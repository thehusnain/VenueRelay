# Live application test report

Tested **17 November 2026** at [VenueRelay](https://venuerelay.onrender.com), using separate Chromium browser sessions. Only labelled test data was created.

## Scope and result

Created four staff accounts (one organiser, two volunteers, one vendor), one event, three organiser tasks, one attendee request, one programme session and one team announcement. **21 functional check groups passed**, including error and permission checks. **24 page/viewport accessibility and layout checks** found no horizontal overflow, date-input overflow or automated axe WCAG A/AA violations. No unhandled JavaScript exceptions were recorded in those sessions.

One interaction defect was reproduced: a notification banner covered task headings and intercepted the Back button and More menu options on a phone. The repository now defers banners while a task form/detail, dialog, inbox or More menu is open. Notifications and enabled sounds still work. This fix has not been deployed by this test run.

## Live checks

1. Organiser signup through UI, recovery code download, and event creation.
2. Shared role links created and preserved after reload; volunteer signup joins correct event; organiser receives named alert and audio oscillator is scheduled.
3. Vendor signup and second volunteer reuse the shared links, with correct roles and one membership per person.
4. Already joined volunteer can reopen the invitation without a duplicate membership.
5. Three tasks created through the wizard: volunteer assignment, vendor assignment and unassigned work.
6. Team shows two volunteers and one vendor after repeat join; no duplicate membership.
7. Volunteer task completes start, blocked/help, resume, review, return for more work, resubmit and organiser confirmation across separate sessions.
8. Vendor completes own task; unrelated volunteer task stays hidden; only organiser can confirm completion.
9. Unassigned task can be assigned later, then reassigned to another joined member.
10. Session rejects an end time earlier than its start time with a visible error.
11. Valid session publishes and appears for volunteer; phone date/time controls fit four viewport sizes.
12. Public attendee QR/link accepts a request without an account; organiser assigns it; volunteer completes it; private tracking shows Finished.
13. Organiser announcement appears for a signed-in vendor.
14. Recovery code resets password, old password is rejected, and new password signs in to the same event.
15. Home, Tasks, Your team and Event plan fit phone, tablet and desktop sizes (320, 390, 768, 1440px) with automated accessibility checks.
16. iOS and Android install guidance opens; standalone manifest, icons and active service worker are present (physical device install not exercised).
17. Offline task change survives page reload and syncs after reconnecting.
18. Personal invitation creation and cancellation work; signed-in recipient is rejected for a cancelled link.
19. End/reopen preserves tasks, team and programme; ended events reject new attendee access while existing private tracking works.
20. Server rejects a volunteer attempt to end the organiser event.
21. Six-step tutorial advances and finishes.

## Test data retained

- Event: **TEST - VenueRelay live check mwl08ofa**.
- Event ID: `f9c463a4-c54e-4343-aa52-eb29052834fa`.
- The event was ended after testing and both shared team links were disabled. Its records remain available for inspection.
- Three tasks finished; the remaining task intentionally retained its in-progress status to verify that ending an event does not falsely complete work.
- Test credentials and recovery codes are in the private, ignored local file `test-results/live-mwl08ofa/test-accounts.json`. They are not committed to the repository.
- Screenshots and machine-readable results are in `test-results/live-mwl08ofa/`.

## Local follow-up

The repository also adds account-only **All / Live / Upcoming / Past** event filters and a simpler mobile task flow. Live means scheduled today and not ended; Upcoming means a future date; Past includes earlier dates and manually ended events. All comparisons use Pakistan Standard Time. Past-date events remain editable until explicitly ended.

The mobile task form hides global navigation, extra header tools and the duplicate step indicator. More groups infrequent actions under **Event tools** and **Help & settings**. Installation remains on the welcome screen and in Help & settings. The updated tutorial and README use these paths.

Validation results are recorded in [VALIDATION.md](VALIDATION.md). Browser regression `npm run test:events` covers date filters, empty results, event switching, end/reopen and the notification obstruction regression.

## Limits

This was functional testing, not an exhaustive security audit or a load test. Physical iPhone/Android installation, the native iOS date picker, camera hardware and real background push delivery were not tested. Notification sound was verified by real Web Audio oscillator scheduling, not listening through a physical device. External integrations and email delivery were outside this live test. Automated accessibility checks do not replace manual assistive-technology testing.
