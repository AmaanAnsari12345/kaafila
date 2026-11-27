# Deploy Checklist Status

Date: 2026-11-28 (launch readiness: voice, calls, push, retention, deletion, enthusiast features)

## Verified in this workspace

| Check | Result |
|---|---|
| `packages/shared` build + 36 unit tests (geo, intelligence, settlement, pricing, OBD, garage, roadside, feature rollout, fuel economy, drive score) | Pass |
| Shared package loads at runtime from the CommonJS API (the v1 build crashed at boot here) | Pass |
| Prisma validate + client generate | Pass |
| All three migrations (including `202611270001_launch_and_enthusiast`) applied to a real PostgreSQL (embedded; CI uses PostGIS 16) | Pass |
| `prisma migrate diff` database ↔ schema: no drift | Pass |
| API typecheck + `nest build` | Pass |
| API end-to-end smoke test (`apps/api/test/smoke.test.mjs`), 21 flows over HTTP, SSE and Socket.IO against real Postgres (Redis mocked in memory) | Pass (after fixing a retention SQL bug it found) |
| Web typecheck (with `next typegen`), lint + production build (20 routes) | Pass |
| Landing page, cockpit HUD on the dark map, voice overlay viewed in a browser | Pass |
| Drive cockpit demo, landing and roadside pages viewed in a browser: real OpenFreeMap tiles, moving cars, live intelligence, quick signals | Pass |
| Hostinger bundles + zips regenerated from current code | Pass |

The smoke test covers: auth and validation, garage reminders, convoy access control, vehicle ownership on pings, plan rate limits, formation/Elastic Band/range intelligence with graceful degradation when places services fail, chat and signals, kitty settlement, ₹500 seat checkout (sandbox) → Drive entitlements → family follow link → public view, dead-zone coverage learning (raw SQL), SOS permissions, staff-only admin with audit log and feature flags, meetup review gate and waitlist promotion, social, device pairing (single-use code → navigator role), Razorpay webhook signature + idempotency, feature registry and staged flags, VAPID key endpoint, fuel economy (full-to-full), build sheet validation, drive score, scenic routes (straight-line routes refused, member-only sharing, one rating per person), streaming help and co-pilot answers over SSE (status codes kept for errors before streaming), admin-only retention job, account deletion (confirmation phrase, cleanup, token revoked), socket handshake auth, membership checks and live fan-out.

## Not verified here

- Docker images and `docker compose up` (Docker isn't installed on this machine).
- Real Redis (the smoke test used an in-memory mock; CI runs it against Redis 7).
- Live Supabase sign-in, Razorpay/Stripe payments, LiveKit media, Claude API calls, Web Push delivery (no credentials in this workspace).
- Voice recognition and speech on physical phones (the overlay was checked on desktop; the streaming path is covered by the smoke test in rules mode).
- Native-device behaviour: background GPS, Web Bluetooth with a physical OBD adapter, crash-detection sensors.
- Load testing.

## Before production launch

1. Provision Postgres 16+ (PostGIS optional), Redis 7, LiveKit with TURN.
2. Self-host or contract routing (OSRM/Valhalla or Google Routes), geocoding (Nominatim or provider), Overpass, and a commercial Open-Meteo key. Set `OSM_USER_AGENT`.
3. Supabase project: enable email magic link and Google; set `SUPABASE_*` and `NEXT_PUBLIC_SUPABASE_*`. Leave `ALLOW_DEV_TOKEN` unset (the API refuses to start with it in production).
4. Razorpay: monthly plan at ₹500 (inclusive) or ₹590 (exclusive), webhook to `/v1/billing/webhooks/razorpay` with events `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`. Stripe: recurring Price + webhook to `/v1/billing/webhooks/stripe`.
5. `ANTHROPIC_API_KEY` for the co-pilot and voice mode; tune `ASSISTANT_VOICE_EFFORT`, `ASSISTANT_HOURLY_LIMIT`, `ASSISTANT_PUBLIC_DAILY_LIMIT`.
5a. Web Push: `npx web-push generate-vapid-keys`, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: or https: contact).
5b. LiveKit for group calls: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`.
5c. Keep `RETENTION_ENABLED=true` on exactly the API replicas you want running the job (a Redis lock prevents overlap).
6. `pnpm --filter @kaafila/api db:deploy`, then check `/v1/health/ready`.
7. Promote one admin: `UPDATE "User" SET role = 'admin' WHERE email = '<your email>';`
8. Run `pnpm --filter @kaafila/api test:smoke` against staging.
