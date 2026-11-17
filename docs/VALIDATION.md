# Validation

Checked on **17 November 2026**, using Node.js 24 and Chromium. Local checks cover the working source. The separate [live test report](LIVE_TEST_REPORT.md) records checks against the hosted application; local changes have not been deployed by this run.

## Latest follow-up: live testing, event filters and simpler mobile flows

| Check | Result |
| --- | --- |
| Live site with four new staff accounts | 21 functional check groups passed; 24 layout/accessibility checks; one notification obstruction found and fixed locally |
| `npm test` | 73 passed, including Pakistan-midnight classification, manual end/reopen precedence and event ordering |
| `npm run test:events` | 3 groups passed: account filters, empty views and switching, mobile task focus and deferred notifications; phone/landscape/desktop axe checks passed |
| `npm run test:mobile` | 52 checks passed |
| `npm run test:usability` | 12 checks passed |
| `npm run test:flow` | 5 journeys passed |
| `npm run test:accounts` | 2 journeys passed |
| `npm run test:tutorial` | 6 groups passed |
| `npm run test:pwa` | 8 checks passed |
| `npm run test:browser` | 15 checks passed, including duplicate retry and concurrent-edit conflict recovery |
| `npm run build` | TypeScript and production build passed; Vite still reports its non-fatal main-chunk size advisory |
| Formatting and `git diff --check` | Passed for the changed application files and new tests |

The live test event was ended and its shared role links disabled after testing. Test accounts, screenshots and results are retained for inspection; private credentials are only in an ignored local file. New event filters only use events already connected to the account. Passing a date does not automatically archive records.

The mobile task form now hides extra header actions, bottom navigation, the footer and the duplicate step indicator. More groups secondary actions under Event tools and Help & settings. Tests inject a real incoming attendee request while the task form is open, verify that the banner does not cover it, then verify that the deferred notification remains available after leaving. The open More menu is also protected from overlapping banners. Screenshot inspection caught and corrected a duplicate event-button label before the final event-filter check.

Physical iPhone/Android installation, native iOS input rendering and background push delivery remain outside this validation. Automated sound checks verify Web Audio scheduling, not a physical speaker.

## Judge-facing repository review

The final source was copied into a fresh directory with no `.env`, dependencies, build output or database. Plain `npm install` completed, `npm test` passed all 73 tests, `npm run build` passed and plain `npm run dev` served the built app at port 3001 and the editor at port 5173. The sample event opened through Explore the demo. No database service or API keys were configured. This validates the install/start portion of the documented clone workflow against the reviewed source.

README and submission documentation now explain role links, attendee help versus registration, task versus session, event date filters and the simpler mobile menu paths. Six screenshots were captured from the current local build. Relative documentation links and tracked-file credential/artifact checks were reviewed before committing; the credential-like URI in a deployment test is an intentional `example.com` fixture.

## Earlier follow-up: joining, date fields and event history

| Check | Result |
| --- | --- |
| `npm test` | 70 passed |
| `npm run test:mongo` | 19 passed against a disposable replica set, including concurrent shared-link joins, organiser notifications and ended-event write protection |
| `npm run test:team` | Signup through a reusable role link, same-link sharing after reload, organiser alert/chime, date-field bounds, end/archive/reopen passed in Chromium |
| `npm run test:mobile` | 52 existing phone/landscape/desktop checks passed, with no overflow or axe findings |
| `npm run test:usability` | 12 checks passed, including navigation targets, menu bounds and first-task visibility |
| `npm run build` | TypeScript and production build passed |

The additional API tests verify no duplicate membership or notification on retry, fixed server-side roles, private token listings, token rotation/revocation, creator-only end/reopen, preserved records, blocked new requests and retained attendee tracking. A committed request can still be recovered after the event ends.

Date-input checks include 320px and 390px phones, a 390×420 short viewport and 844×390 landscape. The CSS explicitly removes the native iOS date-control sizing. Chromium checks and screenshots passed; WebKit could not launch here because the host lacks its required system libraries. A physical iPhone check is still required.

## Earlier baseline checks (17 November)


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
- Load testing, backup restoration and long-running production checks were not run. Local operation uses SQLite; the follow-up also tested the MongoDB adapter against a disposable replica set.
- No deployment, hackathon submission or video recording was performed. Check the final hosted release and the hackathon’s requirements before submitting. Earlier validation and deployment notes remain available in Git history.
