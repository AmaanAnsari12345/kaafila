import { Body, Controller, Get, Module, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { IntelModule } from "../intel/intel.module";
import { TrackingModule } from "../tracking/tracking.module";
import { AssistantService } from "./assistant.service";

class AskDto {
  @IsString() @Length(1, 1000) message!: string;
  @IsOptional() @IsString() @MaxLength(40) convoyId?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

@ApiTags("assistant")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post("ask")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskDto) {
    const position = dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined;
    return this.assistant.ask(user, dto.message.trim(), dto.convoyId, position);
  }

  @Get("history")
  history(@CurrentUser() user: AuthenticatedUser, @Query("convoyId") convoyId?: string) {
    return this.assistant.history(user, convoyId);
  }
}

@Module({
  imports: [TrackingModule, IntelModule],
  controllers: [AssistantController],
  providers: [AssistantService]
})
export class AssistantModule {}
