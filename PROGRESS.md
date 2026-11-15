# Rally — progress, 15 November 2026

## Current scope

One responsive React/Vite website and installable PWA, using the existing Node.js/SQLite backend. No separate Android/iOS projects, APKs, Capacitor or native build workflow. The latest user instruction replaces the dark theme with white surfaces, dark ink, teal actions and amber/green status highlights. Retain locally bundled Antonio headings and Manrope body/UI text. The user authorised git add, commit and push after the work is complete.

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
- Full browser journey: 15 checks passed, including roles, offline reload/reconnect, response lost after commit, reviewed conflicts and keyboard recovery. Integrity: 29 commands, 29 activity entries, zero version/audit/foreign-key mismatches at 2026-11-14T04:58:18.698Z.
- PWA browser scenario: 8 checks passed, including demo login, real service worker/IndexedDB, install/push fallbacks, denied camera and QR image/paste recovery, offline deep route, pause/reload/reconnect and API docs.
- Design matrix: 90 page/state views passed at 320, 375, 768, 1024 and 1440px. Zero horizontal overflow or findings from the selected axe rules; local fonts and reduced motion verified.
- Focused layout: 11 checks passed, covering ten viewports from 320x568 to 1600x900 and delayed-session sign-in input persistence. Both landing actions visible and headline two lines at every tested viewport.
- No uncaught JavaScript errors in the scenarios. Browser tests used the available browser connection; local Playwright requires a Chromium download before npm run test:browser/pwa/design/layout.

Browser checks used a disposable server on port3002, DATABASE_PATH=/tmp/rally-nov14.sqlite, EMAIL_MODE=preview, EMAIL_PREVIEW_DIR=/tmp/rally-nov14-mail (exec session31047). User preview records were not reset or rate limits weakened. Ignored test-results/ holds the captures. The old test-results/run-*.js wrappers use port3002; real scenarios and CLI are under tests/.

## Boundaries and repository handover

Physical phone cameras, VoiceOver/TalkBack and real external push delivery have not been tested. Trusted HTTPS is needed for real phone camera/service worker/push access; VAPID configuration and permission are needed for push. Background scheduling depends on browser support, with foreground/reopen retry fallback. No deployment or external messages were performed.

Git branch main; origin https://github.com/thehusnain/rally.git. A read attempt on 14 November still failed with Could not resolve host: github.com. The user has authorised normal staging, committing and pushing; verify git history/status for the actual result. Do not bypass network/filesystem restrictions or claim a push succeeded without confirmation. Future changes should start from the existing project and observed test evidence.


## Latest mobile/HCI refinement — 14 November

User requested a more distinctive, easier website, with mobile use taking priority. Implemented an event run-sheet layout while retaining the Antonio/Manrope and black/white identity:
- Persistent labelled bottom navigation on phones up to 720px, normal top navigation on larger screens, safe-area/content clearance and scrollable viewport-bounded menus.
- Compact event identity and a single visible, accessible save status. Removed the repeated date/progress display. Workspace entrance choreography disabled.
- Organiser next-step filters (choose owner, help teammate, check result), visible status/ownership on each task, full-row accessible actions and one-tap empty-search recovery.
- Compact team roster, clear sample-role shortcut with focus transfer, simpler buttons and an actual role hand-off explanation on the welcome page.
- Preserved role permissions, task ownership, transactions, offline/conflict handling and PWA behaviour. No new framework/dependency/native project.

Validation: 42 automated tests; 90 responsive/axe views; 11 focused landing/sign-in checks; 12 new mobile usability checks across eight portrait/landscape/tablet/desktop sizes; 15 end-to-end browser checks; 8 PWA checks. Latest integrity: 29 commands/29 activity entries with zero mismatches at 2026-11-14T04:58:18.698Z. No uncaught JavaScript errors. Build, formatting, strict unused-symbol typecheck, diff check and mechanical design detector passed. Final usability rerun passed at 2026-11-14T04:58:59.693Z. The 390x480 field test simulates reduced height; physical keyboard/screen-reader testing remains outstanding.

Design rationale and primary HCI/accessibility references are in DESIGN.md; observed evidence in docs/VALIDATION.md. Tests reproduce with npm run test:usability after Playwright Chromium setup. Updated the two existing tracked screenshots only. Ignored test-results/hci-*-final.png contains extra review captures.

This pass used temporary database /tmp/rally-hci.sqlite on port3002 (exec65298) with preview mail. The normal port3001 preview should serve the current built frontend after refresh. Keep the normal preview available and stop only the temporary test server. User authorised normal git staging, commit and push; report the actual resulting commit/network status, not an assumed successful push.

Git outcome for this latest pass: git add failed with Unable to create .git/index.lock: Read-only file system. No new commit or push was made for the mobile/HCI changes. Source/docs/tests remain saved in the working tree; the previous commit is d8e2071. Do not report this pass as committed. Resume publishing only from an environment with normal repository write access; prior GitHub DNS failure may also need resolving.


## Latest light theme, demo login and real onboarding — 15 November

The user reported the account-page CSS in a 1600px laptop screenshot, requested a white theme with useful colour highlights, explicit demo credentials and a fill-only button, and short manual setup for real users plus an understandable demo.

Completed:
- White theme across all existing pages, menus, forms, task states and PWA browser chrome. Teal actions/selection, amber blockers and green completed/review states. Existing fonts retained.
- Removed overlapping account layout rules from styles.css/reference.css and placed account layout in frontend/src/account.css. No giant account poster, duplicate sign-in header action, heavy double focus outline, or automatic account-input keyboard opening. Sign-in remains in view at 320x568 through laptop sizes.
- Sign-in displays the public demo credentials and Fill demo populates both fields, clears old errors and focuses Sign in; it never submits. Credentials have one shared source with the backend seed. Public Try sample actions now navigate to demo login.
- Demo Home explains the sample one-day festival, current role and request/assignment/completion/check hand-off. A working first-action button opens an appropriate task/request, with optional guide dismissal per role.
- Verified real accounts create their own empty event using one short name/date/venue form. The empty event home guides invitations and first tasks. No sample people/tasks/schedule are added to real events.
- Invitation copy explains choosing a role, link/QR sharing, recipient's own account and joining before task assignment. Added Invite another person and Done; role input has an explicit accessible label; clipboard errors remain visible in the result.
- Found and fixed a real server crash when frontend build files disappear during rebuild. Static streams now return a non-cached 503 with Retry-After before headers, keep the API alive, and recover when files return. A regression test covers missing/restored frontend and HEAD.

Observed verification:
- 43 automated tests passed, including new static rebuild recovery. Build, formatter, strict unused-symbol typecheck and diff check passed; design detector returned [].
- 90 page/state views passed axe/overflow checks in the requested light theme at 320/375/768/1024/1440px, with local fonts and reduced motion.
- 21 layout checks passed: welcome and sign-in at ten short/regular sizes, fill-without-submit and delayed-session input retention. No automatic account-input focus.
- 12 mobile usability checks, 15 offline/role/conflict journey checks and 8 PWA checks passed without uncaught JS errors. Latest demo integrity:29 commands/29 activity, zero mismatches at 2026-11-15T11:54:12.811Z.
- A separate real-account browser proof created an empty non-demo event, invited/joined a separate vendor account, manually created/assigned a task, then completed and confirmed it:4 checks,6 commands/6 activity, zero mismatches at2026-11-15T11:50:24.295Z. Two verified test accounts were prepared only in the disposable database; signup/verification are separately covered by automated account tests. No demo data was seeded for those users.
- Updated README, DESIGN.md, DEMO/SUBMISSION/VALIDATION docs and the two tracked screenshots. Extra captures and real-onboarding-proof.js are ignored under test-results/.

Preview: npm run dev started in exec83908 (API3001 and Vite5173). The user's screenshot used http://127.0.0.1:5173/sign-in; this now shows the light form. Temporary test API on3002 uses /tmp/rally-light-check.sqlite and preview mail only (exec33579). Stop only that test server after checks; retain the normal dev preview.

Git base observed: fe1d569 mobile responsive (the user committed the preceding pass). User authorisation to stage/commit/push persists; report the actual current attempt. The preceding session had a read-only .git and GitHub DNS failure; do not bypass restrictions or claim a new commit/push succeeded without evidence. Normal real-account SMTP delivery remains deferred as requested; local previews and demo login work. Physical phone keyboards/cameras/screen readers and real external push delivery remain untested. No deployment or native app was created.

Final density correction after the user's Home screenshot: removed the duplicate event name from the Home header, reduced/aligned its heading to36px desktop/28px phone, and grouped role/date/venue below it. Removed redundant work-list guidance. Demo help now sits beside the task list on desktop with longer text behind How it works; on phones it starts as a compact, accessible disclosure. Mobile Home uses one Show/filter select instead of four labelled chips. The first task title is visible above phone navigation at375/390px; a full first task fits in the1600x680 laptop viewport. Updated usability checks passed12 checks at12:06:59UTC; preceding full matrix passed90 views after sidebar relocation. Final Home/expanded-guide axe scans at1600x680 and375x667 passed. Existing backend/PWA/real-account proofs remain applicable; last refinements were layout/disclosure only. Normal staging succeeded in this pass via git add -A; verify the final commit and push outcome from git history/output.


## Deployment preparation and venuerelay. rename — 15 November

Latest user request: prepare the existing website/PWA for Vercel + Render + free MongoDB Atlas. They have accounts only and explicitly requested setup files/instructions, not live provisioning. While work was underway they renamed the product to **venuerelay.** with **Every Team. Every Update. One Place.** Preserve the existing stack and the white Antonio/Manrope UI. No native app/APK.

Completed:
- Added a native MongoDB production backend behind the existing Node HTTP API: collections/indexes, snapshot/majority transactions, ownership/role checks, unique actor/request keys, optimistic task versions, transactional command/activity/inbox records, account/invitation/integration flows, leased mail/push outboxes and authenticated WebSockets. Task rules/permissions and sample generation are shared with SQLite; the easy local judge path still creates SQLite automatically without installing a database.
- Production requires Atlas SRV/TLS configuration, HTTPS origins and secure cookies. It cannot silently save to Render's temporary SQLite filesystem. Health checks ping MongoDB and return503 when unavailable; graceful shutdown stops live sockets and drains workers/requests with a deadline.
- Added one-use, origin/event/persona/session-bound live tickets valid30seconds. The Vercel website proxies HTTP to Render to keep auth cookies first-party; direct Render WSS uses these tickets, never session tokens in URLs. Reconnect requests fresh tickets; foreground fallback polling is60seconds while live,10seconds without a socket.
- Root render.yaml describes one modest paid Node service; root vercel.json and scripts/vercel-output.mjs generate Vercel Build Output with exact backend routing, safe caching, SPA deep links and PWA/camera/security headers. No services were provisioned and no credits spent. Real public URLs/private credentials must be set in the hosting dashboards.
- docs/DEPLOYMENT.md covers Atlas → Render → Vercel → final origins, private env values, judge credentials, later SMTP/VAPID setup, phone installation, operational limits and post-deploy failure checks. scripts/check-deployment.mjs checks the deployed proxy/API/manifest/SW/deep link. Optional scripts/migrate-mongo.ts defaults to dry-run, reads SQLite without altering it, applies one transaction only into an empty destination, preserves records/IDs/history/password hashes, excludes sessions/proof/outbox/push state, refuses a populated destination.
- Public demo credentials remain demo@rally.local / RallyDemo2026! for compatibility and are included in submission notes. Render explicitly enables the demo. MongoDB flags it as demo and prevents it creating/joining real events. Real registrations require SMTP; email remains deliberately disabled in the blueprint until configured. No private email/Atlas credentials were requested or written to tracked files.
- Visible name/wordmark, three-line welcome slogan, page metadata, PWA manifest/notification copy, help and documentation now use venuerelay./VenueRelay. Existing cookies, X-Rally-* headers, IndexedDB names, identifiers and demo credentials remain compatible. Repository/folder/database names were not destructively renamed. Refreshed the two existing screenshots with pristine demo data.
- Updated Vite within major8 to8.3.8 and compatible transitive security fixes. npm audit reported0 vulnerabilities. Local compose remains a local demo with explicit development settings; production Docker still needs hosted configuration.

Observed checks:
- npm test:48 passed. npm run test:mongo:12 passed against a real disposable MongoDB8.2.6 replica set; covers empty real event, full roles/ownership/privacy, transactional rollback, eight concurrent identical intents, lost-ack replay, competing version conflicts, single-use invites/tickets, integration/session revocation, mail/push lease races/retries and safe migration.
- The hosted-layout browser fixture on website3003/API3002 used MongoDB plus HTTP proxy/direct ticket WS. The15-check full journey passed actual offline reload/reconnect, post-commit response loss and reviewed conflicts. Integrity29commands/29activity, zero mismatches at2026-11-15T12:49:12.672Z; no uncaught JS errors.
- All21 focused welcome/sign-in layout checks passed after the rename, from320x568 to1600x900, at12:50:13UTC. Main actions/sign-in stay visible; three-line slogan remains compact; demo fill never auto-submits. PWA/QR suite8checks passed at12:51:37UTC, including cached deep routes, image/paste QR and denied camera fallback.
- Vercel Build Output generation passed with a non-secret example backend origin. Final Vite8.3.8 mobile smoke had connected ticket WS, correct brand, no overflow and no JS errors. Health/OpenAPI/manifest/SW/sign-in routes each returned200 through the local proxy. Strict unused-symbol typecheck, normal build, formatting and diff checks passed.
- Actual Atlas/Render/Vercel endpoints have NOT been provisioned or tested. Real SMTP/push and physical iPhone camera/install behaviour remain outstanding. Use docs/DEPLOYMENT.md after setting real dashboard values. The shell's isolated localhost cannot reach the separate browser fixture, so the public readiness CLI was not falsely recorded as a live cloud success; its paths were checked through Playwright.

Cleanup: stop only the disposable tests/hosted-fixture.ts server (exec95114) after captures. Normal frontend build is restored without VITE_WS_URL test overrides for the user's local preview. No production/local-user database was migrated or replaced. Generated .vercel/, data/, .env and test-results/ are ignored.

Publishing: user previously authorised normal git add/commit/push. Base was83ec1e7. Record the actual publishing result below; do not assume remote push succeeded or bypass a read-only .git/network restriction.

Publishing outcome: the deployment/rename changes were committed locally. Normal git push origin main failed with Could not resolve host: github.com. No remote publication or live deployment was confirmed. No secrets/generated output were staged. Resume with a normal git push once GitHub DNS/network access works; no permission bypass or force push is needed.


### Atlas connection troubleshooting — 15 November

User is deploying frontend/backend together on a Render Node service (regular build, API_ONLY=false), with Atlas. Their $50 hackathon credit is active but the paid instance card authorisation was rejected for insufficient bank funds; free hosting was discussed. Email setup is still pending provider credentials; current app uses SMTP, provider-supported alternate ports such as Brevo2525 were discussed, and no HTTPS email adapter or actual delivery was added/tested. The origin-validation error was resolved far enough to reach MongoDB startup.

Latest screenshot: generic database-unavailable startup error. Atlas screenshot shows0.0.0.0/0 active, so do not keep asking them to widen the access list. They shared only a password-placeholder URI with username sheriff and an Atlas cluster hostname; no actual password. We cannot determine authentication/permission/network cause from the generic log and have no access to their private URI/Render account.

Added backend/src/startup-error.ts and wired startup catch to it, returning credential-free categories for authentication (including Atlas bad-auth8000), readWrite permissions, malformed URI, DNS, TLS, connectivity and generic Mongo initialisation. No raw provider messages/URI are printed. Preserves known local configuration hints. Regression tests cover failure classification and secret redaction;49 tests and typecheck passed before the final conservative message-whitelist refinement. Documented diagnostics in DEPLOYMENT.md. Guide the user to check Atlas Database Users (not Atlas website login), readWrite on rally, URI percent-encoding, correct active cluster and authSourceadmin; never request their actual password or complete private URI.

Final diagnostics validation:49 tests passed after the conservative message-whitelist refinement; typecheck and diff check passed. User then asked about Gmail App Passwords. Existing SMTP transport supports them on a host permitting SMTP; Google requires2-StepVerification. Render Free blocks Gmail ports465/587, so Gmail App Password does not solve that network restriction. No Gmail password/key was requested or configured.
