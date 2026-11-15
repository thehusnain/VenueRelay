# Submission notes

Paste the following into the form’s run guide/notes:

```text
VenueRelay — Every Team. Every Update. One Place.
HS-0130 event coordination website + PWA.

Requires Node.js 24 LTS.
1. Open a terminal in the project folder.
2. npm install
3. npm run dev
4. Open http://127.0.0.1:3001. Choose Explore the demo.

DEMO ACCOUNT
Email: demo@rally.local
Password: RallyDemo2026!

The verified demo account and sample event are created automatically on a fresh local startup. No registration, email verification, API key or database installation is required for this account. More → Try a different role lets you inspect organiser, volunteer, vendor and attendee views. These are public demo credentials for sample data only. Open demo event signs in directly; optional credentials remain available under View demo credentials. Staff use username/password accounts, create an empty event, and invite teammates with specific roles. Attendees scan a shared QR, submit without signup, and keep a private tracking link.

Suggested journey: attendee requests help → organiser assigns a person → volunteer starts work and submits a result → organiser confirms completion → attendee reads the update. More → Connection help shows waiting changes and can check record integrity.

VenueRelay is one responsive website/installable PWA, not separate Android/iOS apps. Offline work uses Service Workers and IndexedDB; reconnect retries retain request IDs. Browser support affects Background Sync and push; see docs/PWA.md. Browser push is optional and requires VAPID setup and permission. Phone camera/PWA access requires trusted HTTPS.

Interactive API docs: http://127.0.0.1:3001/api/docs
OpenAPI: http://127.0.0.1:3001/api/openapi.json
Tests: npm test
Build: npm run build
Stop: Ctrl+C
```

Repository: https://github.com/thehusnain/VenueRelay. If the form asks for a demo video, link a short public recording of the working app and recovery journey; a demo recording is not included in this repository.

Hosted judging URL: **https://venuerelay.onrender.com**. Choose Explore the demo or use the credentials above. The Render blueprint explicitly enables the demo account. Setup: [DEPLOYMENT.md](DEPLOYMENT.md). The service already exists; updates must be deployed to it.
