import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBalances, settle, splitByWeight, splitEqually, upiPayLink, validateShares, isValidVpa } from "../settlement.js";
import { quoteDrive, DRIVE_PRICE_PER_VEHICLE_MINOR } from "../plans.js";
import { parseDtcResponse, parsePidResponse, interpretObd } from "../obd.js";
import { reminderStatus, rollReminder, documentStatus } from "../garage.js";
import { emergencyNumbersFor, overpassQuery } from "../roadside.js";
import { generatePairingCode } from "../devices.js";

test("split equally assigns remainder paise and sums exactly", () => {
  const shares = splitEqually(1000, ["a", "b", "c"]);
  assert.deepEqual(shares.map((s) => s.amountMinor), [334, 333, 333]);
  assert.equal(shares.reduce((s, x) => s + x.amountMinor, 0), 1000);
});

test("split by weight sums exactly", () => {
  const shares = splitByWeight(100_000, [
    { userId: "car1", weight: 4 },
    { userId: "car2", weight: 2 },
    { userId: "car3", weight: 1 }
  ]);
  assert.equal(shares.reduce((s, x) => s + x.amountMinor, 0), 100_000);
  assert.equal(shares[0]!.amountMinor, 57_143);
});

test("settlement clears every balance with at most n-1 transfers", () => {
  const expenses = [
    { id: "1", paidByUserId: "a", amountMinor: 300_000, shares: splitEqually(300_000, ["a", "b", "c", "d"]) },
    { id: "2", paidByUserId: "b", amountMinor: 120_000, shares: splitEqually(120_000, ["a", "b", "c", "d"]) },
    { id: "3", paidByUserId: "c", amountMinor: 40_000, shares: splitEqually(40_000, ["c", "d"]) }
  ];
  for (const e of expenses) assert.equal(validateShares(e), null);
  const balances = computeBalances(expenses);
  const transfers = settle(balances);
  assert.ok(transfers.length <= 3);
  const after = new Map(balances);
  for (const t of transfers) {
    after.set(t.fromUserId, after.get(t.fromUserId)! + t.amountMinor);
    after.set(t.toUserId, after.get(t.toUserId)! - t.amountMinor);
  }
  for (const v of after.values()) assert.equal(v, 0);
});

test("validateShares rejects mismatched totals", () => {
  assert.match(validateShares({ id: "x", paidByUserId: "a", amountMinor: 100, shares: [{ userId: "a", amountMinor: 50 }] })!, /add up/);
});

test("UPI link encodes amount in rupees", () => {
  const link = upiPayLink({ vpa: "aarav@okaxis", payeeName: "Aarav", amountMinor: 123_450, note: "Goa trip fuel" });
  assert.ok(link.startsWith("upi://pay?"));
  assert.ok(link.includes("am=1234.50"));
  assert.ok(link.includes("cu=INR"));
  assert.equal(isValidVpa("aarav@okaxis"), true);
  assert.equal(isValidVpa("not a vpa"), false);
});

test("pricing: ₹500 per car inclusive of GST", () => {
  const q = quoteDrive(4, "inclusive");
  assert.equal(q.totalMinor, 4 * DRIVE_PRICE_PER_VEHICLE_MINOR);
  assert.equal(q.subtotalMinor + q.gstMinor, q.totalMinor);
  assert.equal(q.subtotalMinor, Math.round(200_000 / 1.18));
  assert.equal(q.exceedsEmandateLimit, false);
});

test("pricing: exclusive adds 18% GST and flags the RBI ₹15,000 limit", () => {
  const q = quoteDrive(30, "exclusive");
  assert.equal(q.subtotalMinor, 1_500_000);
  assert.equal(q.gstMinor, 270_000);
  assert.equal(q.totalMinor, 1_770_000);
  assert.equal(q.exceedsEmandateLimit, true);
  assert.equal(q.maxVehiclesPerMandate, 25); // 15000 / 590
  assert.equal(quoteDrive(30, "inclusive").exceedsEmandateLimit, false);
  assert.equal(quoteDrive(31, "inclusive").exceedsEmandateLimit, true);
  assert.throws(() => quoteDrive(0));
});

test("OBD PID parsing", () => {
  assert.equal(parsePidResponse("010C", "41 0C 1A F8\r\r>"), 1726);
  assert.equal(parsePidResponse("010D", "410D3C"), 60);
  assert.equal(parsePidResponse("0105", "SEARCHING...\r41057B"), 83);
  assert.equal(parsePidResponse("0142", "4142 3A 98"), 15);
  assert.equal(parsePidResponse("012F", "NO DATA"), null);
  assert.equal(parsePidResponse("010C", "410D3C"), null);
});

test("OBD DTC parsing (CAN with count byte and legacy)", () => {
  assert.deepEqual(parseDtcResponse("43 01 01 03"), ["P0103"]);
  assert.deepEqual(parseDtcResponse("43010300000000"), ["P0103"]);
  assert.deepEqual(parseDtcResponse("4302C1230420"), ["U0123", "P0420"]);
  assert.deepEqual(parseDtcResponse("NO DATA"), []);
});

test("OBD interpretation flags hot coolant and low voltage", () => {
  const flags = interpretObd({ coolantC: 118, voltage: 11.2 }, ["P0420"]);
  assert.equal(flags.filter((f) => f.level === "alert").length, 2);
  assert.ok(flags.some((f) => f.metric === "dtc"));
});

test("reminders and documents", () => {
  const now = Date.parse("2026-11-26T00:00:00Z");
  assert.equal(reminderStatus({ dueAtIso: "2026-12-01T00:00:00Z" }, null, now).state, "due_soon");
  assert.equal(reminderStatus({ dueOdometerKm: 40_000 }, 40_200, now).state, "overdue");
  assert.equal(reminderStatus({ dueAtIso: "2027-06-01T00:00:00Z", dueOdometerKm: 50_000 }, 40_000, now).state, "ok");
  const rolled = rollReminder(180, 10_000, "2026-11-26T00:00:00.000Z", 40_000);
  assert.equal(rolled.dueOdometerKm, 50_000);
  assert.equal(rolled.dueAtIso, "2027-05-25T00:00:00.000Z");
  assert.equal(documentStatus("2026-12-10T00:00:00Z", now).state, "expiring");
  assert.equal(documentStatus("2026-11-01T00:00:00Z", now).state, "expired");
});

test("emergency numbers and overpass query", () => {
  assert.equal(emergencyNumbersFor("in").numbers[0]!.number, "112");
  assert.equal(emergencyNumbersFor("XX").countryCode, "ZZ");
  const q = overpassQuery("fuel", 18.5, 73.8, 5000);
  assert.ok(q.includes('node["amenity"="fuel"](around:5000,18.5,73.8);'));
  assert.ok(q.startsWith("[out:json]"));
});

test("pairing codes are 6 digits", () => {
  assert.equal(generatePairingCode(() => 0.000001), "000001");
  assert.match(generatePairingCode(), /^\d{6}$/);
});

test("feature rollout buckets are stable and respect percentages", async () => {
  const { rolloutBucket, isFeatureOn, FEATURE_REGISTRY } = await import("../features.js");
  assert.equal(rolloutBucket("voice_mode", "user-1"), rolloutBucket("voice_mode", "user-1"));
  assert.equal(isFeatureOn(true, 100, "x", "anyone"), true);
  assert.equal(isFeatureOn(true, 0, "x", "anyone"), false);
  assert.equal(isFeatureOn(false, 100, "x", "anyone"), false);
  let on = 0;
  for (let i = 0; i < 2000; i++) if (isFeatureOn(true, 25, "trek_mode", `u${i}`)) on++;
  assert.ok(on > 400 && on < 600, `25% rollout gave ${on}/2000`);
  assert.equal(new Set(FEATURE_REGISTRY.map((f) => f.key)).size, FEATURE_REGISTRY.length);
});
