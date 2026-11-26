/**
 * Offline demo convoy. Runs the real shared intelligence functions on simulated vehicles so the
 * cockpit is fully explorable without an account or a server. Everything here is labelled demo.
 */
import {
  buildRouteIndex,
  computeFormation,
  convoyHealthScore,
  deadZonesAhead,
  elasticBand,
  encodePolyline,
  fairRegroup,
  fatigueStatus,
  geohashEncode,
  interpolate,
  pointAtChainage,
  recommendRangeStop,
  weakestLinkRange,
  type ConvoyIntelReport,
  type GeoPoint,
  type LiveVehicleState,
  type RouteIndex,
  type StopCandidate
} from "@kaafila/shared";

/** Approximate corridor through real town centres (Navi Mumbai → Pune). Not a navigable route. */
const TOWNS: GeoPoint[] = [
  { lat: 19.0771, lng: 72.9986 },
  { lat: 18.9894, lng: 73.1175 },
  { lat: 18.82, lng: 73.28 },
  { lat: 18.7546, lng: 73.4062 },
  { lat: 18.735, lng: 73.6756 },
  { lat: 18.5204, lng: 73.8567 }
];

function densify(points: GeoPoint[], steps = 12): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 0; s < steps; s++) out.push(interpolate(points[i]!, points[i + 1]!, s / steps));
  }
  out.push(points[points.length - 1]!);
  return out;
}

export const DEMO_ROUTE_POINTS = densify(TOWNS);
export const DEMO_ROUTE: RouteIndex = buildRouteIndex(DEMO_ROUTE_POINTS);
export const DEMO_POLYLINE = encodePolyline(DEMO_ROUTE_POINTS);

export const DEMO_CONVOY = {
  id: "demo",
  name: "Demo: Navi Mumbai → Pune",
  inviteCode: "KAA-DEMO01",
  origin: TOWNS[0]!,
  destination: TOWNS[TOWNS.length - 1]!,
  originName: "Navi Mumbai",
  destinationName: "Pune"
};

interface DemoCar {
  vehicleId: string;
  userId: string;
  displayName: string;
  vehicleName: string;
  vehicleType: LiveVehicleState["vehicleType"];
  role: LiveVehicleState["role"];
  cruiseKph: number;
  chainage: number;
  levelPct: number;
  rangeKmFull: number;
  fuelType: LiveVehicleState["fuelType"];
  drivingSinceMinAgo: number;
  lostSignalBetween?: [number, number];
}

const START: DemoCar[] = [
  { vehicleId: "d1", userId: "u1", displayName: "Aarav", vehicleName: "Mahindra XUV700", vehicleType: "suv", role: "leader", cruiseKph: 82, chainage: 18_000, levelPct: 62, rangeKmFull: 750, fuelType: "diesel", drivingSinceMinAgo: 96 },
  { vehicleId: "d2", userId: "u2", displayName: "Zara", vehicleName: "Hyundai Creta", vehicleType: "suv", role: "driver", cruiseKph: 80, chainage: 17_500, levelPct: 41, rangeKmFull: 600, fuelType: "petrol", drivingSinceMinAgo: 96 },
  { vehicleId: "d3", userId: "u3", displayName: "Kabir", vehicleName: "Tata Nexon EV", vehicleType: "ev", role: "driver", cruiseKph: 74, chainage: 17_000, levelPct: 24, rangeKmFull: 300, fuelType: "ev", drivingSinceMinAgo: 118 },
  { vehicleId: "d4", userId: "u4", displayName: "Maya", vehicleName: "Toyota Innova", vehicleType: "car", role: "sweeper", cruiseKph: 72, chainage: 16_700, levelPct: 70, rangeKmFull: 800, fuelType: "diesel", drivingSinceMinAgo: 40 }
];

/** Demo-only POIs (generic names, placed on the corridor). */
export const DEMO_STOPS: StopCandidate[] = [
  { id: "s1", name: "Highway food court (demo)", position: pointAtChainage(DEMO_ROUTE, 26_000), kind: "food" },
  { id: "s2", name: "Fuel & EV charging plaza (demo)", position: pointAtChainage(DEMO_ROUTE, 31_000), kind: "fuel" },
  { id: "s3", name: "Ghat viewpoint parking (demo)", position: pointAtChainage(DEMO_ROUTE, 52_000), kind: "parking" },
  { id: "s4", name: "Fuel station (demo)", position: pointAtChainage(DEMO_ROUTE, 64_000), kind: "fuel" }
];

/** Demo dead-zone cells around the ghat section, as if learned from past convoys. */
const DEMO_CELLS = (() => {
  const cells = new Map<string, { geohash: string; samples: number; gapCount: number }>();
  for (let ch = 47_000; ch <= 53_000; ch += 300) {
    const h = geohashEncode(pointAtChainage(DEMO_ROUTE, ch), 6);
    cells.set(h, { geohash: h, samples: 12, gapCount: 7 });
  }
  return [...cells.values()];
})();

export class DemoConvoy {
  private cars: DemoCar[] = START.map((c) => ({ ...c }));
  private readonly startedAt = Date.now();
  private crumbs: GeoPoint[] = [];

  tick(seconds: number, extraSpeedForLeader = 0) {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    for (const car of this.cars) {
      // Kabir drifts back over time to make the elastic band visible; the leader eases off when told.
      const wobble = Math.sin(elapsed / 9 + car.cruiseKph) * 3;
      const lag = car.vehicleId === "d3" ? Math.min(10, elapsed / 30) : 0;
      const kph = Math.max(0, car.cruiseKph + wobble - lag + (car.role === "leader" ? extraSpeedForLeader : 0));
      car.chainage = Math.min(DEMO_ROUTE.totalMeters, car.chainage + (kph / 3.6) * seconds);
      car.levelPct = Math.max(3, car.levelPct - ((kph / 3.6) * seconds) / 1000 / car.rangeKmFull * 100);
      (car as DemoCar & { kph: number }).kph = kph;
    }
    const leader = this.cars[0]!;
    this.crumbs.push(pointAtChainage(DEMO_ROUTE, leader.chainage));
    if (this.crumbs.length > 400) this.crumbs.shift();
  }

  vehicles(): LiveVehicleState[] {
    const now = Date.now();
    return this.cars.map((car) => {
      const kph = (car as DemoCar & { kph?: number }).kph ?? car.cruiseKph;
      const pos = pointAtChainage(DEMO_ROUTE, car.chainage);
      const ahead = pointAtChainage(DEMO_ROUTE, car.chainage + 50);
      const heading = (Math.atan2(ahead.lng - pos.lng, ahead.lat - pos.lat) * 180) / Math.PI;
      return {
        vehicleId: car.vehicleId,
        userId: car.userId,
        convoyId: "demo",
        displayName: car.displayName,
        vehicleName: car.vehicleName,
        vehicleType: car.vehicleType,
        role: car.role,
        position: pos,
        speedKph: kph,
        headingDeg: (heading + 360) % 360,
        fuelPct: car.fuelType === "ev" ? undefined : Math.round(car.levelPct),
        batteryPct: car.fuelType === "ev" ? Math.round(car.levelPct) : undefined,
        rangeKmFull: car.rangeKmFull,
        fuelType: car.fuelType,
        capturedAtIso: new Date(now - 1500).toISOString(),
        drivingSinceIso: new Date(this.startedAt - car.drivingSinceMinAgo * 60_000).toISOString(),
        plan: "drive"
      };
    });
  }

  breadcrumbs() {
    return this.crumbs;
  }

  intel(): ConvoyIntelReport {
    const vehicles = this.vehicles();
    const now = Date.now();
    const formation = computeFormation(
      DEMO_ROUTE,
      vehicles.map((v) => ({ vehicleId: v.vehicleId, displayName: v.displayName, position: v.position, speedKph: v.speedKph, capturedAtIso: v.capturedAtIso })),
      { nowMs: now }
    );
    const elastic = elasticBand(formation);
    const lead = formation.entries[0]?.chainageMeters ?? 0;
    const range = weakestLinkRange(
      vehicles.map((v) => ({ vehicleId: v.vehicleId, displayName: v.displayName, levelPct: v.fuelType === "ev" ? v.batteryPct : v.fuelPct, rangeKmFull: v.rangeKmFull, isEv: v.fuelType === "ev" }))
    );
    const limitingIsEv = range.entries.find((e) => e.vehicleId === range.limitingVehicleId)?.isEv ?? false;
    const advice = recommendRangeStop(DEMO_ROUTE, lead, range, DEMO_STOPS.filter((s) => s.kind === "fuel"), limitingIsEv);
    const fatigue = vehicles.map((v) => ({ vehicleId: v.vehicleId, displayName: v.displayName, ...fatigueStatus(v.drivingSinceIso, now) }));
    const regroup =
      elastic.level !== "tight"
        ? fairRegroup(
            vehicles.map((v) => ({ vehicleId: v.vehicleId, position: v.position, speedKph: v.speedKph })),
            DEMO_STOPS,
            DEMO_ROUTE
          )
            .slice(0, 3)
            .map((r) => ({ name: r.candidate.name, position: r.candidate.position, maxEtaSeconds: r.maxEtaSeconds, kind: r.candidate.kind }))
        : [];
    const deadZones = deadZonesAhead(DEMO_ROUTE, lead, DEMO_CELLS);
    return {
      convoyId: "demo",
      generatedAtIso: new Date(now).toISOString(),
      healthScore: convoyHealthScore({
        elastic: elastic.level,
        offRouteCount: formation.offRouteCount,
        staleCount: formation.staleCount,
        openSosCount: 0,
        fatigueDueCount: fatigue.filter((f) => f.level === "due").length,
        rangeStatus: advice.status
      }),
      formation,
      elastic,
      range: { ...range, advice },
      fatigue,
      regroupSuggestions: regroup,
      deadZones,
      openSosCount: 0,
      routeIsEstimate: false,
      notes: ["Demo data: simulated cars on an approximate corridor. Sign in to run a real convoy."]
    };
  }
}
