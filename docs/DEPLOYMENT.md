# Deployment

All variables are documented in [`.env.example`](../.env.example).

## Topology

- **Web** (`apps/web`): Vercel (`infra/vercel.json`, regions `bom1`, `sin1`) or any Node host (`next start`). Build needs the shared package built first (`turbo build` handles it).
- **API + realtime** (`apps/api`): container (`apps/api/Dockerfile`) on Fly.io, Render, Railway, ECS or similar. Run **≥ 2 replicas behind sticky sessions**; the Socket.IO Redis adapter is enabled automatically.
- **PostgreSQL 16+** (managed; PostGIS optional), **Redis 7** (managed), **LiveKit** (cloud or self-hosted with TURN).
- **Geo services**: self-hosted OSRM/Valhalla, Nominatim and Overpass (one 64 GB box covers India to start) or paid providers; commercial Open-Meteo key.

## Web variables

`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_SUPPORT_EMAIL`. Leave `NEXT_PUBLIC_DEV_AUTH` unset in production.

## API variables

Required: `DATABASE_URL`, `REDIS_URL`, `PUBLIC_APP_URL` (comma-separated allowed origins), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Geo: `ROUTING_PROVIDER`, `OSRM_BASE_URL` or `GOOGLE_MAPS_API_KEY`, `GEOCODER_BASE_URL`, `OVERPASS_BASE_URL`, `WEATHER_BASE_URL`, `OPEN_METEO_API_KEY`, `OSM_USER_AGENT`.
Voice: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`. AI: `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`, `ASSISTANT_EFFORT`.
Billing: `PRICE_TAX_MODE`, `GST_RATE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_DRIVE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_DRIVE`.
Never set `ALLOW_DEV_TOKEN` in production — the API refuses to boot with it.

## Release gates

1. `pnpm --filter @kaafila/shared test`
2. `pnpm typecheck && pnpm build`
3. `pnpm --filter @kaafila/api db:deploy` then the drift check: `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code`
4. `pnpm --filter @kaafila/api test:smoke` against staging
5. `/v1/health/ready` returns `ready`; `/`, `/drive`, `/roadside`, `/manifest.webmanifest`, `/sw.js` load

## Payments go-live

- Razorpay: create a monthly plan whose amount matches the tax mode (₹500 inclusive or ₹590 exclusive), set `RAZORPAY_PLAN_ID_DRIVE`, add a webhook to `/v1/billing/webhooks/razorpay` for the `subscription.*` events listed in `DEPLOY_CHECKLIST_STATUS.md`.
- Stripe: a recurring monthly Price for one car (`STRIPE_PRICE_ID_DRIVE`) and a webhook to `/v1/billing/webhooks/stripe` for `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`.
- Confirm GST registration, SAC code and invoicing with a tax adviser.

## Data retention

`LocationPing` grows fastest. Partition it by month and schedule deletion by plan history window (Explorer 7 days, Drive 365 days) before launch — the retention job is on the roadmap.
