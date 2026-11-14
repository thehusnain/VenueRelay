# Rally interface

Rally is an event run sheet for people working on phones, rather than a statistical dashboard. The organiser should see the next hand-off; a volunteer or vendor should find their assignment; an attendee should know how to request help. Keep the black/white identity, circular Rally mark, Antonio display headings and Manrope body/UI text.

## Mobile first

At widths up to 720px, Home, Tasks/My requests, Event plan and Your team sit in a persistent bottom navigation. Use icons with visible labels, a clear current-page mark and targets at least 44px across. Reserve content space and safe-area padding below the navigation; move to a normal top navigation on larger screens. Menus scroll within the viewport. Forms and notices scroll naturally rather than clipping inside a fixed-height page.

The header always identifies Rally and shows whether work is saved, waiting or offline. Updates and More remain labelled. On sample events, Switch role opens and focuses the existing role selector; real events retain their server-enforced permissions. Sample controls should not dominate the work.

## Hierarchy and next steps

Home starts with compact event name, role, date and location. No repeated date poster or completion metric. Next comes the person's work and a clear Add a task/Ask for help action. Organisers can filter next steps into Choose owner, Needs help and Check result. The default list keeps the three most urgent items; all work remains available through Tasks.

Every task row shows readable status, task title, ownership/progress, location and due time. The entire row is an accessible button; desktop next-action labels explain what opening it enables. Color and tiny symbols never carry status alone. Task lists recover from a failed search with Clear search. The team is a compact roster of people, their role/team and active work rather than a wall of decorative cards.

The welcome page explains the actual hand-off: attendee asks, organiser assigns, volunteer/vendor acts, organiser checks. Retain its height-aware two-line headline and visible actions on short screens. Account pages use a restrained supporting panel on desktop and form-only layouts on phones.

## Type and controls

Antonio is display-only; Manrope is used for instructions, names, controls, status and body text. Operational headings use a restrained scale (32px on phone event headings, 42px on desktop), with 14–16px instructions and 16px mobile fields. Secondary metadata uses 12–13px; saving status can use 11px. Long titles and names wrap.

Primary/secondary buttons share an 8px radius; form surfaces keep defined edges without glows. Related fields stay close; separate sections receive more space. Keep native selects, browser Back, keyboard focus, dialog Escape/focus return, explicit submitting states and offline/conflict recovery. Avoid page entrance choreography in the workspace; short hover/state feedback respects reduced motion.

## HCI basis and verification

The implementation applies visible system status, recognition through labelled navigation, plain language, limited choices and recoverable errors from [Nielsen's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). Focus visibility and target-size checks follow [WCAG 2.2 guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/). These are design decisions and tested heuristics, not a claim of formal certification or research with end users.

Run the full page/state matrix, the short-viewport landing check, the task/offline journey and the mobile usability scenario. The usability scenario checks filtering, search recovery, sample-role discovery, navigation target size, menu bounds, compact roster layout and focused-field visibility across phone, landscape, tablet and desktop sizes. Keep actual limitations in docs/VALIDATION.md. Backend permissions, transactional records, sync and PWA behaviour remain unchanged by the visual work.
