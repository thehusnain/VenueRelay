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

## Accounts without email

`EMAIL_TRANSPORT=disabled` is the default. Sign up with a name, email address and password, save the private recovery code, then create or join an event. The email is a sign-in identifier; the app does not claim that ownership was verified. Invitations are secret, single-use links shared by the organiser.

Use **Forgot your password?** with the saved recovery code to reset access. Resetting rotates the code and signs out existing sessions. Save the replacement code. Optional email verification and email reset APIs remain available when an email transport is configured.

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
```

See [validation results](docs/VALIDATION.md) and the [judge walkthrough](docs/DEMO.md).

## API

Interactive documentation: `/api/docs`. OpenAPI 3.1: `/api/openapi.json`.

[API and retry protocol](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Installation and offline use](docs/PWA.md) · [Submission](docs/SUBMISSION.md) · [Interface](docs/DESIGN.md)

`backend/` handles records and permissions, `frontend/` contains the React app and offline client, `shared/` defines contracts, and `tests/` covers behaviour. Keep environment variables, local databases, dependencies and generated browser output out of Git.
