# Validation — 15 November 2026

Observed checks for the website/PWA upgrade and final responsive design. This is test evidence, not a guarantee against every possible failure.

## Automated tests

`npm test` passed **43 tests**, using isolated databases and HTTP/WebSocket fixtures. Browser scenarios used a disposable local database on port 3002, keeping test traffic separate from the user's preview records and authentication rate limits.

Coverage includes permissions, the full role journey, version conflicts, transaction rollback, immutable history, restart persistence, parallel duplicate requests, verified accounts, invitation proofs, email retries, rate limits, bearer revocation, IndexedDB migration, concurrent-tab queue guards, lost-response replay, stale worker leases, demo credentials, authenticated WebSockets and injected push-provider failures. A new regression verifies that missing frontend build files return a non-cached 503 retry response, leave the API alive, and recover when files reappear. No real external push was sent.

## Browser journey

The existing journey passed **15 checks** against the built app: attendee request → organiser assignment → volunteer completion → organiser confirmation, inbox/read acknowledgement, keyboard focus, actual offline reload/reconnect, response lost after commit and explicit conflict review.

The live integrity check reported **29 commands, 29 activity entries, zero version mismatches, zero missing audit entries and zero foreign-key violations** at `2026-11-15T11:54:12.811Z`, after the light-theme/onboarding changes.

The PWA browser check passed **8 checks**: documented demo sign-in without email verification, real service-worker/IndexedDB readiness, install/push fallbacks, QR foreign-link rejection and image decoding with simulated denied camera permission, authorised task navigation, offline deep-route reopening, paused-state recovery across reload, and Swagger/OpenAPI availability. It found no uncaught JavaScript errors.

A separate real-account browser walkthrough used two verified test accounts in the disposable database. It created an empty non-demo event through the one-page form, confirmed zero tasks/schedule and only the organiser, invited a vendor by link, joined the second account with the selected role, manually created/assigned a task, then completed and confirmed it. **4 checks passed; 6 commands matched 6 activity entries, with zero integrity mismatches** at `2026-11-15T11:50:24.295Z`. Account verification was prepared as a fixture for this walkthrough; the automated account tests cover registration and verification separately. No sample records were seeded for these users.

## Responsive/accessibility review

The matrix passed **90 views**: 18 pages/states at **320, 375, 768, 1024 and 1440px**. There was zero horizontal overflow and zero findings for the selected axe WCAG rules. The white theme and dark text were asserted. Antonio/Manrope loaded locally with external font access blocked; reduced-motion handling passed. The new install dialog also passed an automated accessibility scan.

The focused layout check passed **21 checks**: welcome and sign-in at ten viewport sizes from **320×568 to 1600×900**, plus direct sign-in input persistence during a delayed initial session check. Sign-in submission remains within each viewport; demo fill populates both fields without sending a login request. Account inputs are not automatically focused. Main actions fit inside each tested viewport and the welcome heading stays on two lines. Phone install/scanning controls remain visible. The sign-in form also passed an automated accessibility scan. Rendered home, task flow, team and account pages were inspected on mobile and desktop.

The mobile usability scenario passed **12 checks**: visible sample-role switching with keyboard focus, actionable Home filters, recovering from an empty search, and navigation/menu/roster layout at **320×568, 375×667, 390×844, 600×960, 768×1024, 1024×768, 1440×900 and 844×390**. Primary navigation targets met the project's 44px size threshold; fixed phone navigation stayed within the viewport and menus scrolled inside its bounds. The first task title stayed above phone navigation at 375px and 390px, and the mobile demo guide expanded/collapsed on request. Final Home scans also found no selected axe violations at 1600×680 and 375×667, including the expanded guide. A focused task field stayed above the navigation in a shortened 390×480 viewport. This simulates restricted height; it does not replace testing a physical phone keyboard or user research.

`npm run build`, strict unused-symbol TypeScript checking, formatting and `git diff --check` passed. No uncaught JavaScript errors were observed in the browser scenarios. The local Playwright package had no downloaded browser; these scenarios ran through the available browser connection against the built app. To reproduce locally, install Chromium as described in README. Commands: `npm run test:browser`, `npm run test:pwa`, `npm run test:design`, `npm run test:layout` and `npm run test:usability`; output goes to ignored `test-results/`, not the submitted source.

The earlier clean-install check on 12 November used a source copy without dependencies, environment file or database: `npm ci` and the production build passed, with all 22 production files matching the working build byte for byte. Swagger rendered all 27 operations without JavaScript errors in that check; the current PWA scenario also confirmed Swagger/OpenAPI availability.

## Remaining boundaries

Physical iPhone/Android camera behaviour, VoiceOver/TalkBack, external push delivery and browser scheduling after every window closes have not been tested. Camera denial and image upload were tested; push leases/retries used an injected provider. Browser push requires configured VAPID keys and permission. Real phone service-worker/camera/push access requires trusted HTTPS. Background Sync is browser-dependent; foreground/reopen retries remain the fallback. A device must load an event before offline access, and clearing device storage can lose unconfirmed work. Keep backups of confirmed SQLite records.

No native app, APK or iOS build is part of this repository. No deployment was performed.
