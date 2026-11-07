# Rally

An event companion for HS-0130: attendees ask for help, organisers choose someone to handle it, volunteers and vendors do their work, and organisers check the result. Everyone can follow what happened without searching spreadsheets or chat groups.

## Start the demo

Install **Node.js 24 LTS**. From this folder:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3001** and choose **Try a sample event**. No signup, email service, database installation, Docker or API key is needed. Use **More → Try a different role** to try the organiser, volunteer, vendor and attendee experiences. `Ctrl+C` stops the app.

`npm run dev` is the command; `npm dev` is not a valid npm command. Run `npm run` to list available commands.

The launcher builds the web app, starts the Node backend and starts the frontend editor at http://127.0.0.1:5173. Port 3001 serves the built app and supports the offline demonstration. After changing frontend code, use 5173 for live editing; restart `npm run dev` to refresh the built app on 3001.

**No separate database setup:** Node creates `data/rally.sqlite` automatically. Keeping this small local database means completed tasks, notifications and history survive restarts. The sample event uses the same storage and permission checks as real events. Real accounts start with an empty event, without sample records.

## Try a real account

Choose **Start your event**, register, confirm the email, then follow the three steps to name and locate your event. Invite people from **Your team**; invitations give each person their own account and permissions.

External email delivery is intentionally not connected yet. In the default local preview mode, verification and recovery messages are saved privately on this computer; nothing is sent to an external inbox. After registering, run:

```sh
npm run email:preview -- your-address@example.com
```

Open the displayed confirmation link, confirm ownership, and continue. Use an actual email address on a domain that accepts mail: validation checks syntax and DNS records. The link proves access to the local preview during a demo; real inbox ownership can only be demonstrated once SMTP delivery is connected. Preview files contain private links; do not commit or share them.

To customise settings, copy `.env.example` to `.env`. Defaults work without this step. SMTP configuration is described in [API and accounts](docs/API.md).

## Install the app

The built localhost web app can be installed from a supporting desktop browser's install menu. This PWA uses the same event records and works with previously loaded information during a connection loss.

Android and iOS Capacitor projects are in `mobile/`. The Android debug APK and local USB connection instructions are described in [MOBILE.md](docs/MOBILE.md). The Node backend stays on the computer; Capacitor packages the React frontend. No hosting or deployment is required.

## What it does

- Server-enforced organiser, volunteer, vendor and attendee permissions.
- Owned tasks with progress, blockers, resolution and checked completion.
- Shared event plan and team updates; persistent personal notifications.
- Email confirmation, password recovery and revocable sessions.
- Transactional writes, retry deduplication and explicit conflict review.
- Offline device queue and reconnect recovery without silently overwriting other people's changes.
- Append-only activity with before/after records, organiser export and live integrity checks.
- A readable, responsive interface with keyboard support and guided forms.
- Documented API and revocable event integration keys.

Updates refresh every three seconds while the app is visible. Notifications appear inside Rally. SMS, OS push and background sync while the app is closed are not implemented. See [validation](docs/VALIDATION.md) for tested failures and practical limits.

## Project structure

```text
backend/migrations/   Versioned SQL schema and journal protections
backend/src/          Node API, accounts, email outbox, permissions and transactions
frontend/public/      PWA shell, manifest and icons
frontend/src/         React pages, guided task flows, inbox and device outbox
shared/               TypeScript contracts shared by frontend and backend
mobile/android/       Native Android project
mobile/ios/           Native iOS project
scripts/              Local launcher, email preview, Android build and API generator
tests/                Account, domain, HTTP and browser failure tests
docs/                 Run guide, API, design rationale and evidence
artifacts/            Generated Android APK, when built
```

## Check the project

```sh
npm test
npm run build
npm run api:docs
```

If a restricted environment prevents the tests opening a listener, keep the app running and use `RALLY_TEST_URL=http://127.0.0.1:3001 npm test`. HTTP tests create isolated users and events. They require local preview mode and never deliver external mail.

For the browser scenario, run the built app on port 3001, then in another terminal:

```sh
npx playwright install chromium
npm run test:browser
```

Run `npm run build` then `npm start` to serve only the built web app and API. Both start commands preserve the database.

- [Judge run guide and submission text](docs/SUBMISSION.md)
- [Demo walkthrough](docs/DEMO.md)
- [API guide](docs/API.md) and [OpenAPI contract](docs/openapi.json)
- [Architecture and correctness](docs/ARCHITECTURE.md)
- [UI/UX and HCI review](docs/UX-REVIEW.md)
- [Observed validation](docs/VALIDATION.md)

This version is for localhost. No public deployment or app-store publication is required or claimed.
