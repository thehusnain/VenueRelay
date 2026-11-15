# Installation and offline use

VenueRelay is a website with an offline-capable app shell. It works without installation.

## Install experience

When a browser emits `beforeinstallprompt`, VenueRelay shows **Install**. Clicking it calls the browser prompt directly, in the same user gesture. The browser asks the user to confirm. A consumed prompt is never reused; cancellation returns to the website. Once installed, install controls disappear.

Browsers that do not expose that API show the website without an install button or browser-specific instructions. A website cannot silently install itself or force an unsupported browser to provide a native prompt. The settings screen reports installation availability without redirecting people to a specific browser.

[MDN: triggering a PWA install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Offline work

Open the event while connected once. The service worker caches the built app and locally hosted fonts; IndexedDB stores the authorised event snapshot and pending intents. Offline changes are visibly waiting until the server confirms them.

The outbox uses a stable key per intent. After a lost acknowledgement, retrying returns the committed result rather than creating another record. A stale task version stays in the queue for explicit conflict review. A different signed-in account cannot send the original person's work.

Background Sync is optional. Where it is unavailable, foreground and reopen retries provide recovery. Do not erase browser data or uninstall the app while changes are waiting.

Each service worker reads its own versioned cache. Older retained caches cannot replace the current shell or logo. Updates wait until it is safe to reload; **More → Alerts & installation** exposes the update action when available.

## Notifications and QR codes

In-app updates are durable and do not need browser permissions. Opening a notification navigates immediately; its read acknowledgement is saved in the device outbox and retried safely. New unread updates show an actionable banner while the app is visible. **More → Alerts & installation → Turn on alert sound** unlocks a short chime with a real user gesture. No sound is played for the existing inbox on initial load or for duplicate refreshes.

Browser push requires HTTPS and explicit permission. The MongoDB backend retains its own VAPID pair unless environment keys override it. Push links include the event, task and notification IDs so a tap opens the correct event, including after sign-in. The service worker requests normal sound and vibration where supported; OS silent/Focus settings take precedence. On iPhone, background web notifications require the Home Screen app. Website-controlled installation prompts are not supported by iOS, including Chrome on iOS. No unsupported one-click installer or browser redirect is shown.

QR scanning uses the camera only after **Start camera**. Image upload and pasted links remain available when camera access fails. Only links belonging to the same VenueRelay origin are accepted.

## Local phone testing

Use the deployed HTTPS address on a phone. Computer loopback (`127.0.0.1`) belongs to that computer. Plain LAN HTTP usually cannot provide service-worker installation, push or camera access; these browser features require a secure context.

Browser automation checks installation events, cache behaviour, interrupted connections and fallback flows. It does not prove installation on a physical iPhone or Android device.
