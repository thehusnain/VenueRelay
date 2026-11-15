import type { Snapshot, Pending } from '../../shared/contracts';
import { isSnapshot } from './device-state';
export function retainConfirmedVersions(previous: Snapshot | null, next: Snapshot): Snapshot {
  if (
    !previous ||
    previous.user.id !== next.user.id ||
    previous.event.id !== next.event.id ||
    previous.me.id !== next.me.id
  )
    return next;
  const tasks = new Map(previous.tasks.map((task) => [task.id, task]));
  return {
    ...next,
    tasks: next.tasks.map((task) => {
      const saved = tasks.get(task.id);
      return saved && saved.version > task.version ? saved : task;
    }),
  };
}
export function pendingReads(snapshot: Snapshot, waiting: Pending[]) {
  const reads = new Map<string, string>();
  for (const item of waiting)
    if (
      item.eventId === snapshot.event.id &&
      item.action === 'notification.read' &&
      Array.isArray(item.payload.ids)
    )
      for (const id of item.payload.ids) if (typeof id === 'string') reads.set(id, item.createdAt);
  return {
    ...snapshot,
    notifications: snapshot.notifications.map((note) =>
      !note.read_at && reads.has(note.id) ? { ...note, read_at: reads.get(note.id)! } : note,
    ),
  };
}
export function confirmedState(
  snapshot: Snapshot,
  response: { entityType?: string; entity?: object },
) {
  const collection = { task: 'tasks', schedule: 'schedule', announcement: 'announcements' }[
    response.entityType ?? ''
  ] as 'tasks' | 'schedule' | 'announcements' | undefined;
  if (
    !collection ||
    !response.entity ||
    typeof (response.entity as { id?: unknown }).id !== 'string'
  )
    return null;
  const entity = response.entity as { id: string; event_id?: string; version?: number };
  if (entity.event_id !== snapshot.event.id) return null;
  const previous = snapshot[collection].find((item) => item.id === entity.id);
  if (previous && 'version' in previous && (previous.version as number) > (entity.version ?? 0))
    return snapshot;
  const next = {
    ...snapshot,
    [collection]: [entity, ...snapshot[collection].filter((item) => item.id !== entity.id)],
  };
  return isSnapshot(next) ? next : null;
}
