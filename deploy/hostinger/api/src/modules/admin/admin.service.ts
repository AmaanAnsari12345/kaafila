import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SOCKET_EVENTS, type AdminOverview } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AuditService } from "../../shared/audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { RealtimeBus } from "../core/realtime-bus.service";

const LIVE = ["boarding", "active", "paused"] as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus
  ) {}

  async overview(): Promise<AdminOverview> {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [users, newUsers7d, liveConvoys, activeVehicles, openSos, openReports, pendingMeetups, revenue] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gt: weekAgo } } }),
      this.prisma.convoy.count({ where: { status: { in: [...LIVE] } } }),
      this.prisma.convoyMember.count({ where: { status: "active", vehicleId: { not: null }, convoy: { status: { in: [...LIVE] } } } }),
      this.prisma.sosIncident.count({ where: { status: { in: ["open", "acknowledged"] } } }),
      this.prisma.report.count({ where: { status: "open" } }),
      this.prisma.meetup.count({ where: { status: "pending_review" } }),
      this.revenue()
    ]);
    return { users, newUsers7d, liveConvoys, activeVehicles, openSos, openReports, pendingMeetups, revenue: revenue.snapshot, generatedAtIso: new Date().toISOString() };
  }

  async revenue() {
    const [active, byStatus, seats, paid30] = await Promise.all([
      this.prisma.subscription.findMany({ where: { status: "active" }, select: { amountMinor: true, quantity: true, currency: true } }),
      this.prisma.subscription.groupBy({ by: ["status"], _count: { _all: true }, _sum: { quantity: true } }),
      this.prisma.subscriptionSeat.count({ where: { subscription: { status: "active" } } }),
      this.prisma.payment.aggregate({ where: { createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) }, status: { in: ["captured", "paid"] } }, _sum: { amountMinor: true } })
    ]);
    const cancelled30 = await this.prisma.subscription.count({ where: { status: "cancelled", updatedAt: { gt: new Date(Date.now() - 30 * 86_400_000) } } });
    const mrrMinor = active.filter((s) => s.currency === "INR").reduce((sum, s) => sum + s.amountMinor, 0);
    const paidVehicles = active.reduce((sum, s) => sum + s.quantity, 0);
    const base = active.length + cancelled30;
    return {
      snapshot: { mrrMinor, currency: "INR" as const, activeSubscriptions: active.length, activeSeats: seats, churnPct: base ? Math.round((cancelled30 / base) * 1000) / 10 : 0, adRevenueMinor: 0 },
      paidVehicles,
      unassignedSeats: Math.max(0, paidVehicles - seats),
      collectedLast30DaysMinor: paid30._sum.amountMinor ?? 0,
      byStatus: byStatus.map((b) => ({ status: b.status, subscriptions: b._count._all, vehicles: b._sum.quantity ?? 0 }))
    };
  }

  /* --------------------------------- users --------------------------------- */

  async users(q?: string, cursor?: string) {
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { handle: { contains: q.toLowerCase() } }, { id: q }] }
      : {};
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        handle: true,
        role: true,
        isSuspended: true,
        suspendedReason: true,
        countryCode: true,
        createdAt: true,
        lastActiveAt: true,
        _count: { select: { vehicles: true, memberships: true, subscriptions: true } }
      }
    });
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }

  async setSuspended(actor: AuthenticatedUser, userId: string, suspended: boolean, reason?: string) {
    if (actor.id === userId) throw new BadRequestException("You cannot suspend yourself");
    const user = await this.prisma.user.update({ where: { id: userId }, data: { isSuspended: suspended, suspendedReason: suspended ? (reason ?? "Policy violation") : null } });
    await this.audit.record(actor.id, suspended ? "user.suspend" : "user.unsuspend", "user", userId, { reason });
    return user;
  }

  async setRole(actor: AuthenticatedUser, userId: string, role: "user" | "admin" | "support") {
    if (actor.id === userId) throw new BadRequestException("You cannot change your own role");
    const user = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    await this.audit.record(actor.id, "user.role", "user", userId, { role });
    return user;
  }

  /* -------------------------------- convoys -------------------------------- */

  async convoys(status: "live" | "all" = "live") {
    return this.prisma.convoy.findMany({
      where: status === "live" ? { status: { in: [...LIVE] } } : {},
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        visibility: true,
        originName: true,
        destinationName: true,
        startedAt: true,
        createdAt: true,
        owner: { select: { id: true, displayName: true } },
        _count: { select: { members: { where: { status: "active" } }, sosIncidents: { where: { status: { in: ["open", "acknowledged"] } } } } }
      }
    });
  }

  async forceEnd(actor: AuthenticatedUser, convoyId: string, reason: string) {
    const convoy = await this.prisma.convoy.update({ where: { id: convoyId }, data: { status: "cancelled", completedAt: new Date() } });
    await this.redis.client.del(`cmeta:${convoyId}`).catch(() => undefined);
    this.bus.toConvoy(convoyId, SOCKET_EVENTS.state, { type: "status", status: "cancelled", reason: `Ended by KAAFILA operations: ${reason}` });
    await this.audit.record(actor.id, "convoy.force_end", "convoy", convoyId, { reason });
    return convoy;
  }

  sos(status: "open" | "all" = "open") {
    return this.prisma.sosIncident.findMany({
      where: status === "open" ? { status: { in: ["open", "acknowledged"] } } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, displayName: true, phone: true, emergencyContactName: true, emergencyContactPhone: true } }, convoy: { select: { id: true, name: true } } }
    });
  }

  /* ------------------------------- moderation ------------------------------ */

  async moderation() {
    const [reports, hiddenPosts, roadReports] = await Promise.all([
      this.prisma.report.findMany({ where: { status: { in: ["open", "reviewing"] } }, orderBy: { createdAt: "desc" }, take: 100, include: { reporter: { select: { id: true, displayName: true } } } }),
      this.prisma.post.findMany({ where: { isHidden: true }, orderBy: { updatedAt: "desc" }, take: 50, include: { author: { select: { id: true, displayName: true } } } }),
      this.prisma.roadReport.findMany({ where: { isRemoved: false, expiresAt: { gt: new Date() }, dismissals: { gte: 2 } }, orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    return { reports, hiddenPosts, disputedRoadReports: roadReports };
  }

  async resolveReport(actor: AuthenticatedUser, reportId: string, decision: "resolved" | "rejected", hideSubject: boolean) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("Report not found");
    if (hideSubject && decision === "resolved") {
      if (report.subjectType === "post") await this.prisma.post.updateMany({ where: { id: report.subjectId }, data: { isHidden: true } });
      if (report.subjectType === "comment") await this.prisma.postComment.updateMany({ where: { id: report.subjectId }, data: { isHidden: true } });
      if (report.subjectType === "road_report") await this.prisma.roadReport.updateMany({ where: { id: report.subjectId }, data: { isRemoved: true } });
      if (report.subjectType === "user") await this.setSuspended(actor, report.subjectId, true, `Report ${reportId}`);
    }
    const updated = await this.prisma.report.update({ where: { id: reportId }, data: { status: decision, assigneeId: actor.id } });
    await this.audit.record(actor.id, decision === "resolved" ? "report.resolve" : "report.reject", "report", reportId, { hideSubject, subject: `${report.subjectType}:${report.subjectId}` });
    return updated;
  }

  async setPostHidden(actor: AuthenticatedUser, postId: string, hidden: boolean) {
    const post = await this.prisma.post.update({ where: { id: postId }, data: { isHidden: hidden } });
    await this.audit.record(actor.id, hidden ? "post.hide" : "post.restore", "post", postId);
    return post;
  }

  async removeRoadReport(actor: AuthenticatedUser, id: string) {
    const r = await this.prisma.roadReport.update({ where: { id }, data: { isRemoved: true } });
    await this.audit.record(actor.id, "road_report.remove", "road_report", id);
    return r;
  }

  /* -------------------------------- meetups -------------------------------- */

  pendingMeetups() {
    return this.prisma.meetup.findMany({ where: { status: "pending_review" }, orderBy: { startsAt: "asc" }, include: { host: { select: { id: true, displayName: true, email: true } } } });
  }

  async reviewMeetup(actor: AuthenticatedUser, id: string, decision: "approve" | "reject", note?: string) {
    const meetup = await this.prisma.meetup.update({ where: { id }, data: { status: decision === "approve" ? "published" : "rejected", reviewNote: note } });
    await this.audit.record(actor.id, decision === "approve" ? "meetup.approve" : "meetup.reject", "meetup", id, { note });
    this.bus.toUser(meetup.hostId, "meetup:reviewed", { id, decision, note });
    return meetup;
  }

  /* ------------------------- announcements & flags ------------------------- */

  announcements() {
    return this.prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  }

  async createAnnouncement(actor: AuthenticatedUser, data: { title: string; body: string; countryCode?: string; severity?: "info" | "warning" | "critical"; endsAt?: string }) {
    const a = await this.prisma.announcement.create({
      data: { title: data.title, body: data.body, countryCode: data.countryCode?.toUpperCase(), severity: data.severity ?? "info", endsAt: data.endsAt ? new Date(data.endsAt) : undefined, createdById: actor.id }
    });
    await this.audit.record(actor.id, "announcement.create", "announcement", a.id, { title: a.title });
    return a;
  }

  async deleteAnnouncement(actor: AuthenticatedUser, id: string) {
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.record(actor.id, "announcement.delete", "announcement", id);
    return { ok: true };
  }

  flags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  }

  async upsertFlag(actor: AuthenticatedUser, key: string, data: { enabled: boolean; rolloutPct?: number; description?: string }) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled: data.enabled, rolloutPct: data.rolloutPct ?? 100, description: data.description, updatedBy: actor.id },
      create: { key, enabled: data.enabled, rolloutPct: data.rolloutPct ?? 100, description: data.description, updatedBy: actor.id }
    });
    await this.redis.client.del("flags:all").catch(() => undefined);
    await this.audit.record(actor.id, "flag.upsert", "flag", key, data);
    return flag;
  }

  async auditLog(cursor?: string) {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 101, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { items: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99]!.id : null };
  }
}
