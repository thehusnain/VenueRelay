# Hackathon submission guide

## Project summary

**VenueRelay — Every team. Every update. One place.**

An event coordination workspace for organisers, volunteers, vendors and attendees. An attendee scans a QR and requests help; the organiser assigns it; a teammate completes it; the organiser confirms the result. The attendee follows progress through a private link without creating an account.

The application combines role-based access, live updates, mobile Home Screen installation and offline task recovery. Retried actions keep their original request IDs to avoid duplicate work. Human-readable statuses, a short guided tutorial and accessible responsive controls keep the workflow understandable during a busy event.

Repository: https://github.com/thehusnain/VenueRelay

Demo: https://venuerelay.onrender.com

Problem statement reference: **HS-0130**. Confirm this matches the category selected in the submission form.

## Paste into the run instructions

```text
Requires Node.js 24 and Git.

git clone https://github.com/thehusnain/VenueRelay.git
cd VenueRelay
npm install
npm run dev

Open http://127.0.0.1:3001 after “VenueRelay is ready”.
Choose Explore the demo. No account, .env, API key, external service
or database installation is needed. Stop both servers with Ctrl+C.

The local database and sample event are created automatically.
For your own event, choose Start your event and follow the Step-by-step tutorial.

Checks: npm test
Type check and build: npm run build
API explorer: http://127.0.0.1:3001/api/docs
```

## A five-minute presentation

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:30 | Welcome screen and Step-by-step tutorial | A clear path from an attendee request to a checked result. |
| 0:30–1:15 | Sample event, team and invitations | Organiser, volunteer and vendor permissions; reusable role links and optional personal invitations. |
| 1:15–2:30 | Attendee QR in a private window | Submit without signup, save the tracking link, then assign the request. |
| 2:30–3:30 | Volunteer starts work; organiser confirms | A result is checked before it is marked finished. |
| 3:30–4:15 | Connection help: pause, add a task, reconnect | Waiting work is visible and the action is saved once. |
| 4:15–5:00 | Focused mobile task form, My events & history, installation guidance | Less distraction, Live/Upcoming/Past filters, retained event records and Home Screen access. |

Use **More → Try a different role** in the sample event for a single-presenter rehearsal. For genuine collaboration, open separate staff accounts and accept their invitations. A detailed script is in [DEMO.md](DEMO.md).

Optional public sample credentials: `demo@rally.local` / `RallyDemo2026!`. These access sample data only; the **Explore the demo** button is simpler.

## Screenshots

[Desktop workspace](screenshots/desktop.png) · [Phone workspace](screenshots/mobile.png) · [Focused task form](screenshots/mobile-task.png) · [Event history](screenshots/event-history.png) · [First-user tutorial](screenshots/tutorial.png) · [Attendee help](screenshots/attendee-form.png)

These captures show the local revision checked on 17 November 2026, using sample data and illustrative local events. The event-history screenshot includes today’s, upcoming and ended events.

## Submission checklist

- Run the clone/install/dev instructions from a clean folder.
- Run `npm test` and `npm run build`; record the result in [VALIDATION.md](VALIDATION.md).
- Verify the live demo URL before submitting it and deploy the final changes if needed.
- Record a short video following the sequence above; a recording is not included in this repository.
- Use current screenshots showing desktop, mobile and attendee entry.
- Add the actual team names, event/category and video URL required by the hackathon form.
- Check the event’s rules, deadline and required declarations. The repository does not establish eligibility or submit the form.

## Scope and limitations

VenueRelay is a responsive web app/PWA. Installation varies by browser; it is not an App Store or Play Store package. Phones need trusted HTTPS for full PWA/camera features. The local demo runs on one computer; shared phone access requires an HTTPS deployment. Browser push is optional and requires support, server configuration and permission. Open the event online once before relying on the cached shell and saved workspace offline; registration and invitations need a connection.

The project contains automated API and browser checks, but emulation does not certify every physical device. Keep actual device results separate from automated results. See [PWA.md](PWA.md), [VALIDATION.md](VALIDATION.md) and [DEPLOYMENT.md](DEPLOYMENT.md).
