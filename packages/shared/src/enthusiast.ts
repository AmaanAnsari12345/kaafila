/** Car-enthusiast features: fuel economy, build sheets, smooth-driving score, scenic routes. */

/* ------------------------------------------------------------------ */
/* Fuel log: full-tank-to-full-tank economy                           */
/* ------------------------------------------------------------------ */

export interface FuelEntry {
  id: string;
  filledAtIso: string;
  odometerKm: number;
  /** litres, or kWh for EVs */
  quantity: number;
  totalCostMinor: number;
  isFullTank: boolean;
}

export interface FuelInterval {
  fromId: string;
  toId: string;
  distanceKm: number;
  quantity: number;
  /** km per litre (or km per kWh) */
  economy: number;
  costMinor: number;
  costPerKmMinor: number;
}

export interface FuelEconomyReport {
  intervals: FuelInterval[];
  averageEconomy: number | null;
  bestEconomy: number | null;
  costPerKmMinor: number | null;
  totalSpendMinor: number;
  totalQuantity: number;
}

/**
 * Standard full-to-full method: economy is measured only between two full-tank fills, counting all
 * fuel added after the first full fill up to and including the next full fill.
 */
export function fuelEconomy(entries: FuelEntry[]): FuelEconomyReport {
  const sorted = [...entries].sort((a, b) => a.odometerKm - b.odometerKm || Date.parse(a.filledAtIso) - Date.parse(b.filledAtIso));
  const intervals: FuelInterval[] = [];
  let anchor: FuelEntry | null = null;
  let qty = 0;
  let cost = 0;

  for (const e of sorted) {
    if (anchor) {
      qty += e.quantity;
      cost += e.totalCostMinor;
    }
    if (e.isFullTank) {
      if (anchor && qty > 0 && e.odometerKm > anchor.odometerKm) {
        const distance = e.odometerKm - anchor.odometerKm;
        intervals.push({
          fromId: anchor.id,
          toId: e.id,
          distanceKm: distance,
          quantity: round(qty, 2),
          economy: round(distance / qty, 2),
          costMinor: cost,
          costPerKmMinor: Math.round(cost / distance)
        });
      }
      anchor = e;
      qty = 0;
      cost = 0;
    }
  }

  const totalDistance = intervals.reduce((s, i) => s + i.distanceKm, 0);
  const totalQty = intervals.reduce((s, i) => s + i.quantity, 0);
  const totalCost = intervals.reduce((s, i) => s + i.costMinor, 0);
  return {
    intervals,
    averageEconomy: totalQty > 0 ? round(totalDistance / totalQty, 2) : null,
    bestEconomy: intervals.length ? Math.max(...intervals.map((i) => i.economy)) : null,
    costPerKmMinor: totalDistance > 0 ? Math.round(totalCost / totalDistance) : null,
    totalSpendMinor: entries.reduce((s, e) => s + e.totalCostMinor, 0),
    totalQuantity: round(entries.reduce((s, e) => s + e.quantity, 0), 2)
  };
}

/* ------------------------------------------------------------------ */
/* Build sheet                                                        */
/* ------------------------------------------------------------------ */

export const MOD_CATEGORIES = [
  "engine",
  "intake_exhaust",
  "ecu_tune",
  "suspension",
  "wheels",
  "tyres",
  "brakes",
  "aero_body",
  "interior",
  "lighting",
  "audio",
  "electronics",
  "protection",
  "other"
] as const;
export type ModCategory = (typeof MOD_CATEGORIES)[number];

export const MOD_CATEGORY_LABEL: Record<ModCategory, string> = {
  engine: "Engine",
  intake_exhaust: "Intake & exhaust",
  ecu_tune: "ECU / tune",
  suspension: "Suspension",
  wheels: "Wheels",
  tyres: "Tyres",
  brakes: "Brakes",
  aero_body: "Aero & body",
  interior: "Interior",
  lighting: "Lighting",
  audio: "Audio",
  electronics: "Electronics",
  protection: "Protection (PPF, wrap, ceramic)",
  other: "Other"
};

/* ------------------------------------------------------------------ */
/* Smooth-driving score (GPS-derived estimate)                         */
/* ------------------------------------------------------------------ */

export interface SpeedSample {
  t: number; // epoch ms
  speedKph: number;
}

export interface DriveScoreOptions {
  /** braking threshold in g (default 0.35 g) */
  harshBrakeG?: number;
  /** acceleration threshold in g (default 0.3 g) */
  harshAccelG?: number;
  /** only compare samples between 1 and 10 s apart */
  minGapSec?: number;
  maxGapSec?: number;
}

export interface DriveScore {
  score: number | null;
  distanceKm: number;
  harshBrakes: number;
  harshAccels: number;
  eventsPer100Km: number | null;
  maxSpeedKph: number;
  rating: "smooth" | "good" | "needs_attention" | "not_enough_data";
}

const G = 9.80665;

/**
 * Counts harsh braking/acceleration from consecutive speed samples. Phone GPS at 1-10 s
 * resolution under-counts short events, so this is a coaching estimate, not telematics-grade.
 */
export function driveScore(samples: SpeedSample[], opts: DriveScoreOptions = {}): DriveScore {
  const brake = (opts.harshBrakeG ?? 0.35) * G;
  const accel = (opts.harshAccelG ?? 0.3) * G;
  const minGap = opts.minGapSec ?? 1;
  const maxGap = opts.maxGapSec ?? 10;
  const s = [...samples].sort((a, b) => a.t - b.t);
  let distance = 0;
  let brakes = 0;
  let accels = 0;
  let maxSpeed = 0;
  let lastEventAt = -Infinity;

  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    const dt = (b.t - a.t) / 1000;
    maxSpeed = Math.max(maxSpeed, b.speedKph);
    if (dt <= 0 || dt > 60) continue;
    distance += ((a.speedKph + b.speedKph) / 2 / 3.6) * dt;
    if (dt < minGap || dt > maxGap) continue;
    const dv = (b.speedKph - a.speedKph) / 3.6;
    const acc = dv / dt;
    // Debounce: one event per 5 seconds.
    if (b.t - lastEventAt < 5000) continue;
    if (acc <= -brake) {
      brakes++;
      lastEventAt = b.t;
    } else if (acc >= accel) {
      accels++;
      lastEventAt = b.t;
    }
  }

  const km = distance / 1000;
  if (km < 5) return { score: null, distanceKm: round(km, 1), harshBrakes: brakes, harshAccels: accels, eventsPer100Km: null, maxSpeedKph: Math.round(maxSpeed), rating: "not_enough_data" };
  const per100 = ((brakes * 1.5 + accels) / km) * 100;
  const score = Math.max(0, Math.min(100, Math.round(100 - per100 * 6)));
  return {
    score,
    distanceKm: round(km, 1),
    harshBrakes: brakes,
    harshAccels: accels,
    eventsPer100Km: round(((brakes + accels) / km) * 100, 1),
    maxSpeedKph: Math.round(maxSpeed),
    rating: score >= 85 ? "smooth" : score >= 65 ? "good" : "needs_attention"
  };
}

/* ------------------------------------------------------------------ */
/* Scenic routes                                                       */
/* ------------------------------------------------------------------ */

export const ROUTE_TAGS = ["ghats", "coastal", "mountain", "desert", "forest", "lakes", "highway", "twisties", "sunrise", "sunset", "monsoon", "night", "ev_friendly", "family"] as const;
export type RouteTag = (typeof ROUTE_TAGS)[number];

export function averageRating(sum: number, count: number): number | null {
  return count > 0 ? round(sum / count, 1) : null;
}

function round(v: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
