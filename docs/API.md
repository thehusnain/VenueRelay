# API guide

The machine-readable OpenAPI 3.1 contract is at [`openapi.json`](openapi.json) and `GET /api/openapi.json`. Run `npm run api:docs` after a contract change. The source generator lives in `scripts/generate-openapi.mjs`.

## Authentication

Browser clients use an HttpOnly `rally_session` cookie. Sessions last seven days and are revoked on logout. Passwords use salted scrypt hashes. Sign-in endpoints are rate-limited. Real event membership is checked independently of identity.

Integrations use `Authorization: Bearer rly_...`. Create/revoke event-specific tokens in More → Connect another app as a verified organiser. Sample-only accounts cannot issue integration keys. Raw tokens are returned only once and stored hashed. An integration cannot bootstrap an account, create invitations, issue more tokens or revoke tokens.

Native clients use `X-Rally-Client: native` at sign-in and receive a `sessionToken` in addition to the normal cookie. Send this as a bearer token for subsequent requests. It represents the actual account, respects its membership and is revoked by logout. Native tokens are kept in Capacitor Preferences. Allow the actual Capacitor origin using `ALLOWED_ORIGINS`.

All JSON writes require `Content-Type: application/json`. Same-origin requests are accepted; explicitly configured additional origins are accepted. No wildcard origin is used. Keep integration credentials on a trusted server.

## Accounts and email

`POST /api/v1/auth/register` takes `{name,email,password}`. Passwords require 10–200 characters; significant spaces are preserved. Email is checked with validator syntax rules and DNS MX records, with address-record fallback for domains without MX. An explicit null MX is rejected. Temporary DNS failures return `503 EMAIL_LOOKUP_UNAVAILABLE`; checking a domain does not prove a particular inbox exists.

Registration atomically stores an unverified account, a hashed verification proof and an email-outbox job. The session can read its own account and request another confirmation, but real events, invitations and integration access require verification. `POST /api/v1/bootstrap` returns `{requiresSetup:true,user}` for a verified real account without events. Only explicitly chosen anonymous sample sessions seed example records.

| Endpoint | Request | Behaviour |
|---|---|---|
| `POST /auth/verify-email` | `{token}` | Explicitly consumes a 30-minute verification proof; GET links never consume it |
| `POST /auth/resend-verification` | `{}` with session | Replaces the earlier proof; 60-second cooldown |
| `POST /auth/forgot-password` | `{email}` | Same public response for known and unknown accounts |
| `POST /auth/reset-password` | `{token,password}` | One-hour proof; atomically changes password, consumes proof and revokes all sessions |

All paths in the table have the `/api/v1` prefix. Proofs are random, stored hashed, single use and purpose-bound. Invalid/expired/used proofs return 410. Account creation, sign-in and recovery are persistently rate-limited. Neither proof URLs nor raw stored session tokens appear in normal account responses. `user.emailVerified` reports verification state; native sign-in alone returns its bearer session once.

For the localhost demo, default `EMAIL_TRANSPORT=preview` writes private `.eml` files under `data/mail-preview`. Run `npm run email:preview -- EMAIL` to read the latest. Responses and UI label this as a preview: no external message is sent. Real inbox ownership still needs external delivery. Do not expose this directory or copy its proof links into public evidence.

When a mail provider is connected later, set `.env` using `.env.example`: `EMAIL_TRANSPORT=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and optional `SMTP_USER`/`SMTP_PASSWORD`. Use port 465 with `SMTP_SECURE=true`, or port 587 with STARTTLS and `SMTP_SECURE=false`, according to the provider. `APP_ORIGIN` sets the public origin of confirmation/recovery links; for this demo it is `http://127.0.0.1:3001`. Setting `NODE_ENV=production` defaults email to disabled unless explicitly configured. Do not put credentials in frontend environment variables.

The durable worker leases jobs, recovers interrupted leases, retries transient errors with backoff, retains a stable Message-ID, and stops after eight attempts. Expired or consumed proof jobs are cancelled. SMTP is at-least-once delivery: an uncertain provider response can cause a duplicate email. Account proof consumption and operational command effects remain protected independently.

## Read current state

```http
GET /api/v1/events/EVENT_ID/snapshot
Authorization: Bearer YOUR_INTEGRATION_TOKEN
```

The snapshot returns event, current membership, permitted tasks and team names, recent activity, current inbox, schedule and announcements. Tasks are filtered before returning them. The UI polls every three seconds while visible.

Use `GET /api/v1/events/EVENT_ID/activity?after=0&limit=50` for cursor pagination. Continue from `nextCursor` until it is null. Role filters apply before pagination. The organiser export endpoint includes the complete task/activity record.

## Write an intent safely

```http
POST /api/v1/events/EVENT_ID/commands
Authorization: Bearer YOUR_INTEGRATION_TOKEN
Content-Type: application/json
Idempotency-Key: 86e6dcb7-0017-4f56-9d8d-81361d1f58c4

{
  "action": "task.create",
  "payload": {
    "title": "Clear the accessible entrance",
    "location": "North entrance",
    "priority": "urgent",
    "description": "Move the crate and verify the whole step-free route."
  }
}
```

Generate the key once per human/system intent. Save and reuse it across retries, timeouts and reconnects. Do not generate a new key every time an HTTP request fails. Accepted keys are retained indefinitely. The response contains `entity`, `entityId`, `entityType` and `replayed`. A repeated intent returns its original entity, even if that entity has since changed; obtain a fresh snapshot for current state.

| Action                | Payload                                                                     | Permission                                                              |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `task.create`         | `title`, `location`, optional `description`, `priority`, `dueAt`, `ownerId` | Any member; assigning an owner requires organiser                       |
| `task.assign`         | `ownerId`, optional `dueAt`                                                 | Organiser                                                               |
| `task.status`         | `status`, `resolution` for blocked/resolved                                 | Organiser or assigned volunteer/vendor; only organiser verifies closure |
| `schedule.create`     | `title`, `location`, `startsAt`, `endsAt`                                   | Organiser                                                               |
| `announcement.create` | `message`                                                                   | Organiser                                                               |

Task assignment/status commands also require `taskId` and the positive `expectedVersion` outside the payload. Actor and reporter identities always come from the authenticated membership.

```json
{
  "action": "task.status",
  "taskId": "TASK_ID",
  "expectedVersion": 2,
  "payload": { "status": "in_progress" }
}
```

Allowed transitions:

```text
open --organiser assigns--> assigned
assigned --> in_progress
in_progress --> blocked --> in_progress
in_progress --> resolved --organiser verifies--> closed
resolved or closed --organiser reopens--> in_progress
```

Assignment moves any non-closed task back to assigned and clears an old resolution. Blocker/resolution notes require 5–2000 characters. All date-time inputs are ISO 8601 with a timezone; returned values are UTC. The interface displays Pakistan Standard Time for this event template.

## Errors and retries

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This task changed while you were working. Review the latest record before applying your action.",
    "details": { "current": { "id": "TASK_ID", "version": 3 } }
  }
}
```

- `401`: renew authentication; never silently change the actor of queued work.
- `403`: permission/origin failure; do not blindly retry.
- `404`: missing or inaccessible task/event.
- `409 VERSION_CONFLICT`: fetch/review current state. Only after an explicit decision create a new intent with the latest version.
- `409 IDEMPOTENCY_MISMATCH`: a key was reused with a different payload. Treat this as an integration bug.
- `410`: invalid, expired or consumed invitation/account proof.
- `422`: invalid fields or workflow transition. No command was committed.
- `429`: authentication rate limit; wait before retrying.
- Timeout/network failure/`5xx`: the client cannot infer the outcome. Retry operational commands with the **same** intent key.

Account/event/invitation/token creation endpoints do not accept an idempotency key and must not be automatically retried. Notification read acknowledgements, token revocation and accepting the same invitation as the original account are naturally idempotent.
