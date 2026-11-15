import type { Member, Task } from '../../shared/contracts.ts';
import { ensure } from './errors.ts';
export function organiser(ctx: { me: Member }) {
  ensure(ctx.me.role === 'organiser', 403, 'FORBIDDEN', 'Only an organiser can do that.');
}
export function canRead(me: Member, task: Task) {
  return me.role === 'organiser' || task.reporter_id === me.id || task.owner_id === me.id;
}
