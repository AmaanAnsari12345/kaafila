# API Reference

Base URL: `/v1`. Interactive docs: `/docs` (outside production, or with `ENABLE_API_DOCS=true`).

**Auth:** `Authorization: Bearer <Supabase access token>`. For local development only, when the API runs with `ALLOW_DEV_TOKEN=true` and `NODE_ENV` is not `production`: `Bearer dev-token` (admin) or `Bearer dev-token:<name>` (a regular user per name).

**Access rules:** every convoy-scoped route checks membership; staff (admin/support) get read access for operations. Location and telemetry are accepted only for a vehicle the caller drives or navigates in that convoy. Suspended accounts are rejected.

Public routes (no auth) are marked 🌐.

## Platform & health
- 🌐 `GET /health` — liveness. 🌐 `GET /health/ready` — database and Redis reachability (503 when degraded).
- 🌐 `GET /platform/plans` — plan cards. 🌐 `GET /platform/announcements?country=IN`.
- `GET /platform/flags` — feature flags evaluated for the caller (stable percentage rollout).

## Users
- `GET /users/me` — profile, vehicles and effective plan. `PATCH /users/me` — profile, handle, safety card, UPI ID.
- `GET /users/me/export` — personal data export.

## Garage
- `GET|POST /garage/vehicles`, `GET|PATCH|DELETE /garage/vehicles/:id`
- `POST|DELETE /garage/vehicles/:id/maintenance[/:recordId]` — passing `reminderId` rolls that reminder forward.
- `POST|DELETE /garage/vehicles/:id/reminders[/:reminderId]`, `POST|DELETE /garage/vehicles/:id/documents[/:documentId]`
- `POST /garage/vehicles/:id/telemetry` — OBD readings + DTCs; returns interpreted flags (history kept on Drive). `GET` for history.

## Devices
- `GET /devices`, `POST /devices`, `DELETE /devices/:id`, `POST /devices/:id/heartbeat`, `GET /devices/vehicles/:vehicleId`
- `POST /devices/pairings` — 6-digit code (10 min). `POST /devices/pairings/claim` — single-use; another person's device joins the owner's live convoys as navigator.

## Maps
- `GET /maps/geocode?q=` — Nominatim-compatible, serialised to 1 req/s upstream, cached 24 h, 20/min per user.
- `POST /maps/route` — OSRM or Google Routes; straight-line estimate (flagged) as fallback.

## Convoys
- `POST /convoys`, `GET /convoys/mine`, `GET /convoys/invite/:code`, `POST /convoys/join`, `GET /convoys/:id`
- `PATCH /convoys/:id/status` (owner/leader), `PATCH|DELETE /convoys/:id/members/:userId`
- `POST|DELETE /convoys/:id/regroup`, `GET|POST /convoys/:id/messages`, `POST /convoys/:id/signals`, `POST /convoys/:id/alerts/:alertId/ack`
- `POST|GET /convoys/:id/share-links`, `DELETE /convoys/:id/share-links/:linkId` — family follow links (Drive).

## Tracking & intelligence
- `POST /tracking/ping` — REST fallback for the socket path. Rate-limited per car by plan (Drive 2 s, Explorer 10 s); returns `retryAfterMs`.
- `GET /tracking/convoys/:id/live`, `GET /tracking/convoys/:id/breadcrumbs` (Ghost Leader trail)
- `GET /intel/convoys/:id` — formation, Elastic Band, Weakest-Link Range + stop, fatigue, Fair Regroup, Dead-Zone Forecast, health score (cached 10 s per convoy).
- 🌐 `GET /public/follow/:token` — read-only family view (first names, positions only).

## Safety & roadside
- `POST /sos`, `POST /sos/:id/status` (`acknowledged`, `resolved`, `false_alarm`), `GET /sos/mine`, `GET /sos/convoys/:id`
- 🌐 `GET /roadside/emergency?country=IN` or `?lat=&lng=`, 🌐 `GET /roadside/guides[/:id]`
- `GET /roadside/nearby?category=fuel&lat=&lng=&radius=`, `GET /roadside/weather?lat=&lng=`, `GET /roadside/weather/convoys/:id`
- `GET|POST /roadside/reports`, `POST /roadside/reports/:id/vote`

## Kitty
- `GET /kitty/convoys/:id` — expenses, balances, minimum transfers with UPI links.
- `POST /kitty/convoys/:id/expenses` (`equal`, `by_car`, `custom`), `DELETE /kitty/convoys/:id/expenses/:expenseId`

## Social & meetups
- `GET /social/feed`, `POST|DELETE /social/posts[/:id]`, `POST /social/posts/:id/like`, `GET|POST /social/posts/:id/comments`
- `POST /social/users/:id/follow`, `GET /social/profiles/:handle`
- `GET|POST /social/clubs`, `GET /social/clubs/mine`, `GET /social/clubs/:slug`, `POST /social/clubs/:id/join`, `DELETE /social/clubs/:id/membership`
- `POST /social/reports`
- `GET /meetups`, `GET /meetups/mine`, `GET|POST /meetups[/:id]`, `POST /meetups/:id/cancel`, `POST|DELETE /meetups/:id/rsvp`, `POST /meetups/:id/check-in`

## Assistant
- `POST /assistant/ask` `{ message, convoyId?, lat?, lng? }` — Claude with convoy-scoped tools (Drive) or rule-based answers. `GET /assistant/history`.

## Voice & journeys
- `GET /voice/convoys/:id/channels`, `POST /voice/convoys/:id/livekit-token?channelId=`
- `POST /journeys/convoys/:id/start` (Drive), `GET /journeys/convoys/:id`, `POST /journeys/events`, `POST /journeys/:id/complete`, `GET /journeys/:id/replay`, `GET /journeys/:id/report`

## Billing (₹500 per car per month)
- 🌐 `GET /billing/quote?vehicles=N` — subtotal, GST, total, RBI e-mandate flag.
- `GET /billing/me`, `POST /billing/checkout` `{ provider, vehicles, vehicleIds? }`
- `POST /billing/subscriptions/:id/seats`, `DELETE /billing/seats/:seatId`, `POST /billing/subscriptions/:id/cancel`
- `POST /billing/subscriptions/:id/sandbox-activate` — development only (403 in production).
- 🌐 `POST /billing/webhooks/razorpay` (HMAC-SHA256 of raw body), 🌐 `POST /billing/webhooks/stripe` (`constructEvent`). Both idempotent per event id.

## Admin (staff; some actions admin-only)
- `GET /admin/overview`, `GET /admin/revenue` (admin), `GET /admin/users`, `PATCH /admin/users/:id/suspension`, `PATCH /admin/users/:id/role` (admin)
- `GET /admin/convoys`, `POST /admin/convoys/:id/force-end` (admin), `GET /admin/sos`
- `GET /admin/moderation`, `POST /admin/reports/:id/resolve`, `PATCH /admin/posts/:id/visibility`, `POST /admin/road-reports/:id/remove`
- `GET /admin/meetups/pending`, `POST /admin/meetups/:id/review`
- `GET|POST /admin/announcements`, `DELETE /admin/announcements/:id` (admin)
- `GET /admin/flags`, `PUT /admin/flags/:key` (admin), `GET /admin/audit` (admin)
