# Rally interface

A calm, clear event workspace. Keep the established black/white palette and locally bundled Antonio/Manrope pairing. This is a refinement of the existing website/PWA, not a new visual identity or technology stack.

## Hierarchy and scale

The welcome screen leads to starting an event or trying the sample. Its fixed two-part headline is height-aware:52–88px on desktop,40–56px on phones, with1.06 line-height. It must stay on two lines on ordinary desktop widths, with the explanation and actions visible on600–720px-high laptop windows. No decorative eyebrow pill or numbered feature markers. Feature summaries sit in one quiet row below the main content.

Page/task headings use36–48px, event headings44–60px and account headings36–44px. Antonio is display-only; Manrope is used for instructions, names, navigation, controls and body text. Body16px, secondary text12–14px, section headings20–24px. Labels and controls remain readable without giant titles. Operational role/date labels and step numbers convey actual state, rather than decoration.

## Layout

Use a shared20–40px responsive gutter and24/32px section spacing. Related fields stay closer than separate sections. The header uses normal grid placement rather than overlapping branding with an absolutely positioned public nav. On phones, installation and invitation scanning remain accessible below the brand/sign-in row.

Home prioritises three actionable tasks; Tasks, Event plan and Your team retain their existing flows. Settings, install/push and QR tools remain under More. Event metadata supports the task list rather than dominating it. Account forms have a restrained supporting panel on desktop and focused form-only layouts on small screens.

## Components

White primary pills and restrained dark secondary buttons; visible keyboard focus and44px main targets. Surfaces use defined edges,12–16px corners and no decorative glow. Dialogs keep clear focus/escape behaviour and scroll within short viewports. Fields retain16px input text on phones. Long titles and names wrap; pages scroll instead of clipping content.

## Verification

Check the full page/state matrix across phone, tablet and desktop sizes. In addition to overflow/axe checks, assert that the landing actions fit within short laptop viewports and that the desktop headline uses two lines. Inspect rendered pages and verify sign-in input persistence during a delayed initial account check. Backend permissions, outbox/sync, WebSockets and PWA behaviour remain unchanged by styling.
