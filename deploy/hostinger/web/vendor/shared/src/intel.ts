/**
 * Convoy intelligence: pure, deterministic functions used by the API (authoritative)
 * and by the web client (offline/demo mode). No I/O in this module.
 */
import {
  buildRouteIndex,
  geohashEncode,
  haversineMeters,
  pointAtChainage,
  projectOntoRoute,
  type GeoPoint,
  type RouteIndex
} from "./geo.js";

/* ------------------------------------------------------------------ */
/* Formation                                                          */
/* ------------------------------------------------------------------ */

export interface FormationInput {
  vehicleId: string;
  displayName: string;
  position: GeoPoint;
  speedKph: number;
  capturedAtIso: string;
}

export interface FormationEntry {
  vehicleId: string;
  displayName: string;
  chainageMeters: number;
  crossTrackMeters: number;
  offRoute: boolean;
  stale: boolean;
  /** 1 = front of the convoy */
  order: number;
  /** distance along route to the vehicle directly ahead; null for the leader */
  gapAheadMeters: number | null;
  speedKph: number;
  position: GeoPoint;
}

export interface Formation {
  entries: FormationEntry[];
  leadVehicleId: string | null;
  tailVehicleId: string | null;
  /** route distance between the front and the back of the (non-stale) convoy */
  stretchMeters: number;
  routeTotalMeters: number;
  /** remaining route distance for the lead vehicle */
  remainingMeters: number;
  offRouteCount: number;
  staleCount: number;
}

export interface FormationOptions {
  offRouteThresholdMeters?: number;
  staleAfterSeconds?: number;
  nowMs?: number;
}

export function computeFormation(route: RouteIndex, vehicles: FormationInput[], opts: FormationOptions = {}): Formation {
  const offRouteThreshold = opts.offRouteThresholdMeters ?? 150;
  const staleAfterMs = (opts.staleAfterSeconds ?? 90) * 1000;
  const now = opts.nowMs ?? Date.now();

  const projected = vehicles.map((v) => {
    const proj = projectOntoRoute(route, v.position);
    const age = now - Date.parse(v.capturedAtIso);
    return {
      vehicleId: v.vehicleId,
      displayName: v.displayName,
      chainageMeters: proj.chainageMeters,
      crossTrackMeters: proj.crossTrackMeters,
      offRoute: proj.crossTrackMeters > offRouteThreshold,
      stale: !(age <= staleAfterMs),
      speedKph: v.speedKph,
      position: v.position
    };
  });

  const sorted = [...projected].sort((a, b) => b.chainageMeters - a.chainageMeters);
  const live = sorted.filter((e) => !e.stale);

  let previous: (typeof sorted)[number] | null = null;
  const entries: FormationEntry[] = sorted.map((e, i) => {
    const entry: FormationEntry = {
      ...e,
      order: i + 1,
      gapAheadMeters: previous ? Math.max(0, previous.chainageMeters - e.chainageMeters) : null
    };
    previous = e;
    return entry;
  });

  const lead = live[0] ?? null;
  const tail = live[live.length - 1] ?? null;

  return {
    entries,
    leadVehicleId: lead?.vehicleId ?? null,
    tailVehicleId: tail?.vehicleId ?? null,
    stretchMeters: lead && tail ? Math.max(0, lead.chainageMeters - tail.chainageMeters) : 0,
    routeTotalMeters: route.totalMeters,
    remainingMeters: lead ? Math.max(0, route.totalMeters - lead.chainageMeters) : route.totalMeters,
    offRouteCount: entries.filter((e) => e.offRoute && !e.stale).length,
    staleCount: entries.filter((e) => e.stale).length
  };
}

/** Route used when no routing provider is available: straight line origin → destination. */
export function fallbackRoute(origin: GeoPoint, destination: GeoPoint): RouteIndex {
  return buildRouteIndex([origin, destination]);
}

/* ------------------------------------------------------------------ */
/* Elastic Band                                                       */
/* ------------------------------------------------------------------ */

export type ElasticLevel = "tight" | "stretching" | "broken";

export interface ElasticAdvice {
  level: ElasticLevel;
  stretchMeters: number;
  /** suggested reduction of the leader's speed, km/h (0 when tight) */
  leaderSpeedDeltaKph: number;
  /** estimated seconds for the tail to reach the leader's current point */
  tailLagSeconds: number;
  message: string;
}

export interface ElasticOptions {
  softMeters?: number;
  hardMeters?: number;
}

export function elasticBand(formation: Formation, opts: ElasticOptions = {}): ElasticAdvice {
  const soft = opts.softMeters ?? 800;
  const hard = opts.hardMeters ?? 2500;
  const stretch = formation.stretchMeters;
  const tail = formation.entries.find((e) => e.vehicleId === formation.tailVehicleId);
  const tailSpeedMs = Math.max(5, (tail?.speedKph ?? 0) / 3.6);
  const tailLagSeconds = Math.round(stretch / tailSpeedMs);

  if (stretch <= soft) {
    return { level: "tight", stretchMeters: stretch, leaderSpeedDeltaKph: 0, tailLagSeconds, message: "Convoy is tight. Hold your pace." };
  }

  if (stretch <= hard) {
    const ratio = (stretch - soft) / (hard - soft);
    const delta = Math.min(20, Math.max(5, Math.round((5 + ratio * 15) / 5) * 5));
    return {
      level: "stretching",
      stretchMeters: stretch,
      leaderSpeedDeltaKph: delta,
      tailLagSeconds,
      message: `Convoy is stretching (${(stretch / 1000).toFixed(1)} km). Leader: ease off by about ${delta} km/h until the tail closes up.`
    };
  }

  return {
    level: "broken",
    stretchMeters: stretch,
    leaderSpeedDeltaKph: 20,
    tailLagSeconds,
    message: `Convoy is split (${(stretch / 1000).toFixed(1)} km front to back). Set a regroup point and let the tail catch up.`
  };
}

/* ------------------------------------------------------------------ */
/* Weakest-Link Range                                                 */
/* ------------------------------------------------------------------ */

export interface RangeInput {
  vehicleId: string;
  displayName: string;
  /** fuel or battery percentage 0-100 */
  levelPct?: number;
  /** range on a full tank / full charge in km */
  rangeKmFull?: number;
  isEv?: boolean;
}

export interface RangeEntry {
  vehicleId: string;
  displayName: string;
  usableKm: number | null;
  isEv: boolean;
}

export interface RangeReport {
  entries: RangeEntry[];
  limitingVehicleId: string | null;
  convoyRangeKm: number | null;
  unknownCount: number;
}

export function weakestLinkRange(vehicles: RangeInput[], reservePct = 10): RangeReport {
  const entries: RangeEntry[] = vehicles.map((v) => {
    const known = typeof v.levelPct === "number" && typeof v.rangeKmFull === "number" && v.rangeKmFull > 0;
    return {
      vehicleId: v.vehicleId,
      displayName: v.displayName,
      isEv: Boolean(v.isEv),
      usableKm: known ? Math.max(0, ((Math.min(100, v.levelPct!) - reservePct) / 100) * v.rangeKmFull!) : null
    };
  });

  const known = entries.filter((e) => e.usableKm !== null);
  const limiting = known.reduce<RangeEntry | null>((min, e) => (!min || e.usableKm! < min.usableKm! ? e : min), null);

  return {
    entries,
    limitingVehicleId: limiting?.vehicleId ?? null,
    convoyRangeKm: limiting ? Math.round(limiting.usableKm! * 10) / 10 : null,
    unknownCount: entries.length - known.length
  };
}

export interface StopCandidate {
  id: string;
  name: string;
  position: GeoPoint;
  kind?: string;
}

export interface RangeStopAdvice {
  status: "ok" | "plan_stop" | "stop_now" | "unknown";
  stop: (StopCandidate & { distanceAheadMeters: number }) | null;
  message: string;
}

/**
 * Recommend the furthest stop along the route that the limiting vehicle can still reach,
 * keeping a 10% safety margin on top of the reserve already removed from usable range.
 */
export function recommendRangeStop(
  route: RouteIndex,
  leadChainageMeters: number,
  report: RangeReport,
  candidates: StopCandidate[],
  needsEvCharger = false
): RangeStopAdvice {
  if (report.convoyRangeKm === null) {
    return { status: "unknown", stop: null, message: "Add fuel level and full-tank range to vehicles to enable range planning." };
  }

  const reachMeters = report.convoyRangeKm * 1000 * 0.9;
  const remaining = route.totalMeters - leadChainageMeters;
  const limiting = report.entries.find((e) => e.vehicleId === report.limitingVehicleId);

  if (reachMeters >= remaining) {
    return { status: "ok", stop: null, message: `Every car can reach the destination. Lowest range: ${limiting?.displayName} (${report.convoyRangeKm} km).` };
  }

  const ahead = candidates
    .map((c) => {
      const proj = projectOntoRoute(route, c.position);
      return { ...c, chainage: proj.chainageMeters, cross: proj.crossTrackMeters };
    })
    .filter((c) => c.cross < 2000 && c.chainage > leadChainageMeters && c.chainage - leadChainageMeters <= reachMeters)
    .sort((a, b) => b.chainage - a.chainage);

  const best = ahead[0];
  const kind = needsEvCharger ? "charge" : "refuel";

  if (!best) {
    return {
      status: "stop_now",
      stop: null,
      message: `${limiting?.displayName} has about ${report.convoyRangeKm} km left and no known stop lies within reach on the route. ${kind === "charge" ? "Charge" : "Refuel"} at the nearest station now.`
    };
  }

  const { chainage, cross: _cross, ...stop } = best;
  return {
    status: "plan_stop",
    stop: { ...stop, distanceAheadMeters: Math.round(chainage - leadChainageMeters) },
    message: `${limiting?.displayName} limits the convoy to ~${report.convoyRangeKm} km. Plan to ${kind} at ${best.name}, ${((chainage - leadChainageMeters) / 1000).toFixed(0)} km ahead.`
  };
}

/* ------------------------------------------------------------------ */
/* Fair Regroup (minimax ETA)                                         */
/* ------------------------------------------------------------------ */

export interface RegroupVehicle {
  vehicleId: string;
  position: GeoPoint;
  speedKph: number;
}

export interface RegroupRanking {
  candidate: StopCandidate;
  maxEtaSeconds: number;
  totalEtaSeconds: number;
  perVehicle: { vehicleId: string; etaSeconds: number; distanceMeters: number }[];
}

export interface RegroupOptions {
  /** multiplier from straight-line to road distance when no route is used */
  roadFactor?: number;
  /** speed assumed for vehicles that are slow or stopped, km/h */
  minCruiseKph?: number;
  /** penalty multiplier for vehicles that must turn back to reach a stop behind them */
  turnBackPenalty?: number;
}

export function fairRegroup(
  vehicles: RegroupVehicle[],
  candidates: StopCandidate[],
  route?: RouteIndex,
  opts: RegroupOptions = {}
): RegroupRanking[] {
  const roadFactor = opts.roadFactor ?? 1.3;
  const minCruise = opts.minCruiseKph ?? 40;
  const turnBack = opts.turnBackPenalty ?? 1.5;
  if (vehicles.length === 0) return [];

  const vehicleChainage = route ? new Map(vehicles.map((v) => [v.vehicleId, projectOntoRoute(route, v.position)])) : null;

  const rankings = candidates.map((candidate) => {
    const candProj = route ? projectOntoRoute(route, candidate.position) : null;
    const perVehicle = vehicles.map((v) => {
      let distance: number;
      const vp = vehicleChainage?.get(v.vehicleId);
      if (route && candProj && vp && candProj.crossTrackMeters < 3000 && vp.crossTrackMeters < 3000) {
        const along = candProj.chainageMeters - vp.chainageMeters;
        distance = (along >= 0 ? along : -along * turnBack) + candProj.crossTrackMeters + vp.crossTrackMeters;
      } else {
        distance = haversineMeters(v.position, candidate.position) * roadFactor;
      }
      const speedMs = Math.max(minCruise, v.speedKph) / 3.6;
      return { vehicleId: v.vehicleId, distanceMeters: Math.round(distance), etaSeconds: Math.round(distance / speedMs) };
    });
    return {
      candidate,
      perVehicle,
      maxEtaSeconds: Math.max(...perVehicle.map((p) => p.etaSeconds)),
      totalEtaSeconds: perVehicle.reduce((s, p) => s + p.etaSeconds, 0)
    };
  });

  return rankings.sort((a, b) => a.maxEtaSeconds - b.maxEtaSeconds || a.totalEtaSeconds - b.totalEtaSeconds);
}

/* ------------------------------------------------------------------ */
/* Convoy Pulse (fatigue)                                             */
/* ------------------------------------------------------------------ */

export interface FatigueOptions {
  breakAfterMinutes?: number;
  warnBeforeMinutes?: number;
}

export interface FatigueStatus {
  drivingMinutes: number;
  level: "ok" | "soon" | "due";
  message: string;
}

/**
 * Default: a 15-minute break every 2 hours, the common guidance of several
 * road-safety agencies (see docs/BLUEPRINT.md §3.2). Configurable per convoy.
 */
export function fatigueStatus(drivingSinceIso: string | undefined, nowMs = Date.now(), opts: FatigueOptions = {}): FatigueStatus {
  const breakAfter = opts.breakAfterMinutes ?? 120;
  const warnBefore = opts.warnBeforeMinutes ?? 15;
  if (!drivingSinceIso) return { drivingMinutes: 0, level: "ok", message: "Rested." };
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(drivingSinceIso)) / 60_000));
  if (minutes >= breakAfter) {
    return { drivingMinutes: minutes, level: "due", message: `Driving for ${formatMinutes(minutes)}. Take a 15-minute break or swap drivers.` };
  }
  if (minutes >= breakAfter - warnBefore) {
    return { drivingMinutes: minutes, level: "soon", message: `Break due in ${breakAfter - minutes} min.` };
  }
  return { drivingMinutes: minutes, level: "ok", message: `Driving for ${formatMinutes(minutes)}.` };
}

/**
 * Updates the "driving since" marker: resets when the vehicle has been stationary
 * (speed < 5 km/h) for at least `restMinutes`.
 */
export function nextDrivingSince(
  previous: { drivingSinceIso?: string; stoppedSinceIso?: string },
  speedKph: number,
  nowIso: string,
  restMinutes = 10
): { drivingSinceIso?: string; stoppedSinceIso?: string } {
  const moving = speedKph >= 5;
  if (moving) {
    const rested =
      previous.stoppedSinceIso && Date.parse(nowIso) - Date.parse(previous.stoppedSinceIso) >= restMinutes * 60_000;
    return { drivingSinceIso: !previous.drivingSinceIso || rested ? nowIso : previous.drivingSinceIso, stoppedSinceIso: undefined };
  }
  return { drivingSinceIso: previous.drivingSinceIso, stoppedSinceIso: previous.stoppedSinceIso ?? nowIso };
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ------------------------------------------------------------------ */
/* Dead-Zone Forecast                                                 */
/* ------------------------------------------------------------------ */

export interface CoverageCellInput {
  geohash: string;
  samples: number;
  gapCount: number;
}

export interface DeadZone {
  startChainageMeters: number;
  endChainageMeters: number;
  distanceAheadMeters: number;
  lengthMeters: number;
  start: GeoPoint;
  confidence: number;
}

/**
 * Walk the route ahead of the leader; cells where past convoys repeatedly lost signal
 * (>= minGaps gaps and gap ratio >= minRatio) are merged into zones.
 */
export function deadZonesAhead(
  route: RouteIndex,
  leadChainageMeters: number,
  cells: CoverageCellInput[],
  opts: { lookaheadMeters?: number; stepMeters?: number; minGaps?: number; minRatio?: number; precision?: number } = {}
): DeadZone[] {
  const lookahead = opts.lookaheadMeters ?? 40_000;
  const step = opts.stepMeters ?? 400;
  const minGaps = opts.minGaps ?? 2;
  const minRatio = opts.minRatio ?? 0.3;
  const precision = opts.precision ?? 6;
  const byHash = new Map(cells.map((c) => [c.geohash, c]));

  const zones: DeadZone[] = [];
  let current: DeadZone | null = null;
  const end = Math.min(route.totalMeters, leadChainageMeters + lookahead);

  for (let ch = leadChainageMeters; ch <= end; ch += step) {
    const point = pointAtChainage(route, ch);
    const cell = byHash.get(geohashEncode(point, precision));
    const ratio = cell ? cell.gapCount / Math.max(1, cell.samples) : 0;
    const dead = Boolean(cell && cell.gapCount >= minGaps && ratio >= minRatio);

    if (dead) {
      if (!current) {
        current = {
          startChainageMeters: ch,
          endChainageMeters: ch,
          distanceAheadMeters: Math.round(ch - leadChainageMeters),
          lengthMeters: 0,
          start: point,
          confidence: Math.min(1, ratio)
        };
      } else {
        current.endChainageMeters = ch;
        current.lengthMeters = Math.round(ch - current.startChainageMeters);
        current.confidence = Math.max(current.confidence, Math.min(1, ratio));
      }
    } else if (current) {
      zones.push(current);
      current = null;
    }
  }
  if (current) zones.push(current);
  return zones;
}

/* ------------------------------------------------------------------ */
/* Crash heuristic (client-side, NOT a certified safety system)       */
/* ------------------------------------------------------------------ */

export interface CrashOptions {
  /** acceleration magnitude threshold in g (gravity included in samples) */
  impactG?: number;
  /** speed before impact must be at least this, km/h */
  minSpeedBeforeKph?: number;
  /** speed must fall below this within the window, km/h */
  stopSpeedKph?: number;
  windowMs?: number;
}

export class CrashHeuristic {
  private impacts: { t: number; g: number }[] = [];
  private speeds: { t: number; kph: number }[] = [];
  private readonly o: Required<CrashOptions>;

  constructor(opts: CrashOptions = {}) {
    this.o = {
      impactG: opts.impactG ?? 4,
      minSpeedBeforeKph: opts.minSpeedBeforeKph ?? 25,
      stopSpeedKph: opts.stopSpeedKph ?? 8,
      windowMs: opts.windowMs ?? 12_000
    };
  }

  /** ax, ay, az in m/s² including gravity (DeviceMotionEvent.accelerationIncludingGravity) */
  addMotion(tMs: number, ax: number, ay: number, az: number) {
    const g = Math.sqrt(ax * ax + ay * ay + az * az) / 9.80665;
    if (g >= this.o.impactG) this.impacts.push({ t: tMs, g });
    this.prune(tMs);
  }

  addSpeed(tMs: number, kph: number) {
    this.speeds.push({ t: tMs, kph });
    this.prune(tMs);
  }

  check(nowMs: number): { suspected: boolean; peakG: number; reason: string } {
    this.prune(nowMs);
    const impact = this.impacts.reduce<{ t: number; g: number } | null>((m, i) => (!m || i.g > m.g ? i : m), null);
    if (!impact) return { suspected: false, peakG: 0, reason: "no impact" };
    const before = this.speeds.filter((s) => s.t <= impact.t && impact.t - s.t <= 10_000);
    const after = this.speeds.filter((s) => s.t > impact.t);
    const maxBefore = Math.max(0, ...before.map((s) => s.kph));
    const minAfter = after.length ? Math.min(...after.map((s) => s.kph)) : Infinity;
    if (maxBefore >= this.o.minSpeedBeforeKph && minAfter <= this.o.stopSpeedKph) {
      return { suspected: true, peakG: Math.round(impact.g * 10) / 10, reason: `impact ${impact.g.toFixed(1)}g then stop from ${Math.round(maxBefore)} km/h` };
    }
    return { suspected: false, peakG: impact.g, reason: "impact without matching speed collapse" };
  }

  reset() {
    this.impacts = [];
    this.speeds = [];
  }

  private prune(now: number) {
    const cutoff = now - this.o.windowMs - 10_000;
    this.impacts = this.impacts.filter((i) => i.t >= cutoff);
    this.speeds = this.speeds.filter((s) => s.t >= cutoff);
  }
}

/* ------------------------------------------------------------------ */
/* Health score                                                       */
/* ------------------------------------------------------------------ */

export function convoyHealthScore(input: {
  elastic: ElasticLevel;
  offRouteCount: number;
  staleCount: number;
  openSosCount: number;
  fatigueDueCount: number;
  rangeStatus: RangeStopAdvice["status"];
}): number {
  let score = 100;
  if (input.elastic === "stretching") score -= 10;
  if (input.elastic === "broken") score -= 25;
  score -= input.offRouteCount * 6;
  score -= input.staleCount * 8;
  score -= input.openSosCount * 35;
  score -= input.fatigueDueCount * 5;
  if (input.rangeStatus === "plan_stop") score -= 4;
  if (input.rangeStatus === "stop_now") score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ------------------------------------------------------------------ */
/* Report shape returned by GET /v1/intel/convoys/:id                  */
/* ------------------------------------------------------------------ */

export interface ConvoyIntelReport {
  convoyId: string;
  generatedAtIso: string;
  healthScore: number;
  formation: Formation;
  elastic: ElasticAdvice;
  range: RangeReport & { advice: RangeStopAdvice };
  fatigue: (FatigueStatus & { vehicleId: string; displayName: string })[];
  regroupSuggestions: { name: string; position: GeoPoint; maxEtaSeconds: number; kind?: string }[];
  deadZones: DeadZone[];
  openSosCount: number;
  routeIsEstimate: boolean;
  notes: string[];
}
