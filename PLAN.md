# HS-0130 · Rally

## Problem and journey

A request such as “the accessible entrance is blocked” disappears among event chat messages. Rally gives it an owner, shows its progress to the reporter, and records the checked outcome.

Attendee reports → organiser assigns → volunteer/vendor works, flags blockers and describes the result → organiser confirms → reporter receives an update. Accepted changes commit with their activity and notifications, with retry protection and version checks.

## Completed

- Node.js 24 backend, automatic local SQLite and versioned migrations.
- Server-enforced roles, event isolation and account-bound invitations.
- Guided welcome, account confirmation, empty event setup, task creation and task details.
- Email validation, durable confirmation/reset outbox, private preview mode and recoverable sessions.
- Simplified Home, Tasks, Event plan and Your team, with advanced tools under More.
- Durable inbox, immutable history, complete export and live integrity check.
- Per-person offline queue, actual offline reload, lost-response retry and reviewed conflicts.
- 22-operation documented API and revocable integration keys.
- Two-command judge startup without external services.
- Installable PWA and Capacitor Android/iOS projects.
- 30 backend/API tests, 15 production-browser checks and recorded HCI/accessibility evidence.

## Current handoff

Localhost only. Android debug packaging and USB forwarding are documented in docs/MOBILE.md. External email delivery is intentionally deferred. Native device testing, external SMTP, iOS compilation and store publication are later work. Deployment is outside the requested scope.

The user prioritised understandable static UI. Decorative 3D scenes and motion-video backgrounds are not part of the working interface. Clean typography, responsive layout, familiar language and recoverable actions carry the experience.
