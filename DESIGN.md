# Rally · guided event companion

## Direction

Replace the operations-dashboard identity with a clear community event companion. Audience: organisers and helpers without IT training, often on a phone. Adjectives: understandable, welcoming, direct, trustworthy. Essence: everyone knows next.

The incumbent dark sidebar, metrics strip, tiny status table and technical tools on the home screen have been rejected. The replacement uses an open page, a short horizontal navigation, clear task sentences and full-page steps for account/event setup. No dashboard charts, task-board jargon or decorative control panels.

## Visual system

Self-hosted Manrope throughout; 16px body with 1.6 line height, 14px minimum supporting labels, 20–24px section headings and 32–40px page headings. Code examples alone use IBM Plex Mono. Spacious 8px rhythm; 44px minimum main controls. Corners 8px on controls and 14px on substantial surfaces. Defined edges without decorative glow/shadow.

| Token | Value / role |
|---|---|
| Background | oklch(.98 .004 250), cool near-white |
| Surface | oklch(1 0 0), white |
| Text | oklch(.25 .025 255), ink |
| Muted text | oklch(.46 .02 255), readable supporting text |
| Border | oklch(.88 .01 250) |
| Strong control border | oklch(.62 .02 250) |
| Primary action | oklch(.28 .035 255), ink |
| Accent | oklch(.48 .14 35), terracotta |
| Selected surface | oklch(.95 .012 250) |
| Success | oklch(.40 .08 155) |
| Warning | oklch(.44 .09 65) |
| Error | oklch(.46 .14 25) |

The identifying move is a clear event-day heading with a simple date tab and task handoff expressed as a sentence naming the person. Colour helps people find their next action; it does not decorate every element. The welcome screen demonstrates one labelled example task rather than a fake analytics screen.

## Information architecture

Public entry → create account / sign in / explicitly try sample → confirm email → create/join event → Home, Tasks, Event plan, Your team. History, connections, connection help and account controls live under More. Home shows at most three next actions. Technical IDs and detailed logs are disclosed only when requested.

## HCI commitments

Use real-world vocabulary; reveal optional fields progressively; retain input on errors; present one primary action per step; preserve Back and Cancel; show saved/pending/conflict feedback clearly. Mobile navigation is text-labelled. Forms allow password-manager autofill and paste. Layout supports narrow screens and increased text size. Native dialogs are reserved for brief protected interactions; longer onboarding uses full-page steps.

## Motion

Only short state/reveal transitions (160–200ms) and reduced-motion support. No WebGL or decorative 3D in the work flow. Later expressive motion must preserve comprehension and performance.

## Verification

Review welcome, sign-in, confirmation, empty-event setup, organiser home, volunteer task, attendee request, mobile and errors. Run keyboard and automated accessibility checks. Record research and findings in docs/UX-REVIEW.md and updated validation evidence.
