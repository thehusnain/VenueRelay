# Rally — progress, 14 November 2026

## Current scope

One responsive React/Vite website and installable PWA, using the existing Node.js/SQLite backend. No separate Android/iOS projects, APKs, Capacitor or native build workflow. Retain the black/white design, locally bundled Antonio headings and Manrope body/UI text. The user authorised git add, commit and push after the work is complete.

## Completed

- Responsive welcome, account forms, home, task flow, event plan, team, activity, integrations and connection-help screens. Shared heading/gutter scale, height-aware two-line landing heading and main actions visible on short laptop and phone viewports. Phone installation and invitation-scanning navigation remains visible.
- Fixed direct sign-in inputs being cleared when the initial session check finishes. Existing role permissions and task flows retained.
- IndexedDB snapshots/outbox, scoped queues, atomic migration, multi-tab lease tokens, persistent retries, original idempotency IDs and explicit conflict review. Shared foreground/Background Sync engine.
- Generated service worker precaches actual application/font assets, excludes API/auth responses, supports offline deep navigation and controlled updates.
- Authenticated WebSockets with origin/membership/session checks and heartbeat/reconnect/poll recovery. Optional push with durable jobs, retries and permission controls.
- QR camera, image upload and pasted-link scanning with same-origin validation. Immutable server activity, ownership and version checks retained.
- Native projects, packages and obsolete generated artifacts removed. Private .env, data/, dependencies, build/test output and .sites-runtime/ remain ignored.
- Demo account automatically seeded for local judging: demo@rally.local / RallyDemo2026! Public sample credentials are in README and docs/SUBMISSION.md. SMTP setup remains optional; email verification uses local previews by default.
- Swagger at /api/docs and OpenAPI at /api/openapi.json. Current desktop/mobile screenshots and docs/VALIDATION.md updated.

## Verified on 14 November

- npm test: 42 tests passed with isolated HTTP/WebSocket/database fixtures.
- Production build, formatting, strict unused-symbol TypeScript and git diff --check passed.
- Full browser journey: 15 checks passed, including roles, offline reload/reconnect, response lost after commit, reviewed conflicts and keyboard recovery. Integrity: 29 commands, 29 activity entries, zero version/audit/foreign-key mismatches at 2026-11-14T04:39:35.078Z.
- PWA browser scenario: 8 checks passed, including demo login, real service worker/IndexedDB, install/push fallbacks, denied camera and QR image/paste recovery, offline deep route, pause/reload/reconnect and API docs.
- Design matrix: 90 page/state views passed at 320, 375, 768, 1024 and 1440px. Zero horizontal overflow or findings from the selected axe rules; local fonts and reduced motion verified.
- Focused layout: 11 checks passed, covering ten viewports from 320x568 to 1600x900 and delayed-session sign-in input persistence. Both landing actions visible and headline two lines at every tested viewport.
- No uncaught JavaScript errors in the scenarios. Browser tests used the available browser connection; local Playwright requires a Chromium download before npm run test:browser/pwa/design/layout.

Browser checks used a disposable server on port3002, DATABASE_PATH=/tmp/rally-nov14.sqlite, EMAIL_MODE=preview, EMAIL_PREVIEW_DIR=/tmp/rally-nov14-mail (exec session31047). User preview records were not reset or rate limits weakened. Ignored test-results/ holds the captures. The old test-results/run-*.js wrappers use port3002; real scenarios and CLI are under tests/.

## Boundaries and repository handover

Physical phone cameras, VoiceOver/TalkBack and real external push delivery have not been tested. Trusted HTTPS is needed for real phone camera/service worker/push access; VAPID configuration and permission are needed for push. Background scheduling depends on browser support, with foreground/reopen retry fallback. No deployment or external messages were performed.

Git branch main; origin https://github.com/thehusnain/rally.git. A read attempt on 14 November still failed with Could not resolve host: github.com. The user has authorised normal staging, committing and pushing; verify git history/status for the actual result. Do not bypass network/filesystem restrictions or claim a push succeeded without confirmation. No remaining product implementation is required for this design pass; future changes should start from the existing project and observed test evidence.
