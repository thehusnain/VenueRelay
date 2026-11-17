# VenueRelay

**Every team. Every update. One place.**

VenueRelay helps event organisers, volunteers and vendors turn attendee requests into completed work. Share an attendee QR, assign the request, follow progress and confirm the result. Works on phones, tablets and computers, with Home Screen installation and offline task recovery.

[Live demo](https://venuerelay.onrender.com) · [Five-minute walkthrough](docs/DEMO.md) · [Hackathon submission guide](docs/SUBMISSION.md)

## Run locally

Install **Node.js 24** (includes npm) and Git. Then:

```sh
git clone https://github.com/thehusnain/VenueRelay.git
cd VenueRelay
npm install
npm run dev
```

Open **http://127.0.0.1:3001** when the terminal says **VenueRelay is ready**. Choose **Explore the demo** to try the sample event immediately. No account, environment file, database installation, API key or external service is required for the local demo. The local SQLite database is created automatically in `data/` and survives restarts. Stop with **Ctrl+C**.

For your own event, choose **Start your event**. Use the in-app **Step-by-step tutorial** for a short, replayable tutorial with Next, Back and Skip.

## Your first event

1. **Create an event.** Register with a name, username and password. Save your recovery code, then enter the event name, date and place.
2. **Add volunteers.** Open **Your team → Team join links → Create volunteer link**. Send the same link to your volunteers. Each person signs in or creates an account and joins with their own name.
3. **Add vendors.** Choose **Create vendor link** and share it with your vendors. Shared links last seven days and can be disabled or replaced. Use **Invite a teammate** if you prefer a personal, single-use invitation.
4. **Let attendees join.** In **Your team → Share attendee QR**, create the event link. Attendees scan it, request help without signup and save their private tracking link.
5. **Finish the work.** Assign the request to a teammate. They select **Start task**, add the result and **Send for review**. The organiser selects **Confirm it’s done**; the attendee can see the update.

**Waiting to save?** Your change is on this device. Reconnect and let it retry instead of submitting again. **More → Connection help** explains any action that needs review.

## Joining alerts and event history

New volunteers and vendors generate a named update for the organiser. Attendee help requests also appear in Updates; opening the public page alone does not register attendance. Choose **Your team → Enable notification sound** to hear alerts while the app is open and active. Background notifications depend on browser support, permission and server push configuration.

When finished, open **More → My events & history → End this event**. Confirm to keep the event read-only in your account, including tasks, team, programme and history. New joins and attendee requests stop; existing private tracking links still work. Unfinished tasks retain their status. You can open earlier events or reopen one you created from **My events & history**. Reopening restores existing unexpired links unless they were disabled or replaced.

## Install on a phone

Open the HTTPS website on the phone and choose **Install VenueRelay** for device-specific help. On Android, use the browser’s install option. On iPhone or iPad, open in Safari and use **Share → Add to Home Screen**. Launch VenueRelay from its new icon next time. Browser support and wording vary; the website remains usable without installation.

Phone installation, service workers and camera access require trusted **HTTPS**. Computer localhost works for local PWA testing; a phone opening a computer’s plain HTTP network address does not provide the same capabilities. [Installation and offline guide](docs/PWA.md).

## Development and checks

`npm run dev` builds the installable app at **3001** and starts a live frontend editor at **5173**. Use port **5173** while changing UI code; restart `npm run dev` to refresh the built app at **3001**. Use **3001** for offline and installation checks.

| Command | Purpose |
| --- | --- |
| `npm test` | Domain, account, API and recovery checks |
| `npm run build` | Type checking and production frontend build |
| `npm run test:flow` | Browser checks for the event workflow |
| `npm run test:install` | Browser checks for installation guidance |
| `npm run test:tutorial` | Six-step guidance, keyboard access and storage recovery |
| `npm run test:mobile` | Browser checks for mobile interactions |
| `npm run test:team` | Shared joining, notification sound, date fields and event history |

Browser checks require the app running and Playwright Chromium: run `npx playwright install chromium` once. This is optional for contributors; running the application does not require it.

## If something goes wrong

| Problem | What to do |
| --- | --- |
| `npm` is not recognised, or Node version warning | Install Node.js 24, reopen your terminal, then run `npm install`. |
| Dependencies are missing | Run `npm install` from the folder containing `package.json`. |
| Port 3001 or 5173 is already in use | Stop the previous server with Ctrl+C. To choose other ports, add `PORT=3002` and `WEB_PORT=5174` to an optional `.env` file, then use the printed URLs. |
| Page does not open | Wait for the ready message and use its exact app URL. Read any startup error above it. |
| Old installed app still appears | Save pending work, then open **More → Alerts & installation** and apply an available update, or close and reopen the app. |
| A teammate cannot open your local link | `127.0.0.1` refers to your own computer. Use a shared HTTPS deployment for a multi-device event. |

The source includes app code, database migrations, tests, documentation and required assets. Local data, `.env`, dependencies, build output and test reports stay out of Git. Keep real invitation, recovery and attendee tracking links private.

[Deployment](docs/DEPLOYMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Validation and device limits](docs/VALIDATION.md)
