# KAAFILA™

**The group-driving operating system.** KAAFILA keeps every car in a group coordinated — pacing, fuel stops, regroups, emergencies and expenses — from the first invite to the last UPI settlement. Pricing: **₹500 per car per month** (KAAFILA Drive); joining a convoy is free (Explorer).

Start with **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)**: product, architecture, feature status, device model, provider limits, pricing mechanics and roadmap.

## What's inside

| Path | What |
|---|---|
| `apps/web` | Next.js 15 PWA: landing, Drive cockpit (MapLibre + live sockets + offline demo), Garage with Web Bluetooth OBD-II, Connect (device pairing), Roadside, Co-pilot, Community, Meetups, Billing, Profile, operations console |
| `apps/api` | NestJS 10: REST + Socket.IO, Prisma/PostgreSQL, Redis, Supabase auth, Razorpay/Stripe seats, LiveKit tokens, Claude co-pilot |
| `packages/shared` | Domain types and pure logic used by both: geo maths, convoy intelligence, kitty settlement, pricing, OBD parsing, roadside data. Unit-tested |
| `apps/api/test/smoke.test.mjs` | End-to-end smoke test (15 flows over HTTP and Socket.IO against a real database) |
| `deploy/hostinger` | Generated upload bundles (`pnpm hostinger:prepare`) |

## Signature features

Elastic Band pacing · Weakest-Link Range fuel/charge planning · Fair Regroup (minimax ETA) · Dead-Zone Forecast learned from ping gaps · Convoy Pulse fatigue alerts · crash-aware SOS with countdown and safety card · Kitty with minimum-transfer settlement and UPI links · expiring family follow links · co-pilot device pairing · Ghost Leader breadcrumb trail · quick signals read aloud.

## Quick start (local)

Requirements: Node 22.12+, pnpm 9.15, PostgreSQL 16+, Redis 7 (or `docker compose up postgres redis`).

```bash
pnpm install
cp .env.example .env            # dev defaults: ALLOW_DEV_TOKEN=true, NEXT_PUBLIC_DEV_AUTH=true
pnpm --filter @kaafila/shared build
pnpm db:generate
pnpm --filter @kaafila/api db:deploy
pnpm dev                        # web :3000, API :4000, shared package in watch mode
```

- Open `http://localhost:3000/drive` — the demo convoy runs without an account.
- Sign in at `/login` with a dev name (use different names in different browsers to test a convoy with several people; the name `admin` is an administrator).
- API docs: `http://localhost:4000/docs`.
- Without payment keys, checkout runs in a **development sandbox** you can activate from the Billing page (disabled in production).
- Without `ANTHROPIC_API_KEY`, the co-pilot answers with rule-based responses from the same live data.

## Checks

```bash
pnpm --filter @kaafila/shared test          # 31 unit tests
pnpm typecheck && pnpm build
DATABASE_URL=... REDIS_URL=... pnpm --filter @kaafila/api test:smoke   # migrated DB required
```

CI (`.github/workflows/ci.yml`) runs all of these against Postgres and Redis, plus a migration-drift check.

## Docs

[Blueprint](docs/BLUEPRINT.md) · [API](docs/API.md) · [Realtime](docs/REALTIME.md) · [Deployment](docs/DEPLOYMENT.md) · [Deploy status](docs/DEPLOY_CHECKLIST_STATUS.md) · [Security](docs/SECURITY.md) · [Hostinger](docs/HOSTINGER_DEPLOY.md) · [Launch SOP](docs/LAUNCH_SOP.md) · [Revenue playbook](docs/REVENUE_PLAYBOOK.md) · [Mobile roadmap](docs/MOBILE_ROADMAP.md)

## Honest limits

- Browsers pause GPS when the app isn't on screen; background tracking, CarPlay and Android Auto need the native apps on the roadmap.
- Web Bluetooth (OBD) works in Chrome and Edge, not on iPhone or Firefox.
- The public OSRM, Nominatim and Overpass servers and the free Open-Meteo API are for development; production needs self-hosted or paid equivalents (BLUEPRINT §7).
- Crash detection is an aid, not a certified safety system.
