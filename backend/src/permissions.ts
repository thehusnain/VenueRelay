import type { Member, Task } from '../../shared/contracts.ts';
import { ensure } from './errors.ts';
export function organiser(ctx: { me: Member }) {
  ensure(ctx.me.role === 'organiser', 403, 'FORBIDDEN', 'Only an organiser can do that.');
}
export function canRead(me: Member, task: Task) {
  return me.role === 'organiser' || task.reporter_id === me.id || task.owner_id === me.id;
}

export function activeEvent(event: { ended_at?: string | null } | undefined) {
  ensure(event, 404, 'NOT_FOUND', 'Event not found.');
  ensure(
    !event.ended_at,
    409,
    'EVENT_ENDED',
    'This event has ended and is read-only. The organiser can reopen it from My events.',
  );
}
