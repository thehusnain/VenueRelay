/// <reference lib="webworker" />
import { syncOutbox } from './sync-engine';
import { notificationLink } from '../../shared/notification-link';
const worker = self as unknown as ServiceWorkerGlobalScope;
const assets: string[] = JSON.parse('__RALLY_PRECACHE__');
const CACHE = 'rally-pwa-__RALLY_VERSION__';
worker.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(assets))),
);
worker.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter(
        (key) => key.startsWith('rally-shell-') || key.startsWith('rally-pwa-'),
      );
      const previous = keys.filter((key) => key !== CACHE).pop();
      await Promise.all(
        keys.filter((key) => key !== CACHE && key !== previous).map((key) => caches.delete(key)),
      );
      await worker.clients.claim();
    })(),
  ),
);
worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== worker.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 4000);
          try {
            const response = await fetch(event.request, { signal: controller.signal });
            if (!response.ok) throw new Error('The app shell is temporarily unavailable.');
            return response;
          } finally {
            clearTimeout(timer);
          }
        } catch {
          return (
            (await (await caches.open(CACHE)).match('/index.html')) ??
            new Response('VenueRelay is offline. Open it once while connected.', { status: 503 })
          );
        }
      })(),
    );
  } else if (assets.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(async (cache) => (await cache.match(url.pathname)) ?? fetch(event.request)),
    );
  }
});
async function flush() {
  const result = await syncOutbox(undefined, import.meta.env.VITE_API_URL ?? '');
  for (const client of await worker.clients.matchAll({ type: 'window' }))
    client.postMessage({ type: 'rally:outbox' });
  if (result.retry) throw new Error('Some changes are still waiting for a safe retry.');
}
worker.addEventListener('sync' as any, (event: any) => {
  if (event.tag === 'rally-outbox') event.waitUntil(flush());
});
worker.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void worker.skipWaiting();
});
worker.addEventListener('push', (event) => {
  let payload: { id?: string; url?: string; eventId?: string; taskId?: string } = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
  } catch {}
  const path = notificationLink(payload, worker.location.origin);
  const notification: NotificationOptions & { vibrate: number[] } = {
    body: 'Your event has a new update. Open VenueRelay to see the details.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'rally-' + (payload.id ?? 'update'),
    silent: false,
    vibrate: [180, 80, 180],
    data: { url: path },
  };
  event.waitUntil(worker.registration.showNotification('VenueRelay update', notification));
});
worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = notificationLink({ url: event.notification.data?.url }, worker.location.origin);
  const url = new URL(path, worker.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client && !/^\/(attend\/|request$)/.test(new URL(client.url).pathname)) {
          try {
            const navigated = await (client as WindowClient).navigate(url.href);
            if (navigated) {
              await navigated.focus();
              return;
            }
          } catch {
            client.postMessage({ type: 'rally:open-notification', url: path });
            try {
              await (client as WindowClient).focus();
              return;
            } catch {}
          }
        }
      }
      await worker.clients.openWindow(url.href);
    })(),
  );
});
