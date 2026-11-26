import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccessToken } from "livekit-server-sdk";
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
    token.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: member.role !== "viewer" && member.role !== "family",
      canPublishData: true
    });
    return { wsUrl, room, token: await token.toJwt(), channel: { id: channel.id, name: channel.name, type: channel.channelType }, hdVoice: limits.hdVoice, video: limits.video };
  }
}
