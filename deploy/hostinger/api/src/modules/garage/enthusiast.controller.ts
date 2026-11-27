import { Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { driveScore, fuelEconomy, MOD_CATEGORIES } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";

class FuelDto {
  @IsDateString() filledAt!: string;
  @IsInt() @Min(0) @Max(5_000_000) odometerKm!: number;
  @IsNumber() @Min(0.1) @Max(2000) quantity!: number;
  @IsInt() @Min(0) @Max(10_000_000) totalCostMinor!: number;
  @IsOptional() @IsBoolean() isFullTank?: boolean;
  @IsOptional() @IsString() @MaxLength(120) station?: string;
}

class ModDto {
  @IsIn(MOD_CATEGORIES as unknown as string[]) category!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsDateString() installedAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) costMinor?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class ScoreQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

@Injectable()
export class EnthusiastService {
  constructor(private readonly prisma: PrismaService) {}

  private async owned(userId: string, vehicleId: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true, odometerKm: true, fuelType: true } });
    if (!v) throw new NotFoundException("Vehicle not found");
    if (v.userId !== userId) throw new ForbiddenException("Not your vehicle");
    return v;
  }

  async fuel(userId: string, vehicleId: string) {
    const v = await this.owned(userId, vehicleId);
    const entries = await this.prisma.fuelLog.findMany({ where: { vehicleId }, orderBy: { odometerKm: "desc" }, take: 500 });
    const economy = fuelEconomy(entries.map((e) => ({ id: e.id, filledAtIso: e.filledAt.toISOString(), odometerKm: e.odometerKm, quantity: e.quantity, totalCostMinor: e.totalCostMinor, isFullTank: e.isFullTank })));
    return { unit: v.fuelType === "ev" ? "kWh" : "L", economyUnit: v.fuelType === "ev" ? "km/kWh" : "km/L", entries, economy };
  }

  async addFuel(userId: string, vehicleId: string, dto: FuelDto) {
    const v = await this.owned(userId, vehicleId);
    const entry = await this.prisma.fuelLog.create({ data: { vehicleId, filledAt: new Date(dto.filledAt), odometerKm: dto.odometerKm, quantity: dto.quantity, totalCostMinor: dto.totalCostMinor, isFullTank: dto.isFullTank ?? true, station: dto.station } });
    if (!v.odometerKm || dto.odometerKm > v.odometerKm) await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { odometerKm: dto.odometerKm } });
    return entry;
  }

  async deleteFuel(userId: string, vehicleId: string, id: string) {
    await this.owned(userId, vehicleId);
    await this.prisma.fuelLog.deleteMany({ where: { id, vehicleId } });
    return { ok: true };
  }

  async mods(userId: string, vehicleId: string) {
    await this.owned(userId, vehicleId);
    return this.prisma.vehicleMod.findMany({ where: { vehicleId }, orderBy: [{ category: "asc" }, { createdAt: "asc" }] });
  }

  async addMod(userId: string, vehicleId: string, dto: ModDto) {
    await this.owned(userId, vehicleId);
    const count = await this.prisma.vehicleMod.count({ where: { vehicleId } });
    if (count >= 100) throw new ForbiddenException("A build sheet can list up to 100 parts");
    return this.prisma.vehicleMod.create({ data: { ...dto, installedAt: dto.installedAt ? new Date(dto.installedAt) : undefined, vehicleId } });
  }

  async deleteMod(userId: string, vehicleId: string, id: string) {
    await this.owned(userId, vehicleId);
    await this.prisma.vehicleMod.deleteMany({ where: { id, vehicleId } });
    return { ok: true };
  }

  /** Smooth-driving score from this car's stored pings over the last N days. */
  async driveScore(userId: string, vehicleId: string, days = 30) {
    await this.owned(userId, vehicleId);
    const pings = await this.prisma.locationPing.findMany({
      where: { vehicleId, capturedAt: { gt: new Date(Date.now() - days * 86_400_000) } },
      orderBy: { capturedAt: "asc" },
      take: 50_000,
      select: { capturedAt: true, speedKph: true }
    });
    return { days, samples: pings.length, ...driveScore(pings.map((p) => ({ t: p.capturedAt.getTime(), speedKph: p.speedKph }))) };
  }
}

@ApiTags("garage")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("garage/vehicles/:id")
export class EnthusiastController {
  constructor(private readonly svc: EnthusiastService) {}

  @Get("fuel")
  fuel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.fuel(user.id, id);
  }

  @Post("fuel")
  addFuel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: FuelDto) {
    return this.svc.addFuel(user.id, id, dto);
  }

  @Delete("fuel/:entryId")
  deleteFuel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("entryId") entryId: string) {
    return this.svc.deleteFuel(user.id, id, entryId);
  }

  @Get("mods")
  mods(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.mods(user.id, id);
  }

  @Post("mods")
  addMod(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ModDto) {
    return this.svc.addMod(user.id, id, dto);
  }

  @Delete("mods/:modId")
  deleteMod(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("modId") modId: string) {
    return this.svc.deleteMod(user.id, id, modId);
  }

  @Get("drive-score")
  score(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() q: ScoreQuery) {
    return this.svc.driveScore(user.id, id, q.days ?? 30);
  }
}
