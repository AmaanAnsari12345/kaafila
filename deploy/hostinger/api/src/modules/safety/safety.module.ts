import { Body, Controller, Get, Module, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { SafetyService } from "./safety.service";

export class RaiseSosDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  convoyId?: string;

  @IsIn(["manual", "crash_detected", "medical", "breakdown", "security"])
  kind!: "manual" | "crash_detected" | "medical" | "breakdown" | "security";

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  peakG?: number;
}

export class SosTransitionDto {
  @IsIn(["acknowledged", "resolved", "false_alarm"])
  status!: "acknowledged" | "resolved" | "false_alarm";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags("safety")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("sos")
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  raise(@CurrentUser() user: AuthenticatedUser, @Body() dto: RaiseSosDto) {
    return this.safety.raise(user, dto);
  }

  @Post(":id/status")
  transition(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SosTransitionDto) {
    return this.safety.transition(user, id, dto.status, dto.note);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.safety.mine(user.id);
  }

  @Get("convoys/:convoyId")
  forConvoy(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.safety.listForConvoy(user, convoyId);
  }
}

@Module({
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService]
})
export class SafetyModule {}
