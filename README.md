# Rally

An event coordination website and installable PWA for HS-0130. Attendees request help, organisers assign an owner, volunteers/vendors do the work, and organisers check completion. The same website works on phones, tablets and desktops. There is no separate native application.

## Run locally

Use Node.js 24 LTS:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3001**. SQLite is created automatically under `data/`; no database installation, Docker, email account or API key is required. Keep the terminal running. `Ctrl+C` stops the app. `npm run dev` is the command, not `npm dev`.

The built app on port 3001 supports offline testing. Port 5173 is the live frontend editor. After source changes, rebuild/restart to update port 3001.

## Judge demo login

- Email: **demo@rally.local**
- Password: **RallyDemo2026!**

Choose **Sign in**. This verified demo account is created automatically on a fresh local startup and opens a sample event. Use **More → Try a different role** to inspect organiser, volunteer, vendor and attendee workflows. These credentials are public demo data, not for real events. The account is seeded only outside production; `DEMO_ACCOUNT_ENABLED=false` prevents seeding.

The welcome screen also offers an isolated **Try a sample event** option. Real registrations remain separate and start without sample records. Email verification/recovery uses private local previews until SMTP is configured:

```sh
npm run email:preview -- YOUR_EMAIL
```

## Features

- Server-enforced roles, task ownership, progress, blockers and checked completion.
- Transactional SQLite records, immutable activity journal, persistent inbox and integrity checks.
- IndexedDB snapshots and per-person outbox, concurrent-tab leases, persistent retries and explicit conflict review.
- Service-worker precaching, install controls and optional Background Sync, with foreground/reopen retries when the browser lacks it.
- Authenticated WebSockets for live invalidations; role-filtered snapshots and periodic refresh recover missed updates.
- Optional browser push with permission controls, durable delivery jobs and provider retry handling.
- Mobile QR camera scanning, image upload and pasted-link fallback; invitation QR codes.
- Keyboard support, responsive layout and locally bundled Antonio/Manrope fonts.

Open **More → Install Rally & notifications** for installation and push controls, or **More → Connection help** to inspect pending work and record integrity. Never clear device storage while unsent work is waiting.

## Checks and API

```sh
npm test
npm run build
npm run api:docs
```

If test subprocesses cannot open ports, start Rally first and run `RALLY_TEST_URL=http://127.0.0.1:3001 npm test`.

With the built app running, install the Playwright browser once, then run:

```sh
npx playwright install chromium
npm run test:browser
npm run test:pwa
npm run test:design
npm run test:layout
```

Interactive Swagger: **http://127.0.0.1:3001/api/docs**. OpenAPI: `/api/openapi.json`.

- [PWA setup, phone access and browser limits](docs/PWA.md)
- [API contract and retry protocol](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Judge submission notes and credentials](docs/SUBMISSION.md)
- [Validation](docs/VALIDATION.md)

`backend/` owns records and permissions; `frontend/` contains React, service worker and IndexedDB code; `shared/` holds contracts; `tests/` covers behaviour. Keep `.env`, `data/`, dependencies and generated browser output out of Git. This repository has no APK, iOS project or native build workflow.
