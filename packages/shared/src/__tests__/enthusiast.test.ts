import { test } from "node:test";
import assert from "node:assert/strict";
import { driveScore, fuelEconomy } from "../enthusiast.js";

test("fuel economy uses the full-to-full method", () => {
  const r = fuelEconomy([
    { id: "a", filledAtIso: "2026-11-01T00:00:00Z", odometerKm: 10_000, quantity: 40, totalCostMinor: 400_000, isFullTank: true },
    { id: "b", filledAtIso: "2026-11-05T00:00:00Z", odometerKm: 10_300, quantity: 10, totalCostMinor: 100_000, isFullTank: false },
    { id: "c", filledAtIso: "2026-11-09T00:00:00Z", odometerKm: 10_600, quantity: 30, totalCostMinor: 300_000, isFullTank: true },
    { id: "d", filledAtIso: "2026-11-15T00:00:00Z", odometerKm: 11_100, quantity: 35, totalCostMinor: 350_000, isFullTank: true }
  ]);
  assert.equal(r.intervals.length, 2);
  assert.equal(r.intervals[0]!.distanceKm, 600);
  assert.equal(r.intervals[0]!.quantity, 40); // partial 10 + full 30
  assert.equal(r.intervals[0]!.economy, 15);
  assert.equal(r.intervals[1]!.economy, 14.29);
  assert.equal(r.averageEconomy, 14.67); // 1100 km / 75 L
  assert.equal(r.costPerKmMinor, 682); // ₹7,500 / 1,100 km
  assert.equal(r.totalSpendMinor, 1_150_000);
});

test("fuel economy needs two full fills", () => {
  const r = fuelEconomy([{ id: "a", filledAtIso: "2026-11-01T00:00:00Z", odometerKm: 100, quantity: 30, totalCostMinor: 300_000, isFullTank: true }]);
  assert.equal(r.averageEconomy, null);
  assert.equal(r.intervals.length, 0);
});

test("drive score counts harsh braking and acceleration", () => {
  const t0 = Date.parse("2026-11-27T06:00:00Z");
  const samples = [];
  // 20 minutes at a steady 72 km/h, 2 s apart → ~24 km
  for (let i = 0; i <= 600; i++) samples.push({ t: t0 + i * 2000, speedKph: 72 });
  const smooth = driveScore(samples);
  assert.equal(smooth.harshBrakes, 0);
  assert.equal(smooth.score, 100);
  assert.equal(smooth.rating, "smooth");
  assert.ok(smooth.distanceKm > 23 && smooth.distanceKm < 25);

  const jerky = [...samples];
  // a 72 → 40 km/h drop in 2 s = 4.4 m/s² ≈ 0.45 g braking, twice, 30 s apart
  jerky[100] = { t: t0 + 100 * 2000, speedKph: 40 };
  jerky[115] = { t: t0 + 115 * 2000, speedKph: 40 };
  const r = driveScore(jerky);
  assert.equal(r.harshBrakes, 2);
  // The instant rebound 2 s later falls inside the 5 s debounce, which absorbs single-sample GPS glitches.
  assert.equal(r.harshAccels, 0);
  assert.ok(r.score! < smooth.score!);
});

test("drive score refuses tiny samples", () => {
  assert.equal(driveScore([{ t: 0, speedKph: 30 }, { t: 2000, speedKph: 31 }]).rating, "not_enough_data");
});
