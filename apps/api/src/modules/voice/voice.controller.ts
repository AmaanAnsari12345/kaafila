import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { VoiceService } from "./voice.service";

@ApiTags("voice")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("voice")
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get("convoys/:convoyId/channels")
  getChannels(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.voice.getChannels(user, convoyId);
  }

  @Post("convoys/:convoyId/livekit-token")
  token(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string, @Query("channelId") channelId?: string) {
    return this.voice.createLiveKitToken(user, convoyId, channelId);
  }
}
