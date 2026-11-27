import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SOCKET_EVENTS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AuditService } from "../../shared/audit/audit.service";
import { AuthService, type AuthenticatedUser } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { RealtimeBus } from "../core/realtime-bus.service";

export const DELETE_CONFIRMATION = "DELETE MY ACCOUNT";

/**
 * Self-service account deletion (DPDP Act 2023 / GDPR erasure).
 * - Personal data, location history, cars, devices, posts, chat and SOS records are deleted.
 * - Live convoys and clubs the person owns are handed to another member or closed.
 * - Subscriptions are cancelled at the provider; payment records stay (tax law), linked to an
 *   anonymised user row so accounting still balances. Kitty expenses stay for the other members,
 *   shown as "Deleted user".
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    private readonly bus: RealtimeBus
  ) {}

  async delete(user: AuthenticatedUser, confirmation: string) {
    if (confirmation !== DELETE_CONFIRMATION) throw new BadRequestException(`Type "${DELETE_CONFIRMATION}" to confirm`);
    const userId = user.id;

    const cancelledSubscriptions = await this.billing.cancelAllForUser(userId);
    const handedOver: string[] = [];
    const closed: string[] = [];

    // Live convoys owned or led by this person.
    const convoys = await this.prisma.convoy.findMany({
      where: { OR: [{ ownerId: userId }, { leaderUserId: userId }], status: { in: ["scheduled", "boarding", "active", "paused"] } },
      include: { members: { where: { status: "active", userId: { not: userId } }, orderBy: { joinedAt: "asc" } } }
    });
    for (const c of convoys) {
      const successor = c.members.find((m) => m.role === "leader") ?? c.members.find((m) => m.vehicleId) ?? c.members[0];
      if (!successor) {
        await this.prisma.convoy.update({ where: { id: c.id }, data: { status: "cancelled", completedAt: new Date() } });
        closed.push(c.id);
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.convoy.update({
          where: { id: c.id },
          data: { ...(c.ownerId === userId ? { ownerId: successor.userId } : {}), leaderUserId: c.leaderUserId === userId || c.ownerId === userId ? successor.userId : c.leaderUserId }
        }),
        this.prisma.convoyMember.update({ where: { id: successor.id }, data: { role: c.ownerId === userId ? "owner" : "leader" } })
      ]);
      handedOver.push(c.id);
      this.bus.toConvoy(c.id, SOCKET_EVENTS.presence, { type: "role", userId: successor.userId, role: c.ownerId === userId ? "owner" : "leader" });
    }

    // Clubs owned: hand to the longest-standing member, or delete the empty club.
    const clubs = await this.prisma.club.findMany({ where: { ownerId: userId }, include: { members: { where: { userId: { not: userId } }, orderBy: { joinedAt: "asc" }, take: 1 } } });
    for (const club of clubs) {
      const heir = club.members[0];
      if (heir) {
        await this.prisma.$transaction([
          this.prisma.club.update({ where: { id: club.id }, data: { ownerId: heir.userId } }),
          this.prisma.clubMember.update({ where: { id: heir.id }, data: { role: "owner" } })
        ]);
      } else {
        await this.prisma.club.delete({ where: { id: club.id } });
      }
    }

    const memberships = await this.prisma.convoyMember.findMany({ where: { userId }, select: { convoyId: true } });

    await this.prisma.$transaction([
      this.prisma.meetup.updateMany({ where: { hostId: userId, status: { in: ["draft", "pending_review", "published"] } }, data: { status: "cancelled" } }),
      this.prisma.meetupRsvp.deleteMany({ where: { userId } }),
      this.prisma.convoyMember.updateMany({ where: { userId }, data: { status: "removed", vehicleId: null } }),
      this.prisma.convoyMessage.deleteMany({ where: { userId } }),
      this.prisma.sosIncident.deleteMany({ where: { userId } }),
      this.prisma.post.deleteMany({ where: { authorId: userId } }),
      this.prisma.postComment.deleteMany({ where: { authorId: userId } }),
      this.prisma.postLike.deleteMany({ where: { userId } }),
      this.prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
      this.prisma.clubMember.deleteMany({ where: { userId } }),
      this.prisma.device.deleteMany({ where: { userId } }),
      this.prisma.devicePairing.deleteMany({ where: { ownerId: userId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId } }),
      this.prisma.assistantMessage.deleteMany({ where: { userId } }),
      this.prisma.roadReportVote.deleteMany({ where: { userId } }),
      this.prisma.scenicRoute.deleteMany({ where: { authorId: userId } }),
      // Cars cascade their location history, telemetry, reminders, documents and seats.
      this.prisma.vehicle.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          displayName: "Deleted user",
          email: null,
          phone: null,
          handle: null,
          avatarUrl: null,
          bio: null,
          homeCity: null,
          countryCode: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          bloodGroup: null,
          medicalNotes: null,
          upiVpa: null,
          role: "user",
          isSuspended: true,
          suspendedReason: "Account deleted",
          deletedAt: new Date()
        }
      })
    ]);

    // Caches that still hold this person's data.
    const keys = [`ent:usr:${userId}`, ...memberships.flatMap((m) => [`mem:${m.convoyId}:${userId}`, `cmeta:${m.convoyId}`, `intel:${m.convoyId}`])];
    await this.redis.client.del(...keys).catch(() => undefined);
    for (const m of memberships) this.bus.toConvoy(m.convoyId, SOCKET_EVENTS.presence, { type: "removed", userId });

    await this.auth.deleteIdentity(userId);
    await this.audit.record(userId, "user.delete", "user", userId, { cancelledSubscriptions, handedOver, closed });
    this.logger.log(`account ${userId} deleted (${handedOver.length} convoys handed over, ${closed.length} closed)`);
    return { deleted: true, cancelledSubscriptions, convoysHandedOver: handedOver.length, convoysClosed: closed.length };
  }
}
