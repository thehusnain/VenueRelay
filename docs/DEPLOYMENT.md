# Deploy VenueRelay

Every Team. Every Update. One Place.

This setup uses your existing accounts: **Vercel for the website/PWA, one Render service for Node.js and WebSockets, and MongoDB Atlas Free for records**. The repository prepares these services; it does not create resources or spend credits automatically. Check the paid Render plan and your credit balance before creating the service.

## 1. Create Atlas storage

1. Create a **Free** cluster in MongoDB Atlas. Choose a region close to the Render region you will use.
2. Under Database Access, create a dedicated database user with read/write access to the `rally` database. Keep its password private; this is different from your Atlas website login.
3. Choose **Connect → Drivers → Node.js**. Copy the `mongodb+srv://…` connection string, inserting the database user's credentials. Percent-encode special characters in the password as Atlas instructs. Keep TLS enabled.
4. In Atlas Network Access, allow the outbound IP ranges shown on your Render service's **Connect → Outbound** panel. You can add these after creating the Render service. Do not make unrestricted access the permanent setup. Add your own IP only if running the optional migration from your laptop.

The app creates collections and unique indexes at startup and requires replica-set transactions. Atlas Free supports this. Do not run production against standalone MongoDB or a local SQLite file on Render's temporary filesystem.

## 2. Create the Render API

Push this repository to GitHub, then in Render choose **New → Blueprint**, connect the repository and use the root `render.yaml`. The blueprint requests one `0.5c-512mb` Node web service with `/api/health` as its health check. Review its displayed cost before creating it. No Render database or persistent disk is required.

Use the repository root. The blueprint supplies the build/start commands and Node 24 version. Supply the requested environment variables privately in Render:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Your private Atlas connection string |
| `MONGODB_DATABASE` | `rally` |
| `APP_ORIGIN` | Your intended Vercel production origin, for example `https://your-project.vercel.app` |
| `ALLOWED_ORIGINS` | That same origin; comma-separated exact origins if you add a custom domain |

The blueprint also sets `NODE_ENV=production`, `HOST=0.0.0.0`, `API_ONLY=true`, `COOKIE_SECURE=true`, `DEMO_ACCOUNT_ENABLED=true` and `EMAIL_TRANSPORT=disabled`. Render supplies `PORT`. Keep preview deployments away from real records: do not wildcard all `*.vercel.app` origins.

You can reserve the Vercel project name before its first successful build. Once both services exist, check the actual Vercel production domain and correct `APP_ORIGIN`/`ALLOWED_ORIGINS` in Render if necessary. A temporary wrong origin can let the service start but sign-in/live tickets will not work until corrected.

Add Render's outbound IP ranges to Atlas and deploy/redeploy. Open the Render URL followed by `/api/health`. A healthy response includes:

```json
{"status":"ok","storage":"mongodb"}
```

Record the public Render origin, such as `https://your-api.onrender.com`. If startup fails, check Atlas network access, database-user permissions and the private URI in Render. The server refuses to fall back to local storage in production.

## 3. Create the Vercel website

1. Import the same GitHub repository into Vercel. Keep **Root Directory** at the repository root and **Framework Preset** as **Other**.
2. Use Node.js **24.x**. The root `vercel.json` selects `npm ci` and `npm run build:vercel`. Leave the Output Directory override **off**; the build emits Vercel's `.vercel/output` format.
3. Set **`RENDER_API_URL`** to the public Render HTTPS origin, without `/api`, paths, credentials or query strings. This is public routing information.
4. Deploy. Do not add `MONGODB_URI`, SMTP passwords or VAPID private keys to Vercel or any `VITE_*` variable.
5. Correct Render's `APP_ORIGIN` and `ALLOWED_ORIGINS` to the final Vercel production origin, then redeploy Render.

HTTP `/api/*` requests are proxied from the website to Render. The host-only HttpOnly cookie belongs to the website, so sign-in works without third-party cookies. WebSockets connect directly to Render with 30-second, one-use tickets issued through the authenticated proxy. Session tokens never enter WebSocket URLs. Fonts and the offline shell are bundled locally.

Changing `RENDER_API_URL` requires a new Vercel build. Changing Render environment variables requires a Render redeploy. A new custom domain also needs updating Render's origin settings and email links.

## 4. Judge access and real accounts

The public sample account is enabled by the blueprint:

```text
Email: demo@rally.local
Password: RallyDemo2026!
```

These established demo credentials remain compatible with earlier versions; the product is VenueRelay. Choose **Sign in → Fill demo → Sign in**. The MongoDB backend prevents this shared demo account from creating or joining real events. Demo role previews only work in its sample event. Other accounts create their own empty events after verification. Disable demo seeding with `DEMO_ACCOUNT_ENABLED=false` before the first startup if you do not want judge access; changing this flag later does not delete an existing account.

Copy these credentials and the deployed website URL into the submission notes in [SUBMISSION.md](SUBMISSION.md). Do not share an Atlas URI or a real organiser's password.

### Enable registration and password recovery

**Public registration and password recovery require a configured mail provider.** For Render Free, use the Brevo HTTPS transport rather than the blocked standard SMTP ports. Brevo documents a free plan with 300 daily sends; provider account approval, sender verification and quotas still apply.

1. Use Brevo’s **Free** plan. Under Settings → Senders, Domains, IPs → Senders, add your sender and complete its verification code. Follow any additional sending-access requirements shown by Brevo; domain authentication improves deliverability.
2. Under SMTP & API → API Keys & MCP, create an **API key**, not an SMTP key. Do not share it in chat or commit it.
3. Add these privately in Render → Environment:

| Variable | Value |
| --- | --- |
| `EMAIL_TRANSPORT` | `brevo` |
| `BREVO_API_KEY` | Your private Brevo API key |
| `EMAIL_FROM` | `VenueRelay <YOUR_VERIFIED_SENDER_EMAIL>` |
| `APP_ORIGIN` | Your real public HTTPS website origin, without a page path |

Save and redeploy the updated code. No SMTP host, port or Gmail App Password is used for this transport. API requests use HTTPS with a timeout and fixed provider endpoint; redirecting the private key is disallowed. The existing leased outbox retains failed/unconfirmed messages, respects provider Retry-After, and reuses the same UUID as its provider idempotency key. Brevo’s documented deduplication window is 30 minutes; provider acceptance is not a guarantee of inbox delivery. Its free-tier queue can delay mail after the daily cap, potentially past verification-link expiry. Request a fresh link after sending capacity returns rather than disabling verification.

After deploying, register using an address you control, confirm that Brevo accepts the transaction in its logs, receive the message, open its single-use link, and create your empty event. Then test Forgot password with the same real inbox. These external delivery checks require your account credentials and have not been performed by the repository tests.

If you have already registered but have not received a link, sign in and use **Send another email** after configuring delivery. Keep ownership verification enabled.

Provider references: [Free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [sender verification](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email), [transactional email API](https://developers.brevo.com/reference/send-transac-email), [idempotency window](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

### SMTP on a compatible host

The existing SMTP transport remains available. Gmail SMTP with an App Password requires Google 2-Step Verification and a host permitting its SMTP ports; Render Free blocks 465/587. Configure the following only for an accessible provider endpoint:


| Variable | Value |
| --- | --- |
| `EMAIL_TRANSPORT` | `smtp` |
| `EMAIL_FROM` | A sender verified by your mail provider |
| `SMTP_HOST` | Your provider's SMTP hostname |
| `SMTP_PORT` | Usually `587` for STARTTLS or `465` for TLS; use the provider's value |
| `SMTP_SECURE` | `false` for STARTTLS, `true` for TLS |
| `SMTP_USER` | Provider username |
| `SMTP_PASSWORD` | Provider SMTP credential |

Redeploy Render and test signup → verification → empty event → invite → teammate signup/join → assign a task. Use Render/provider logs if a message does not arrive. Expired/used verification links require a new message. Production forbids local preview emails. Real addresses are syntax/domain-checked; only the emailed single-use link proves ownership.

### Optional browser push

Run `npm run push:keys` once and save the resulting `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:YOUR_CONTACT_EMAIL` privately on Render. Keep the same keys across deployments. The public key is supplied to the browser by the API. Users opt in through **More → Install VenueRelay & notifications**. In-app updates remain available without push.

On iPhone, open the HTTPS website in Safari, choose **Share → Add to Home Screen**, then launch it from the Home Screen. On supported iOS versions, installed web apps can request push permission after a user action. No App Store installation is needed. Verify the camera and notifications on the actual phones you will demonstrate.

## 5. Verify before sharing

```sh
npm run check:deployment -- https://YOUR_VERCEL_DOMAIN
```

This checks the public API proxy, MongoDB health, OpenAPI, manifest, service worker and sign-in deep link. Then complete these browser checks:

1. Sign in with the demo, switch between attendee/organiser/volunteer/vendor views and confirm tasks remain role-filtered.
2. Install on your phone. Visit the event once online, then disable network access. Submit a task and reload: it must remain waiting on the device.
3. Reconnect and reopen the app. Confirm exactly one saved task and an empty waiting queue. **More → Connection help → Check records** must report matching commands/activity and no task-version mismatches.
4. Open the same event on a second device. Change a task and confirm the other device updates. Stop/restart Render: the client should reconnect/refetch and records should persist.
5. Start editing an assignment, change it from the other device, then submit the original draft. It must request conflict review instead of silently overwriting the newer owner.
6. Test a real invited teammate after configuring email, plus camera-denied and notification-denied fallbacks.

The cloud services and physical phone behaviour must be checked after deployment. Local integration tests use a real disposable MongoDB replica set, not your Atlas cluster:

```sh
npm test
npm run test:mongo
npm run build
```

The MongoDB suite downloads a MongoDB binary on its first run and covers concurrency, lost acknowledgements, transaction rollback, membership/privacy, single-use invites/tickets, session revocation, mail/push retries and migration.

## Optional: move existing local records

A new deployment starts empty apart from the public demo. If you need your local records, stop local writes and the Render service first, back up `data/`, choose an **empty destination database name**, and put `MONGODB_URI`/`MONGODB_DATABASE` only in a private local `.env`:

```sh
npm run db:migrate -- ./data/rally.sqlite
npm run db:migrate -- ./data/rally.sqlite --apply
```

The first command reports counts without copying records. The second copies records in one MongoDB transaction and refuses a populated destination. It preserves IDs, password hashes, ownership, command keys, history and in-app notifications. It never changes the source SQLite file. Sessions, pending verification/reset tokens, mail jobs and push subscriptions are intentionally excluded; users sign in again and request fresh links. Point Render at the migrated database and restart it, then check integrity. Do not automatically migrate the disposable judge/sample database into real event storage.

## Operating limits

Use **one Render instance** for this setup. Live invalidations are process-local; clients also refetch every 60 seconds while live and every 10 seconds when the socket is unavailable. Offline work retries on reconnect, foreground/reopen and optional browser Background Sync. Data mutations are transactional and idempotent across process restarts; external email/push delivery can repeat after an ambiguous provider response, with stable identifiers/tags to limit duplicate presentation.

Atlas Free has finite storage, connections and throughput. Keep the connection pool small (currently 10), monitor usage and use synthetic data for public judging. Enable the backup options offered by your cluster and practice restoring separately; exported event JSON is not a full account/database backup. Do not promise unlimited event traffic or multi-region disaster recovery on this setup. Keep your Render credits and billing alerts under review; the repository does not enforce a spending cap.

Configuration references: [Vercel Build Output API](https://vercel.com/docs/build-output-api), [Vercel routing](https://vercel.com/docs/build-output-api/configuration), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render WebSockets](https://render.com/docs/websocket), [MongoDB transaction rules](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).


## Atlas startup errors

A failed startup reports a fixed, credential-free category: `MONGODB_AUTH` (database username/password, password encoding or authSource), `MONGODB_PERMISSIONS` (grant readWrite on the configured database), `MONGODB_URI_FORMAT` (malformed driver URI), `MONGODB_DNS` (hostname/active cluster), `MONGODB_TLS` (encrypted connection/certificates), or `MONGODB_NETWORK` (connectivity/access list). These are diagnostic categories, not confirmation of an individual account problem. The app does not print raw MongoDB errors or connection credentials.

Use the Atlas **Database User** password, not the Atlas website-login password. Passwords with reserved URI characters must be percent-encoded once; do not leave `<db_password>` or its angle brackets in the value. Atlas SCRAM users authenticate against `admin`; `MONGODB_DATABASE=rally` selects the application database independently. Verify the configured user's readWrite access to that database. See [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).
