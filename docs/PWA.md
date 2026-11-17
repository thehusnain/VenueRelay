# Installation and offline use

VenueRelay is a website with an offline-capable app shell. It works without installation.

## Install on your phone

Choose **Install VenueRelay** on the welcome page or **More → Help & settings → Alerts & installation** in the workspace. The desktop workspace also has a header install button. Installation guidance stays available even when the browser has no automatic prompt.

### iPhone and iPad

1. Open the event’s HTTPS website in **Safari**.
2. Tap **Share → Add to Home Screen**. Scroll the share sheet or open More if necessary.
3. Leave **Open as Web App** on if offered, then tap **Add**.

Open VenueRelay from its new Home Screen icon. These instructions follow [Apple’s web app guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

### Android

1. Open the event’s HTTPS website in **Chrome**.
2. Choose **Install VenueRelay**. If no native prompt appears, open Chrome’s three-dot menu and choose **Install and create shortcut**, **Install app**, or **Add to Home screen**, depending on your browser version.
3. Choose **Install** and confirm.

The icon opens VenueRelay directly. See [Google’s web app guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en).

### Computers and other browsers

Chrome and Edge can install from the address bar or browser menu. If installation is unavailable, use the website or bookmark it. In-app browsers, private browsing, managed devices, and older browsers may restrict installation. The guide lets you select a device manually, so a browser’s device detection cannot hide instructions.

When a browser emits `beforeinstallprompt`, clicking **Install VenueRelay** invokes it directly in the same user gesture. A consumed prompt is never reused. Cancellation leaves guidance available, and prompt failures open the manual steps. Install controls disappear after the browser’s installed event or when running in standalone mode. A normal browser tab may not know that an app was previously installed; open its Home Screen icon if it is already there.

The app needs no app-store account or download. Installation is a browser capability; a website cannot silently install itself or guarantee installation on every device. See [MDN’s install prompt documentation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Offline work

Open the event while connected once. The service worker caches the built app and locally hosted fonts; IndexedDB stores the authorised event snapshot and pending intents. Offline changes are visibly waiting until the server confirms them.

The outbox uses a stable key per intent. After a lost acknowledgement, retrying returns the committed result rather than creating another record. A stale task version stays in the queue for explicit conflict review. A different signed-in account cannot send the original person's work.

Background Sync is optional. Where it is unavailable, foreground and reopen retries provide recovery. Do not erase browser data or uninstall the app while changes are waiting.

Each service worker reads its own versioned cache. Older retained caches cannot replace the current shell or logo. Updates wait until it is safe to reload; **More → Help & settings → Alerts & installation** exposes the update action when available.

## Notifications and QR codes

In-app updates are durable and do not need browser permissions. Opening a notification navigates immediately; its read acknowledgement is saved in the device outbox and retried safely. New unread updates show an actionable banner while the app is visible. Banners are deferred while a task, dialog, inbox or More menu is open so they cannot cover controls; updates remain in the bell. **More → Help & settings → Alerts & installation → Turn on alert sound** unlocks a short chime with a real user gesture. No sound is played for the existing inbox on initial load or for duplicate refreshes.

Browser push requires HTTPS and explicit permission. The MongoDB backend retains its own VAPID pair unless environment keys override it. Push links include the event, task and notification IDs so a tap opens the correct event, including after sign-in. The service worker requests normal sound and vibration where supported; OS silent/Focus settings take precedence. On iPhone, background web notifications require the Home Screen app. On iOS, use the manual Home Screen steps above; the app does not pretend to provide a one-click native installer.

QR scanning uses the camera only after **Start camera**. Image upload and pasted links remain available when camera access fails. Only links belonging to the same VenueRelay origin are accepted.

## Local phone testing

Use the deployed HTTPS address on a phone. Computer loopback (`127.0.0.1`) belongs to that computer. Plain LAN HTTP usually cannot provide service-worker installation, push or camera access; these browser features require a secure context.

Browser automation checks installation events, cache behaviour, interrupted connections and fallback flows. It does not prove installation on a physical iPhone or Android device.
