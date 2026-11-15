const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function notificationLink(
  payload: { url?: unknown; eventId?: unknown; taskId?: unknown; id?: unknown },
  origin: string,
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '/';
  let url: URL;
  try {
    url = new URL(typeof payload.url === 'string' ? payload.url : '/', origin);
  } catch {
    return '/';
  }
  if (url.origin !== origin || !/^\/(?:tasks\/[A-Za-z0-9_-]+)?$/.test(url.pathname)) return '/';
  if (identifier(payload.taskId)) url.pathname = '/tasks/' + payload.taskId;
  const eventId = identifier(payload.eventId) ? payload.eventId : url.searchParams.get('event');
  const noteId = identifier(payload.id) ? payload.id : url.searchParams.get('notification');
  const params = new URLSearchParams();
  if (identifier(eventId)) params.set('event', eventId);
  if (identifier(noteId)) params.set('notification', noteId);
  return url.pathname + (params.size ? '?' + params.toString() : '');
}
