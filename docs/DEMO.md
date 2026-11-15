# Five-minute HS-0130 demonstration

Run `npm install`, then `npm run dev`. Open http://127.0.0.1:3001 and choose **Explore the demo**. A separate Sign in page also offers Open demo event and optional public credentials. The sample guide explains the community festival, your current role and a first task to try.

## Follow one request

1. In **More**, preview the attendee role.
2. Choose **Ask for help** and report “Accessible entrance blocked” at “North entrance”. Follow the three steps; Back preserves your answers.
3. Preview the organiser. In **Tasks**, open the request and choose the volunteer Ayesha Khan to handle it.
4. Preview the volunteer. Open the assignment and start working. Report a blocker if needed, resume, then explain the result and submit it for a check.
5. Preview the organiser and confirm the task is done.
6. Preview the attendee. The request is finished and **Updates** shows the result. The attendee cannot assign or finish other people's work.

The sample selector is an owner-only rehearsal. For real collaboration, use separate registered accounts and **Your team → Invite someone**. Share each single-use invitation link with its intended person. Real events do not expose role preview.

## Interrupt the connection

1. As organiser, open **More → Connection help** and pause task updates.
2. Add a task. It stays in **Waiting to save**; saved records are not falsely changed.
3. Reconnect and observe one saved task with one creation entry.
4. Run the record check on the same page. Open its details to see matching commands/history and zero task version or reference mismatches.

For an actual network outage, load the event on port 3001 once, switch the browser offline in developer tools, add a task, reload, then restore connectivity. The cached shell, confirmed snapshot and waiting action survive. The sample pause button is only an app-level rehearsal; the automated browser tests also exercise actual offline controls.

## Show conflicting edits

Sign in to the documented demo account in two separate browser profiles (for example, a regular and a private window). Open the same organiser event in both. Tabs in one profile deliberately share an outbox and block a second pending operation on the same task. In one tab pause updates and queue an assignment. In the other tab assign that task to someone else. Reconnect the first. The saved owner remains; the waiting change needs review. Choose **Keep saved version** or explicitly **Use my change instead**. A polling refresh while a draft is open does not silently replace the version the draft was based on.

The automated lost-response scenario lets the server commit before aborting its response, then retries the same action. It verifies one task, activity record and set of notifications.

## Show an actual account

Create a staff account with your name, username and password. Save the recovery code and continue. Add the event name, date and place in one form. The event starts with no sample work and only its organiser. Invite a teammate, choose a role, and share the secret link or QR code directly. The recipient signs up with their own account and accepts the invitation. Assign a task, complete it as the teammate and confirm it as the organiser. Use the saved recovery code to reset the password without email; save the replacement code and sign back into the same records. More → Account security can replace a lost code while you are signed in.

## Show integration readiness

As an organiser, open **More → Connect another app**. Create an event key and call the documented snapshot/command API. Revoke it and show access is denied. **More → What changed** offers the activity log and complete event export. API documentation is served at `/api/openapi.json`.

See [validation](VALIDATION.md) for measured results and [PWA instructions](PWA.md) for browser installation and phone access. No public deployment is needed.


## No-signup attendee demonstration

Open **Your team → Share attendee QR → Create attendee QR & link**. Open the link in a private browser window, describe a request and submit without registering. Save its private tracking link. In the organiser window, assign, complete and confirm the resulting task. Refresh the attendee link to see the finished result. Disable the shared event link; existing tracking still works. Repeat with a dropped response/offline reload to demonstrate one correct request after retry. The browser test is `npm run test:attendees`.
