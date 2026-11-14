# Running beyond localhost

No deployment is needed for the judge’s computer demo: use the README’s npm commands.

For multiple physical phones, the same Node service needs a reachable trusted HTTPS origin. Use a TLS reverse proxy, preserve Host and forward WebSocket upgrades. Set APP_ORIGIN to the public/local HTTPS origin and COOKIE_SECURE=true. A localhost address on a phone refers to the phone itself. See PWA.md for installation and browser requirements.

Keep data/rally.sqlite on persistent local storage and back it up. Do not run independent writable SQLite replicas. Keep .env and email previews private. The optional existing Dockerfile/compose configuration provides a single Node instance; it does not supply HTTPS or a domain.

Public demo credentials are for sample data only. Production startup does not seed the demo account; do not copy a demo database into a real event deployment. Configure SMTP and VAPID only when their external delivery is needed. No public hosting, publication or app-store distribution has been performed.
