# KAAFILA Hostinger API Upload

Upload this entire folder as a Hostinger NestJS app.

Recommended Hostinger settings:
- Build command: `npm run build`
- Start command: `npm run start`
- Node version: `22` if available, otherwise `20`

Before deploy:
1. Rename `.env.example` to `.env` in the Hostinger file manager or set the same values in the environment UI.
2. Set `DATABASE_URL` and `REDIS_URL` to your managed services.
3. Set Supabase, Maps, LiveKit, and payment secrets.
4. Run Prisma deploy command once after the first upload: `npx prisma migrate deploy`.

Health endpoint after deploy:
- `/v1/health`
