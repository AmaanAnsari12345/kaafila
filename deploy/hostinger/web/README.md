# KAAFILA Hostinger Web Upload

Upload this entire folder as a Hostinger Next.js app.

Recommended Hostinger settings:
- Build command: `npm run build`
- Start command: `npm run start`
- Node version: `22` if available, otherwise `20`

Before deploy:
1. Rename `.env.example` to `.env` in the Hostinger file manager or set the same values in the environment UI.
2. Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL` to your deployed API domain.
3. Set the Supabase, Maps, LiveKit, and billing keys.

Route notes:
- Landing: `/`, cockpit: `/drive`, roadside: `/roadside`
- Operations console (staff only): `/admin`
- PWA manifest: `/manifest.webmanifest`
- Service worker: `/sw.js`
