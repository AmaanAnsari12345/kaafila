import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { LocationPingDto } from "./dto/location-ping.dto";
import { TrackingService } from "./tracking.service";

@ApiTags("tracking")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** REST fallback for clients that cannot hold a socket (the socket path is preferred). */
  @Post("ping")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  ingest(@CurrentUser() user: AuthenticatedUser, @Body() dto: LocationPingDto) {
    return this.tracking.ingest(user, dto);
  }

  @Get("convoys/:convoyId/live")
  live(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.tracking.snapshot(user, convoyId);
  }

  @Get("convoys/:convoyId/breadcrumbs")
  breadcrumbs(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.tracking.breadcrumbs(user, convoyId);
  }
}

/** Unauthenticated, token-scoped, read-only family follow view. */
@ApiTags("public")
@Controller("public")
export class PublicFollowController {
  constructor(private readonly tracking: TrackingService) {}

  @Get("follow/:token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  follow(@Param("token") token: string) {
    return this.tracking.publicView(token);
  }
}
