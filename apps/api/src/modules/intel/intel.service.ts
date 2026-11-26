import { Injectable, Logger } from "@nestjs/common";
import {
  buildRouteIndex,
  computeFormation,
  convoyHealthScore,
  deadZonesAhead,
  decodePolyline,
  elasticBand,
  fairRegroup,
  fallbackRoute,
  fatigueStatus,
  geohashEncode,
  pointAtChainage,
  recommendRangeStop,
  weakestLinkRange,
  type ConvoyIntelReport,
  type LiveVehicleState,
  type RangeStopAdvice,
  type RouteIndex,
  type StopCandidate
} from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { PlacesService } from "../integrations/places.service";
import { TrackingService, type ConvoyMeta } from "../tracking/tracking.service";

@Injectable()
export class IntelService {
  private readonly logger = new Logger(IntelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly tracking: TrackingService,
    private readonly places: PlacesService
  ) {}

  routeFor(meta: ConvoyMeta): { route: RouteIndex; isEstimate: boolean } {
    if (meta.routePolyline) {
      const points = decodePolyline(meta.routePolyline);
      if (points.length >= 2) return { route: buildRouteIndex(points), isEstimate: points.length === 2 };
    }
    return { route: fallbackRoute(meta.origin, meta.destination), isEstimate: true };
  }

  async forConvoy(user: Pick<AuthenticatedUser, "id" | "role">, convoyId: string): Promise<ConvoyIntelReport> {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    // Many clients in one convoy poll the same report; compute it at most every 10 seconds.
    return this.redis.remember(`intel:${convoyId}`, 10, () => this.compute(convoyId));
  }

  async compute(convoyId: string): Promise<ConvoyIntelReport> {
    const [meta, vehicles, openSosCount] = await Promise.all([
      this.tracking.convoyMeta(convoyId),
      this.tracking.liveVehicles(convoyId),
      this.prisma.sosIncident.count({ where: { convoyId, status: { in: ["open", "acknowledged"] } } })
    ]);
    const notes: string[] = [];
    const { route, isEstimate } = this.routeFor(meta);
    if (isEstimate) notes.push("Route is a straight-line estimate; formation distances are approximate.");

    const s = meta.settings;
    const now = Date.now();
    const formation = computeFormation(
      route,
      vehicles.map((v) => ({ vehicleId: v.vehicleId, displayName: v.displayName, position: v.position, speedKph: v.speedKph, capturedAtIso: v.capturedAtIso })),
      { offRouteThresholdMeters: s.offRouteMeters ?? 150, nowMs: now }
    );
    const elastic = elasticBand(formation, { softMeters: s.elasticSoftMeters, hardMeters: s.elasticHardMeters });
    const lead = formation.entries.find((e) => e.vehicleId === formation.leadVehicleId);
    const leadChainage = lead?.chainageMeters ?? 0;

    const range = weakestLinkRange(vehicles.map((v) => this.rangeInput(v)));
    const advice = await this.rangeAdvice(route, leadChainage, range, notes);

    const fatigue = vehicles.map((v) => ({
      vehicleId: v.vehicleId,
      displayName: v.displayName,
      ...fatigueStatus(v.drivingSinceIso, now, { breakAfterMinutes: s.breakAfterMinutes })
    }));

    const regroupSuggestions =
      vehicles.length >= 2 && (elastic.level !== "tight" || formation.offRouteCount > 0) ? await this.regroupSuggestions(route, formation, vehicles, notes) : [];

    const deadZones = await this.deadZones(route, leadChainage);

    return {
      convoyId,
      generatedAtIso: new Date(now).toISOString(),
      healthScore: convoyHealthScore({
        elastic: elastic.level,
        offRouteCount: formation.offRouteCount,
        staleCount: formation.staleCount,
        openSosCount,
        fatigueDueCount: fatigue.filter((f) => f.level === "due").length,
        rangeStatus: advice.status
      }),
      formation,
      elastic,
      range: { ...range, advice },
      fatigue,
      regroupSuggestions,
      deadZones,
      openSosCount,
      routeIsEstimate: isEstimate,
      notes
    };
  }

  private rangeInput(v: LiveVehicleState) {
    const isEv = v.fuelType === "ev" || v.vehicleType === "ev";
    return { vehicleId: v.vehicleId, displayName: v.displayName, levelPct: isEv ? v.batteryPct : v.fuelPct, rangeKmFull: v.rangeKmFull, isEv };
  }

  private async rangeAdvice(
    route: RouteIndex,
    leadChainage: number,
    range: ReturnType<typeof weakestLinkRange>,
    notes: string[]
  ): Promise<RangeStopAdvice> {
    const first = recommendRangeStop(route, leadChainage, range, []);
    if (first.status === "ok" || first.status === "unknown") return first;

    const limiting = range.entries.find((e) => e.vehicleId === range.limitingVehicleId);
    const reach = (range.convoyRangeKm ?? 0) * 1000 * 0.9;
    const probe = pointAtChainage(route, leadChainage + Math.min(reach * 0.6, 15_000));
    try {
      const pois = await this.places.nearby(limiting?.isEv ? "ev_charging" : "fuel", probe, 20_000, 40);
      const candidates: StopCandidate[] = pois.map((p) => ({ id: p.id, name: p.name, position: { lat: p.lat, lng: p.lng }, kind: p.category }));
      return recommendRangeStop(route, leadChainage, range, candidates, limiting?.isEv);
    } catch (err) {
      this.logger.warn(`range stop lookup failed: ${(err as Error).message}`);
      notes.push("Stations lookup is unavailable right now; range advice is based on distance only.");
      return {
        status: "plan_stop",
        stop: null,
        message: `${limiting?.displayName ?? "One car"} can cover about ${range.convoyRangeKm} km. Plan a ${limiting?.isEv ? "charging" : "fuel"} stop within ${Math.round(reach / 1000)} km.`
      };
    }
  }

  private async regroupSuggestions(route: RouteIndex, formation: ReturnType<typeof computeFormation>, vehicles: LiveVehicleState[], notes: string[]) {
    const live = formation.entries.filter((e) => !e.stale);
    if (live.length < 2) return [];
    const mid = (live[0]!.chainageMeters + live[live.length - 1]!.chainageMeters) / 2;
    // Bias slightly ahead of the midpoint: the tail can catch up while the front slows.
    const probe = pointAtChainage(route, mid + formation.stretchMeters * 0.15);
    try {
      const [food, fuel] = await Promise.all([this.places.nearby("food", probe, 8000, 15), this.places.nearby("fuel", probe, 8000, 15)]);
      const candidates: StopCandidate[] = [...food, ...fuel].map((p) => ({ id: p.id, name: p.name, position: { lat: p.lat, lng: p.lng }, kind: p.category }));
      if (candidates.length === 0) return [];
      const liveIds = new Set(live.map((e) => e.vehicleId));
      const ranking = fairRegroup(
        vehicles.filter((v) => liveIds.has(v.vehicleId)).map((v) => ({ vehicleId: v.vehicleId, position: v.position, speedKph: v.speedKph })),
        candidates,
        route
      );
      return ranking.slice(0, 3).map((r) => ({ name: r.candidate.name, position: r.candidate.position, maxEtaSeconds: r.maxEtaSeconds, kind: r.candidate.kind }));
    } catch (err) {
      this.logger.warn(`regroup lookup failed: ${(err as Error).message}`);
      notes.push("Regroup suggestions are unavailable right now (places lookup failed).");
      return [];
    }
  }

  private async deadZones(route: RouteIndex, leadChainage: number) {
    const hashes = new Set<string>();
    const end = Math.min(route.totalMeters, leadChainage + 40_000);
    for (let ch = leadChainage; ch <= end; ch += 400) hashes.add(geohashEncode(pointAtChainage(route, ch), 6));
    const cells = await this.tracking.coverageCells([...hashes]);
    return deadZonesAhead(route, leadChainage, cells);
  }
}
