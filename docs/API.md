# VenueRelay API

Interactive Swagger UI: `/api/docs`. OpenAPI 3.1: `/api/openapi.json`; regenerate with `npm run api:docs`.

The API base is `/api/v1`. Browser sessions use HttpOnly SameSite cookies. Mutations require an allowed Origin when one is present. Authenticated organisers may issue event-scoped hashed bearer integration keys; keep them server-side. Existing API bearer sessions remain supported.

## Operational writes

```http
POST /api/v1/events/EVENT_ID/commands
Content-Type: application/json
Idempotency-Key: UNIQUE_INTENT_ID
X-Rally-Expected-Actor: MEMBER_ID

{"action":"task.create","payload":{"title":"Prepare the welcome desk","location":"Entrance"}}
```

Persist the intent and ID before sending. Retry with the same ID and identical body after an uncertain response. Reusing an ID with different data returns 409. Task updates include `taskId` and `expectedVersion`; a stale version returns 409 without changing records. Do not silently overwrite it: refresh and obtain an explicit reviewed intent.

`X-Rally-Expected-Actor` protects offline queues from account changes. `409 ACTOR_CHANGED` means retain the original work and ask for the original account. `X-Rally-Persona` is only a role preview in the authenticated owner’s sample event; real event role spoofing is rejected.

Errors have `{"error":{"code":"...","message":"...","details":{}}}`. Preserve waiting work on network/5xx errors. Respect Retry-After on 429. A 401 needs sign-in; 403 means access is denied. A request is not confirmed merely because it was sent.

## Live and browser notifications

| Endpoint | Purpose |
| --- | --- |
| `POST /events/{id}/live-ticket` | Hosted MongoDB: issue an origin/event/persona/session-bound, one-use ticket valid for 30 seconds |
| `GET /events/{id}/live` | WebSocket upgrade; local same-origin cookie or hosted `?ticket=VALUE`, with an allowed Origin |
| `GET /events/{id}/snapshot` | Current role-filtered event records |
| `GET /events/{id}/activity?after=ID` | Cursor-based accessible history |
| `GET /push/public-key` | Push availability and public VAPID key |
| `GET /events/{id}/push/subscription` | Whether the current session/member is subscribed |
| `POST /events/{id}/push/subscription` | Save browser-provided `{endpoint,keys:{p256dh,auth}}` |
| `DELETE /events/{id}/push/subscription` | Remove an owned `{endpoint}` |

WebSocket messages are `{type:"connected",eventId}` and `{type:"event.changed",eventId}`. Refetch the authorised snapshot on invalidation; missed messages are recovered by reconnect refresh/polling. Session revocation closes the socket with 4401. WebSocket payloads do not contain task records or accept commands.

Push requires browser permission, VAPID settings and an own signed-in membership. Subscriptions to supported browser push providers are accepted; arbitrary URLs are rejected. No private VAPID key is returned. Browser push delivery does not replace durable inbox/activity records.

## Accounts

`POST /auth/register` accepts `{name,email,password}`. With `EMAIL_TRANSPORT=disabled` (default), it returns `{user,delivery,recoveryCode}` and a session cookie. `user.accessGranted` is true and `user.emailVerified` remains false. Save `recoveryCode` privately: it is returned once and stored only as a hash. Never log it. `GET /auth/me` does not return it.

`POST /auth/recover-account` accepts `{email,recoveryCode,password}`. It atomically changes the password, rotates the code, cancels pending resets and revokes existing sessions. The success response contains a replacement `recoveryCode`; save it and sign in again. Invalid, used or unknown proofs return the same 401 error; per-account and IP limits apply. Do not blindly retry a lost recovery response: try signing in with the new password.

`POST /auth/recovery-code` accepts `{password}` for your own signed-in account and returns a replacement code once. The previous code stops working. Demo accounts are denied. This is also available through More → Account security.

Optional email verification and reset endpoints remain documented for deployments with an email transport. Preview mode creates private files for local testing and is rejected in production. Event access and email ownership are separate facts.

Render serves the website and HTTP API from the same origin so cookies stay first-party. Request a fresh ticket for each direct Render WebSocket connection. Keep established `X-Rally-*` headers, cookies and device-storage identifiers for backward compatibility after the VenueRelay rename. The production adapter shares task rules with the local SQLite adapter; production requires MongoDB transactions.
