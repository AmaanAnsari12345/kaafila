import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { UpdateProfileDto } from "./users.dto";
import { UsersService } from "./users.service";
import { AccountDeletionService } from "./account-deletion.service";

class DeleteAccountDto {
  @IsString() @MaxLength(40) confirm!: string;
}

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly deletion: AccountDeletionService
  ) {}

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /** Permanently deletes the account. Body: { "confirm": "DELETE MY ACCOUNT" }. */
  @Delete("me")
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 3600_000 } })
  deleteMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeleteAccountDto) {
    return this.deletion.delete(user, dto.confirm);
  }

  @Get("me/export")
  @Throttle({ default: { limit: 3, ttl: 3600_000 } })
  exportMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.exportData(user.id);
  }
}
