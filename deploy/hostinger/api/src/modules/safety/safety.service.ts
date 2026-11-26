import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SOCKET_EVENTS, type SosEvent } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AuditService } from "../../shared/audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { RealtimeBus } from "../core/realtime-bus.service";

export interface RaiseSosInput {
  convoyId?: string;
  kind: SosEvent["kind"];
  lat: number;
  lng: number;
  notes?: string;
  peakG?: number;
}

type TimelineEntry = { at: string; by: string; event: string; note?: string };

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly bus: RealtimeBus,
    private readonly audit: AuditService
  ) {}

  async raise(user: AuthenticatedUser, input: RaiseSosInput): Promise<SosEvent> {
    let vehicleId: string | undefined;
    if (input.convoyId) {
      const member = await this.access.requireMember(input.convoyId, user);
      vehicleId = member.vehicleId ?? undefined;
    }
    // Duplicate taps within 20 s update the same incident instead of creating another.
    const recent = await this.prisma.sosIncident.findFirst({
      where: { userId: user.id, status: "open", createdAt: { gt: new Date(Date.now() - 20_000) } },
      orderBy: { createdAt: "desc" }
    });

    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { bloodGroup: true, medicalNotes: true, emergencyContactName: true, emergencyContactPhone: true }
    });
    const entry: TimelineEntry = { at: new Date().toISOString(), by: user.id, event: "raised", note: input.notes };

    const incident = recent
      ? await this.prisma.sosIncident.update({
          where: { id: recent.id },
          data: { lat: input.lat, lng: input.lng, timeline: [...this.timeline(recent.timeline), { ...entry, event: "location_update" }] as Prisma.InputJsonArray }
        })
      : await this.prisma.sosIncident.create({
          data: {
            convoyId: input.convoyId,
            userId: user.id,
            vehicleId,
            kind: input.kind,
            lat: input.lat,
            lng: input.lng,
            notes: input.notes,
            peakG: input.peakG,
            timeline: [entry] as Prisma.InputJsonArray
          }
        });

    if (!recent && input.convoyId) {
      await this.prisma.alert.create({
        data: {
          convoyId: input.convoyId,
          type: "sos",
          severity: "critical",
          title: input.kind === "crash_detected" ? "Possible crash detected" : "SOS raised",
          message: `${user.displayName} needs help (${input.kind.replace("_", " ")}).`,
          vehicleId,
          lat: input.lat,
          lng: input.lng
        }
      });
    }

    const event: SosEvent = {
      id: incident.id,
      convoyId: input.convoyId,
      userId: user.id,
      displayName: user.displayName,
      vehicleId,
      kind: incident.kind,
      status: incident.status,
      position: { lat: incident.lat, lng: incident.lng },
      createdAtIso: incident.createdAt.toISOString(),
      medical: {
        bloodGroup: profile?.bloodGroup ?? undefined,
        notes: profile?.medicalNotes ?? undefined,
        emergencyContactName: profile?.emergencyContactName ?? undefined,
        emergencyContactPhone: profile?.emergencyContactPhone ?? undefined
      }
    };
    if (input.convoyId) this.bus.toConvoy(input.convoyId, recent ? SOCKET_EVENTS.sosUpdate : SOCKET_EVENTS.sosNew, event);
    this.bus.toStaff(recent ? SOCKET_EVENTS.sosUpdate : SOCKET_EVENTS.sosNew, event);
    await this.redis.client.del(`intel:${input.convoyId}`).catch(() => undefined);
    return event;
  }

  async transition(user: AuthenticatedUser, id: string, next: "acknowledged" | "resolved" | "false_alarm", note?: string) {
    const incident = await this.prisma.sosIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException("Incident not found");

    const isStaff = user.role === "admin" || user.role === "support";
    const isOwner = incident.userId === user.id;
    let isConvoyMember = false;
    if (incident.convoyId) isConvoyMember = Boolean(await this.access.membership(incident.convoyId, user.id));
    // Anyone in the convoy can acknowledge; only the person, staff, or convoy members can resolve.
    if (!isStaff && !isOwner && !isConvoyMember) throw new ForbiddenException("You cannot update this incident");
    if (next === "false_alarm" && !isOwner && !isStaff) throw new ForbiddenException("Only the person who raised it can mark a false alarm");

    const now = new Date();
    const updated = await this.prisma.sosIncident.update({
      where: { id },
      data: {
        status: next,
        ...(next === "acknowledged" ? { acknowledgedBy: user.id, acknowledgedAt: now } : { resolvedBy: user.id, resolvedAt: now }),
        timeline: [...this.timeline(incident.timeline), { at: now.toISOString(), by: user.id, event: next, note }] as Prisma.InputJsonArray
      }
    });
    if (isStaff && !isOwner && !isConvoyMember) await this.audit.record(user.id, next === "acknowledged" ? "sos.acknowledge" : "sos.resolve", "sos", id, { note });

    const payload = { id, status: updated.status, by: user.displayName, atIso: now.toISOString() };
    if (incident.convoyId) this.bus.toConvoy(incident.convoyId, SOCKET_EVENTS.sosUpdate, payload);
    this.bus.toStaff(SOCKET_EVENTS.sosUpdate, payload);
    await this.redis.client.del(`intel:${incident.convoyId}`).catch(() => undefined);
    return updated;
  }

  async listForConvoy(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    return this.prisma.sosIncident.findMany({
      where: { convoyId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { displayName: true } } }
    });
  }

  async mine(userId: string) {
    return this.prisma.sosIncident.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  }

  private timeline(value: Prisma.JsonValue | null): TimelineEntry[] {
    return Array.isArray(value) ? (value as unknown as TimelineEntry[]) : [];
  }
}
