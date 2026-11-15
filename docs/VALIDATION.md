# Validation

Verified on 15 November 2026 against disposable local databases. These results describe the revised source; live deployment validation is recorded separately below.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 54 passed |
| `npm run test:mongo` | 14 passed against a disposable MongoDB replica set |
| `npm run build` | TypeScript and production Vite build passed |
| Design browser matrix | 90 page/viewport combinations: no horizontal overflow or automated axe WCAG findings |
| Layout browser checks | 21 checks passed, including 320×568 phones and 1280×600 laptops |
| Usability browser checks | 12 checks passed: role shortcut, action filters, search recovery, navigation, roster, menu bounds and focused fields |
| PWA browser checks | 8 passed: cached shell, QR fallback, offline deep routes, paused-state recovery and API docs |
| Installation events | Android/iPhone identities: direct native prompt, dismissal, retry, installed state and no unsupported installation instructions |
| Account browser journey | Signup without email, recovery-code download, empty event setup, code replacement and password recovery passed on a 390px phone viewport |

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

## No-email account checks

Signup grants access while leaving `emailVerified=false`. Recovery secrets are stored hashed and omitted from account/snapshot responses. Invalid credentials cannot enable an existing account. Password recovery rotates the code, revokes sessions and leaves event records intact. Two simultaneous uses of one recovery code produce one success and one rejection, including on MongoDB. An authenticated user can replace a lost code after confirming their current password; the previous code then fails. Browser assertions confirm that signup, password recovery and code replacement move keyboard focus to the noneditable result heading.

## Limits

Automated axe results are not an accessibility certification or a substitute for testing with assistive technology. No physical phone installation, real camera capture, external email or external push delivery was tested. Camera denial and image/paste fallback were exercised. Installation prompt events and phone browser identities were emulated. A website cannot silently install itself where the browser does not expose installation.

The production Atlas database was not modified by these local tests. Backups, restore procedures, event-scale load and long-running production operation require separate validation.

## Release verification

Release `8351e31` was pushed to `thehusnain/VenueRelay` and the existing Render service deployed it. The live site served the matching frontend assets and both new recovery API operations. A fresh 390px browser session completed one-click demo sign-in and Home/Tasks navigation with no horizontal overflow or uncaught JavaScript errors. MongoDB health returned `ok`, and the signed-in account reported `EMAIL_TRANSPORT=disabled` and `accessGranted=true`. The live smoke check did not create test attendee tasks or change operational event records.

Use [the Render deployment checks](DEPLOYMENT.md) for later releases. Confirm the deployment serves the reviewed build, passes MongoDB health, exposes OpenAPI and supports same-origin sign-in. Existing Render dashboard build commands and environment values can override repository defaults.
