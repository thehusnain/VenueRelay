# Deploy on Render

VenueRelay serves the frontend and backend from one Node web service. Keep the existing Render service and MongoDB Atlas database; a second hosting provider or paid email service is unnecessary.

## Update the existing service

In Render, open the service backing **https://venuerelay.onrender.com**. Keep its connected repository, root directory, region and database settings.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Node | `24.x` |

Set the following environment variables. Existing values set directly in Render can override a Blueprint, so check them when updating an existing service.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `API_ONLY` | `false` |
| `APP_ORIGIN` | `https://venuerelay.onrender.com` |
| `ALLOWED_ORIGINS` | `https://venuerelay.onrender.com` |
| `COOKIE_SECURE` | `true` |
| `EMAIL_TRANSPORT` | `disabled` |
| `DEMO_ACCOUNT_ENABLED` | `true` for the public demo |
| `MONGODB_URI` | Keep the existing private Atlas `mongodb+srv://` connection string |
| `MONGODB_DATABASE` | Keep the existing database name |

Render supplies `PORT`. Remove obsolete `VITE_API_URL` and `VITE_WS_URL` overrides if present: this deployment uses same-origin requests and sockets. Never put database credentials in a `VITE_*` variable.

Deploy the reviewed commit on the existing service. `render.yaml` documents the configuration for a new service; do not import it as a second service when you already have VenueRelay running. The existing paid plan is sufficient. No database reset or migration is required for an existing MongoDB deployment: account fields are added when accounts are created or activated.

## Accounts

New staff accounts use a unique username and password. They need no email, OTP or additional provider. Existing email/password accounts continue to work. Private recovery codes replace emailed resets for the normal interface. Public demo accounts cannot use recovery codes. Attendees use a shared event QR/link and a private receipt link; they never register.

Share invitation links or QR codes directly with the intended person. Links expire after 48 hours, are stored hashed and can be accepted by one account. Never post real invitation links publicly.

Browser push has no email or paid provider dependency. At startup, the MongoDB backend creates one VAPID key pair in its private `server_settings` collection if no environment pair was supplied. Concurrent starts reuse the stored pair, and restarts retain it. Only the public key is exposed by the API. Keep this collection in secure database backups. Existing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` settings override the stored pair; `npm run push:keys` remains available for an explicit deployment configuration.

## Check after deployment

```sh
npm run check:deployment -- https://venuerelay.onrender.com
```

Then use a private browser window:

1. Open the home page and choose **Explore the demo**.
2. Create a username/password staff account, save its recovery code and create an empty event.
3. Invite a separate staff account as a volunteer. Assign a task, complete it as the volunteer, then confirm it as the organiser.
4. Open **Saved records** on desktop, or **More → Event tools → Connection help** on a phone. Confirm the record check passes.
5. Queue a task while offline, reload, reconnect and confirm exactly one task appears. Repeat the documented lost-response and conflict tests locally before deployment.
6. Check a phone-sized browser, the team invitation dialog, sign-in errors and keyboard navigation.
7. Share an attendee QR from Your team, submit a request without signing in, and track it through completion. Disable the shared link and confirm the private tracking link still works.
8. Where the browser offers installation, **Install VenueRelay** should open native confirmation. On iPhone/iPad, the installation help should explain Safari → Share → Add to Home Screen. Other browsers should show honest instructions and retain access to the website.

Existing installed clients may finish using an older service worker. Close and reopen the app, or use **More → Help & settings → Alerts & installation → Update VenueRelay and reload** once pending work is saved. Never clear device storage while unsent work is waiting.

## Storage and operations

Production requires MongoDB Atlas with transactions; it refuses temporary SQLite storage. Atlas network access must allow the existing Render service, and the database user needs access to the configured database. Retain the current database and backups.

Health returns a failure when the database is unavailable. Render should send SIGTERM during deploys; the server drains connections and workers before closing the database. Keep one instance with the supplied small-event configuration. Large event scale and backup recovery require separate operational validation.

For an optional local SQLite import, `npm run db:migrate -- /path/to/rally.sqlite` is a read-only dry run. `--apply` requires an empty destination and copies records atomically. It does not merge into a live event database.

Configuration references: [Render Node deployment](https://render.com/docs/deploy-node-express-app), [Blueprints](https://render.com/docs/blueprint-spec), [WebSockets](https://render.com/docs/websocket), [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).
