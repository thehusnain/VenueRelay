# Rally API

Interactive Swagger UI: `/api/docs`. OpenAPI 3.1: `/api/openapi.json`; regenerate with `npm run api:docs`.

The API base is `/api/v1`. Browser sessions use HttpOnly SameSite cookies. Mutations require an allowed Origin when one is present. Verified organisers may issue event-scoped hashed bearer integration keys; keep them server-side. Existing API bearer sessions remain supported.

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
| `GET /events/{id}/live` | WebSocket upgrade; cookie session, allowed Origin, optional owner-only demo persona query |
| `GET /events/{id}/snapshot` | Current role-filtered event records |
| `GET /events/{id}/activity?after=ID` | Cursor-based accessible history |
| `GET /push/public-key` | Push availability and public VAPID key |
| `GET /events/{id}/push/subscription` | Whether the current session/member is subscribed |
| `POST /events/{id}/push/subscription` | Save browser-provided `{endpoint,keys:{p256dh,auth}}` |
| `DELETE /events/{id}/push/subscription` | Remove an owned `{endpoint}` |

WebSocket messages are `{type:"connected",eventId}` and `{type:"event.changed",eventId}`. Refetch the authorised snapshot on invalidation; missed messages are recovered by reconnect refresh/polling. Session revocation closes the socket with 4401. WebSocket payloads do not contain task records or accept commands.

Push requires browser permission, VAPID settings and an own signed-in membership. Subscriptions to supported browser push providers are accepted; arbitrary URLs are rejected. No private VAPID key is returned. Browser push delivery does not replace durable inbox/activity records.

Accounts, verification/reset, invitations, schedule, announcements, exports, integrity and integration-key operations are fully described in OpenAPI. Default email previews remain private under `data/mail-preview`; use `npm run email:preview -- EMAIL` for local verification. Configure SMTP through private `.env` for external delivery. Never include preview files or credentials in the repository.
