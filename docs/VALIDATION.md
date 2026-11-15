# Validation

Verified on 15 November 2026 against disposable local databases. These results describe the revised source; live deployment validation is recorded separately below.

## Mobile loading and staff invitations

The updated mobile journey passed **52 checks in Chromium and 52 in WebKit**, with touch input enabled, against disposable local databases. The MongoDB run matches the single-origin Render setup. It covers a centered loading group in portrait/landscape, fresh username signup and event setup, invitation creation, native and denied-clipboard fallback copying, pending status after reload, duplicate rejection, replacement of a lost link, invalidation of the original link, a separate staff account joining the correct event despite owning a newer event, cancellation and retained invitation history. The final Chromium and WebKit checks completed at `2026-11-15T17:39:42.751Z` and `2026-11-15T17:39:55.602Z` with zero uncaught JavaScript errors. Each rendered state passed overflow and axe checks. The navigation matrix uses the app's touch controls; direct-route loading is also covered by the 90-state design matrix.

Phone widths include 320, 360, 390 and 414px, plus 844×390 landscape, 768px tablet and 1280px desktop. Short-viewport dialog checks use 360×420; these simulate available space and do not emulate a physical software keyboard. No real phone hardware was used. WebKit is browser-engine coverage, not a physical iPhone test. A separate hard-navigation probe found no errors after requests settled; rapid full-document test navigation had caused WebKit cancellation diagnostics, so the interaction matrix uses the real navigation controls.

API tests additionally verify organiser-only metadata, absence of raw tokens/hashes in lists, pagination, old-link rejection, joined-name rejection, idempotent cancellation and activity integrity. Eight simultaneous MongoDB invitations for the same normalised name yield one success and seven `ALREADY_INVITED` rejections.

Run `npm run test:mobile` against a local server using `RALLY_TEST_URL`; set `BROWSER_ENGINE=webkit` when Playwright WebKit and its dependencies are available.

## Staff usernames and account-free attendees

The staff signup/sign-in flow now supports usernames without email. Existing email/password accounts remain compatible. The new attendee journey passed in the browser against both SQLite and a disposable MongoDB replica set: organiser creates QR/link → guest submits without an account → committed response is lost → guest reloads offline → reconnect safely confirms one request → staff assign, complete and close it → private guest tracking shows the result after reload → shared-link revocation preserves existing tracking.

The MongoDB browser check reported **zero guest signup/login calls, 7 commands, 7 activity entries, 0 incorrect versions, 0 missing history entries, 0 broken references and 0 JavaScript errors** at `2026-11-15T16:27:25.252Z`. A separate 320px run with long unbroken title, location and venue values passed pending/tracking overflow and axe checks at `2026-11-15T16:35:42.059Z`.

API tests cover username uniqueness, staff invitation and recovery, guest capability isolation, unknown receipts, mismatched retry payloads, simultaneous duplicate requests, revocation/replay, QR fragment/origin validation and rollback when receipt storage fails. MongoDB tests exercise the same concurrency and rollback invariants. The updated 90-state design matrix and 21 short-viewport checks passed. Browser checks also confirm that skip navigation preserves private keys and browser Back restores the correct request after a fragment change. Public help reads are bounded and refresh every 15 seconds while visible; this is not a load test or unlimited-capacity claim.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 60 passed |
| `npm run test:mongo` | 16 passed against a disposable MongoDB replica set |
| `npm run build` | TypeScript and production Vite build passed |
| Design browser matrix | 90 page/viewport combinations: no horizontal overflow or automated axe WCAG findings |
| Layout browser checks | 21 checks passed, including 320×568 phones and 1280×600 laptops |
| Usability browser checks | 12 checks passed: role shortcut, action filters, search recovery, navigation, roster, menu bounds and focused fields |
| PWA browser checks | 8 passed: cached shell, QR fallback, offline deep routes, paused-state recovery and API docs |
| Installation events | Android/iPhone identities: direct native prompt, dismissal, retry, installed state and no unsupported installation instructions |
| Account browser journey | Signup without email, recovery-code download, empty event setup, code replacement and password recovery passed on a 390px phone viewport |
| Mobile invitation journey | 52 checks each in Chromium and WebKit: phone, landscape, short dialogs, copy fallback, duplicate handling and invitation lifecycle |

The design matrix covers welcome, sign-in, registration, account recovery, confirmation/reset links, home, tasks, plan, team, activity, integrations, connection help, task detail, all creation steps and updates. Widths: 320, 375, 768, 1024 and 1440px. Additional usability checks include 390, 600 and 844px landscape layouts. Inputs use 16px text on phones; navigation retains visible labels and targets of at least 44px.

## Failure journey

The browser journey completed attendee request → organiser assignment → volunteer completion → organiser confirmation. It also checked:

- An actual network outage, offline reload and reconnect retained one pending intent and created one task.
- Dropping a response after the server committed returned the original result on retry, with no duplicate task.
- A competing assignment preserved the draft, rejected the stale version and required explicit conflict review.
- Reporter updates persisted, acknowledgement worked and dialog keyboard focus returned correctly.
- Attendee controls did not offer organiser-only actions.

At the final record check: **29 commands, 29 activity entries, 0 incorrect task versions, 0 missing history entries and 0 broken references**. Check time: `2026-11-15T15:20:38.797Z`. This was an isolated SQLite fixture. The same full browser failure journey subsequently passed against a disposable MongoDB replica set served by one Node process, matching the Render topology. Its final check at `2026-11-15T15:50:13.536Z` also reported 29 commands, 29 activity entries and zero invariant failures.

MongoDB tests separately cover transactional rollback, simultaneous duplicate commands, version conflicts, real separate accounts, invitation reuse, event-scoped integration tokens, authenticated sockets, push retries, session revocation and a read-only SQLite import that refuses a populated destination.

## Legacy email-account regression checks

Signup grants access while leaving `emailVerified=false`. Recovery secrets are stored hashed and omitted from account/snapshot responses. Invalid credentials cannot enable an existing account. Password recovery rotates the code, revokes sessions and leaves event records intact. Two simultaneous uses of one recovery code produce one success and one rejection, including on MongoDB. An authenticated user can replace a lost code after confirming their current password; the previous code then fails. Browser assertions confirm that signup, password recovery and code replacement move keyboard focus to the noneditable result heading.

## Limits

Automated axe results are not an accessibility certification or a substitute for testing with assistive technology. No physical phone installation, real camera capture, external email or external push delivery was tested. Camera denial and image/paste fallback were exercised. Installation prompt events and phone browser identities were emulated. A website cannot silently install itself where the browser does not expose installation.

The production Atlas database was not modified by these local tests. Backups, restore procedures, event-scale load and long-running production operation require separate validation.

## Earlier live release verification

Release `8351e31` was pushed to `thehusnain/VenueRelay` and the existing Render service deployed it. The live site served the matching frontend assets and both new recovery API operations. A fresh 390px browser session completed one-click demo sign-in and Home/Tasks navigation with no horizontal overflow or uncaught JavaScript errors. MongoDB health returned `ok`, and the signed-in account reported `EMAIL_TRANSPORT=disabled` and `accessGranted=true`. The live smoke check did not create test attendee tasks or change operational event records.

Use [the Render deployment checks](DEPLOYMENT.md) for later releases. Confirm the deployment serves the reviewed build, passes MongoDB health, exposes OpenAPI and supports same-origin sign-in. Existing Render dashboard build commands and environment values can override repository defaults.
