import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRouteIndex, destinationPoint, geohashEncode, pointAtChainage } from "../geo.js";
import {
  computeFormation,
  convoyHealthScore,
  CrashHeuristic,
  deadZonesAhead,
  elasticBand,
  fairRegroup,
  fatigueStatus,
  nextDrivingSince,
  recommendRangeStop,
  weakestLinkRange
} from "../intel.js";

const start = { lat: 19.0, lng: 73.0 };
const end = destinationPoint(start, 180, 100_000); // 100 km due south
const route = buildRouteIndex([start, destinationPoint(start, 180, 50_000), end]);
const now = Date.parse("2026-11-26T08:00:00Z");
const fresh = new Date(now - 5_000).toISOString();

function at(chainage: number, id: string, speed = 70, captured = fresh) {
  return { vehicleId: id, displayName: id, position: pointAtChainage(route, chainage), speedKph: speed, capturedAtIso: captured };
}

test("formation orders by chainage, computes gaps and stretch, flags stale", () => {
  const f = computeFormation(
    route,
    [at(20_000, "B"), at(21_000, "A"), at(18_500, "C"), at(30_000, "STALE", 0, new Date(now - 600_000).toISOString())],
    { nowMs: now }
  );
  assert.equal(f.entries[0]!.vehicleId, "STALE");
  assert.equal(f.leadVehicleId, "A");
  assert.equal(f.tailVehicleId, "C");
  assert.ok(Math.abs(f.stretchMeters - 2500) < 10, `stretch ${f.stretchMeters}`);
  const b = f.entries.find((e) => e.vehicleId === "B")!;
  assert.ok(Math.abs(b.gapAheadMeters! - 1000) < 10);
  assert.equal(f.staleCount, 1);
  assert.ok(Math.abs(f.remainingMeters - 79_000) < 20);
});

test("formation flags off-route vehicles", () => {
  const off = { vehicleId: "X", displayName: "X", position: destinationPoint(pointAtChainage(route, 10_000), 90, 600), speedKph: 50, capturedAtIso: fresh };
  const f = computeFormation(route, [off, at(9_000, "Y")], { nowMs: now });
  assert.equal(f.entries.find((e) => e.vehicleId === "X")!.offRoute, true);
  assert.equal(f.offRouteCount, 1);
});

test("elastic band: tight, stretching, broken", () => {
  const tight = elasticBand(computeFormation(route, [at(10_000, "A"), at(9_500, "B")], { nowMs: now }));
  assert.equal(tight.level, "tight");
  assert.equal(tight.leaderSpeedDeltaKph, 0);

  const stretching = elasticBand(computeFormation(route, [at(10_000, "A"), at(8_500, "B")], { nowMs: now }));
  assert.equal(stretching.level, "stretching");
  assert.ok(stretching.leaderSpeedDeltaKph >= 5 && stretching.leaderSpeedDeltaKph <= 20);

  const broken = elasticBand(computeFormation(route, [at(10_000, "A"), at(5_000, "B")], { nowMs: now }));
  assert.equal(broken.level, "broken");
});

test("weakest-link range picks the lowest usable range and ignores unknowns", () => {
  const r = weakestLinkRange([
    { vehicleId: "A", displayName: "A", levelPct: 80, rangeKmFull: 600 },
    { vehicleId: "B", displayName: "B", levelPct: 30, rangeKmFull: 500 },
    { vehicleId: "C", displayName: "C" }
  ]);
  assert.equal(r.limitingVehicleId, "B");
  assert.equal(r.convoyRangeKm, 100); // (30 - 10)% of 500
  assert.equal(r.unknownCount, 1);
});

test("range stop: picks the furthest reachable stop on route", () => {
  const report = weakestLinkRange([{ vehicleId: "B", displayName: "B", levelPct: 15, rangeKmFull: 600 }]); // 30 km usable
  const stops = [
    { id: "s1", name: "Near", position: pointAtChainage(route, 15_000) },
    { id: "s2", name: "Reachable", position: pointAtChainage(route, 35_000) },
    { id: "s3", name: "Too far", position: pointAtChainage(route, 50_000) },
    { id: "s0", name: "Behind", position: pointAtChainage(route, 5_000) }
  ];
  const advice = recommendRangeStop(route, 10_000, report, stops);
  assert.equal(advice.status, "plan_stop");
  assert.equal(advice.stop?.id, "s2");
  assert.ok(Math.abs(advice.stop!.distanceAheadMeters - 25_000) < 20);

  const none = recommendRangeStop(route, 10_000, report, [stops[2]!]);
  assert.equal(none.status, "stop_now");

  const plenty = recommendRangeStop(route, 10_000, weakestLinkRange([{ vehicleId: "A", displayName: "A", levelPct: 100, rangeKmFull: 900 }]), stops);
  assert.equal(plenty.status, "ok");
});

test("fair regroup minimises the worst ETA, not the average", () => {
  const vehicles = [
    { vehicleId: "front", position: pointAtChainage(route, 40_000), speedKph: 60 },
    { vehicleId: "mid", position: pointAtChainage(route, 30_000), speedKph: 60 },
    { vehicleId: "tail", position: pointAtChainage(route, 10_000), speedKph: 60 }
  ];
  const candidates = [
    { id: "ahead", name: "Ahead plaza", position: pointAtChainage(route, 45_000) },
    { id: "middle", name: "Middle dhaba", position: pointAtChainage(route, 41_000) }
  ];
  const ranking = fairRegroup(vehicles, candidates, route);
  assert.equal(ranking[0]!.candidate.id, "middle");
  assert.ok(ranking[0]!.maxEtaSeconds < ranking[1]!.maxEtaSeconds);
});

test("fatigue: 2 hours triggers a break", () => {
  const since = new Date(now - 125 * 60_000).toISOString();
  assert.equal(fatigueStatus(since, now).level, "due");
  assert.equal(fatigueStatus(new Date(now - 110 * 60_000).toISOString(), now).level, "soon");
  assert.equal(fatigueStatus(new Date(now - 30 * 60_000).toISOString(), now).level, "ok");
});

test("driving-since resets only after a 10 minute rest", () => {
  const t0 = "2026-11-26T06:00:00.000Z";
  let s = nextDrivingSince({}, 60, t0);
  assert.equal(s.drivingSinceIso, t0);
  s = nextDrivingSince(s, 0, "2026-11-26T07:00:00.000Z");
  s = nextDrivingSince(s, 50, "2026-11-26T07:05:00.000Z"); // 5 min stop — no reset
  assert.equal(s.drivingSinceIso, t0);
  s = nextDrivingSince(s, 0, "2026-11-26T08:00:00.000Z");
  s = nextDrivingSince(s, 50, "2026-11-26T08:12:00.000Z"); // 12 min stop — reset
  assert.equal(s.drivingSinceIso, "2026-11-26T08:12:00.000Z");
});

test("dead zones ahead are merged from repeated-gap cells", () => {
  const cells = new Map<string, { geohash: string; samples: number; gapCount: number }>();
  for (let ch = 20_000; ch <= 24_000; ch += 200) {
    const h = geohashEncode(pointAtChainage(route, ch), 6);
    cells.set(h, { geohash: h, samples: 5, gapCount: 4 });
  }
  const zones = deadZonesAhead(route, 10_000, [...cells.values()]);
  assert.equal(zones.length, 1);
  assert.ok(zones[0]!.distanceAheadMeters >= 9_000 && zones[0]!.distanceAheadMeters <= 11_000);
  assert.ok(zones[0]!.lengthMeters >= 3_000);
});

test("crash heuristic needs both impact and speed collapse", () => {
  const c = new CrashHeuristic();
  const t = 1_000_000;
  c.addSpeed(t - 3000, 72);
  c.addMotion(t, 30, 30, 20); // ~4.8 g
  assert.equal(c.check(t + 100).suspected, false);
  c.addSpeed(t + 3000, 2);
  const r = c.check(t + 3100);
  assert.equal(r.suspected, true);
  assert.ok(r.peakG > 4);

  const pothole = new CrashHeuristic();
  pothole.addSpeed(t - 1000, 60);
  pothole.addMotion(t, 30, 30, 20);
  pothole.addSpeed(t + 2000, 58);
  assert.equal(pothole.check(t + 2100).suspected, false);
});

test("health score penalises SOS heavily", () => {
  const base = { elastic: "tight" as const, offRouteCount: 0, staleCount: 0, openSosCount: 0, fatigueDueCount: 0, rangeStatus: "ok" as const };
  assert.equal(convoyHealthScore(base), 100);
  assert.ok(convoyHealthScore({ ...base, openSosCount: 1 }) <= 65);
});
