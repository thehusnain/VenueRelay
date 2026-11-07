# Five-minute HS-0130 demonstration

Run `npm install`, then `npm run dev`. Open http://127.0.0.1:3001 and choose **Try a sample event**. This choice is explicit; new visitors see the welcome page.

## Follow one request

1. In **More**, preview the attendee role.
2. Choose **Ask for help** and report “Accessible entrance blocked” at “North entrance”. Follow the three steps; Back preserves your answers.
3. Preview the organiser. In **Tasks**, open the request and choose the volunteer Ayesha Khan to handle it.
4. Preview the volunteer. Open the assignment and start working. Report a blocker if needed, resume, then explain the result and submit it for a check.
5. Preview the organiser and confirm the task is done.
6. Preview the attendee. The request is finished and **Updates** shows the result. The attendee cannot assign or finish other people's work.

The sample selector is an owner-only rehearsal. For real collaboration, use separate registered/verified accounts and **Your team → Invite someone**. Share each single-use invitation link with its intended person. Real events do not expose role preview.

## Interrupt the connection

1. As organiser, open **More → Connection help** and pause task updates.
2. Add a task. It stays in **Waiting to save**; saved records are not falsely changed.
3. Reconnect and observe one saved task with one creation entry.
4. Run the record check on the same page. Open its details to see matching commands/history and zero task version or reference mismatches.

For an actual network outage, load the event on port 3001 once, switch the browser offline in developer tools, add a task, reload, then restore connectivity. The cached shell, confirmed snapshot and waiting action survive. The sample pause button is only an app-level rehearsal; the automated browser tests also exercise actual offline controls.

## Show conflicting edits

Open the same organiser event in two tabs. In one tab pause updates and queue an assignment. In the other tab assign that task to someone else. Reconnect the first. The saved owner remains; the waiting change needs review. Choose **Keep saved version** or explicitly **Use my change instead**. A polling refresh while a draft is open does not silently replace the version the draft was based on.

The automated lost-response scenario lets the server commit before aborting its response, then retries the same action. It verifies one task, activity record and set of notifications.

## Show an actual account

Create an account with a valid email domain. Use `npm run email:preview -- EMAIL` to read the private local message. Confirm the link, create an event and show its empty state. Request a password reset, use the latest local message, set a new password and sign back into the same records. External delivery is deferred; the interface says so.

## Show integration readiness

As a verified organiser, open **More → Connect another app**. Create an event key and call the documented snapshot/command API. Revoke it and show access is denied. **More → What changed** offers the activity log and complete event export. API documentation is served at `/api/openapi.json`.

See [validation](VALIDATION.md) for measured results and [mobile instructions](MOBILE.md) for the locally connected app. No public deployment is needed.
