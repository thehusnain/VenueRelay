<div align="center">
  <img src="frontend/public/favicon.svg" alt="VenueRelay" width="72" height="72">

  # VenueRelay

  **Every team. Every update. One place.**

  An event workspace that turns attendee requests into coordinated, completed work.

  <a href="https://venuerelay.onrender.com">Open the demo</a>

  <br>

  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Progressive web app" src="https://img.shields.io/badge/Progressive%20Web%20App-Installable-5A8F7B?logo=pwa&logoColor=white">
</div>

<br>

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="VenueRelay event workspace on desktop" width="880">
</p>

## What it does

- **Keeps the whole team coordinated.** Organisers, volunteers and vendors each have a clear role.
- **Turns requests into owned work.** Attendees can request help from a QR code without creating an account. Staff can assign, track and review the work.
- **Keeps event information together.** Share the programme, receive team updates, and find live, upcoming and past events.
- **Works well on phones.** Install VenueRelay from the browser and continue with cached event details when the connection drops.

<details>
  <summary><strong>More screenshots</strong></summary>
  <br>

  <img src="docs/screenshots/mobile.png" alt="VenueRelay on a phone" width="340">
  <img src="docs/screenshots/mobile-task.png" alt="Focused task creation on a phone" width="340">
  <img src="docs/screenshots/event-history.png" alt="Live, upcoming and past events" width="760">
  <img src="docs/screenshots/tutorial.png" alt="VenueRelay step-by-step tutorial" width="560">
  <img src="docs/screenshots/attendee-form.png" alt="No-account attendee help request" width="340">
</details>

## Run locally

Install [Node.js 24](https://nodejs.org/) and Git. Then:

~~~sh
git clone https://github.com/thehusnain/VenueRelay.git
cd VenueRelay
npm install
npm run dev
~~~

Open **http://127.0.0.1:3001** when the terminal says **VenueRelay is ready**. Choose **Explore the demo** to start right away. The local SQLite database is created automatically; no environment file or external service is needed. Press **Ctrl+C** to stop.
