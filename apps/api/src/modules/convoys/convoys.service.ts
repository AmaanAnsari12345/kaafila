import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { randomBytes, randomInt } from "node:crypto";
import { quickSignal, SOCKET_EVENTS, type ChatMessageEvent, type QuickSignalEvent, type RegroupPoint } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { EntitlementsService } from "../core/entitlements.service";
import { RealtimeBus } from "../core/realtime-bus.service";
import { MapsService } from "../integrations/maps.service";
import type {
  ChatMessageDto,
  ConvoyStatusDto,
  CreateConvoyDto,
  JoinConvoyDto,
  QuickSignalDto,
  RegroupDto,
  ShareLinkDto,
  UpdateMemberDto
} from "./dto/convoy.dto";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

@Injectable()
export class ConvoysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly access: ConvoyAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly bus: RealtimeBus,
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {}

  /** Tracking caches convoy metadata (leader, regroup, status) for the hot path. */
  private async invalidateMeta(convoyId: string) {
    await this.redis.client.del(`cmeta:${convoyId}`).catch(() => undefined);
  }

  private joinUrl(code: string) {
    return `${this.config.get<string>("PUBLIC_APP_URL")}/join/${code}`;
  }

  private async newInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = "KAA-";
      for (let i = 0; i < 6; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
      const exists = await this.prisma.convoy.count({ where: { inviteCode: code } });
      if (!exists) return code;
    }
    throw new ConflictException("Could not allocate an invite code, try again");
  }

  private async assertOwnsVehicle(userId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
    if (!vehicle || vehicle.userId !== userId) throw new ForbiddenException("Pick one of your own vehicles");
  }

  async create(user: AuthenticatedUser, dto: CreateConvoyDto) {
    if (dto.vehicleId) await this.assertOwnsVehicle(user.id, dto.vehicleId);
    const [route, inviteCode] = await Promise.all([this.maps.planRoute(dto.origin, dto.destination, dto.waypoints ?? []), this.newInviteCode()]);

    const convoy = await this.prisma.convoy.create({
      data: {
        name: dto.name.trim(),
        ownerId: user.id,
        leaderUserId: user.id,
        inviteCode,
        visibility: dto.visibility ?? "private",
        status: "boarding",
        originLat: dto.origin.lat,
        originLng: dto.origin.lng,
        originName: dto.origin.name,
        destinationLat: dto.destination.lat,
        destinationLng: dto.destination.lng,
        destinationName: dto.destination.name,
        routePolyline: route.polyline,
        routeDistanceM: route.distanceMeters,
        routeDurationS: route.durationSeconds,
        routeProvider: route.provider,
        plannedDepartureAt: dto.plannedDepartureAt ? new Date(dto.plannedDepartureAt) : undefined,
        maxVehicles: dto.maxVehicles ?? 50,
        settings: (dto.settings ?? {}) as Prisma.InputJsonObject,
        members: { create: { userId: user.id, vehicleId: dto.vehicleId, role: "owner", status: "active" } },
        voiceChannels: {
          createMany: {
            data: [
              { name: "Main", channelType: "main" },
              { name: "Leaders", channelType: "leaders" },
              { name: "Emergency", channelType: "emergency" }
            ]
          }
        }
      }
    });

    return { ...convoy, joinUrl: this.joinUrl(convoy.inviteCode), route };
  }

  async previewByCode(code: string) {
    const convoy = await this.prisma.convoy.findUnique({
      where: { inviteCode: code.toUpperCase() },
      select: {
        id: true,
        name: true,
        status: true,
        originName: true,
        destinationName: true,
        plannedDepartureAt: true,
        maxVehicles: true,
        owner: { select: { displayName: true } },
        _count: { select: { members: { where: { status: "active" } } } }
      }
    });
    if (!convoy || convoy.status === "completed" || convoy.status === "cancelled") throw new NotFoundException("Invite not found or convoy has ended");
    return convoy;
  }

  async join(user: AuthenticatedUser, dto: JoinConvoyDto) {
    const convoy = await this.prisma.convoy.findUnique({ where: { inviteCode: dto.inviteCode.toUpperCase() } });
    if (!convoy || convoy.status === "completed" || convoy.status === "cancelled") throw new NotFoundException("Invite not found or convoy has ended");

    const role = dto.role ?? (dto.vehicleId ? "driver" : "viewer");
    if (role === "driver") {
      if (!dto.vehicleId) throw new BadRequestException("Choose the vehicle you are driving");
      await this.assertOwnsVehicle(user.id, dto.vehicleId);
      const vehicles = await this.prisma.convoyMember.count({ where: { convoyId: convoy.id, status: "active", vehicleId: { not: null }, userId: { not: user.id } } });
      if (vehicles >= convoy.maxVehicles) throw new ConflictException(`This convoy is full (${convoy.maxVehicles} vehicles)`);
      const busy = await this.prisma.convoyMember.findFirst({ where: { convoyId: convoy.id, vehicleId: dto.vehicleId, status: "active", userId: { not: user.id } } });
      if (busy) throw new ConflictException("That vehicle is already in this convoy");
    }

    const existing = await this.prisma.convoyMember.findUnique({ where: { convoyId_userId: { convoyId: convoy.id, userId: user.id } } });
    if (existing?.status === "removed") throw new ForbiddenException("You were removed from this convoy by its organiser");

    const member = await this.prisma.convoyMember.upsert({
      where: { convoyId_userId: { convoyId: convoy.id, userId: user.id } },
      update: { vehicleId: role === "driver" ? dto.vehicleId : null, status: "active", ...(existing && ["owner", "leader", "sweeper"].includes(existing.role) ? {} : { role }) },
      create: { convoyId: convoy.id, userId: user.id, vehicleId: role === "driver" ? dto.vehicleId : null, role, status: "active" }
    });
    await this.access.invalidate(convoy.id, user.id);
    this.bus.toConvoy(convoy.id, SOCKET_EVENTS.presence, { type: "joined", userId: user.id, displayName: user.displayName, role: member.role });
    return { convoyId: convoy.id, member };
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.convoyMember.findMany({
      where: { userId, status: { in: ["active", "muted"] } },
      orderBy: { joinedAt: "desc" },
      take: 50,
      include: {
        convoy: {
          select: {
            id: true,
            name: true,
            status: true,
            inviteCode: true,
            originName: true,
            destinationName: true,
            plannedDepartureAt: true,
            startedAt: true,
            routeDistanceM: true,
            _count: { select: { members: { where: { status: "active" } } } }
          }
        }
      }
    });
    return memberships.map((m) => ({ role: m.role, vehicleId: m.vehicleId, ...m.convoy, joinUrl: this.joinUrl(m.convoy.inviteCode) }));
  }

  async getById(user: AuthenticatedUser, id: string) {
    const membership = await this.access.requireMember(id, user, { allowStaff: true });
    const convoy = await this.prisma.convoy.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: { in: ["active", "muted"] } },
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, handle: true } },
            vehicle: { select: { id: true, name: true, type: true, make: true, model: true, color: true, fuelType: true, rangeKmFull: true, plateNumber: true } }
          }
        },
        voiceChannels: true,
        routeCheckpoints: { orderBy: { sequence: "asc" } },
        alerts: { orderBy: { createdAt: "desc" }, take: 25 }
      }
    });
    if (!convoy) throw new NotFoundException("Convoy not found");

    const regroup: RegroupPoint | null =
      convoy.regroupLat !== null && convoy.regroupLng !== null
        ? { name: convoy.regroupName ?? "Regroup", position: { lat: convoy.regroupLat, lng: convoy.regroupLng }, setByUserId: convoy.regroupSetBy ?? "", setAtIso: convoy.regroupSetAt?.toISOString() ?? "" }
        : null;

    const plans = await Promise.all(convoy.members.map((m) => this.entitlements.planForVehicle(m.vehicleId)));
    return {
      ...convoy,
      // Plate numbers are visible to members only, never to staff overrides or the public.
      members: convoy.members.map((m, i) => ({
        ...m,
        plan: plans[i],
        vehicle: m.vehicle && membership.staffOverride ? { ...m.vehicle, plateNumber: null } : m.vehicle
      })),
      regroup,
      joinUrl: this.joinUrl(convoy.inviteCode),
      me: { role: membership.role, vehicleId: membership.vehicleId, staffOverride: Boolean(membership.staffOverride) }
    };
  }

  async updateMember(user: AuthenticatedUser, convoyId: string, memberUserId: string, dto: UpdateMemberDto) {
    await this.access.requireCommander(convoyId, user);
    const target = await this.prisma.convoyMember.findUnique({ where: { convoyId_userId: { convoyId, userId: memberUserId } } });
    if (!target || target.status === "removed") throw new NotFoundException("Member not found");
    if (target.role === "owner") throw new ForbiddenException("The owner's role cannot be changed");
    if (["leader", "sweeper", "driver"].includes(dto.role) && !target.vehicleId) throw new BadRequestException("This member has no vehicle in the convoy");

    await this.prisma.$transaction(async (tx) => {
      if (dto.role === "leader") {
        const convoy = await tx.convoy.findUniqueOrThrow({ where: { id: convoyId }, select: { leaderUserId: true, ownerId: true } });
        if (convoy.leaderUserId !== convoy.ownerId && convoy.leaderUserId !== memberUserId) {
          await tx.convoyMember.updateMany({ where: { convoyId, userId: convoy.leaderUserId, role: "leader" }, data: { role: "driver" } });
          await this.access.invalidate(convoyId, convoy.leaderUserId);
        }
        await tx.convoy.update({ where: { id: convoyId }, data: { leaderUserId: memberUserId } });
      }
      await tx.convoyMember.update({ where: { id: target.id }, data: { role: dto.role } });
    });

    await Promise.all([this.access.invalidate(convoyId, memberUserId), this.invalidateMeta(convoyId)]);
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.presence, { type: "role", userId: memberUserId, role: dto.role });
    return { ok: true };
  }

  async removeMember(user: AuthenticatedUser, convoyId: string, memberUserId: string) {
    const isSelf = user.id === memberUserId;
    if (!isSelf) await this.access.requireCommander(convoyId, user);
    const target = await this.prisma.convoyMember.findUnique({ where: { convoyId_userId: { convoyId, userId: memberUserId } } });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "owner") throw new ForbiddenException("The owner cannot leave or be removed; end the convoy instead");

    // Leaving yourself keeps the door open to rejoin; being removed blocks the invite code.
    await this.prisma.convoyMember.update({ where: { id: target.id }, data: { status: isSelf ? "invited" : "removed", vehicleId: null } });
    await this.access.invalidate(convoyId, memberUserId);
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.presence, { type: isSelf ? "left" : "removed", userId: memberUserId });
    return { ok: true };
  }

  async setStatus(user: AuthenticatedUser, convoyId: string, dto: ConvoyStatusDto) {
    await this.access.requireCommander(convoyId, user);
    const now = new Date();
    const convoy = await this.prisma.convoy.update({
      where: { id: convoyId },
      data: {
        status: dto.status,
        ...(dto.status === "active" ? { startedAt: now } : {}),
        ...(dto.status === "completed" || dto.status === "cancelled" ? { completedAt: now } : {})
      },
      select: { id: true, status: true, startedAt: true, completedAt: true }
    });
    await this.invalidateMeta(convoyId);
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.state, { type: "status", status: convoy.status });
    return convoy;
  }

  async setRegroup(user: AuthenticatedUser, convoyId: string, dto: RegroupDto): Promise<RegroupPoint> {
    await this.access.requireCommander(convoyId, user);
    const now = new Date();
    await this.prisma.convoy.update({
      where: { id: convoyId },
      data: { regroupName: dto.name, regroupLat: dto.lat, regroupLng: dto.lng, regroupSetAt: now, regroupSetBy: user.id }
    });
    await this.invalidateMeta(convoyId);
    const regroup: RegroupPoint = { name: dto.name, position: { lat: dto.lat, lng: dto.lng }, setByUserId: user.id, setAtIso: now.toISOString() };
    await this.prisma.alert.create({
      data: { convoyId, type: "regroup", severity: "info", title: `Regroup at ${dto.name}`, message: `${user.displayName} set the regroup point.`, lat: dto.lat, lng: dto.lng }
    });
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.regroupNew, regroup);
    return regroup;
  }

  async clearRegroup(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireCommander(convoyId, user);
    await this.prisma.convoy.update({ where: { id: convoyId }, data: { regroupName: null, regroupLat: null, regroupLng: null, regroupSetAt: null, regroupSetBy: null } });
    await this.invalidateMeta(convoyId);
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.regroupNew, null);
    return { ok: true };
  }

  async messages(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    const rows = await this.prisma.convoyMessage.findMany({
      where: { convoyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { displayName: true } } }
    });
    return rows.reverse().map((m) => ({ id: m.id, kind: m.kind, body: m.body, signal: m.signal, userId: m.userId, displayName: m.user.displayName, createdAtIso: m.createdAt.toISOString() }));
  }

  async postMessage(user: AuthenticatedUser, convoyId: string, dto: ChatMessageDto): Promise<ChatMessageEvent> {
    const member = await this.access.requireMember(convoyId, user);
    if (member.status === "muted") throw new ForbiddenException("You are muted in this convoy");
    const row = await this.prisma.convoyMessage.create({ data: { convoyId, userId: user.id, vehicleId: member.vehicleId, kind: "text", body: dto.body.trim() } });
    const event: ChatMessageEvent = { id: row.id, convoyId, userId: user.id, displayName: user.displayName, body: row.body, createdAtIso: row.createdAt.toISOString() };
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.chatNew, event);
    return event;
  }

  async sendSignal(user: AuthenticatedUser, convoyId: string, dto: QuickSignalDto): Promise<QuickSignalEvent> {
    const member = await this.access.requireMember(convoyId, user);
    const def = quickSignal(dto.code);
    const position = dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined;
    const row = await this.prisma.convoyMessage.create({
      data: { convoyId, userId: user.id, vehicleId: member.vehicleId, kind: "quick_signal", signal: def.code, body: `${user.displayName} ${def.spoken}`, lat: position?.lat, lng: position?.lng }
    });
    if (def.severity === "critical") {
      await this.prisma.alert.create({
        data: { convoyId, type: "road_hazard", severity: "critical", title: def.label, message: `${user.displayName} ${def.spoken}.`, vehicleId: member.vehicleId, lat: position?.lat, lng: position?.lng }
      });
    }
    const event: QuickSignalEvent = {
      id: row.id,
      convoyId,
      userId: user.id,
      vehicleId: member.vehicleId ?? undefined,
      displayName: user.displayName,
      code: def.code,
      position,
      createdAtIso: row.createdAt.toISOString()
    };
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.signalNew, event);
    return event;
  }

  async acknowledgeAlert(user: AuthenticatedUser, convoyId: string, alertId: string) {
    await this.access.requireMember(convoyId, user);
    const result = await this.prisma.alert.updateMany({ where: { id: alertId, convoyId, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
    return { ok: result.count > 0 };
  }

  /* ---------------------------- family follow links ---------------------------- */

  async createShareLink(user: AuthenticatedUser, convoyId: string, dto: ShareLinkDto) {
    const member = await this.access.requireMember(convoyId, user);
    const limits = await this.entitlements.limitsForVehicle(member.vehicleId);
    if (!limits.familyLinks) throw new ForbiddenException("Family follow links are part of KAAFILA Drive (₹500 per car per month)");
    const token = randomBytes(24).toString("base64url");
    const link = await this.prisma.shareLink.create({
      data: { token, convoyId, createdById: user.id, label: dto.label, expiresAt: new Date(Date.now() + dto.hours * 3600_000) }
    });
    return { id: link.id, url: `${this.config.get<string>("PUBLIC_APP_URL")}/follow/${token}`, expiresAtIso: link.expiresAt.toISOString() };
  }

  async listShareLinks(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user);
    return this.prisma.shareLink.findMany({
      where: { convoyId, createdById: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, label: true, expiresAt: true, viewCount: true, createdAt: true }
    });
  }

  async revokeShareLink(user: AuthenticatedUser, convoyId: string, linkId: string) {
    const member = await this.access.requireMember(convoyId, user);
    const link = await this.prisma.shareLink.findFirst({ where: { id: linkId, convoyId } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.createdById !== user.id && !["owner", "leader"].includes(member.role)) throw new ForbiddenException("Only the creator or the convoy leader can revoke this link");
    await this.prisma.shareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }
}
