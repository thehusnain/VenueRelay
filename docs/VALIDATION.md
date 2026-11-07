# Validation evidence

Checked 7 November 2026 on the built React frontend and running Node.js API. Results describe observed tests, not a guarantee against every possible failure.

## Backend and API

**30 tests passed, zero failed.**

```sh
RALLY_TEST_URL=http://127.0.0.1:3001 npm test
```

The environment restricts listener creation in some test subprocesses, so HTTP cases used the already running local API. They create isolated accounts and events in preview mode. Domain/account unit cases use in-memory or temporary file databases.

The checks cover:

- Full attendee report → assignment → work → blocker → resolution → checked completion, with correct permissions and notifications.
- Replayed requests, payload/key mismatch and 12 parallel duplicate HTTP submissions producing one accepted intent.
- Stale expected versions rejected, foreign event assignments and role spoofing denied.
- Injected storage failures rolling back task, request journal, history and notifications together.
- Database restart preserving records and deduplication; SQL triggers rejecting changes to immutable journals.
- Single-use account-bound invitations and separate real organiser/volunteer accounts.
- Event-scoped hashed integration credentials and immediate revocation.
- Native bearer sessions without cookies, including logout revocation.
- Unverified accounts denied event access; verified real accounts receive empty onboarding.
- Atomic account/proof/email enqueue, proof expiry/replacement/replay, wrong-purpose proofs and password reset revoking all sessions.
- SMTP interruption/backoff with a stable Message-ID, lease recovery, private local previews and cancellation of obsolete email jobs.
- Rate limits surviving restarts; schema upgrade retaining data without assuming existing email ownership.
- Email syntax and domain checks, null MX rejection, address-record fallback and temporary DNS failure handling.

## Production browser journey

**15 checks passed, zero uncaught JavaScript errors.** The final run used the connected Playwright browser against port 3001 after restarting the two-command launcher. The reusable scenario is [browser-scenario.js](../tests/browser-scenario.js), with [Node launcher](../tests/browser.mjs). The environment blocks the shell's direct Chromium launcher.

Automated axe scans found zero findings for the requested WCAG 2 A/AA, 2.1 AA and 2.2 AA rules on welcome, failed sign-in, organiser home, task detail, updates dialog and 375px home. This is not a full WCAG conformance certification.

Behaviour checked:

1. Welcome opens first; no sample account is created until explicitly chosen.
2. Failed sign-in retains email and focuses the error summary.
3. Home limits next-action tasks to three.
4. Three-step request retains answers through Back and forward navigation.
5. Complete four-role journey, checked completion and browser Back navigation.
6. Reporter notifications and read acknowledgement; dialog Tab wrapping, Escape and focus restoration.
7. Actual browser offline mode, queued task, offline reload and reconnect produce exactly one task.
8. A response is aborted only after the server commits; replay confirms the same record without duplicates.
9. A draft assignment remains based on its original version while live polling brings another owner's change. Submission produces a conflict; saved ownership remains until explicit review and reapplication.
10. 375px/320px layouts have no horizontal overflow, navigation stays labelled and Escape dismisses More.

After these scenarios, the live integrity response was:

```json
{
  "ok": true,
  "commands": 29,
  "activity": 29,
  "taskVersionMismatches": 0,
  "missingAuditEntries": 0,
  "foreignKeyViolations": 0,
  "checkedAt": "2026-11-07T10:41:36.252Z"
}
```

[Machine-readable result](browser-results.json), [welcome](screenshots/welcome.png), [desktop](screenshots/desktop.png), [mobile](screenshots/mobile.png), [record check](screenshots/reliability.png).

## Real account interface check

A separate browser context registered a real account, was denied event access before confirmation, used the private local email preview and explicitly confirmed. It created “Local community day” with **zero tasks and one member**, without sample records. Password recovery through another private preview succeeded; signing in with the new password returned the same verified account and event with zero tasks. These private proof links and credentials are not included in evidence files. Real external email delivery has not been configured or tested.

## Build and design checks

- `npm run dev` fresh startup rebuilt and served both UI and API on port 3001, with the live editor on 5173.
- `npm run build`, strict unused-symbol TypeScript checking and formatting checks passed.
- Main JavaScript approximately 86 KB gzipped; fonts are self-hosted.
- OpenAPI 3.1 document contains 22 operations, including verification and recovery.
- Impeccable mechanical detector returned no findings on the redesigned pages and stylesheet.
- Capacitor Android/iOS projects and Preferences configuration are included. Native builds skip service-worker registration.

## Limits

No manual screen-reader audit, physical-device accessibility audit, sustained load test or external SMTP delivery test has been performed. Live updates poll every three seconds while visible. In-app notifications persist, but SMS, OS push and closed-app background sync are not implemented. The device must have loaded the event before an offline reload; clearing device storage loses unconfirmed local actions. The database file remains essential to preserving confirmed records.

This is a localhost handoff. No public deployment, store publication or iOS binary is claimed. See [MOBILE.md](MOBILE.md) for the Android artifact's current build and runtime validation status.
