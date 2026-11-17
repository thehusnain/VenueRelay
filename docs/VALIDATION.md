# Validation

Checked locally on **17 November 2026**, using Node.js 24 and Chromium. These results cover the working source in this revision. They do not establish that the hosted demo has been updated.

## Current checks

| Check | Result |
| --- | --- |
| `npm install` in a clean source folder | Passed without `.env`, pre-existing dependencies or external database setup; dependencies were installed and the app built |
| `npm run dev` | Ready message, automatically created SQLite database, app and live-editor responses, API proxy and demo sign-in verified; alternate ports used to avoid the existing development session |
| `npm test` | 68 passed, including missing dependencies, occupied ports and invalid port settings |
| `npm run build` | TypeScript and production build passed |
| `npm run test:design` | 90 page/viewport combinations, no horizontal overflow or automated axe WCAG A/AA findings |
| `npm run test:usability` | 12 checks passed, including first-task visibility, 44px navigation targets, menus, search recovery and shortened viewports |
| `npm run test:tutorial` | Six steps, Next/Back/Skip, resume/replay, focus return, account-scoped dismissal and blocked-storage fallback passed; all six steps passed axe checks |
| `npm run test:install` | Android/iPhone browser identities, manual instructions, device override, native prompt cancellation/failure, safe retry and installed state passed |
| `npm run test:pwa` | Eight checks passed, including real service-worker caching, local fonts, IndexedDB, offline deep routes, QR fallback and paused-state recovery |
| `npm run test:flow` | Five journeys passed, including delayed acknowledgements, visible pending work, task completion, alerts and sign-in notification links |

The design matrix covers welcome, sign-in, signup, account recovery, legacy confirmation/reset links, home, tasks, programme, team, history, integrations, connection help, task detail, task creation and updates at **320, 375, 768, 1024 and 1440px**. Usability checks also cover 390px, 600px and 844×390 landscape. Tutorial checks include 320px, 390px, landscape and desktop.

Tests use isolated accounts or demo fixtures. API tests exercise role and event boundaries, invitation rotation and expiry, private attendee receipts, account recovery, idempotent retries, version conflicts, database rollback, notification state and interrupted connections. Runtime and test-generated files remain ignored by Git.

## Reproduce

```sh
npm install
npm test
npm run build
npm run dev
```

In a second terminal, install the optional test browser once and run:

```sh
npx playwright install chromium
npm run test:tutorial
npm run test:install
npm run test:design
npm run test:usability
npm run test:pwa
npm run test:flow
```

Browser tests default to `http://127.0.0.1:3001`. Set `RALLY_TEST_URL` for another local URL. `CHROMIUM_PATH` can select an existing Chromium executable. Offline/PWA tests require the built app on the API port, rather than Vite’s live editor. Restart `npm run dev` after source changes before testing the built app.

## Limits

- Phone layouts and installation prompts were emulated. **Physical iPhone/Android installation, real camera capture and external push delivery were not tested.**
- Home Screen installation on phones requires a supported browser and trusted HTTPS. A local network HTTP address does not provide full PWA capabilities.
- Automated accessibility results are not certification or a substitute for screen-reader and user testing. Browser emulation does not guarantee every device.
- This pass did not rerun the optional MongoDB integration suite, load testing, backup restoration or long-running production checks. Local operation uses SQLite.
- No deployment, hackathon submission or video recording was performed. Check the final hosted release and the hackathon’s requirements before submitting. Earlier validation and deployment notes remain available in Git history.
