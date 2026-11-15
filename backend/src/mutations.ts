import type { Member, Task, Schedule, Announcement, Status } from '../../shared/contracts.ts';
import type { Context } from './domain.ts';
import { organiser, canRead } from './permissions.ts';
import { id, now } from './auth.ts';
import { ensure, text, choice, date, ApiError } from './errors.ts';
export interface CommandInput {
  action: string;
  taskId?: string;
  expectedVersion?: number;
  payload: Record<string, unknown>;
}
export function planCommand(ctx: Context, input: CommandInput, members: Member[], task?: Task) {
  ensure(
    input &&
      typeof input.payload === 'object' &&
      input.payload !== null &&
      !Array.isArray(input.payload),
    422,
    'VALIDATION_ERROR',
    'A payload object is required.',
  );
  const p = input.payload,
    stamp = now(),
    organisers = members.filter((m) => m.role === 'organiser').map((m) => m.id);
  const ownerValid = (owner: string) =>
    ensure(
      members.some((m) => m.id === owner && m.event_id === ctx.event.id && m.role !== 'attendee'),
      422,
      'INVALID_OWNER',
      'Choose a team member from this event.',
    );
  let entityType = 'task',
    before: Task | null = null,
    after: Task | Schedule | Announcement,
    recipients: string[] = [],
    message = '';
  if (input.action === 'task.create') {
    const owner = p.ownerId ? text(p.ownerId, 'Owner', 100) : null;
    if (owner) {
      organiser(ctx);
      ownerValid(owner);
    }
    after = {
      id: id(),
      event_id: ctx.event.id,
      title: text(p.title, 'Title', 140, 3),
      description: text(p.description ?? '', 'Description', 2000, 0),
      location: text(p.location, 'Location', 120),
      priority: choice(p.priority ?? 'normal', ['urgent', 'high', 'normal'] as const, 'Priority'),
      status: owner ? 'assigned' : 'open',
      owner_id: owner,
      reporter_id: ctx.me.id,
      due_at: p.dueAt ? date(p.dueAt, 'Due time') : null,
      resolution: '',
      version: 1,
      created_at: stamp,
      updated_at: stamp,
    };
    recipients = [...organisers, owner ?? ''];
    message = `${ctx.me.name} reported: ${after.title}`;
  } else if (input.action === 'task.assign' || input.action === 'task.status') {
    text(input.taskId, 'Task ID', 100);
    ensure(task && canRead(ctx.me, task), 404, 'NOT_FOUND', 'Task not found.');
    if (input.action === 'task.assign') organiser(ctx);
    else
      ensure(
        ctx.me.role === 'organiser' ||
          (task.owner_id === ctx.me.id && ['volunteer', 'vendor'].includes(ctx.me.role)),
        403,
        'FORBIDDEN',
        'Only the assigned person or an organiser can update this task.',
      );
    ensure(
      Number.isInteger(input.expectedVersion) && Number(input.expectedVersion) > 0,
      422,
      'VERSION_REQUIRED',
      'Supply the task’s positive expectedVersion.',
    );
    ensure(
      input.expectedVersion === task.version,
      409,
      'VERSION_CONFLICT',
      'This task changed while you were working. Review the latest record before applying your action.',
      { current: task },
    );
    before = task;
    let updated = { ...task, version: task.version + 1, updated_at: stamp };
    if (input.action === 'task.assign') {
      const owner = text(p.ownerId, 'Owner', 100);
      ownerValid(owner);
      ensure(
        task.status !== 'closed',
        422,
        'INVALID_TRANSITION',
        'Reopen the task before assigning it.',
      );
      updated = {
        ...updated,
        owner_id: owner,
        status: 'assigned',
        resolution: '',
        due_at: p.dueAt ? date(p.dueAt, 'Due time') : task.due_at,
      };
    } else {
      const status = choice(
        p.status,
        ['in_progress', 'blocked', 'resolved', 'closed'] as const,
        'Status',
      );
      const transitions: Record<Status, Status[]> = {
        open: [],
        assigned: ['in_progress'],
        in_progress: ['blocked', 'resolved'],
        blocked: ['in_progress'],
        resolved: ctx.me.role === 'organiser' ? ['closed', 'in_progress'] : [],
        closed: ctx.me.role === 'organiser' ? ['in_progress'] : [],
      };
      ensure(
        transitions[task.status].includes(status),
        422,
        'INVALID_TRANSITION',
        `A task in ${task.status} cannot move to ${status}.`,
      );
      ensure(task.owner_id, 422, 'OWNER_REQUIRED', 'Assign an owner before starting work.');
      updated = {
        ...updated,
        status,
        resolution: ['blocked', 'resolved'].includes(status)
          ? text(p.resolution, 'Resolution or blocker note', 2000, 5)
          : task.resolution,
      };
    }
    after = updated;
    recipients = [...organisers, task.reporter_id, task.owner_id ?? '', updated.owner_id ?? ''];
    message = `${task.title} · ${input.action === 'task.assign' ? 'Assigned to ' + members.find((m) => m.id === updated.owner_id)!.name : updated.status.replace('_', ' ')}`;
  } else if (input.action === 'schedule.create') {
    organiser(ctx);
    entityType = 'schedule';
    const startsAt = date(p.startsAt, 'Start time'),
      endsAt = date(p.endsAt, 'End time');
    ensure(endsAt > startsAt, 422, 'VALIDATION_ERROR', 'End time must be after start time.');
    after = {
      id: id(),
      event_id: ctx.event.id,
      title: text(p.title, 'Title', 140, 3),
      location: text(p.location, 'Location', 120),
      starts_at: startsAt,
      ends_at: endsAt,
      version: 1,
    };
  } else if (input.action === 'announcement.create') {
    organiser(ctx);
    entityType = 'announcement';
    message = text(p.message, 'Announcement', 1000, 5);
    after = { id: id(), event_id: ctx.event.id, actor_id: ctx.me.id, message, created_at: stamp };
    recipients = members.filter((m) => !m.user_id.startsWith('guest:')).map((m) => m.id);
  } else throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown command action.');
  return { entityType, entityId: after.id, before, after, recipients, message };
}
