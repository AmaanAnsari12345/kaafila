# Hostinger Deployment

KAAFILA is a split deployment on Hostinger:

- `deploy/hostinger/web` -> Next.js frontend app
- `deploy/hostinger/api` -> NestJS backend app

Do not upload the monorepo root directly. The root still uses workspace wiring for local development.

## Prepare Upload Folders

From the project root:

```bash
node scripts/prepare-hostinger-bundles.mjs
```

That creates:

- `deploy/hostinger/web`
- `deploy/hostinger/api`

## Hostinger Web App

Upload the contents of `deploy/hostinger/web` as one Node.js app.

Recommended settings:

- Framework: `Next.js`
- Build command: `npm run build`
- Start command: `npm run start`
- Node version: `22` if available, otherwise `20`

Set these environment variables:

- `PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SOCKET_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `NEXT_PUBLIC_LIVEKIT_WS_URL`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Hostinger API App

Upload the contents of `deploy/hostinger/api` as a second Node.js app.

Recommended settings:

- Framework: `NestJS`
- Build command: `npm run build`
- Start command: `npm run start`
- Node version: `22` if available, otherwise `20`

Set these environment variables:

- `PORT`
- `PUBLIC_APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `MAPBOX_ACCESS_TOKEN`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_WS_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## First Deploy Order

1. Deploy API app
2. Set API domain into web env:
   `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SOCKET_URL`
3. Deploy web app
4. Run database migration:
   `npx prisma migrate deploy`
5. Verify:
   - web `/`
   - web `/admin`
   - web `/manifest.webmanifest`
   - API `/v1/health`

## Important Notes

- Hostinger should treat these as two separate Node.js applications.
- The shared package is vendored into each upload folder, so Hostinger does not need pnpm workspaces.
- Keep production secrets in Hostinger environment variables instead of hardcoding them into files.
