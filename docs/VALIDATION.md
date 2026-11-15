# Validation — 15 November 2026

Observed checks for the website/PWA upgrade, responsive design and hosted MongoDB preparation. This is test evidence, not a guarantee against every possible failure.

## Automated tests

`npm test` passed **43 tests**, using isolated databases and HTTP/WebSocket fixtures. Browser scenarios used a disposable local database on port 3002, keeping test traffic separate from the user's preview records and authentication rate limits.

Coverage includes permissions, the full role journey, version conflicts, transaction rollback, immutable history, restart persistence, parallel duplicate requests, verified accounts, invitation proofs, email retries, rate limits, bearer revocation, IndexedDB migration, concurrent-tab queue guards, lost-response replay, stale worker leases, demo credentials, authenticated WebSockets and injected push-provider failures. A new regression verifies that missing frontend build files return a non-cached 503 retry response, leave the API alive, and recover when files reappear. No real external push was sent.

## Browser journey

The existing journey passed **15 checks** against the built app: attendee request → organiser assignment → volunteer completion → organiser confirmation, inbox/read acknowledgement, keyboard focus, actual offline reload/reconnect, response lost after commit and explicit conflict review.

The latest hosted-layout browser proof used a separate website/API proxy with a real disposable MongoDB replica set and direct ticket-authenticated WebSockets. It reported **29 commands, 29 activity entries, zero version mismatches, zero missing audit entries and zero invalid task/member references** at `2026-11-15T12:49:12.672Z`. All 15 journey checks passed, including actual browser offline reload/reconnect, a dropped response after commit and explicit conflict review. This was local production-shaped testing, not a test of provisioned Atlas/Render/Vercel services.

The PWA browser check passed **8 checks**: documented demo sign-in without email verification, real service-worker/IndexedDB readiness, install/push fallbacks, QR foreign-link rejection and image decoding with simulated denied camera permission, authorised task navigation, offline deep-route reopening, paused-state recovery across reload, and Swagger/OpenAPI availability. It found no uncaught JavaScript errors.

A separate real-account browser walkthrough used two verified test accounts in the disposable database. It created an empty non-demo event through the one-page form, confirmed zero tasks/schedule and only the organiser, invited a vendor by link, joined the second account with the selected role, manually created/assigned a task, then completed and confirmed it. **4 checks passed; 6 commands matched 6 activity entries, with zero integrity mismatches** at `2026-11-15T11:50:24.295Z`. Account verification was prepared as a fixture for this walkthrough; the automated account tests cover registration and verification separately. No sample records were seeded for these users.

## Responsive/accessibility review

The matrix passed **90 views**: 18 pages/states at **320, 375, 768, 1024 and 1440px**. There was zero horizontal overflow and zero findings for the selected axe WCAG rules. The white theme and dark text were asserted. Antonio/Manrope loaded locally with external font access blocked; reduced-motion handling passed. The new install dialog also passed an automated accessibility scan.

The focused layout check passed **21 checks**: welcome and sign-in at ten viewport sizes from **320×568 to 1600×900**, plus direct sign-in input persistence during a delayed initial session check. Sign-in submission remains within each viewport; demo fill populates both fields without sending a login request. Account inputs are not automatically focused. Main actions fit inside each tested viewport. After the rename, all 21 focused checks passed again at `2026-11-15T12:50:13.804Z`; the welcome heading now displays the three short tagline lines without additional wrapping. Phone install/scanning controls remain visible. The sign-in form also passed an automated accessibility scan. Rendered home, task flow, team and account pages were inspected on mobile and desktop.

The mobile usability scenario passed **12 checks**: visible sample-role switching with keyboard focus, actionable Home filters, recovering from an empty search, and navigation/menu/roster layout at **320×568, 375×667, 390×844, 600×960, 768×1024, 1024×768, 1440×900 and 844×390**. Primary navigation targets met the project's 44px size threshold; fixed phone navigation stayed within the viewport and menus scrolled inside its bounds. The first task title stayed above phone navigation at 375px and 390px, and the mobile demo guide expanded/collapsed on request. Final Home scans also found no selected axe violations at 1600×680 and 375×667, including the expanded guide. A focused task field stayed above the navigation in a shortened 390×480 viewport. This simulates restricted height; it does not replace testing a physical phone keyboard or user research.

`npm run build`, strict unused-symbol TypeScript checking, formatting and `git diff --check` passed. No uncaught JavaScript errors were observed in the browser scenarios. The local Playwright package had no downloaded browser; these scenarios ran through the available browser connection against the built app. To reproduce locally, install Chromium as described in README. Commands: `npm run test:browser`, `npm run test:pwa`, `npm run test:design`, `npm run test:layout` and `npm run test:usability`; output goes to ignored `test-results/`, not the submitted source.

The earlier clean-install check on 12 November used a source copy without dependencies, environment file or database: `npm ci` and the production build passed, with all 22 production files matching the working build byte for byte. Swagger rendered all 27 operations without JavaScript errors in that check; the current PWA scenario also confirmed Swagger/OpenAPI availability.

## Remaining boundaries

Physical iPhone/Android camera behaviour, VoiceOver/TalkBack, external push delivery and browser scheduling after every window closes have not been tested. Camera denial and image upload were tested; push leases/retries used an injected provider. Browser push requires configured VAPID keys and permission. Real phone service-worker/camera/push access requires trusted HTTPS. Background Sync is browser-dependent; foreground/reopen retries remain the fallback. A device must load an event before offline access, and clearing device storage can lose unconfirmed work. Back up local SQLite records and configure/test Atlas backup and restoration options for hosted records.

No native app, APK or iOS build is part of this repository. No deployment was performed.


## Deployment preparation and rename

The visible product, PWA manifest, notification copy, API title and submission notes are now **venuerelay. — Every Team. Every Update. One Place.** Existing cookies, device stores, API headers and public demo credentials remain compatible.

- `npm test`: **48 passed**, including fail-closed production configuration, database-unavailable health checks, Retry-After responses and Vercel route/cache configuration.
- `npm run test:mongo`: **12 passed** against MongoDB 8.2.6 in a disposable replica set. It covers real empty-event registration/invitations, role/privacy boundaries, transaction rollback, eight simultaneous duplicate requests, lost acknowledgements, two writers competing for one version, integration revocation, one-use/expired/origin-bound socket tickets, session revocation, leased email/push recovery and read-only-source SQLite migration.
- The MongoDB-backed proxy PWA scenario passed **8 checks** at `2026-11-15T12:51:37.250Z`, including camera-denied/image/paste fallbacks and offline deep routes. No uncaught JavaScript errors.
- After updating Vite within version 8, the mobile smoke check confirmed visible venuerelay. branding, ticket-authenticated WebSocket connection, no overflow at 390px and no uncaught errors. `npm audit` reported **0 vulnerabilities**.
- Vercel Build Output generation passed with a non-secret example HTTPS backend origin. The actual Render origin must be supplied at deployment. Build, strict unused-symbol typecheck and formatting checks passed.

To reproduce the hosted browser journey locally, build with `VITE_WS_URL=http://127.0.0.1:3002 npm run build`, run `node --import tsx tests/hosted-fixture.ts` (disposable MongoDB; first run downloads its binary), then run `RALLY_TEST_URL=http://127.0.0.1:3003 RALLY_TEST_MONGO=true npm run test:browser` from another terminal. Stop the fixture and run a normal `npm run build` afterwards. The fixture uses no real Atlas credentials. Live cloud/physical-phone tests and external SMTP/push delivery remain outstanding and are listed in DEPLOYMENT.md.
