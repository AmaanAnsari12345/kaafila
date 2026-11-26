/**
 * End-to-end smoke test: boots the compiled API (dist/) against a real PostgreSQL and drives
 * the main product flows over HTTP and Socket.IO.
 *
 *   DATABASE_URL=postgresql://... pnpm --filter @kaafila/api test:smoke
 *
 * Redis: uses REDIS_URL when set, or an in-memory mock with SMOKE_REDIS_MOCK=1.
 * The database must already be migrated (prisma migrate deploy). Data is namespaced per run.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

Object.assign(process.env, {
  NODE_ENV: "test",
  ALLOW_DEV_TOKEN: "true",
  ROUTING_PROVIDER: "none",
  PUBLIC_APP_URL: "http://localhost:3000",
  // Unreachable on purpose: places lookups must degrade gracefully, and tests never hit public services.
  OVERPASS_BASE_URL: "http://127.0.0.1:9/overpass",
  GEOCODER_BASE_URL: "http://127.0.0.1:9/nominatim",
  WEATHER_BASE_URL: "http://127.0.0.1:9/weather",
  RAZORPAY_WEBHOOK_SECRET: "smoke_webhook_secret"
});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the smoke test");

const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const request = require("supertest");
const { AppModule } = require(path.join(here, "../dist/app.module.js"));
const { RedisService } = require(path.join(here, "../dist/shared/redis/redis.service.js"));
const { PrismaService } = require(path.join(here, "../dist/shared/prisma/prisma.service.js"));
const { io } = createRequire(path.join(here, "../../web/package.json"))("socket.io-client");

const run = Date.now().toString(36);
const tok = (name) => `dev-token:${name}${run}`;
const AARAV = tok("aarav");
const ZARA = tok("zara");
const EVE = tok("eve");
const ADMIN = "dev-token";

let app;
let http;
let baseUrl;
const S = {};

const api = (method, url, token, body) => {
  let r = request(http)[method](`/v1${url}`);
  if (token) r = r.set("Authorization", `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};

// Straight-line demo corridor: Navi Mumbai → Pune
const O = { lat: 19.0771, lng: 72.9986 };
const D = { lat: 18.5204, lng: 73.8567 };
const along = (t) => ({ lat: O.lat + (D.lat - O.lat) * t, lng: O.lng + (D.lng - O.lng) * t });

before(async () => {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (process.env.SMOKE_REDIS_MOCK === "1") {
    const RedisMock = require("ioredis-mock");
    const mock = Object.create(RedisService.prototype);
    mock.client = new RedisMock();
    mock.create = () => new RedisMock();
    mock.logger = { warn() {}, log() {} };
    builder = builder.overrideProvider(RedisService).useValue(mock);
  }
  const moduleRef = await builder.compile();
  app = moduleRef.createNestApplication({ rawBody: true, logger: ["error", "warn"] });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0);
  http = app.getHttpServer();
  baseUrl = `http://127.0.0.1:${http.address().port}`;
});

after(async () => {
  await app?.close();
});

test("health, readiness and public endpoints", async () => {
  assert.equal((await api("get", "/health")).status, 200);
  const ready = await api("get", "/health/ready");
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  const quote = await api("get", "/billing/quote?vehicles=3");
  assert.equal(quote.body.totalMinor, 150_000);
  assert.equal(quote.body.taxMode, "inclusive");
  const guides = await api("get", "/roadside/guides");
  assert.ok(guides.body.length >= 10);
  const emergency = await api("get", "/roadside/emergency?country=IN");
  assert.equal(emergency.body.numbers[0].number, "112");
});

test("authentication is required and validated", async () => {
  assert.equal((await api("get", "/users/me")).status, 401);
  assert.equal((await api("get", "/users/me", "not-a-real-token")).status, 401);
  const me = await api("get", "/users/me", AARAV);
  assert.equal(me.status, 200);
  assert.equal(me.body.plan, "explorer");
  S.aaravId = me.body.id;
});

test("garage: add cars", async () => {
  const a = await api("post", "/garage/vehicles", AARAV, { type: "suv", name: "XUV700", fuelType: "diesel", rangeKmFull: 750, odometerKm: 41000 });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  S.a1 = a.body.id;
  const z = await api("post", "/garage/vehicles", ZARA, { type: "ev", name: "Nexon EV", fuelType: "ev", rangeKmFull: 300 });
  S.z1 = z.body.id;
  const bad = await api("post", "/garage/vehicles", ZARA, { type: "spaceship", name: "x" });
  assert.equal(bad.status, 400);
  const reminder = await api("post", `/garage/vehicles/${S.a1}/reminders`, AARAV, { type: "engine_oil", title: "Engine oil", dueOdometerKm: 41200, intervalKm: 10000 });
  assert.equal(reminder.status, 201);
  const list = await api("get", "/garage/vehicles", AARAV);
  assert.equal(list.body[0].reminders[0].status.state, "due_soon");
});

test("convoys: create, access control, join", async () => {
  const bad = await api("post", "/convoys", AARAV, { name: "x", origin: { lat: 200, lng: 0 }, destination: D });
  assert.equal(bad.status, 400);

  const c = await api("post", "/convoys", AARAV, { name: "Smoke run", origin: { ...O, name: "Navi Mumbai" }, destination: { ...D, name: "Pune" }, vehicleId: S.a1 });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.route.isEstimate, true);
  S.convoy = c.body.id;
  S.code = c.body.inviteCode;

  assert.equal((await api("get", `/convoys/${S.convoy}`, EVE)).status, 403);
  assert.equal((await api("post", "/convoys/join", ZARA, { inviteCode: S.code, vehicleId: S.a1 })).status, 403, "cannot join with someone else's car");

  const j = await api("post", "/convoys/join", ZARA, { inviteCode: S.code, vehicleId: S.z1 });
  assert.equal(j.status, 201, JSON.stringify(j.body));
  const detail = await api("get", `/convoys/${S.convoy}`, ZARA);
  assert.equal(detail.body.members.length, 2);
  assert.equal(detail.body.me.role, "driver");
});

test("tracking: ownership, rate limits, live state, intelligence", async () => {
  const now = Date.now();
  const spoof = await api("post", "/tracking/ping", ZARA, { convoyId: S.convoy, vehicleId: S.a1, ...along(0.2), speedKph: 80, headingDeg: 140, capturedAt: new Date(now).toISOString() });
  assert.equal(spoof.status, 403, "cannot send another member's car position");

  const a = await api("post", "/tracking/ping", AARAV, { convoyId: S.convoy, vehicleId: S.a1, ...along(0.2), speedKph: 82, headingDeg: 140, capturedAt: new Date(now - 20_000).toISOString() });
  assert.equal(a.body.accepted, true, JSON.stringify(a.body));
  const z = await api("post", "/tracking/ping", ZARA, { convoyId: S.convoy, vehicleId: S.z1, ...along(0.19), speedKph: 76, headingDeg: 140, batteryPct: 18, capturedAt: new Date(now).toISOString() });
  assert.equal(z.body.accepted, true);

  const again = await api("post", "/tracking/ping", ZARA, { convoyId: S.convoy, vehicleId: S.z1, ...along(0.191), speedKph: 76, headingDeg: 140, capturedAt: new Date(now + 1000).toISOString() });
  assert.equal(again.body.accepted, false);
  assert.equal(again.body.reason, "rate_limited", "Explorer cars are limited to one ping per 10 s");

  const live = await api("get", `/tracking/convoys/${S.convoy}/live`, ZARA);
  assert.equal(live.body.vehicles.length, 2);

  const intel = await api("get", `/intel/convoys/${S.convoy}`, ZARA);
  assert.equal(intel.status, 200, JSON.stringify(intel.body));
  assert.equal(intel.body.formation.leadVehicleId, S.a1);
  assert.equal(intel.body.formation.entries.length, 2);
  assert.ok(intel.body.formation.stretchMeters > 800, `stretch ${intel.body.formation.stretchMeters}`);
  assert.notEqual(intel.body.elastic.level, "tight");
  assert.equal(intel.body.range.limitingVehicleId, S.z1);
  assert.equal(intel.body.range.advice.status, "plan_stop");
  assert.ok(intel.body.notes.some((n) => n.includes("Route is a straight-line estimate")));
  assert.ok(intel.body.notes.some((n) => /unavailable/.test(n)), "places failures degrade with a note");
  assert.equal((await api("get", `/intel/convoys/${S.convoy}`, EVE)).status, 403);
});

test("signals, chat and kitty settlement", async () => {
  assert.equal((await api("post", `/convoys/${S.convoy}/signals`, ZARA, { code: "need_charge" })).status, 201);
  assert.equal((await api("post", `/convoys/${S.convoy}/signals`, ZARA, { code: "teleport" })).status, 400);
  assert.equal((await api("post", `/convoys/${S.convoy}/messages`, AARAV, { body: "Regroup at the plaza" })).status, 201);
  const msgs = await api("get", `/convoys/${S.convoy}/messages`, ZARA);
  assert.equal(msgs.body.length, 2);

  const e = await api("post", `/kitty/convoys/${S.convoy}/expenses`, AARAV, { title: "Diesel", category: "fuel", amountMinor: 300_000, splitMode: "equal" });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  const sum = await api("get", `/kitty/convoys/${S.convoy}`, ZARA);
  assert.equal(sum.body.totalMinor, 300_000);
  assert.equal(sum.body.transfers.length, 1);
  assert.equal(sum.body.transfers[0].amountMinor, 150_000);
  assert.equal(sum.body.transfers[0].toUserId, S.aaravId);
  assert.equal((await api("get", `/kitty/convoys/${S.convoy}`, EVE)).status, 403);
});

test("billing: ₹500 per car seat activates Drive and unlocks family links", async () => {
  const locked = await api("post", `/convoys/${S.convoy}/share-links`, AARAV, { hours: 2 });
  assert.equal(locked.status, 403, "family links require Drive");

  const checkout = await api("post", "/billing/checkout", AARAV, { provider: "razorpay", vehicles: 1, vehicleIds: [S.a1] });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  assert.equal(checkout.body.provider, "sandbox");
  assert.equal(checkout.body.quote.totalMinor, 50_000);
  const activated = await api("post", `/billing/subscriptions/${checkout.body.subscriptionId}/sandbox-activate`, AARAV);
  assert.equal(activated.status, 201, JSON.stringify(activated.body));
  assert.equal(activated.body.subscriptions[0].seats[0].vehicleId, S.a1);
  assert.equal((await api("get", "/users/me", AARAV)).body.plan, "drive");

  const link = await api("post", `/convoys/${S.convoy}/share-links`, AARAV, { hours: 2, label: "Family" });
  assert.equal(link.status, 201, JSON.stringify(link.body));
  const token = link.body.url.split("/follow/")[1];
  const pub = await api("get", `/public/follow/${token}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.vehicles.length, 2);
  assert.equal(pub.body.vehicles[0].plateNumber, undefined, "public view carries no plate numbers");
  assert.equal((await api("get", `/public/follow/not-a-token`)).status, 404);
});

test("coverage learning records dead-zone gaps (raw SQL path)", async () => {
  // The Explorer-era 10 s window may still be open right after the upgrade; honour retryAfterMs.
  let res;
  for (let i = 0; i < 8; i++) {
    res = await api("post", "/tracking/ping", AARAV, { convoyId: S.convoy, vehicleId: S.a1, ...along(0.205), speedKph: 80, headingDeg: 140, capturedAt: new Date(Date.now() + 50_000).toISOString() });
    if (res.body.accepted || res.body.reason !== "rate_limited") break;
    await new Promise((r) => setTimeout(r, res.body.retryAfterMs ?? 2000));
  }
  assert.equal(res.body.accepted, true, JSON.stringify(res.body));
  assert.equal(res.body.plan, "drive");
  await new Promise((r) => setTimeout(r, 800));
  const prisma = app.get(PrismaService);
  const gaps = await prisma.coverageCell.count({ where: { gapCount: { gt: 0 } } });
  assert.ok(gaps > 0, "a >60 s gap between pings marks coverage cells");
});

test("SOS lifecycle and permissions", async () => {
  const sos = await api("post", "/sos", ZARA, { convoyId: S.convoy, kind: "breakdown", ...along(0.19) });
  assert.equal(sos.status, 201, JSON.stringify(sos.body));
  assert.equal(sos.body.status, "open");
  S.sos = sos.body.id;
  assert.equal((await api("post", `/sos/${S.sos}/status`, EVE, { status: "resolved" })).status, 403);
  assert.equal((await api("post", `/sos/${S.sos}/status`, AARAV, { status: "false_alarm" })).status, 403, "only the person or staff marks a false alarm");
  assert.equal((await api("post", `/sos/${S.sos}/status`, AARAV, { status: "acknowledged" })).status, 201);
  const intel = await api("get", `/intel/convoys/${S.convoy}`, AARAV);
  assert.equal(intel.body.openSosCount, 1);
});

test("admin console is staff-only and audited", async () => {
  assert.equal((await api("get", "/admin/overview", AARAV)).status, 403);
  const o = await api("get", "/admin/overview", ADMIN);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.ok(o.body.openSos >= 1);
  assert.ok(o.body.revenue.mrrMinor >= 50_000);
  const users = await api("get", `/admin/users?q=eve${run}`, ADMIN);
  assert.equal(users.status, 200);
  const flag = await api("put", `/admin/flags/smoke_${run}`, ADMIN, { enabled: true, rolloutPct: 100 });
  assert.equal(flag.status, 200);
  const flags = await api("get", "/platform/flags", ZARA);
  assert.equal(flags.body[`smoke_${run}`], true);
  const audit = await api("get", "/admin/audit", ADMIN);
  assert.ok(audit.body.items.some((a) => a.action === "flag.upsert"));
});

test("meetups: review gate, RSVP", async () => {
  const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const m = await api("post", "/meetups", ZARA, { title: "Smoke sunrise run", description: "Coffee and a gentle drive.", startsAt, venueName: "Plaza", lat: 18.75, lng: 73.4, capacity: 2 });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.status, "pending_review");
  assert.equal((await api("post", `/meetups/${m.body.id}/rsvp`, AARAV, {})).status, 404, "not open before review");
  assert.equal((await api("post", `/admin/meetups/${m.body.id}/review`, ADMIN, { decision: "approve" })).status, 201);
  const rsvp = await api("post", `/meetups/${m.body.id}/rsvp`, AARAV, { vehicleId: S.a1 });
  assert.equal(rsvp.status, 201, JSON.stringify(rsvp.body));
  assert.equal(rsvp.body.status, "going");
  const third = await api("post", `/meetups/${m.body.id}/rsvp`, EVE, {});
  assert.equal(third.body.status, "waitlist", "host + one guest fill capacity 2");
  assert.equal((await api("delete", `/meetups/${m.body.id}/rsvp`, AARAV)).status, 200);
  const promoted = await api("get", `/meetups/${m.body.id}`, EVE);
  assert.equal(promoted.body.myRsvp.status, "going", "cancelling promotes the waitlist");
});

test("social: post, like, comment, follow", async () => {
  const p = await api("post", "/social/posts", AARAV, { body: "Great run today" });
  assert.equal(p.status, 201);
  assert.equal((await api("post", `/social/posts/${p.body.id}/like`, ZARA)).body.liked, true);
  assert.equal((await api("post", `/social/posts/${p.body.id}/comments`, ZARA, { body: "Epic!" })).status, 201);
  assert.equal((await api("post", `/social/users/${S.aaravId}/follow`, ZARA)).body.following, true);
  const feed = await api("get", "/social/feed?scope=following", ZARA);
  assert.ok(feed.body.items.some((i) => i.id === p.body.id && i.likeCount === 1));
});

test("device pairing makes a passenger the car's navigator", async () => {
  const pairing = await api("post", "/devices/pairings", AARAV, { vehicleId: S.a1, kind: "tablet" });
  assert.equal(pairing.status, 201);
  assert.match(pairing.body.code, /^\d{6}$/);
  const claim = await api("post", "/devices/pairings/claim", EVE, { code: pairing.body.code, name: "Dash tablet" });
  assert.equal(claim.status, 201, JSON.stringify(claim.body));
  assert.deepEqual(claim.body.joinedConvoyIds, [S.convoy]);
  const detail = await api("get", `/convoys/${S.convoy}`, EVE);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.me.role, "navigator");
  assert.equal((await api("post", "/devices/pairings/claim", ZARA, { code: pairing.body.code, name: "x" })).status, 404, "codes are single-use");
});

test("payment webhooks verify signatures and are idempotent", async () => {
  const body = JSON.stringify({ event: "subscription.activated", payload: { subscription: { entity: { id: `sub_smoke_${run}`, status: "active" } } } });
  const sig = createHmac("sha256", "smoke_webhook_secret").update(body).digest("hex");
  const send = (signature) => request(http).post("/v1/billing/webhooks/razorpay").set("Content-Type", "application/json").set("X-Razorpay-Signature", signature).set("X-Razorpay-Event-Id", `evt_${run}`).send(body);
  assert.equal((await send("deadbeef")).status, 401);
  const first = await send(sig);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.ignored, "unknown_subscription");
  assert.equal((await send(sig)).body.duplicate, true);
});

test("socket: handshake auth, membership, live fan-out", async () => {
  const connect = (token) =>
    new Promise((resolve, reject) => {
      const s = io(baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 8000 });
      const t = setTimeout(() => (s.disconnect(), reject(new Error("connect timeout"))), 10_000);
      s.on("connect", () => (clearTimeout(t), resolve(s)));
      s.on("connect_error", (e) => (clearTimeout(t), s.disconnect(), reject(e)));
    });
  await assert.rejects(connect("bogus"), /Invalid|unauthorized|token|Authentication/i);

  const outsider = await connect(tok("mallory"));
  const denied = await outsider.timeout(5000).emitWithAck("convoy:join", { convoyId: S.convoy });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  outsider.disconnect();

  const zara = await connect(ZARA);
  const aarav = await connect(AARAV);
  const joined = await zara.timeout(5000).emitWithAck("convoy:join", { convoyId: S.convoy });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  assert.ok(joined.data.vehicles.length >= 2);
  await aarav.timeout(5000).emitWithAck("convoy:join", { convoyId: S.convoy });

  const update = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no location:update broadcast within 8 s")), 8000);
    zara.on("location:update", (v) => (clearTimeout(t), resolve(v)));
  });
  await new Promise((r) => setTimeout(r, 2100));
  const ack = await aarav.timeout(5000).emitWithAck("location:ping", { convoyId: S.convoy, vehicleId: S.a1, ...along(0.21), speedKph: 84, headingDeg: 140, capturedAt: new Date(Date.now() + 55_000).toISOString() });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  assert.equal(ack.data.accepted, true, JSON.stringify(ack));
  const got = await update;
  assert.equal(got.vehicleId, S.a1);

  const bad = await aarav.timeout(5000).emitWithAck("location:ping", { convoyId: S.convoy, vehicleId: S.a1, lat: 999 });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
  zara.disconnect();
  aarav.disconnect();
});
