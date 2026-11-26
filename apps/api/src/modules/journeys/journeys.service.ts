import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { haversineMeters } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { EntitlementsService } from "../core/entitlements.service";
import type { CreateJourneyEventDto } from "./dto/create-journey-event.dto";

@Injectable()
export class JourneysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConvoyAccessService,
    private readonly entitlements: EntitlementsService
  ) {}

  async start(user: AuthenticatedUser, convoyId: string) {
    const member = await this.access.requireCommander(convoyId, user);
    const limits = await this.entitlements.limitsForVehicle(member.vehicleId);
    if (!limits.journeyRecording) throw new ForbiddenException("Journey recording is part of KAAFILA Drive (₹500 per car per month)");
    return this.prisma.journeyRecording.upsert({
      where: { convoyId },
      update: { status: "recording" },
      create: { convoyId, status: "recording", startedAt: new Date() }
    });
  }

  async forConvoy(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    return this.prisma.journeyRecording.findUnique({ where: { convoyId }, include: { events: { orderBy: { capturedAt: "asc" }, take: 500 } } });
  }

  async addEvent(user: AuthenticatedUser, dto: CreateJourneyEventDto) {
    const journey = await this.prisma.journeyRecording.findUnique({ where: { id: dto.journeyId }, select: { convoyId: true, status: true } });
    if (!journey) throw new NotFoundException("Journey not found");
    await this.access.requireMember(journey.convoyId, user);
    if (journey.status !== "recording") throw new ForbiddenException("This journey is not recording");
    return this.prisma.journeyEvent.create({
      data: {
        journeyId: dto.journeyId,
        type: dto.type,
        title: dto.title,
        lat: dto.lat,
        lng: dto.lng,
        metadata: { ...dto.metadata, by: user.id } as Prisma.InputJsonObject,
        capturedAt: new Date(dto.capturedAt)
      }
    });
  }

  private async load(user: AuthenticatedUser, journeyId: string) {
    const journey = await this.prisma.journeyRecording.findUnique({
      where: { id: journeyId },
      include: { convoy: { select: { id: true, name: true, startedAt: true, completedAt: true } }, events: { orderBy: { capturedAt: "asc" } } }
    });
    if (!journey) throw new NotFoundException("Journey not found");
    await this.access.requireMember(journey.convoyId, user, { allowStaff: true });
    return journey;
  }

  async getReplay(user: AuthenticatedUser, journeyId: string) {
    const journey = await this.load(user, journeyId);
    const frames = await this.prisma.locationPing.findMany({
      where: { convoyId: journey.convoyId, capturedAt: { gte: journey.startedAt, ...(journey.completedAt ? { lte: journey.completedAt } : {}) } },
      orderBy: { capturedAt: "asc" },
      take: 50_000,
      select: { capturedAt: true, vehicleId: true, lat: true, lng: true, speedKph: true, headingDeg: true }
    });
    return {
      journey,
      frames: frames.map((f) => ({ ts: f.capturedAt.toISOString(), vehicleId: f.vehicleId, location: { lat: f.lat, lng: f.lng }, speedKph: f.speedKph, headingDeg: f.headingDeg }))
    };
  }

  async complete(user: AuthenticatedUser, journeyId: string) {
    const journey = await this.prisma.journeyRecording.findUnique({ where: { id: journeyId } });
    if (!journey) throw new NotFoundException("Journey not found");
    await this.access.requireCommander(journey.convoyId, user);
    const report = await this.getReport(user, journeyId);
    return this.prisma.journeyRecording.update({
      where: { id: journeyId },
      data: { status: "completed", completedAt: new Date(), summary: report.stats as unknown as Prisma.InputJsonObject }
    });
  }

  /** Per-vehicle distance, moving/stopped time and speeds computed from stored pings. */
  async getReport(user: AuthenticatedUser, journeyId: string) {
    const replay = await this.getReplay(user, journeyId);
    const byVehicle = new Map<string, typeof replay.frames>();
    for (const f of replay.frames) {
      const list = byVehicle.get(f.vehicleId) ?? [];
      list.push(f);
      byVehicle.set(f.vehicleId, list);
    }
    const vehicles = [...byVehicle.entries()].map(([vehicleId, frames]) => {
      let distance = 0;
      let moving = 0;
      let stopped = 0;
      for (let i = 1; i < frames.length; i++) {
        const dt = (Date.parse(frames[i]!.ts) - Date.parse(frames[i - 1]!.ts)) / 1000;
        if (dt <= 0 || dt > 600) continue; // ignore gaps (dead zones, app closed)
        const d = haversineMeters(frames[i - 1]!.location, frames[i]!.location);
        distance += d;
        if (frames[i]!.speedKph >= 5) moving += dt;
        else stopped += dt;
      }
      const speeds = frames.map((f) => f.speedKph);
      return {
        vehicleId,
        distanceKm: Math.round(distance / 100) / 10,
        movingMinutes: Math.round(moving / 60),
        stoppedMinutes: Math.round(stopped / 60),
        averageMovingSpeedKph: moving > 0 ? Math.round((distance / moving) * 3.6) : 0,
        maxSpeedKph: speeds.length ? Math.round(Math.max(...speeds)) : 0
      };
    });
    const events = replay.journey.events;
    return {
      journeyId,
      convoy: replay.journey.convoy,
      stats: {
        vehicles,
        frames: replay.frames.length,
        events: events.length,
        tollsPaidMinor: events.filter((e) => e.type === "toll").reduce((s, e) => s + Number((e.metadata as Record<string, unknown>)?.amountMinor ?? 0), 0),
        checkpoints: events.filter((e) => e.type === "checkpoint").length,
        generatedAtIso: new Date().toISOString()
      }
    };
  }
}
