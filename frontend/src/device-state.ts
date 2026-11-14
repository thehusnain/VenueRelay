import type { Snapshot } from '../../shared/contracts';

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function isSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || !record(value.user) || !record(value.event) || !record(value.me))
    return false;
  if (
    ![value.user.id, value.event.id, value.event.name, value.me.id, value.me.name].every(
      (v) => typeof v === 'string',
    )
  )
    return false;
  if (!date(value.event.date + 'T12:00:00Z')) return false;
  for (const key of [
    'tasks',
    'members',
    'events',
    'schedule',
    'announcements',
    'notifications',
    'activity',
  ])
    if (!Array.isArray(value[key]) || !value[key].every(record)) return false;
  return (
    value.tasks.every(
      (task: any) =>
        typeof task.id === 'string' &&
        typeof task.title === 'string' &&
        typeof task.location === 'string' &&
        ['open', 'assigned', 'in_progress', 'blocked', 'resolved', 'closed'].includes(
          task.status,
        ) &&
        ['normal', 'high', 'urgent'].includes(task.priority) &&
        (!task.due_at || date(task.due_at)),
    ) &&
    value.members.every(
      (member: any) => typeof member.id === 'string' && typeof member.name === 'string',
    ) &&
    value.schedule.every(
      (session: any) =>
        typeof session.title === 'string' && date(session.starts_at) && date(session.ends_at),
    ) &&
    value.announcements.every((announcement: any) => typeof announcement.message === 'string') &&
    value.notifications.every(
      (notification: any) =>
        typeof notification.message === 'string' && date(notification.created_at),
    ) &&
    value.activity.every(
      (activity: any) => typeof activity.after_json === 'string' && date(activity.created_at),
    )
  );
}
