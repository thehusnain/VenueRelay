# Judge run guide

Paste the following into the submission form's **How to run it** field:

```text
Prerequisite: Node.js 24 LTS (includes npm).
1. Clone the submitted repository and open a terminal in the rally project folder.
2. Run: npm install
3. Run: npm run dev
4. Open http://127.0.0.1:3001 and choose “Try a sample event”.

No database installation, Docker, API key or email service is needed. A local SQLite file is created automatically and survives restarts. The sample is explicitly labelled; use More → Try a different role to try organiser, volunteer, vendor and attendee.

Suggested journey: attendee reports a request → organiser assigns it → volunteer starts work and submits the result → organiser checks and finishes it → attendee sees the update. More → Connection help provides an app-level connection rehearsal and live record check. See docs/DEMO.md and docs/VALIDATION.md for actual offline, retry and conflicting-edit test evidence.

For real account setup, use a valid email address. External delivery is deferred: run “npm run email:preview -- YOUR_EMAIL” to read the private local confirmation message, open its link, confirm and create an empty event. No email is sent outside this computer.

To check the backend: npm test. To build: npm run build. API: http://127.0.0.1:3001/api/openapi.json. Android/PWA instructions: docs/MOBILE.md. Stop with Ctrl+C.
```

## Project links

The form shown asks for a GitHub repository URL and a short public demo video URL. Use the repository containing this source and a recording of the working local app. Neither a deployed site nor motion-video content inside the app is necessary. No repository or recording has been published automatically.

For the recording, show the welcome screen, the role journey, a connection interruption/recovery, the resulting history and the live record check. Keep the app visible and explain the actions in ordinary language.
