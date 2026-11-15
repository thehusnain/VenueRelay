# VenueRelay

Manage event requests and team tasks in one place.

**[Open VenueRelay](https://venuerelay.onrender.com)** · [Full guide](docs/DEMO.md)

Choose **Explore the demo** to try it without an account.

## How it works

1. **Create an event.** Sign up with a username and password, save your recovery code, then enter the event details. No email needed.
2. **Invite staff.** Open **Your team → Invite a teammate**. Choose Volunteer or Vendor and share their personal invitation link.
3. **Share the attendee QR.** Visitors scan it to request help without signing up. Each request has a private tracking link.
4. **Complete the work.** The organiser assigns a task. The teammate starts it, adds the result and selects **Send for review**. The organiser checks it and selects **Confirm it’s done**.

**Waiting for confirmation?** Your change is saved on this device. Let it reconnect rather than submitting again. Use **More → Connection help** if it needs review.

## Updates and alerts

The **Updates** bell opens task updates. **More → Alerts & installation** controls sound and browser notifications.

On iPhone, background notifications require the Home Screen app and permission. Installation and sound follow your browser and phone settings.

## Run locally

Requires Node.js 24.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3001**. The local database is created automatically.

[Deployment](docs/DEPLOYMENT.md) · [API](docs/API.md) · [Validation](docs/VALIDATION.md)
