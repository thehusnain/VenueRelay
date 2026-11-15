# Submission notes

Paste the following into the form’s run guide/notes:

```text
Rally — HS-0130 event coordination website + PWA.

Requires Node.js 24 LTS.
1. Open a terminal in the project folder.
2. npm install
3. npm run dev
4. Open http://127.0.0.1:3001. Choose Sign in, Fill demo, then Sign in.

DEMO ACCOUNT
Email: demo@rally.local
Password: RallyDemo2026!

The verified demo account and sample event are created automatically on a fresh local startup. No registration, email verification, API key or database installation is required for this account. More → Try a different role lets you inspect organiser, volunteer, vendor and attendee views. These are public demo credentials for sample data only. The login page displays them and its fill button does not submit automatically. Real users create an empty event with one short form, invite teammates with specific roles, then add and assign their own tasks.

Suggested journey: attendee requests help → organiser assigns a person → volunteer starts work and submits a result → organiser confirms completion → attendee reads the update. More → Connection help shows waiting changes and can check record integrity.

Rally is one responsive website/installable PWA, not separate Android/iOS apps. Offline work uses Service Workers and IndexedDB; reconnect retries retain request IDs. Browser support affects Background Sync and push; see docs/PWA.md. Browser push is optional and requires VAPID setup and permission. Phone camera/PWA access requires trusted HTTPS.

Interactive API docs: http://127.0.0.1:3001/api/docs
OpenAPI: http://127.0.0.1:3001/api/openapi.json
Tests: npm test
Build: npm run build
Stop: Ctrl+C
```

Use the actual GitHub repository URL in the repository field. If the form asks for a demo video, link a short public recording of the working app and recovery journey; no recording or repository is published automatically.
