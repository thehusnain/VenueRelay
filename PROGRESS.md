# Resume Rally from here

Paused at the user's explicit request on 7 November 2026. Do not restart work until the user asks to continue. All source is saved in `/home/sheriff/Desktop/rally`. The local database and private email previews remain in `data/`; do not delete or package them.

## User requirements and decisions

HS-0130 small-event coordination: Node backend, accessible React UI, permissions, task ownership, durable notifications and history, documented API, failure correctness. User rejected a dense generic dashboard and prioritises beginner-friendly UX, plain language and attractive static pages. No motion-video backgrounds; decorative 3D is not part of the working flow. LOCALHOST ONLY. External email delivery is deferred; build verification/recovery with explicitly labelled local preview. Judge needs easy startup without database/service setup. User also wants an app.

## Completed and checked

- React 19/Vite/TypeScript frontend: welcome first, explicit sample, guided signup/confirmation/event setup, three-step request creation, task detail, simple Home/Tasks/Event plan/Your team, advanced tools under More.
- Node 24 backend with automatic SQLite file, migrations, role/event isolation, transactional state/history/notifications, intent deduplication, optimistic concurrency and live integrity checks.
- Real accounts, syntax/DNS email validation, hashed single-use verification/reset proofs, persistent rate limits, durable leased email outbox and private .eml preview. No external email is sent in default preview mode.
- Offline outbox, offline reload, lost-response retries and explicit conflict review. A draft preserves its original version even when polling refreshes the current task.
- Native Capacitor projects; Android local API is http://127.0.0.1:3001 with adb reverse USB mapping. Native sessions use Preferences; native builds skip service-worker registration. Updated web/native icons and splash assets.
- `npm install` then `npm run dev` automatically builds and serves localhost:3001 and starts live editor:5173. No separate DB/env/service setup. `.env` optional, `.env.example` provided, Node24 required. `npm dev` is not a valid npm command.
- `npm run email:preview -- EMAIL` reads latest private preview. Do not expose actual proof links or credentials in docs.
- `npm run app:android` added: typecheck, native frontend build, cap sync android, assembleDebug, copy APK, restore browser build. Requires JDK21 + Android SDK36. Build tools pinned36 across Android modules.
- README and docs/SUBMISSION.md, MOBILE.md, DEMO.md, API.md, ARCHITECTURE.md, VALIDATION.md, PLAN.md updated for localhost and current UX. OpenAPI22 operations including account verification/recovery.
- No deployment, repository publishing or video uploading performed. No git repository currently initialised in this folder.

## Verification evidence

- All 30 account/domain/HTTP tests passed via `RALLY_TEST_URL=http://127.0.0.1:3001 npm test`.
- `npm run build`, `npm run format:check`, unused-local/parameter TypeScript checks passed.
- Final production browser scenario:15 checks passed, no uncaught JavaScript errors. Fresh welcome, retained error inputs/focus, three-step Back, complete role journey, durable inbox, keyboard dialogs, actual offline reload, response aborted after commit, reviewed conflicting assignments and375/320px layouts. Automated axe scans on6 views returned no findings; no full WCAG/manual screen-reader claim.
- Integrity29 commands/29 activity,0 task-version mismatches,0 missing audit,0 FK violations at2026-11-07T10:41:36.252Z. Saved docs/browser-results.json and docs/screenshots/{welcome,desktop,mobile,reliability}.png.
- Separate real UI account journey verified signup→local proof→empty event→password recovery→same event after login. No sample data in that event. Private test account remains only in ignored local data.
- Impeccable mechanical detector returned[] on redesigned pages/styles.
- Native origin OPTIONS preflight against freshly started API returned204 and allowed https://localhost.

## Android build: resume here

Temporary toolchain installed under `/tmp/rally-native-tools` (not in source). Verified commandline-tools and JDK archive checksums against official downloads. Installed SDK platform36, build-tools36.0.0 and platform-tools. Gradle also installed35 automatically before build pinning. JDK21.0.2 is a compiler only. Cached Gradle8.13 used to avoid a large wrapper download; project wrapper8.14.3 also present for normal users. Dependencies downloaded to writable temporary Gradle cache (~379MB).

The build was interrupted on the user's stop request. Last output during interruption reached :app:packageDebug. The Gradle output APK exists at mobile/android/app/build/outputs/apk/debug/app-debug.apk, but the script was interrupted before copying, verification and restoring the browser build. Treat it as unverified until checked. Do not claim an APK is ready until it exists, is copied and verified. Source and dependency downloads remain reusable.

Resume command (after user says continue):

```sh
cd /home/sheriff/Desktop/rally
JAVA_HOME=/tmp/rally-native-tools/jdk-21.0.2 ANDROID_HOME=/tmp/rally-native-tools/sdk ANDROID_USER_HOME=/tmp/rally-native-tools/android-user GRADLE_USER_HOME=/tmp/rally-native-tools/gradle GRADLE_RO_DEP_CACHE=/home/sheriff/.gradle/caches RALLY_GRADLE=/home/sheriff/.gradle/wrapper/dists/gradle-8.13-bin/5xuhj0ry160q40clulazy9h7d/gradle-8.13/bin/gradle npm run app:android
```

Initial dependency resolution can be quiet for a minute; don't keep cancelling a progressing build. Android code compiled; final packaging may still need dependency work. No /dev/kvm in this environment; no emulator or physical-device runtime validation has occurred. No IPA built on Linux.

## Remaining work

1. Resume and complete Android build. Verify APK with SDK36 apksigner and aapt badging/config inspection; check bundled API127.0.0.1:3001 and cleartext/mixed-content flags. Copy artifacts/rally-android-debug.apk via script. The script restores browser frontend on success; if interrupted, frontend/dist may still be the native-API build (same localhost works, but restore normal npm run build when finished).
2. Write artifacts/README.md with actual build/signature/identity evidence and honest native-runtime limits. docs/MOBILE.md references it but it does not exist yet. Update validation native status only when checked.
3. Sync iOS with final frontend if desired (only `cap sync ios` after proper build); do not run general cap sync during Android packaging because it can overwrite copied Android assets/config. A previous general sync was cancelled before it touched them; checked Android still had native assets index-BBT2b_8i.js and native cleartext flags.
4. Prepare clean local source+APK zip if useful. Exclude data/, .env, node_modules/, build/dist/.gradle caches, test-results/, .openai/.sites-runtime/.impeccable and private/generated files. No zip has been made yet. Add archive pattern to .gitignore if making it.
5. Restart `npm run dev` for user after resuming. It was stopped intentionally when user paused. Do not delete database. Final response should give simple2 commands, localhost link, automaticDB/no signup sample, APK link and USB guide,30+15 test result, email still preview. Never claim physical-device QA or deployment.

## Useful files and tooling

- README.md:judge startup and features; docs/SUBMISSION.md:copy-paste submission run guide (form also needs user's GitHub and short demo recording links later).
- scripts/build-android.mjs, scripts/dev.mjs, scripts/email-preview.mjs.
- tests/browser-scenario.js is an async function expression without trailing semicolon; excluded from Prettier because MCP filename wrapper rejects the semicolon. tests/browser.mjs supplies portable root/base.
- Connected Playwright via discovered tools works. Shell Chromium launch is environment-blocked. Use mcp__playwright__browser_run_code_unsafe filename when needed; its VM does not have process/imports. Avoid logging its full returned test code; parse text before “### Ran Playwright code”.
- No subagents allowed unless user/skill explicitly instructs. None were used.
- Instructions:keep progress updates under60 seconds during work, do not deploy or send messages, no approval questions for already authorised reversible local work.

## Artifact state when pausing

```json
{
  "packagedApkExists": false,
  "gradleApkExists": true
}
```
