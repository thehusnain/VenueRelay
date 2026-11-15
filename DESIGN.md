# VenueRelay interface

VenueRelay is an event run sheet for people working on phones, rather than a statistical dashboard. The organiser should see the next hand-off; a volunteer or vendor should find their assignment; an attendee should know how to request help. Use the requested white theme: white surfaces, dark blue-grey text, teal primary actions/selection, amber blockers and green confirmations. Keep the circular, original-teal (#006b60) white VR monogram, Antonio display headings and Manrope body/UI text.

## Mobile first

At widths up to 720px, Home, Tasks/My requests, Event plan and Your team sit in a persistent bottom navigation. Use icons with visible labels, a clear current-page mark and targets at least 44px across. Reserve content space and safe-area padding below the navigation; move to a normal top navigation on larger screens. Menus scroll within the viewport. Forms and notices scroll naturally rather than clipping inside a fixed-height page.

The header always identifies VenueRelay and shows whether work is saved, waiting or offline. Updates and More remain labelled. On sample events, Switch role opens and focuses the existing role selector; real events retain their server-enforced permissions. Sample controls should not dominate the work.

## Hierarchy and next steps

Home starts with a left-aligned event name (36px desktop, 28px phone), then one grouped metadata row for role, date and location. Do not repeat the event name in the home header. No repeated date poster or completion metric. Next comes the person's work and a clear Add a task/Ask for help action. Organisers can filter next steps into Choose owner, Needs help and Check result. Desktop uses compact filter buttons; phones use one labelled native select. The default list keeps the three most urgent items; all work remains available through Tasks.

Every task row shows readable status, task title, ownership/progress, location and due time. The entire row is an accessible button; desktop next-action labels explain what opening it enables. Color and tiny symbols never carry status alone. Task lists recover from a failed search with Clear search. The team is a compact roster of people, their role/team and active work rather than a wall of decorative cards.

The welcome page explains the actual hand-off: attendee asks, organiser assigns, volunteer/vendor acts, organiser checks. Use the three short tagline lines “Every Team. Every Update. One Place.” with height-aware type and visible actions on short screens. Account layout is owned by account.css, with the old overlapping account rules removed from the base/theme sheets. Sign-in shows the demo credentials beside the form on desktop and above it on phones. Fill demo only populates fields; Sign in is a separate action. Do not autofocus account inputs on entry. Keep a single 2px focus ring and the sign-in action inside short laptop/phone viewports. Avoid decorative account posters.

## Type and controls

Antonio is display-only; Manrope is used for instructions, names, controls, status and body text. Operational headings use a restrained scale (32px on phone event headings, 42px on desktop), with 14–16px instructions and 16px mobile fields. Secondary metadata uses 12–13px; saving status can use 11px. Long titles and names wrap.

Primary/secondary buttons share an 8px radius; form surfaces keep defined edges without glows. Related fields stay close; separate sections receive more space. Keep native selects, browser Back, keyboard focus, dialog Escape/focus return, explicit submitting states and offline/conflict recovery. Real first-use setup is one name/date/venue form followed by an actionable invite/task checklist. New real events contain only their organiser, with no sample tasks or teammates. Demo guides explain the sample festival, current role and the next hand-off through a short first action. Keep the guide beside tasks on desktop and collapsed behind an accessible disclosure on phones; longer explanations stay on demand. Avoid page entrance choreography in the workspace; short hover/state feedback respects reduced motion.

## HCI basis and verification

The implementation applies visible system status, recognition through labelled navigation, plain language, limited choices and recoverable errors from [Nielsen's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). Focus visibility and target-size checks follow [WCAG 2.2 guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/). These are design decisions and tested heuristics, not a claim of formal certification or research with end users.

Run the full page/state matrix, the short-viewport landing check, the task/offline journey and the mobile usability scenario. The usability scenario checks filtering, search recovery, sample-role discovery, navigation target size, menu bounds, compact roster layout and focused-field visibility across phone, landscape, tablet and desktop sizes. Keep actual limitations in docs/VALIDATION.md. Backend permissions, transactional records, sync and PWA behaviour remain unchanged by the visual work.

Installation is always reachable from the welcome navigation, account-page footer and workspace header. The mobile header places it next to save status so it does not compete with Updates/More. Keep the browser title and wordmark exactly VenueRelay; show “Every Team. Every Update. One Place.” in the page. Installation help uses mobile wording and browser-appropriate steps rather than branding the product for one operating system.
