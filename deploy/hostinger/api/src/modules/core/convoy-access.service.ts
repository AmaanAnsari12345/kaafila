import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { COMMAND_ROLES, DRIVING_ROLES, type ConvoyRole } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";

export interface MembershipInfo {
  convoyId: string;
  userId: string;
  role: ConvoyRole;
  vehicleId: string | null;
  status: "invited" | "active" | "muted" | "removed";
  /** true when access is granted because the caller is platform staff, not a member */
  staffOverride?: boolean;
}

const MEMBERSHIP_TTL_SECONDS = 30;

@Injectable()
export class ConvoyAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  private key(convoyId: string, userId: string) {
    return `mem:${convoyId}:${userId}`;
  }

  async membership(convoyId: string, userId: string): Promise<MembershipInfo | null> {
    const cached = await this.redis.getJson<MembershipInfo | { none: true }>(this.key(convoyId, userId)).catch(() => null);
    if (cached) return "none" in cached ? null : cached;

    const member = await this.prisma.convoyMember.findUnique({
      where: { convoyId_userId: { convoyId, userId } },
      select: { convoyId: true, userId: true, role: true, vehicleId: true, status: true }
    });
    const value: MembershipInfo | null = member && member.status !== "removed" ? member : null;
    await this.redis.cacheJson(this.key(convoyId, userId), value ?? { none: true }, MEMBERSHIP_TTL_SECONDS).catch(() => undefined);
    return value;
  }

  async invalidate(convoyId: string, userId: string) {
    await this.redis.client.del(this.key(convoyId, userId)).catch(() => undefined);
  }

  /** Any active member (or staff when allowStaff) may read convoy data. */
  async requireMember(convoyId: string, user: Pick<AuthenticatedUser, "id" | "role">, opts: { allowStaff?: boolean } = {}): Promise<MembershipInfo> {
    const member = await this.membership(convoyId, user.id);
    if (member && member.status !== "invited") return member;

    if (opts.allowStaff && (user.role === "admin" || user.role === "support")) {
      const exists = await this.prisma.convoy.count({ where: { id: convoyId } });
      if (!exists) throw new NotFoundException("Convoy not found");
      return { convoyId, userId: user.id, role: "viewer", vehicleId: null, status: "active", staffOverride: true };
    }

    const exists = await this.prisma.convoy.count({ where: { id: convoyId } });
    if (!exists) throw new NotFoundException("Convoy not found");
    throw new ForbiddenException("You are not a member of this convoy");
  }

  /** Owner or leader. */
  async requireCommander(convoyId: string, user: Pick<AuthenticatedUser, "id" | "role">): Promise<MembershipInfo> {
    const member = await this.requireMember(convoyId, user);
    if (!COMMAND_ROLES.includes(member.role)) throw new ForbiddenException("Only the convoy owner or leader can do this");
    return member;
  }

  /** The caller must be driving (or navigating) this exact vehicle in this convoy. */
  async requireVehicle(convoyId: string, userId: string, vehicleId: string): Promise<MembershipInfo> {
    const member = await this.membership(convoyId, userId);
    if (!member || member.status !== "active") throw new ForbiddenException("You are not an active member of this convoy");
    if (!DRIVING_ROLES.includes(member.role)) throw new ForbiddenException("Your role cannot send vehicle updates");
    if (member.vehicleId !== vehicleId) throw new ForbiddenException("This vehicle is not assigned to you in this convoy");
    return member;
  }
}
