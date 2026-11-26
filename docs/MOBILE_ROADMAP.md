# Mobile Roadmap

KAAFILA is already structured to become Android and iOS apps without changing the backend model.

## Current Reusable Layers

- Shared contracts: [packages/shared/src/index.ts](C:/Users/91961/OneDrive/Documents/Kaafila/packages/shared/src/index.ts)
- Auth surface: Supabase
- Billing surface: Razorpay + Stripe
- Realtime surface: Socket.IO + LiveKit
- Domain model: convoys, tracking, journeys, alerts, subscriptions, reports, ads

## Recommended Mobile Architecture

Use `Expo + React Native` for the first mobile apps.

Why:

- fast Android and iOS delivery
- strong React team reuse
- easier OTA updates
- straightforward access to notifications, location, camera, microphone, and native modules

## App Modules

1. Auth and onboarding
2. Vehicle profile and emergency profile
3. Live convoy room
4. PTT voice and group calling
5. Background location streaming
6. Journey recorder with camera/media upload
7. Family follow mode
8. Sponsor placements and rewarded unlocks
9. Admin-lite operator console

## Native-Only Work

- background location permissions and battery rules
- push notifications
- call audio routing and Bluetooth
- offline storage and sync
- Android Auto / Apple CarPlay
- OBD-II / telemetry bridges

## Build Sequence

1. Web pilot validates UX and business model.
2. Expo shell app consumes the same API and shared contracts.
3. Replace web-only components with native map, permissions, camera, notifications.
4. Add background tasks and media upload.
5. Add native monetization SDKs.
6. Add automotive integrations last.

## Mobile Monetization

- Pro subscription stays shared at the account level.
- Mobile ads use native SDK placement rules.
- Direct sponsors remain server-driven inventory packages.
- Rewarded unlocks can gate premium replay exports for free users.

## Definition Of Mobile Ready

KAAFILA is mobile-ready when:

- every major backend contract is app-agnostic
- maps and realtime flows are not tied to DOM APIs
- auth and billing are server-owned
- media storage is object-storage based
- sponsor inventory is configuration-driven, not hardcoded per screen
