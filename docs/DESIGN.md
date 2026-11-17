# Interface design

VenueRelay is a task workspace used during an event. The interface puts the next hand-off ahead of summary statistics: find the request, name an owner, act, then check the result.

## Colors

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

Install controls remain discoverable before installation. Where the browser offers a native prompt, the control opens it directly. Otherwise it opens three-step guidance for iPhone/iPad, Android or computer, with automatic device selection and an explicit override. Installed apps hide redundant install controls. HTTPS requirements are explained alongside the instructions. Save status distinguishes confirmed work, pending changes and an interrupted connection.

## Validation

Automated browser checks cover narrow phones, tablets, desktop, short viewports, keyboard focus, dialogs, search recovery, role switching and WCAG rules through axe-core. Results and remaining device limits are recorded in [VALIDATION.md](VALIDATION.md).


Attendees use a separate narrow request form reached through a shared QR/link. It has no account fields or staff controls. After submission, a private tracking view shows only that request, its status and updates, plus a clearly labelled link-saving action. Public entry tokens and private receipt tokens stay in URL fragments. The staff sharing dialog provides a QR, copyable link and controls to disable links. Guest reporters stay out of the staff roster.

## Event overview and first-use guidance

The event header uses deep evergreen (`#173f35`), pale mint text and a warm sand (`#f4dba8`) progress track. Its task total comes from the current workspace and opens the task list. The welcome page shows a sample event with a concise task list. Manrope remains locally bundled for a consistent experience without external font requests.

A six-step tutorial explains event creation, volunteer invitations, vendor invitations, attendee requests, task completion and installation. Each step has concise instructions, the actual control labels and a visual sequence. Next, Back and Skip preserve user control. Completion and dismissal are stored per account; a memory fallback keeps the guide usable when storage is blocked. The tutorial is available on the welcome screen, from More, and through a dismissible first-workspace invitation below the work area.

## HCI choices

- **Visibility of status:** labelled task states, save status, pending changes, tutorial progress and a real completion total.
- **Recognition:** consistent wording in controls, tutorial routes and documentation; icons always accompany meaningful labels.
- **User control:** Back, Skip, dismissal, replay, Escape and restored focus.
- **Error prevention and recovery:** explicit invitation roles, one-use links, disabled busy actions, inline errors, safe retry IDs and connection help.
- **Progressive disclosure:** one tutorial topic at a time; advanced event tools stay in More.
- **Accessibility:** locally bundled readable type, text contrast, 44px primary navigation targets, keyboard access, native dialogs and reduced-motion support. Automated checks supplement, rather than replace, real assistive-technology and user testing.

## Date fields, joining and event history

Date, time and datetime-local inputs use `appearance: none`, explicit border-box sizing, bounded width, and a minimum height. Their labels can shrink within grid tracks. This avoids the native iOS theme’s content-box sizing while retaining native date/time selection; WebKit’s value area has an explicit minimum height and left alignment.

Your team offers one shared link per volunteer/vendor role alongside personal invitations. The organiser sees expiry and join counts, can disable or replace links, and can enable notification sound. Shared-link instructions explain that anyone holding the link may join; names come from each account. The guide teaches the shared-link path first.

More → My events & history lists active and ended events with their date and venue. Ending requires confirmation and explains unfinished work and retained records. Ended workspaces show a persistent read-only notice; mutation controls are disabled, and the server rejects new work. The creator can reopen an event. Existing privacy and role permissions also apply to archived records.
