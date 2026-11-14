# Architecture

The existing React 19/TypeScript/Vite frontend and Node.js 24/SQLite backend are retained. The PWA is the website; there is no native client project.

SQLite uses WAL, foreign keys and full synchronous commits. Each operational command validates event membership/role and the expected task version inside a transaction. State, command journal, activity and inbox records commit together. `(actor_id, request_key)` is unique, and a replay must have the same request hash. Immutable journal triggers and the integrity endpoint provide record checks.

## Device storage and sync

IndexedDB stores confirmed snapshots and an outbox scoped by user, event and member. Legacy localStorage intents migrate transactionally with their original IDs; unreadable records retain a raw recovery copy. Legacy records are removed only after IndexedDB commits.

A new action is stored before network submission. IDB read/write transactions prevent concurrent tabs from queuing two pending operations on the same task. Per-intent leases coordinate foreground and service-worker retries. If a worker dies, its lease expires; the original server request key still prevents duplicate effects.

Network/server failures retain work with persistent backoff; 429 respects Retry-After. Conflicts and permission errors require review. Reapplying a conflict atomically replaces it with a new intent based on the latest task version. Account checks and the expected-actor header prevent an old queue from being submitted as a different person.

## Live updates

The same HTTP server accepts authenticated WebSocket upgrades for an event. Origin, session and membership are checked at connection, heartbeat and broadcast. Only invalidation messages are sent; clients fetch the role-filtered snapshot. The client reconnects with backoff and periodically refreshes as a fallback. Commands remain idempotent HTTP requests.

## Offline shell and notifications

Vite builds a module service worker with a precache manifest containing the actual hashed app assets and bundled fonts. Navigation can fall back to the shell. API/auth responses never enter Cache Storage. Browser Background Sync is optional; reconnect/foreground/reopen retries remain available.

Browser push subscriptions belong to the current session and member. Persistent delivery jobs have unique notification/subscription pairs, expiring leases and bounded retries. Existing inbox records remain authoritative. Push delivery is at-least-once under ambiguous failures; stable tags limit duplicate display. External email remains the existing separate leased outbox, with local previews by default.

SQLite supports this small organiser on one persistent server. Multiple independently written replicas, browser storage eviction and loss of the server database require operational planning/backups; this app does not claim distributed disaster recovery.
