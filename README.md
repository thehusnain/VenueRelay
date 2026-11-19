# VenueRelay

At a busy festival, a visitor can tell someone the step-free entrance is blocked and still have no way to know who is clearing it. VenueRelay gives the visitor a private tracking link, gives one crew member the job, and asks the organiser to check the result.

**[Open the live demo](https://venuerelay.onrender.com/sign-in)**

| Demo account | Sign-in details |
| --- | --- |
| Username | `demo@rally.local` |
| Password | `RallyDemo2026!` |
| Event | Riverside Makers Festival |

### Follow one request

1. **At the organiser’s desk**, sign in and choose **Share attendee QR** on Home or under **Your team**. Choose **Create attendee QR & link**, then open the link in a private window to use it as a visitor.
2. **As the visitor**, report “Crate blocking the step-free entrance” at the north gate. Keep the private tracking page open.
3. **Back at the desk**, open the new request in **Tasks** and assign it to **Ayesha Khan**. In the sample event, use **More → Try a different role** to view her work as a volunteer. Choose **Start task**, then **This task is done**, describe the cleared entrance and send the result for review.
4. **As the organiser**, open the same task and choose **Confirm it’s done**. In the visitor window, choose **Check for updates** to see **Finished**. Home now counts the request as confirmed. A task awaiting review still counts as open.

The public account shares sample data across visitors. For a separate event with your own crew, choose **Start your event** and invite volunteers and vendors with role-specific links.

![Organiser view of the sample festival, including work awaiting assignment or review](docs/screenshots/desktop.png)

[Phone workspace](docs/screenshots/mobile.png) · [Attendee request form](docs/screenshots/attendee-form.png) · [Task on a phone](docs/screenshots/mobile-task.png) · [Event history](docs/screenshots/event-history.png) · [Tutorial](docs/screenshots/tutorial.png)

### When the venue loses connectivity

Open the event online once. On **More → Event tools → Connection help**, pause task updates, add a task and reconnect. Watch the waiting action become one saved task. The browser keeps a pending action in IndexedDB, and the server uses its original request ID to recognise a retry. If two people edit the same task version, the second edit goes back for review.

### Run locally

Use Node.js 24 and Git.

```sh
git clone https://github.com/thehusnain/VenueRelay.git
cd VenueRelay
npm ci
npm run dev
```

When the terminal prints **VenueRelay is ready**, open **http://127.0.0.1:3001** and choose **Explore the demo**. The app creates its SQLite database and sample festival on first start. Press Ctrl+C to stop. To type-check and build the production frontend, run `npm run build`.

### How it runs

React and TypeScript power the installable web app. The Node.js API checks event membership and role on every operational command. Hosted events use MongoDB transactions so a task change, its history and its notifications commit together. WebSocket messages tell connected devices when to refresh their role-specific view.

The deployment runs one application instance. Moving to multiple instances would require sharing live-update notifications across servers. The organiser’s attendee-request counts come from saved event records and can be used during a pilot to see how much visitor work remains open at closing time.

[Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [API](docs/API.md) · [Mobile installation](docs/PWA.md)
