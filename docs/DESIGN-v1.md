> Archived initial design. Superseded by [DESIGN.md](../DESIGN.md) after user feedback.

# Rally design system

## Purpose and positioning

A working event coordination application for small organisers, attendees, volunteers and vendors. Primary outcome: a reported on-site problem has an accountable owner and a verified resolution. Adjectives: clear, composed, practical, human. Essence: calm event control.

## Direction

A contemporary event fieldbook: dark forest navigation, paper-white workspace, strongly aligned operational rows and a distinctive event ticket with a punched divider. Considered alternatives were a high-density dispatch console and a colourful festival app; the fieldbook balances on-site readability and organiser oversight. Reference conventions: Linear's task ownership and Eventbrite's event identity, transposed rather than copied.

## Tokens

Display/body: locally hosted Manrope; figures and identifiers: locally hosted IBM Plex Mono. Base 14px; scale 1.25: 11, 14, 18, 22, 28, 35px. Spacing unit 4px. Radii 8px and 14px; circular avatars excepted. Defined edges with no decorative drop shadows. Plain CSS custom properties.

| Role              | OKLCH                  |
| ----------------- | ---------------------- |
| Background        | oklch(0.977 0.004 150) |
| Surface           | oklch(1 0 0)           |
| Foreground        | oklch(0.25 0.025 160)  |
| Muted             | oklch(0.48 0.018 160)  |
| Border            | oklch(0.90 0.010 150)  |
| Brand/nav         | oklch(0.28 0.048 162)  |
| Accent            | oklch(0.80 0.14 115)   |
| Accent foreground | oklch(0.26 0.045 160)  |
| Success           | oklch(0.41 0.09 160)   |
| Warning           | oklch(0.44 0.09 65)    |
| Error             | oklch(0.46 0.14 25)    |

## Craft

Signature: the event ticket and numbered run-of-show rail. A stable sidebar, wide task workspace and compact contextual schedule. Mobile: horizontal navigation and single-column cards, actions reachable without hover. Semantic status labels always accompany colours. Manrope is self-hosted so poor event Wi-Fi does not break typography.

Native HTML dialogs manage focus; visible focus rings, skip link, explicit labels, live sync messages, 44px primary targets, native keyboard controls. Motion limited to a 160ms fade/translation; reduced-motion eliminates transitions. No decorative imagery or animation that competes with time-sensitive work. Icons share a 24px grid and 1.7px stroke. Light mode is the supported theme.

## Audit

Review rendered desktop/mobile for overflow, hierarchy, keyboard navigation and contrast before completion. No ornamental charts or fabricated live metrics; every count derives from persisted records. Record final findings in docs/VALIDATION.md.

## Final audit · 7 November 2026

The built SaaS application follows the clear/composed/practical/human fieldbook direction. Local Manrope and IBM Plex Mono, forest navigation, lime accent and event-ticket signature are implemented. Desktop and 390px mobile screenshots were reviewed. Counts derive from persisted records. No decorative charts, fabricated live attendance, ornamental WebGL or animation dependent controls were introduced. Automated desktop/mobile/dialog WCAG scans returned zero findings; keyboard testing led to explicit modal focus wrapping/restoration and hidden collapsed mobile navigation. Source and evidence are recorded in docs/VALIDATION.md. Final 3D/motion art direction remains a separate pass using the user’s references.
