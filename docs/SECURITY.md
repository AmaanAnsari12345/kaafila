# Security

## Identity

- Supabase is the identity provider for email, Google, Apple, and mobile OTP.
- API routes require bearer tokens except public health checks and provider webhooks.
- Admin endpoints require the `admin` or `support` role (`StaffGuard`, `AdminGuard`); roles live in the database and every admin mutation is written to `AuditLog`. The `dev-token` bypass works only with `ALLOW_DEV_TOKEN=true` outside production.

## Location Privacy

- Location pings are sensitive personal data.
- Store exact tracks only for active convoy participants and explicit family follow mode.
- Retention should follow plan limits: Free history is short-lived, Pro history is longer, enterprise/fleet retention is contract based.
- Provide export and deletion controls for journey recordings.

## Realtime

- Socket connections are authenticated during the handshake (implemented).
- Every socket room join and event verifies convoy membership; location pings must come from the vehicle's own driver or navigator (implemented).
- SOS events should be tamper-evident and retained for audit.

## Payments

- Razorpay and Stripe webhook signatures are verified over the raw body before any state change, and each event id is processed once (implemented).
- Never trust client-side plan status.
- Keep all amount values in minor units.

## Infrastructure

- Use Postgres row-level access only when exposing direct data APIs; this backend uses service-role access and must enforce policy in NestJS.
- Encrypt media at rest and serve it through signed URLs.
- Rate-limit invite creation, location pings, SOS broadcasts, and public convoy discovery.
- Add security headers, CORS allowlists, WAF rules, Sentry, audit logs, and structured request IDs.
