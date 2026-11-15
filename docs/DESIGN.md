# Interface design

VenueRelay is a task workspace used during an event. The interface puts the next hand-off ahead of summary statistics: find the request, name an owner, act, then check the result.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f5f7f6` | Workspace background |
| `--surface` | `#ffffff` | Forms and task lists |
| `--fg` | `#1c302b` | Primary text |
| `--muted` | `#596b64` | Supporting text |
| `--brand` | `#006b60` | Primary actions, selection and focus |
| `--selected` | `#edf5f0` | Active navigation and grouped feedback |
| `--border` | `#dce5df` | Surface boundaries |
| `--control-border` | `#a4b5aa` | Input boundaries |
| `--warning` | `#875415` | Interrupted work |
| `--error` | `#b32929` | Errors and blockers |

Status always includes words. Colour and dots supplement the label.

## Typography

Manrope is bundled locally in weights 400, 500 and 600. Page headings range from 26–38px; task titles use 14–15px; main content uses 14px. Input text is at least 16px on phones to avoid browser zoom. IBM Plex Mono is reserved for code and record references. Headings wrap and use modest negative tracking.

## Layout

Desktop navigation occupies a 216px sidebar below the header. At 900px and below, the four primary destinations become a persistent bottom navigation with safe-area padding. Secondary destinations stay in More. The current role remains visible beside event details; sample role switching is labelled and cannot change real event permissions.

At 720px and below, the home screen becomes one column. Task filters use a native select, the demo guide collapses, and forms use the full available width. Content reserves space below the fixed navigation. The welcome screen introduces the request-to-completion flow through a clearly labelled sample event preview.

## Components

Buttons use an 8px radius and a 44–46px minimum target height. Forms use visible labels, native controls, inline errors and a focused error summary. Task lists use full-row buttons with readable status, title, ownership, location and time. Related content shares a single bordered surface; shadows are reserved for overlays.

Dialogs use native `dialog`, Escape, focus containment, scrolling within the viewport and focus return. No page entrance animation is used in the workspace. Loading feedback respects reduced motion.

The initial loading state keeps its logo, motto and progress indicator in one centered group in both phone orientations. Dialogs follow the visual viewport height when the mobile keyboard changes the available space. Phone dialogs start focus on their heading so the keyboard opens only after a field is selected. Dialog actions stack on phones; invitation results put the link and copy action before the optional QR code.

The team page shows pending invitations before the staff roster. Each invitation exposes its role, expiry and state, with share/replacement and cancellation controls. Previous invitations stay available in a disclosure. Long names wrap without displacing actions. The staff roster excludes guest request reporters.

## Account and device flows

The sign-in form comes before optional demo details. Demo access is one click. Staff signup uses a username and password, with a private recovery code before continuing to setup; Account security can replace it after password confirmation. Real events begin empty and guide organisers to invitations and the first task.

Install controls appear only while a browser-provided install event is available. They open the native prompt directly. Unsupported browsers retain the website without manual installation steps. Save status distinguishes confirmed work, pending changes and an interrupted connection.

## Validation

Automated browser checks cover narrow phones, tablets, desktop, short viewports, keyboard focus, dialogs, search recovery, role switching and WCAG rules through axe-core. Results and remaining device limits are recorded in [VALIDATION.md](VALIDATION.md).


Attendees use a separate narrow request form reached through a shared QR/link. It has no account fields or staff controls. After submission, a private tracking view shows only that request, its status and updates, plus a clearly labelled link-saving action. Public entry tokens and private receipt tokens stay in URL fragments. The staff sharing dialog provides a QR, copyable link and controls to disable links. Guest reporters stay out of the staff roster.
