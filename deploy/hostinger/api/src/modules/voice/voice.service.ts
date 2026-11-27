import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { DRIVING_ROLES } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { EntitlementsService } from "../core/entitlements.service";

@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: ConvoyAccessService,
    private readonly entitlements: EntitlementsService
  ) {}

  status() {
    return { enabled: Boolean(this.config.get("LIVEKIT_API_KEY") && this.config.get("LIVEKIT_API_SECRET") && this.config.get("LIVEKIT_WS_URL")) };
  }

  async getChannels(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    return this.prisma.voiceChannel.findMany({ where: { convoyId }, orderBy: { createdAt: "asc" } });
  }

  /**
   * LiveKit token bound to the caller's real identity and a channel of their convoy.
   * The Leaders channel is limited to owner/leader/sweeper. HD voice is a Drive feature.
   */
  async createLiveKitToken(user: AuthenticatedUser, convoyId: string, channelId?: string) {
    const member = await this.access.requireMember(convoyId, user);
    const apiKey = this.config.get<string>("LIVEKIT_API_KEY");
    const apiSecret = this.config.get<string>("LIVEKIT_API_SECRET");
    const wsUrl = this.config.get<string>("LIVEKIT_WS_URL");
    if (!apiKey || !apiSecret || !wsUrl) throw new ServiceUnavailableException("Voice is not configured on this server");

    const channel = channelId
      ? await this.prisma.voiceChannel.findFirst({ where: { id: channelId, convoyId } })
      : await this.prisma.voiceChannel.findFirst({ where: { convoyId, channelType: "main" } });
    if (!channel) throw new NotFoundException("Voice channel not found");
    if (channel.channelType === "leaders" && !["owner", "leader", "sweeper"].includes(member.role)) throw new ForbiddenException("Leaders channel is for the leader, owner and sweeper");

    const limits = await this.entitlements.limitsForVehicle(member.vehicleId);
    const room = `convoy-${convoyId}-${channel.id}`;
    const token = new AccessToken(apiKey, apiSecret, { identity: user.id, name: user.displayName, ttl: "4h" });
    // Safety: anyone driving a car in the convoy can publish audio only; passengers (navigator) may share video.
    const isDriver = DRIVING_ROLES.includes(member.role) && member.role !== "navigator";
    const listenOnly = member.role === "viewer" || member.role === "family";
    const sources = isDriver ? [TrackSource.MICROPHONE] : limits.video ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE];
    token.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: !listenOnly,
      canPublishSources: listenOnly ? [] : sources,
      canPublishData: true
    });
    return {
      wsUrl,
      room,
      token: await token.toJwt(),
      channel: { id: channel.id, name: channel.name, type: channel.channelType },
      hdVoice: limits.hdVoice,
      video: !listenOnly && sources.includes(TrackSource.CAMERA),
      audioOnlyReason: isDriver ? "You're driving: video is off in convoy channels." : null
    };
  }

  /** Club lounge: group voice/video call for club members (not for use while driving). */
  async createClubToken(user: AuthenticatedUser, clubId: string) {
    const apiKey = this.config.get<string>("LIVEKIT_API_KEY");
    const apiSecret = this.config.get<string>("LIVEKIT_API_SECRET");
    const wsUrl = this.config.get<string>("LIVEKIT_WS_URL");
    if (!apiKey || !apiSecret || !wsUrl) throw new ServiceUnavailableException("Calls are not configured on this server");
    const membership = await this.prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: user.id } }, include: { club: { select: { name: true } } } });
    if (!membership) throw new ForbiddenException("Join the club to enter its lounge");
    const room = `club-${clubId}-lounge`;
    const token = new AccessToken(apiKey, apiSecret, { identity: user.id, name: user.displayName, ttl: "4h" });
    token.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO], canPublishData: true });
    return { wsUrl, room, token: await token.toJwt(), channel: { id: clubId, name: `${membership.club.name} lounge`, type: "club" }, hdVoice: true, video: true, audioOnlyReason: null };
  }
}
