# Realtime

Socket.IO carries convoy state, positions, quick signals, chat, SOS and PTT signalling. LiveKit carries voice/video media. Event names live in `packages/shared/src/events.ts` (`SOCKET_EVENTS`).

## Connection

```ts
const socket = io(API_URL, { auth: { token: supabaseAccessToken } });
socket.emit("convoy:join", { convoyId }, (ack) => { /* ack.data = ConvoyStateSnapshot */ });
```

- The token is verified during the handshake; unauthenticated sockets never connect.
- Each socket joins `user:<id>`; staff sockets also join `staff` (SOS console, meetup review queue).
- `convoy:join` checks membership (staff may observe). Every handler validates its payload and replies with `{ ok: true, data } | { ok: false, error, status }`.

## Client → server

| Event | Payload | Notes |
|---|---|---|
| `convoy:join` / `convoy:leave` | `{ convoyId }` | join returns a snapshot |
| `location:ping` | `LocationPingDto` | car must be yours in this convoy; plan cadence enforced (`accepted: false, reason: "rate_limited", retryAfterMs`) |
| `signal:send` | `{ convoyId, code, lat?, lng? }` | 20/min per user |
| `chat:send` | `{ convoyId, body }` | 30/min per user |
| `regroup:set` | `{ convoyId, name, lat, lng }` | owner/leader |
| `sos:raise` | `{ convoyId?, kind, lat, lng, peakG? }` | repeated taps within 20 s update one incident |
| `voice:signal` | `{ convoyId, channelId, kind, data? }` | sender identity comes from the socket, not the payload |

## Server → client

`location:update` (LiveVehicleState), `signal:new`, `chat:new`, `sos:new`, `sos:update`, `regroup:new`, `convoy:state` (status changes, operations force-end), `convoy:presence` (online/offline/joined/role/removed), `kitty:updated`, `device:paired`, `meetup:promoted`, `meetup:reviewed`.

## Hot path

1. Membership + vehicle check (Redis-cached 30 s), plan cadence throttle (`SET NX PX`).
2. Live state in Redis (`live:<convoy>:<vehicle>`, TTL 5 min); out-of-order pings after a dead zone are stored but don't move the marker back.
3. Leader breadcrumbs (`crumbs:<convoy>`, 600 points) for the Ghost Leader trail; driving session state for fatigue.
4. Fan-out to `convoy:<id>`; durable `LocationPing` insert and dead-zone coverage learning run asynchronously.

## Scaling

`RedisIoAdapter` (Socket.IO Redis adapter) is enabled automatically when Redis is reachable, so rooms span API replicas. Run replicas behind sticky sessions (required for the polling transport). TURN servers are needed for LiveKit on restrictive mobile networks.
