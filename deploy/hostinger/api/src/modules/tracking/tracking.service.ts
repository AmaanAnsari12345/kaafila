import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  geohashEncode,
  geohashesAlongSegment,
  haversineMeters,
  nextDrivingSince,
  SOCKET_EVENTS,
  type ConvoyStateSnapshot,
  type FuelType,
  type GeoPoint,
  type LiveVehicleState,
  type RegroupPoint,
  type VehicleType
} from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { EntitlementsService } from "../core/entitlements.service";
import { RealtimeBus } from "../core/realtime-bus.service";
import type { LocationPingDto } from "./dto/location-ping.dto";

export interface ConvoyMeta {
  id: string;
  name: string;
  status: string;
  leaderUserId: string;
  ownerId: string;
  routePolyline: string | null;
  origin: GeoPoint;
  destination: GeoPoint;
  destinationName: string | null;
  regroup: RegroupPoint | null;
  settings: Record<string, number>;
}

interface VehicleMeta {
  displayName: string;
  vehicleName: string;
  vehicleType: VehicleType;
  fuelType?: FuelType;
  rangeKmFull?: number;
}

interface DriveState {
  drivingSinceIso?: string;
  stoppedSinceIso?: string;
}

const LIVE_TTL = 300;
const GAP_SECONDS = 60;

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly bus: RealtimeBus
  ) {}

  /* ------------------------------ cached metadata ------------------------------ */

  async convoyMeta(convoyId: string): Promise<ConvoyMeta> {
    return this.redis.remember(`cmeta:${convoyId}`, 30, async () => {
      const c = await this.prisma.convoy.findUnique({ where: { id: convoyId } });
      if (!c) throw new NotFoundException("Convoy not found");
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        leaderUserId: c.leaderUserId,
        ownerId: c.ownerId,
        routePolyline: c.routePolyline,
        origin: { lat: c.originLat, lng: c.originLng },
        destination: { lat: c.destinationLat, lng: c.destinationLng },
        destinationName: c.destinationName,
        regroup:
          c.regroupLat !== null && c.regroupLng !== null
            ? { name: c.regroupName ?? "Regroup", position: { lat: c.regroupLat, lng: c.regroupLng }, setByUserId: c.regroupSetBy ?? "", setAtIso: c.regroupSetAt?.toISOString() ?? "" }
            : null,
        settings: (c.settings as Record<string, number> | null) ?? {}
      };
    });
  }

  async invalidateConvoyMeta(convoyId: string) {
    await this.redis.client.del(`cmeta:${convoyId}`).catch(() => undefined);
  }

  private async vehicleMeta(vehicleId: string, userId: string): Promise<VehicleMeta> {
    return this.redis.remember(`vmeta:${vehicleId}`, 600, async () => {
      const [vehicle, user] = await Promise.all([
        this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { name: true, type: true, fuelType: true, rangeKmFull: true } }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
      ]);
      return {
        displayName: user?.displayName ?? "Driver",
        vehicleName: vehicle?.name ?? "Vehicle",
        vehicleType: (vehicle?.type ?? "car") as VehicleType,
        fuelType: (vehicle?.fuelType ?? undefined) as FuelType | undefined,
        rangeKmFull: vehicle?.rangeKmFull ?? undefined
      };
    });
  }

  /* --------------------------------- hot path --------------------------------- */

  async ingest(user: Pick<AuthenticatedUser, "id">, dto: LocationPingDto) {
    const member = await this.access.requireVehicle(dto.convoyId, user.id, dto.vehicleId);
    const limits = await this.entitlements.limitsForVehicle(dto.vehicleId);

    const intervalMs = Math.max(500, limits.pingIntervalSeconds * 1000 - 300);
    const throttleKey = `ping:${dto.convoyId}:${dto.vehicleId}`;
    if (!(await this.redis.throttle(throttleKey, intervalMs))) {
      const remaining = await this.redis.client.pttl(throttleKey).catch(() => -1);
      return { accepted: false as const, reason: "rate_limited", retryAfterMs: remaining > 0 ? remaining : intervalMs, plan: limits.plan };
    }

    const captured = Date.parse(dto.capturedAt);
    const now = Date.now();
    if (captured > now + 60_000) return { accepted: false as const, reason: "clock_skew", plan: limits.plan };

    const liveKey = `live:${dto.convoyId}:${dto.vehicleId}`;
    const [prev, drive, meta, convoy] = await Promise.all([
      this.redis.getJson<LiveVehicleState>(liveKey),
      this.redis.getJson<DriveState>(`drive:${dto.convoyId}:${dto.vehicleId}`),
      this.vehicleMeta(dto.vehicleId, user.id),
      this.convoyMeta(dto.convoyId)
    ]);

    // Out-of-order delivery (e.g. after a dead zone): store durably but don't move the live marker back.
    const isLatest = !prev || Date.parse(prev.capturedAtIso) <= captured;
    const position = { lat: dto.lat, lng: dto.lng };
    const capturedAtIso = new Date(captured).toISOString();
    const nextDrive = isLatest ? nextDrivingSince(drive ?? {}, dto.speedKph, capturedAtIso) : (drive ?? {});

    const state: LiveVehicleState = {
      vehicleId: dto.vehicleId,
      userId: user.id,
      convoyId: dto.convoyId,
      displayName: meta.displayName,
      vehicleName: meta.vehicleName,
      vehicleType: meta.vehicleType,
      role: member.role,
      position,
      speedKph: dto.speedKph,
      headingDeg: dto.headingDeg,
      accuracyMeters: dto.accuracyMeters,
      fuelPct: dto.fuelPct ?? prev?.fuelPct,
      batteryPct: dto.batteryPct ?? prev?.batteryPct,
      rangeKmFull: meta.rangeKmFull,
      fuelType: meta.fuelType,
      capturedAtIso,
      drivingSinceIso: nextDrive.drivingSinceIso,
      plan: limits.plan
    };

    if (isLatest) {
      await Promise.all([
        this.redis.cacheJson(liveKey, state, LIVE_TTL),
        this.redis.cacheJson(`drive:${dto.convoyId}:${dto.vehicleId}`, nextDrive, 6 * 3600),
        this.redis.client.multi().sadd(`live:${dto.convoyId}:set`, dto.vehicleId).expire(`live:${dto.convoyId}:set`, 86_400).exec()
      ]);
      if (user.id === convoy.leaderUserId) {
        await this.redis.pushCapped(`crumbs:${dto.convoyId}`, { lat: dto.lat, lng: dto.lng, t: capturedAtIso }, 600, 12 * 3600);
      }
      this.bus.toConvoy(dto.convoyId, SOCKET_EVENTS.locationUpdate, state);
    }

    if (convoy.status === "boarding" && dto.speedKph >= 15) void this.autoStart(dto.convoyId);

    void this.persist(dto, captured);
    if (prev) void this.learnCoverage(prev, state);

    return { accepted: true as const, state, plan: limits.plan };
  }

  private async autoStart(convoyId: string) {
    try {
      const res = await this.prisma.convoy.updateMany({ where: { id: convoyId, status: "boarding" }, data: { status: "active", startedAt: new Date() } });
      if (res.count) {
        await this.invalidateConvoyMeta(convoyId);
        this.bus.toConvoy(convoyId, SOCKET_EVENTS.state, { type: "status", status: "active" });
      }
    } catch (err) {
      this.logger.warn(`autoStart failed: ${(err as Error).message}`);
    }
  }

  private async persist(dto: LocationPingDto, captured: number) {
    try {
      await this.prisma.locationPing.create({
        data: {
          convoyId: dto.convoyId,
          vehicleId: dto.vehicleId,
          lat: dto.lat,
          lng: dto.lng,
          speedKph: dto.speedKph,
          headingDeg: dto.headingDeg,
          accuracyMeters: dto.accuracyMeters,
          capturedAt: new Date(captured)
        }
      });
    } catch (err) {
      this.logger.error(`ping persist failed: ${(err as Error).message}`);
    }
  }

  /**
   * Dead-Zone Forecast learning. A gap of > 60 s between consecutive pings of a moving vehicle
   * marks every geohash-6 cell along the gap. Normal pings add a sample (at most every 30 s per
   * vehicle) to the current cell so the gap ratio stays meaningful.
   */
  private async learnCoverage(prev: LiveVehicleState, next: LiveVehicleState) {
    try {
      const gapSeconds = (Date.parse(next.capturedAtIso) - Date.parse(prev.capturedAtIso)) / 1000;
      const moved = haversineMeters(prev.position, next.position);
      if (gapSeconds > GAP_SECONDS && gapSeconds < 45 * 60 && moved > 300) {
        const cells = geohashesAlongSegment(prev.position, next.position, 6).slice(0, 200);
        await this.prisma.$executeRaw`
          INSERT INTO "CoverageCell" ("geohash", "samples", "gapCount", "lastGapAt", "updatedAt")
          SELECT g, 1, 1, NOW(), NOW() FROM unnest(${cells}::text[]) AS g
          ON CONFLICT ("geohash") DO UPDATE SET
            "samples" = "CoverageCell"."samples" + 1,
            "gapCount" = "CoverageCell"."gapCount" + 1,
            "lastGapAt" = NOW(),
            "updatedAt" = NOW()`;
        return;
      }
      if (await this.redis.throttle(`cov:${next.vehicleId}`, 30_000)) {
        const cell = geohashEncode(next.position, 6);
        await this.prisma.$executeRaw`
          INSERT INTO "CoverageCell" ("geohash", "samples", "gapCount", "updatedAt") VALUES (${cell}, 1, 0, NOW())
          ON CONFLICT ("geohash") DO UPDATE SET "samples" = "CoverageCell"."samples" + 1, "updatedAt" = NOW()`;
      }
    } catch (err) {
      this.logger.warn(`coverage learning failed: ${(err as Error).message}`);
    }
  }

  /* --------------------------------- reads ------------------------------------ */

  async liveVehicles(convoyId: string): Promise<LiveVehicleState[]> {
    const ids = await this.redis.client.smembers(`live:${convoyId}:set`);
    if (ids.length) {
      const states = await this.redis.mgetJson<LiveVehicleState>(ids.map((id) => `live:${convoyId}:${id}`));
      const live = states.filter((s): s is LiveVehicleState => Boolean(s));
      if (live.length) return live;
    }
    return this.liveFromDatabase(convoyId);
  }

  /** Fallback after a Redis flush: latest ping per active member vehicle. */
  private async liveFromDatabase(convoyId: string): Promise<LiveVehicleState[]> {
    const members = await this.prisma.convoyMember.findMany({
      where: { convoyId, status: "active", vehicleId: { not: null } },
      include: { user: { select: { displayName: true } }, vehicle: { select: { name: true, type: true, fuelType: true, rangeKmFull: true } } }
    });
    const pings = await Promise.all(
      members.map((m) => this.prisma.locationPing.findFirst({ where: { convoyId, vehicleId: m.vehicleId! }, orderBy: { capturedAt: "desc" } }))
    );
    const plans = await Promise.all(members.map((m) => this.entitlements.planForVehicle(m.vehicleId)));
    return members.flatMap((m, i) => {
      const p = pings[i];
      if (!p) return [];
      return [
        {
          vehicleId: m.vehicleId!,
          userId: m.userId,
          convoyId,
          displayName: m.user.displayName,
          vehicleName: m.vehicle?.name ?? "Vehicle",
          vehicleType: (m.vehicle?.type ?? "car") as VehicleType,
          role: m.role,
          position: { lat: p.lat, lng: p.lng },
          speedKph: p.speedKph,
          headingDeg: p.headingDeg,
          accuracyMeters: p.accuracyMeters ?? undefined,
          rangeKmFull: m.vehicle?.rangeKmFull ?? undefined,
          fuelType: (m.vehicle?.fuelType ?? undefined) as FuelType | undefined,
          capturedAtIso: p.capturedAt.toISOString(),
          plan: plans[i]!
        }
      ];
    });
  }

  async snapshot(user: Pick<AuthenticatedUser, "id" | "role">, convoyId: string): Promise<ConvoyStateSnapshot> {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    const [vehicles, meta] = await Promise.all([this.liveVehicles(convoyId), this.convoyMeta(convoyId)]);
    return { convoyId, vehicles, regroup: meta.regroup, serverTimeIso: new Date().toISOString() };
  }

  async breadcrumbs(user: Pick<AuthenticatedUser, "id" | "role">, convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    const crumbs = await this.redis.listJson<{ lat: number; lng: number; t: string }>(`crumbs:${convoyId}`, 600);
    return { convoyId, points: crumbs.reverse() };
  }

  /* --------------------------- public family follow --------------------------- */

  async publicView(token: string) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || link.expiresAt.getTime() < Date.now()) throw new NotFoundException("This follow link has expired or was revoked");
    void this.prisma.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);

    const [meta, vehicles] = await Promise.all([this.convoyMeta(link.convoyId), this.liveVehicles(link.convoyId)]);
    return {
      convoy: { name: meta.name, status: meta.status, destination: meta.destination, destinationName: meta.destinationName, routePolyline: meta.routePolyline },
      regroup: meta.regroup,
      expiresAtIso: link.expiresAt.toISOString(),
      // Minimal data: first names and positions only.
      vehicles: vehicles.map((v) => ({
        vehicleId: v.vehicleId,
        displayName: v.displayName.split(" ")[0],
        vehicleName: v.vehicleName,
        vehicleType: v.vehicleType,
        position: v.position,
        speedKph: Math.round(v.speedKph),
        headingDeg: v.headingDeg,
        lastSeenIso: v.capturedAtIso
      }))
    };
  }

  async coverageCells(geohashes: string[]) {
    if (geohashes.length === 0) return [];
    return this.prisma.coverageCell.findMany({ where: { geohash: { in: geohashes.slice(0, 500) } }, select: { geohash: true, samples: true, gapCount: true } });
  }
}

