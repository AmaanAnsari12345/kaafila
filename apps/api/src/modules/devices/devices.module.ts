import { Body, Controller, Delete, ForbiddenException, Get, HttpException, HttpStatus, Injectable, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { IsIn, IsObject, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { randomInt } from "node:crypto";
import { PAIRING_CODE_TTL_SECONDS, SOCKET_EVENTS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { RealtimeBus } from "../core/realtime-bus.service";

const KINDS = ["phone", "tablet", "car_display", "obd_adapter", "dashcam", "wearable"] as const;
type Kind = (typeof KINDS)[number];

class CreatePairingDto {
  @IsOptional() @IsString() @MaxLength(40) vehicleId?: string;
  @IsIn(KINDS) kind!: Kind;
}

class ClaimPairingDto {
  @Matches(/^\d{6}$/) code!: string;
  @IsString() @Length(1, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(60) platform?: string;
  @IsOptional() @IsObject() capabilities?: Record<string, boolean>;
}

class RegisterDeviceDto {
  @IsIn(KINDS) kind!: Kind;
  @IsString() @Length(1, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(40) vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(60) platform?: string;
  @IsOptional() @IsObject() capabilities?: Record<string, boolean>;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly bus: RealtimeBus,
    private readonly config: ConfigService
  ) {}

  private async assertOwns(userId: string, vehicleId: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
    if (!v || v.userId !== userId) throw new ForbiddenException("Not your vehicle");
  }

  async createPairing(user: AuthenticatedUser, dto: CreatePairingDto) {
    if (dto.vehicleId) await this.assertOwns(user.id, dto.vehicleId);
    if (!(await this.redis.allow(`rl:pair:new:${user.id}`, 6, 600))) throw new HttpException("Too many pairing codes, wait a few minutes", HttpStatus.TOO_MANY_REQUESTS);

    let code = "";
    for (let i = 0; i < 8; i++) {
      code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const clash = await this.prisma.devicePairing.count({ where: { code, consumedAt: null, expiresAt: { gt: new Date() } } });
      if (!clash) break;
    }
    const pairing = await this.prisma.devicePairing.create({
      data: { code, ownerId: user.id, vehicleId: dto.vehicleId, kind: dto.kind, expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000) }
    });
    return { code, expiresAtIso: pairing.expiresAt.toISOString(), url: `${this.config.get<string>("PUBLIC_APP_URL")}/connect?code=${code}` };
  }

  async claim(user: AuthenticatedUser, dto: ClaimPairingDto) {
    // Brute-force protection: 8 attempts per user and 300 per hour platform-wide.
    const [perUser, global] = await Promise.all([this.redis.allow(`rl:pair:claim:${user.id}`, 8, 600), this.redis.allow("rl:pair:claim:all", 300, 3600)]);
    if (!perUser || !global) throw new HttpException("Too many attempts, wait a few minutes", HttpStatus.TOO_MANY_REQUESTS);

    const pairing = await this.prisma.devicePairing.findFirst({ where: { code: dto.code, consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!pairing) throw new NotFoundException("Code not found or expired");

    const consumed = await this.prisma.devicePairing.updateMany({ where: { id: pairing.id, consumedAt: null }, data: { consumedAt: new Date(), consumedBy: user.id } });
    if (!consumed.count) throw new NotFoundException("Code already used");

    const device = await this.prisma.device.create({
      data: {
        userId: user.id,
        vehicleId: pairing.vehicleId,
        kind: pairing.kind,
        name: dto.name,
        platform: dto.platform,
        capabilities: (dto.capabilities ?? undefined) as Prisma.InputJsonObject | undefined,
        lastSeenAt: new Date()
      }
    });

    // A co-pilot device belonging to someone else joins the owner's live convoys as navigator of that car.
    const joined: string[] = [];
    if (pairing.vehicleId && user.id !== pairing.ownerId) {
      const convoys = await this.prisma.convoyMember.findMany({
        where: { userId: pairing.ownerId, vehicleId: pairing.vehicleId, status: "active", convoy: { status: { in: ["boarding", "active", "paused"] } } },
        select: { convoyId: true }
      });
      for (const { convoyId } of convoys) {
        const existing = await this.prisma.convoyMember.findUnique({ where: { convoyId_userId: { convoyId, userId: user.id } } });
        if (existing?.status === "removed") continue;
        await this.prisma.convoyMember.upsert({
          where: { convoyId_userId: { convoyId, userId: user.id } },
          update: { status: "active", role: existing && ["owner", "leader", "sweeper"].includes(existing.role) ? existing.role : "navigator", vehicleId: pairing.vehicleId },
          create: { convoyId, userId: user.id, vehicleId: pairing.vehicleId, role: "navigator", status: "active" }
        });
        await this.access.invalidate(convoyId, user.id);
        this.bus.toConvoy(convoyId, SOCKET_EVENTS.presence, { type: "joined", userId: user.id, displayName: user.displayName, role: "navigator" });
        joined.push(convoyId);
      }
    }
    this.bus.toUser(pairing.ownerId, "device:paired", { deviceId: device.id, name: device.name, byUserId: user.id });
    return { device, joinedConvoyIds: joined };
  }

  register(user: AuthenticatedUser, dto: RegisterDeviceDto) {
    return (async () => {
      if (dto.vehicleId) await this.assertOwns(user.id, dto.vehicleId);
      return this.prisma.device.create({
        data: { userId: user.id, vehicleId: dto.vehicleId, kind: dto.kind, name: dto.name, platform: dto.platform, capabilities: (dto.capabilities ?? undefined) as Prisma.InputJsonObject | undefined, lastSeenAt: new Date() }
      });
    })();
  }

  mine(userId: string) {
    return this.prisma.device.findMany({ where: { userId, status: "active" }, orderBy: { pairedAt: "desc" }, include: { vehicle: { select: { id: true, name: true } } } });
  }

  async forVehicle(userId: string, vehicleId: string) {
    await this.assertOwns(userId, vehicleId);
    return this.prisma.device.findMany({ where: { vehicleId, status: "active" }, include: { user: { select: { id: true, displayName: true } } } });
  }

  async revoke(user: AuthenticatedUser, deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId }, include: { vehicle: { select: { userId: true } } } });
    if (!device) throw new NotFoundException("Device not found");
    const isVehicleOwner = device.vehicle?.userId === user.id;
    if (device.userId !== user.id && !isVehicleOwner) throw new ForbiddenException("You cannot revoke this device");
    await this.prisma.device.update({ where: { id: deviceId }, data: { status: "revoked" } });
    if (device.vehicleId && device.userId !== device.vehicle?.userId) {
      const rows = await this.prisma.convoyMember.findMany({ where: { userId: device.userId, vehicleId: device.vehicleId, role: "navigator", status: "active" } });
      for (const row of rows) {
        await this.prisma.convoyMember.update({ where: { id: row.id }, data: { status: "invited", vehicleId: null } });
        await this.access.invalidate(row.convoyId, device.userId);
      }
    }
    return { ok: true };
  }

  async heartbeat(userId: string, deviceId: string) {
    await this.prisma.device.updateMany({ where: { id: deviceId, userId, status: "active" }, data: { lastSeenAt: new Date() } });
    return { ok: true };
  }
}

@ApiTags("devices")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.devices.mine(user.id);
  }

  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(user, dto);
  }

  @Get("vehicles/:vehicleId")
  forVehicle(@CurrentUser() user: AuthenticatedUser, @Param("vehicleId") vehicleId: string) {
    return this.devices.forVehicle(user.id, vehicleId);
  }

  @Post("pairings")
  createPairing(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePairingDto) {
    return this.devices.createPairing(user, dto);
  }

  @Post("pairings/claim")
  claim(@CurrentUser() user: AuthenticatedUser, @Body() dto: ClaimPairingDto) {
    return this.devices.claim(user, dto);
  }

  @Post(":id/heartbeat")
  heartbeat(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.devices.heartbeat(user.id, id);
  }

  @Delete(":id")
  revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.devices.revoke(user, id);
  }
}

@Module({
  controllers: [DevicesController],
  providers: [DevicesService]
})
export class DevicesModule {}
