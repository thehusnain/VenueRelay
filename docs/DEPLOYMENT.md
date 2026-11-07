# Future hosting notes

The current handoff runs on localhost only. These notes are optional future work, outside the requested demo.

## Node.js deployment

Rally is a stateful Node.js service. Use a Node/container host with a persistent local volume; do not put its SQLite file on ephemeral serverless storage. Serve the web app and API from the same HTTPS origin when possible.

```sh
docker compose up --build -d
```

The supplied compose file binds to the host loopback interface. Put a TLS reverse proxy in front for remote users, preserve the correct Host header and set `COOKIE_SECURE=true` for HTTPS. Set `ALLOWED_ORIGINS` only if native clients or a separate trusted frontend origin need it. Local development automatically allows the Vite loopback origin; production does not.

Runtime variables:

| Variable          | Default             | Purpose                                             |
| ----------------- | ------------------- | --------------------------------------------------- |
| `PORT`            | `3001`              | HTTP port                                           |
| `HOST`            | `127.0.0.1`         | Listen address (`0.0.0.0` in container)             |
| `DATABASE_PATH`   | `data/rally.sqlite` | Persistent database file                            |
| `COOKIE_SECURE`   | `false`             | Set `true` behind HTTPS                             |
| `ALLOWED_ORIGINS` | Empty in production | Exact comma-separated additional origins            |
| `NODE_ENV`        | Development         | Production disables automatic Vite-origin allowance |

`npm run dev` and `npm start` load an optional `.env` using Node’s `--env-file-if-exists` option. A direct Node invocation or container still needs explicit configuration. The `.env.example` documents names without containing secrets.

The checked-in migration is applied with idempotent schema creation on startup. Later schema versions must be explicit additive migrations with a tested upgrade path; do not alter an already deployed schema in place. Domain commands are serialised by SQLite transactions; one persistent deployment is the intended operating model.

## Backups and recovery

Back up the SQLite database using SQLite’s online backup facility or stop the service before copying the database and its WAL/SHM files together. A live copy of only `rally.sqlite` can omit committed WAL records. Keep encrypted off-host backups and test restore on a separate instance. Restoring also restores sessions, invitations, integration token hashes and request deduplication history. Do not restore just the tasks table without its journal.

`GET /api/health` confirms the process is reachable. The organiser’s integrity endpoint checks record relationships; it does not replace backup/restore monitoring. Persist and monitor process errors without logging request credentials or passwords.

## Hosting status

No external Node deployment has been made. A private Sites project was reserved during initial setup, but its Worker runtime cannot host this Node process unchanged. The container and local production build are the concrete deployment artifacts. Choose an actual Node host and persistent disk before attaching a public domain or building native clients against a production API URL.

The Dockerfile/compose configuration is provided for deployment; a successful container build is not claimed unless recorded in `VALIDATION.md`.
