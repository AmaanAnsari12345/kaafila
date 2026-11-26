# KAAFILA Launch SOP

This SOP is the practical sequence for taking KAAFILA from local preview to a production pilot with monetization turned on.

## Phase 1: Foundation Freeze

1. Freeze the feature set for pilot:
   `convoy rooms`, `live map`, `vehicle roster`, `alerts`, `voice channels`, `journey recorder`, `admin dashboard`, `Brand Studio`, `billing`.
2. Create production credentials and store them in your secrets manager:
   `Supabase`, `Postgres`, `Redis`, `Google Maps`, `Mapbox`, `LiveKit`, `Razorpay`, `Stripe`, `AWS`, `Cloudflare`, `Sentry`.
3. Set public product limits for the pilot:
   free plan size, Pro plan price, convoy member cap, data retention, support SLA.

## Phase 2: Infrastructure Bring-up

1. Provision:
   `Vercel` for web, `ECS/EKS/Render/Fly/Railway` for API, `RDS Postgres`, `ElastiCache Redis`, `S3 + CloudFront`, `LiveKit`.
2. Apply environment variables from [.env.example](C:/Users/91961/OneDrive/Documents/Kaafila/.env.example).
3. Run database steps:
   `pnpm db:generate`
   `pnpm db:migrate`
4. Enable observability:
   app logs, API logs, websocket logs, Prisma errors, webhook logs, uptime checks, Sentry alerts.

## Phase 3: Monetization Activation

1. Turn on Pro billing flows:
   Razorpay for India first, Stripe for global coverage.
2. Turn on free-tier ad inventory:
   lobby banners, rewarded export unlocks, replay sponsor cards, pit stop placements.
3. Turn on direct sponsorship inventory:
   title convoy, route takeover, safety sponsor, pit stop partner, AI movie sponsor.
4. Publish the sponsor rate card:
   one-page pricing sheet, media kit, convoy demographics, sponsor deliverables, brand-safe ad policy.

## Phase 4: Pilot Operations

1. Start with 3 pilot cohorts:
   supercar clubs, biker communities, tourism operators.
2. Assign one operator per live convoy window:
   support, moderation, incident response, sponsorship QA.
3. Run each pilot with a checklist:
   room creation, join flow, live tracking, voice channel, alert ack, regroup flow, report export.
4. Collect:
   DAU, convoy completion rate, average convoy size, Pro conversion, sponsor CTR, incident count.

## Phase 5: Mobile Expansion

1. Reuse backend, shared types, auth, billing, realtime, and LiveKit.
2. Build mobile clients with `Expo + React Native`.
3. Port:
   live map, push-to-talk, notifications, location streaming, journey capture, sponsor placements.
4. Then add:
   Android Auto, Apple CarPlay, offline map packs, OBD-II ingestion.

## Release Gate

Ship only when all of these pass:

- `pnpm build`
- `apps/web` production build passes
- `apps/api` Nest build passes
- Prisma validate/generate passes
- `/` and `/admin` smoke checks pass
- webhook test events pass
- LiveKit token generation passes
- test sponsor placement renders without blocking core navigation

## Daily Ops Rhythm

1. 08:00: infra health, queue backlog, failed renewals, sponsor impressions.
2. 12:00: pilot convoy review, user support, bug triage.
3. 18:00: revenue dashboard, lead pipeline, next-day launch checklist.
