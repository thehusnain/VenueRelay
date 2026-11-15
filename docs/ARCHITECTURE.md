# Architecture

The React 19/TypeScript/Vite frontend and Node.js 24 HTTP API are retained. Hosted records use the native MongoDB driver with Atlas; the automatic local demo keeps its SQLite adapter. Both adapters share the task validation/transition engine and sample generator. The PWA is the website; there is no native client project.

SQLite uses WAL, foreign keys and full synchronous commits. Each operational command validates event membership/role and the expected task version inside a transaction. State, command journal, activity and inbox records commit together. `(actor_id, request_key)` is unique, and a replay must have the same request hash. Immutable journal triggers and the integrity endpoint provide record checks.

MongoDB uses snapshot/majority transactions and unique command/request indexes. State, history and notifications commit together; task updates compare versions and driver transaction retries recheck the current version. Commands, activity and account history are append-only through the application storage boundary. Atlas administrators retain direct database access. This is an operational activity log, not a cryptographically tamper-proof ledger.

## Hosting

One Render Node process serves the built website, PWA assets, HTTP API, WebSockets and leased optional mail/push workers. Browser requests use the same origin. Production startup requires an Atlas URI, HTTPS origins and secure cookies; it cannot silently use temporary SQLite storage. Mongo indexes are created at startup. Health checks ping the database. SIGTERM stops sockets/workers and drains requests before closing the connection pool.

HTTP auth cookies are host-only, HttpOnly and SameSite=Lax; the proxy keeps them first-party. Direct cross-origin WebSocket connections use a 30-second one-use ticket stored hashed in MongoDB, bound to origin/event/persona/session. The server consumes it atomically and rechecks membership/session. A reconnect always requests a new ticket. No session credentials enter WebSocket URLs. Exact origin allowlists and API body limits remain in force.

The public demo account is explicitly enabled on Render, flagged as demo and denied real-event creation/joining. Authenticated real accounts create empty events. Staff register with a username and password and use private recovery codes. Attendees submit through shared QR links without accounts. Email is optional for legacy integrations.

## Device storage and sync

IndexedDB stores confirmed snapshots and an outbox scoped by user, event and member. Legacy localStorage intents migrate transactionally with their original IDs; unreadable records retain a raw recovery copy. Legacy records are removed only after IndexedDB commits.

A new action is stored before network submission. IDB read/write transactions prevent concurrent tabs from queuing two pending operations on the same task. Per-intent leases coordinate foreground and service-worker retries. If a worker dies, its lease expires; the original server request key still prevents duplicate effects.

Network/server failures retain work with persistent backoff; 429 respects Retry-After. Conflicts and permission errors require review. Reapplying a conflict atomically replaces it with a new intent based on the latest task version. Account checks and the expected-actor header prevent an old queue from being submitted as a different person.

## Live updates

The same HTTP server accepts authenticated WebSocket upgrades for an event. Origin, session and membership are checked at connection; heartbeat and account changes revoke invalid sessions. Invalidation messages carry no event records. Only invalidation messages are sent; clients fetch the role-filtered snapshot. The client reconnects with backoff and refetches every 60 seconds while live or every 10 seconds without a socket. Invalidation delivery is process-local; this deployment uses one Render instance. Commands remain idempotent HTTP requests.

## Offline shell and notifications

Vite builds a module service worker with a precache manifest containing the actual hashed app assets and bundled fonts. Navigation can fall back to the shell. API/auth responses never enter Cache Storage. Browser Background Sync is optional; reconnect/foreground/reopen retries remain available.

Browser push subscriptions belong to the current session and member. Persistent delivery jobs have unique notification/subscription pairs, expiring leases and bounded retries. Existing inbox records remain authoritative. Push delivery is at-least-once under ambiguous failures; stable tags limit duplicate display. External email remains the existing separate leased outbox, disabled by default; local preview mode is available for email tests.

MongoDB Atlas provides durable hosted storage independently of Render process restarts. Local SQLite remains on the developer’s disk. Browser storage eviction, provider outages, capacity and database restoration still require operational planning; this app does not claim unlimited capacity or distributed disaster recovery. See DEPLOYMENT.md for setup, limits and optional read-only-source migration.


## Account-free attendee entry

Staff accounts have an optional, unique normalised username; legacy email accounts remain supported. Attendees do not create users or sessions. A reusable, revocable event capability permits only public help metadata and request creation. Each request creates a lightweight attendee member for reporter/audit references, with a `guest:` user reference that cannot authenticate. A separate hashed receipt capability grants read-only access to one request. Submission and receipt creation share the same transaction as task, journal and notifications. Shared-link revocation does not remove receipts. Guest reporters are excluded from the staff roster and broadcast notification fanout. Public entry is rate limited.
