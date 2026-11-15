# VenueRelay

A shared event workspace for organisers, volunteers, vendors and attendees. Built for hackathon challenge **HS-0130**.

Attendees request help. Organisers assign an owner. Volunteers and vendors report progress or blockers. The organiser checks the result before closing the task. Every confirmed change produces an activity entry and the relevant inbox updates.

## Run locally

Requires Node.js 24.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3001**. The app creates a local SQLite database automatically. No email provider, API key or separate database installation is needed. Port 5173 provides frontend hot reload; port 3001 serves the built, offline-capable app.

Choose **Explore the demo** for immediate access, or create an account and an empty event. The optional demo credentials are `demo@rally.local` / `RallyDemo2026!`.

## Staff accounts and attendee access

Organisers, volunteers and vendors use **username + password** accounts. Signup needs a name, a unique username and a password, with no email or OTP. Save the private recovery code. Existing email/password accounts continue to work through the same sign-in field.

Staff join an event through a personal, single-use invitation with an organiser-selected role. Attendees do not need accounts:

1. Open **Your team → Share attendee QR**, then create an attendee link.
2. Share or print the QR/link for the event.
3. Attendees open it, describe what they need and where, then submit.
4. Each request gets a private tracking link. Staff assign, complete and check the work in the normal task flow.

The shared attendee link can accept many requests. A private tracking link reveals only its own request. Keep tracking links private. The organiser can disable a shared QR/link without deleting requests or breaking existing tracking links.

Use **Forgot your password?** with the saved recovery code to recover a staff account. **More → Account security** can replace a lost recovery code while signed in. `EMAIL_TRANSPORT=disabled` remains the default; no email provider or paid login service is required.

## Reliability and access

- Server-enforced event membership, roles, task ownership and state transitions.
- MongoDB transactions in production; SQLite transactions for local development.
- An append-only command and activity journal with stable retry keys and version conflict checks.
- Device snapshots and a persistent outbox for interrupted connections; conflicts require review.
- Live WebSocket updates, reconnect refresh and polling fallback.
- Durable in-app notifications, with optional browser push using VAPID keys.
- Phone layouts, keyboard access, labelled forms, QR invitations and locally bundled fonts.

The **Install** button appears when the browser provides its native install prompt and opens that prompt directly. Installation is optional. Browsers without that API can use the website immediately.

## Render deployment

The frontend and backend run in **one Render web service**. Render serves the Vite build, API, service worker and WebSocket endpoint from the same origin. See [deployment settings](docs/DEPLOYMENT.md). Existing production records remain in MongoDB Atlas.

## Validation

```sh
npm test
npm run build
npm run test:mongo
```

Browser checks require Playwright Chromium and a running built app:

```sh
npx playwright install chromium
npm run test:browser
npm run test:design
npm run test:layout
npm run test:usability
npm run test:pwa
npm run test:install
npm run test:accounts
npm run test:attendees
```

See [validation results](docs/VALIDATION.md) and the [judge walkthrough](docs/DEMO.md).

## API

Interactive documentation: `/api/docs`. OpenAPI 3.1: `/api/openapi.json`.

[API and retry protocol](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Installation and offline use](docs/PWA.md) · [Submission](docs/SUBMISSION.md) · [Interface](docs/DESIGN.md)

`backend/` handles records and permissions, `frontend/` contains the React app and offline client, `shared/` defines contracts, and `tests/` covers behaviour. Keep environment variables, local databases, dependencies and generated browser output out of Git.
