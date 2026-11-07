# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small-event organisers, volunteers, vendors and attendees. The user explicitly asks for a beginner-friendly experience for people without an IT background. Event-day users need to understand what to do next, often on a phone and with unreliable connectivity.

## Product Purpose

Replace scattered spreadsheets and messages with requests that have a responsible person, a clear next action, and a verified outcome. HS-0130 requires permissions, notifications, dependable history, an accessible interface and a documented API.

## Operating Context

An attendee reports a need, the organiser chooses a person to help, that person reports progress and completion, and the organiser confirms the result. Real event records persist across sessions and restarts. Device actions can wait for a connection and must not overwrite another person’s changes.

## Capabilities and Constraints

Node.js backend and React/TypeScript frontend are explicit user requirements. SQLite is the existing persistent SQL database. The Capacitor projects wrap the shared web interface. The user asked to prioritise UX over visual effects, remove the generic dashboard, add a real account entry flow and email validation, and improve reliability.

Email ownership must be confirmed with a time-limited link. The user chose: “Set up email delivery later; build the verification flow now.” Real SMTP delivery remains an unconfigured external dependency. A local development email preview is not proof of a message reaching a real inbox.

## Brand Commitments

Existing product name Rally. Visual identity and screen structure may change: the user has explicitly rejected the incumbent dashboard. Use plain, human language. The user has delegated implementation/design decisions and will provide motion references later.

## Product Principles

- Show the next useful action before supporting information.
- Real accounts start with a real, empty event; sample data is an explicit choice.
- Every person sees only information relevant to their role.
- Explain pending work, errors and conflicts in everyday language.
- Keep a dependable record underneath a simple interface.

## Accessibility & Inclusion

Keyboard access, readable text, named controls, clear error recovery, large touch targets and reduced-motion support are required. Non-technical comprehension is the primary improvement requested. Automated checks do not substitute for usability testing with actual attendees or staff.

## Evidence on Hand

The previous build has domain/API and browser failure-condition tests. Existing screenshots represent the rejected design and serve as an anti-reference. No customer testimonials, attendance metrics or human usability-study findings have been supplied.
