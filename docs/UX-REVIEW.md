# UX and HCI redesign rationale

## Observed problem

The user, describing themselves as a beginner without IT knowledge, found the previous dashboard messy and difficult to understand and explicitly rejected its generic dashboard appearance. This is direct user feedback; no wider usability study is claimed.

The old first screen opened a sample dashboard without an account decision; mixed tasks, counts, schedule, activity and technical tools; displayed small text; used terms such as “Run of show”, “Owner”, “Reliability lab” and “Ready to verify”; and repeated task-creation actions in several places.

## Sources and fit

- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): visibility, familiar language, recognition, error prevention and recovery fit people doing time-sensitive work without training.
- [GOV.UK: question pages](https://design-system.service.gov.uk/patterns/question-pages/): focused questions and a clear continuation fit event/account setup. We borrow the interaction principle, not government branding.
- [GOV.UK: confirm an email address](https://design-system.service.gov.uk/patterns/confirm-an-email-address/): address syntax is different from proving access to the inbox; use a clear link, expiry and recovery.
- [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): WCAG’s AA criterion starts at 24 CSS pixels with exceptions. Rally chooses larger 44px primary targets for event-day touch use.
- [MIT: heuristic evaluation and user-centred design](https://designftw.csail.mit.edu/lectures/heuristic-eval/): assess learnability, efficiency and safety against concrete tasks.

The UI/UX local guidance’s accessible style recommendation fits readable text, keyboard access and clear controls. Its automatically suggested sales page, logo proof and decorative display-font recommendations do not fit this product and are not adopted.

## Changes to verify

| Finding | Design response | Evidence to collect |
|---|---|---|
| Unexpected dashboard on first visit | Welcome, sign-in and optional sample entry | Fresh browser opens welcome |
| Too many simultaneous decisions | Four ordinary navigation labels; advanced tools under More | First-screen walkthrough |
| Unclear next step | Role-specific actions naming the task and person | Organiser/worker/attendee journey |
| Small, dense table | Readable task list with sentence-level status | Mobile and 200% text checks |
| Form complexity | Focused steps and optional details | Back retains values; errors retain input |
| False confidence about email | Actual link confirmation; explicit unconfigured delivery state | Token expiry, resend, replay and access tests |
| Concern about lost/duplicate records | Saved/pending feedback and reviewed conflicts | Re-run outage and concurrency tests |

## Evaluation limits

A heuristic review, browser checks and automated accessibility scans establish specific observable properties. They do not establish that every beginner will understand the app. The next human evaluation should ask an unfamiliar organiser to create an event, invite a helper and complete a request without instructions, noting hesitation, mistakes and recovery.
