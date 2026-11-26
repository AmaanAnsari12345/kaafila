import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.service";
import { AdminGuard, StaffGuard } from "../auth/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { AdminService } from "./admin.service";

class SuspendDto {
  @IsBoolean() suspended!: boolean;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

class RoleDto {
  @IsIn(["user", "admin", "support"]) role!: "user" | "admin" | "support";
}

class ReasonDto {
  @IsString() @Length(3, 300) reason!: string;
}

class ResolveReportDto {
  @IsIn(["resolved", "rejected"]) decision!: "resolved" | "rejected";
  @IsOptional() @IsBoolean() hideSubject?: boolean;
}

class HideDto {
  @IsBoolean() hidden!: boolean;
}

class ReviewDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class AnnouncementDto {
  @IsString() @Length(3, 120) title!: string;
  @IsString() @Length(3, 2000) body!: string;
  @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @IsOptional() @IsIn(["info", "warning", "critical"]) severity?: "info" | "warning" | "critical";
  @IsOptional() @IsDateString() endsAt?: string;
}

class FlagDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) rolloutPct?: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, StaffGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  @Get("revenue")
  @UseGuards(AdminGuard)
  revenue() {
    return this.admin.revenue();
  }

  @Get("users")
  users(@Query("q") q?: string, @Query("cursor") cursor?: string) {
    return this.admin.users(q?.slice(0, 80), cursor);
  }

  @Patch("users/:id/suspension")
  suspend(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: SuspendDto) {
    return this.admin.setSuspended(actor, id, dto.suspended, dto.reason);
  }

  @Patch("users/:id/role")
  @UseGuards(AdminGuard)
  role(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: RoleDto) {
    return this.admin.setRole(actor, id, dto.role);
  }

  @Get("convoys")
  convoys(@Query("status") status?: "live" | "all") {
    return this.admin.convoys(status === "all" ? "all" : "live");
  }

  @Post("convoys/:id/force-end")
  @UseGuards(AdminGuard)
  forceEnd(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReasonDto) {
    return this.admin.forceEnd(actor, id, dto.reason);
  }

  @Get("sos")
  sos(@Query("status") status?: "open" | "all") {
    return this.admin.sos(status === "all" ? "all" : "open");
  }

  @Get("moderation")
  moderation() {
    return this.admin.moderation();
  }

  @Post("reports/:id/resolve")
  resolveReport(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolveReport(actor, id, dto.decision, dto.hideSubject ?? false);
  }

  @Patch("posts/:id/visibility")
  hidePost(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: HideDto) {
    return this.admin.setPostHidden(actor, id, dto.hidden);
  }

  @Post("road-reports/:id/remove")
  removeRoadReport(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.admin.removeRoadReport(actor, id);
  }

  @Get("meetups/pending")
  pendingMeetups() {
    return this.admin.pendingMeetups();
  }

  @Post("meetups/:id/review")
  review(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReviewDto) {
    return this.admin.reviewMeetup(actor, id, dto.decision, dto.note);
  }

  @Get("announcements")
  announcements() {
    return this.admin.announcements();
  }

  @Post("announcements")
  @UseGuards(AdminGuard)
  createAnnouncement(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AnnouncementDto) {
    return this.admin.createAnnouncement(actor, dto);
  }

  @Delete("announcements/:id")
  @UseGuards(AdminGuard)
  deleteAnnouncement(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.admin.deleteAnnouncement(actor, id);
  }

  @Get("flags")
  flags() {
    return this.admin.flags();
  }

  @Put("flags/:key")
  @UseGuards(AdminGuard)
  upsertFlag(@CurrentUser() actor: AuthenticatedUser, @Param("key") key: string, @Body() dto: FlagDto) {
    return this.admin.upsertFlag(actor, key.slice(0, 60), dto);
  }

  @Get("audit")
  @UseGuards(AdminGuard)
  audit(@Query("cursor") cursor?: string) {
    return this.admin.auditLog(cursor);
  }
}
