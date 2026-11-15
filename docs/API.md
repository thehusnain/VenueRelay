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
| `POST /events/{id}/notifications/read` | Acknowledge up to 100 owned notification IDs with `{ids:[...]}`; repeated acknowledgements are safe |
| `GET /push/public-key` | Push availability and public VAPID key |
| `GET /events/{id}/push/subscription` | Whether the current session/member is subscribed |
| `POST /events/{id}/push/subscription` | Save browser-provided `{endpoint,keys:{p256dh,auth}}` |
| `DELETE /events/{id}/push/subscription` | Remove an owned `{endpoint}` |

WebSocket messages are `{type:"connected",eventId}` and `{type:"event.changed",eventId}`. Refetch the authorised snapshot on invalidation; missed messages are recovered by reconnect refresh/polling. Session revocation closes the socket with 4401. WebSocket payloads do not contain task records or accept commands.

MongoDB deployments create and retain VAPID keys automatically unless environment keys are supplied. Push requires browser permission and an own signed-in membership. Subscriptions to supported browser push providers are accepted; arbitrary URLs are rejected. No private VAPID key is returned. Push payloads include `id`, `eventId`, optional `taskId` and a same-origin `url`; the app opens the correct event/task after sign-in. Browser push delivery does not replace durable inbox/activity records.

Read acknowledgements accept `X-Rally-Expected-Actor` and only affect the current member’s notifications. Keep a read acknowledgement on the device until `{ok:true}` is received; retries after lost responses do not duplicate work.

## Staff accounts

`POST /auth/register` accepts `{name,username,password}`. Usernames are case-insensitive, unique and 3–30 ASCII characters, beginning with a letter. Signup returns `{user,delivery,recoveryCode}` and a session cookie. No email or OTP is required. `POST /auth/login` accepts `{username,password}`. Existing clients may continue sending `email`; existing email/password accounts retain their records and membership.

Save the recovery code privately. `POST /auth/recover-account` accepts `{username,recoveryCode,password}`, changes the password, rotates the code and revokes sessions atomically. It also accepts the legacy `email` field. `POST /auth/recovery-code` accepts `{password}` for the signed-in staff account and replaces its private code. Neither endpoint changes event records. Optional legacy email verification/reset endpoints remain documented for existing integrations.

## Staff invitations

Only a signed-in organiser can manage staff invitations. Integration keys and other roles cannot list, replace or cancel them.

| Endpoint | Purpose |
| --- | --- |
| `POST /events/{id}/invitations` | Create `{name,role}`; return the single-use token once, valid for 48 hours |
| `GET /events/{id}/invitations?offset=0&limit=50` | Read `{items,pendingCount,nextOffset}`; pending first, with accepted/expired/cancelled history |
| `POST /events/{id}/invitations/{invitationId}/renew` | Replace a pending/expired link; invalidate the old token and return a fresh one once |
| `DELETE /events/{id}/invitations/{invitationId}` | Cancel an unused invitation; repeated cancellation is idempotent |

Names are compared within the event after Unicode normalisation, case folding and whitespace collapse. A name already pending returns `409 ALREADY_INVITED`; a joined name returns `409 ALREADY_MEMBER`. Names are labels rather than verified identity; use distinguishable names for different people. Concurrent invitations for the same normalised name cannot create duplicate pending records. Accepted or cancelled records cannot be renewed. Listing never returns raw tokens, hashes or the accepting account ID. Replacement and cancellation preserve the activity log. Creation and replacement must not be retried automatically after an unknown outcome; inspect the pending list first.

The organiser can copy/share a new invitation while its dialog is open and reopen it in the same app session. After a reload, **Your team → Pending invitations → Replace link** issues a new shareable link. Recipients land in the invited event after authentication, including when they already have a newer event of their own.

## Account-free attendees

| Endpoint | Access and purpose |
| --- | --- |
| `GET /events/{id}/attendee-links` | Organiser: link metadata; never raw tokens |
| `POST /events/{id}/attendee-links` | Signed-in organiser: returns `{id,token}` once; no automatic retry |
| `DELETE /events/{id}/attendee-links/{linkId}` | Signed-in organiser: disable public entry; idempotent and audited |
| `GET /attendee-events/{id}` | `X-VenueRelay-Event-Key: TOKEN`: event name, venue, date and ID only |
| `POST /attendee-events/{id}/requests` | Same event key plus `Idempotency-Key`: create one attendee request |
| `GET /attendee-requests` | `Authorization: Bearer vr_guest_RECEIPT_KEY`: read exactly one request and its status history |

Share `/attend/EVENT_ID#key=TOKEN`. An attendee device generates a random 32-byte base64url `receiptKey` and a separate stable request key, and persists both with the form **before** sending `{title,location,priority,description,name,receiptKey}`. Name and details are optional. Reuse the same keys and body after an outage, lost acknowledgement or reload. A mismatch returns 409; a confirmed replay returns the original request. The browser retains an unconfirmed intent and retries on reconnect/reopen. No attendee account, password or staff session is created.

The private URL is `/request#key=RECEIPT_KEY`. Tokens stay in URL fragments instead of server request paths/query strings. Tokens are stored hashed server-side. Anyone holding a private link can read that request; it has no staff permissions and cannot list other requests. The visible tracking page refreshes every 15 seconds. The public event capability cannot assign owners, update statuses, or read staff data. Names are self-reported.

Each submission atomically creates its lightweight reporter, task, command, activity entry, notifications and receipt. A failed receipt write rolls everything back. Disabling a public QR/link rejects new access with 410 but preserves existing private tracking and confirmed replays. There may be at most ten active links per event.

Public request attempts are bounded to 120/minute per event and 60/minute per server peer; public reads share a 1200/minute peer budget. Respect `Retry-After` and retain the original intent. A shared connection may reach a limit at a busy event. These bounds protect entry points; they are not a load-capacity guarantee.

Render serves the website and HTTP API from the same origin so cookies stay first-party. Request a fresh ticket for each direct Render WebSocket connection. Keep established `X-Rally-*` headers, cookies and device-storage identifiers for backward compatibility after the VenueRelay rename. The production adapter shares task rules with the local SQLite adapter; production requires MongoDB transactions.
