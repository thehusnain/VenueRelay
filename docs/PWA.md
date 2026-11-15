# Install and use the PWA

VenueRelay is one website. Installing it adds a Home Screen/app icon for that website; no app store or native build is needed.

## Installation

On Android/desktop, open **More → Install VenueRelay & notifications → Install VenueRelay** when the browser offers installation. Otherwise use the browser’s install menu. On iPhone, open VenueRelay in Safari, choose **Share → Add to Home Screen**, enable **Open as Web App** if shown, then Add.

Service workers, browser camera access and push require a secure context. Computer `localhost` is suitable for local testing. On a physical phone, use a **trusted HTTPS address** reachable from that phone. A computer’s `localhost` is not the phone’s localhost. Plain HTTP over a private IP does not provide full PWA functionality.

For a local phone demo, put the phone/computer on the same Wi-Fi, run Node on a reachable interface and place a trusted local HTTPS reverse proxy in front of port 3001. Set `APP_ORIGIN` to the HTTPS address and `COOKIE_SECURE=true`; preserve Host and forward WebSocket upgrades. Trust the local certificate on the phone. This does not require a public deployment. The server remains necessary for shared updates.

## Offline and updates

The production build precaches its app shell, JavaScript, CSS, fonts and icons. API responses are never service-worker cached. IndexedDB stores the last confirmed event and scoped unsent intents. Open an event online first before testing offline reload.

Pending work is retried on reconnect and while VenueRelay is visible. Where Background Sync exists, the service worker also retries when the browser schedules it. Safari/iPhone does not provide the same Background Sync guarantees: reopen VenueRelay to resume work. Browsers can suspend or evict local storage; closed-app sync is not guaranteed.

A new worker waits before replacing an active version. The installation dialog offers an update/reload action and disables it while this view has waiting changes. Records are still protected by IndexedDB and server idempotency if another tab updates. Never clear site data to fix a connection problem while work is waiting.

## Browser push

In the project terminal:

```sh
npm run push:keys
```

Copy the generated VAPID settings into private `.env`, set `VAPID_SUBJECT` to your real contact email URI, and restart VenueRelay. Never commit the private key. Push is optional; the in-app inbox works without it.

Then sign in, open an event, and choose **Enable browser notifications** in the install/notification dialog. Permission is requested only after that action. On iPhone, web push requires a supported iOS version and the Home Screen web app. Denied or unsupported permission has a readable fallback.

The server stores session-bound subscriptions and durable delivery jobs. Expired endpoints are removed, temporary provider failures retry with backoff, and logout/session expiry stops delivery. Push payloads contain no task description or person’s name; open VenueRelay to read authorised details. Delivery may repeat after an ambiguous provider failure; a stable notification tag reduces duplicate display. Push is a prompt, not the authoritative activity log.

## QR scanning

Use **Scan invitation** on the welcome screen or **More → Scan a QR code**. Choose the rear camera where available, upload a QR image, or paste a VenueRelay link. Denied camera permission never blocks those alternatives. Closing the scanner stops its camera tracks.

Only links for the current VenueRelay origin are accepted. An invitation still requires sign-in and server acceptance; a task link still uses the normal role checks. Display invitations from the same reachable HTTPS address the phones use, not a laptop-only localhost address.

References: [iPhone Home Screen web apps](https://support.apple.com/guide/iphone/iphea86e5236/ios), [WebKit push support](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

Installation access is always visible on the welcome page and workspace header; account pages retain a footer shortcut. A missing native browser prompt opens manual installation steps instead of hiding the action. Installed/standalone sessions hide the shortcut. The app name and browser title are VenueRelay; the circular VR mark uses the original teal #006b60.
