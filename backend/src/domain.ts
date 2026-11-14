import type { IncomingMessage } from 'node:http';
import type { Store } from './database.ts';
import { hash, id, now, token, requireVerified, publicUser, type User } from './auth.ts';
import { ApiError, ensure, text, choice, date } from './errors.ts';
import type {
  Event,
  Member,
  Task,
  Status,
  Activity,
  Schedule,
  Snapshot,
  Notification,
  Announcement,
} from '../../shared/contracts.ts';
export interface Context {
  user: User;
  event: Event;
  me: Member;
  isIntegration?: boolean;
}
interface Command {
  action: string;
  taskId?: string;
  expectedVersion?: number;
  payload: Record<string, unknown>;
}
const canonical = (value: unknown): string =>
  JSON.stringify(
    value && typeof value === 'object'
      ? Array.isArray(value)
        ? value.map((x) => JSON.parse(canonical(x)))
        : Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, JSON.parse(canonical(v))]),
          )
      : value,
  );
export function organiser(ctx: Context) {
  ensure(ctx.me.role === 'organiser', 403, 'FORBIDDEN', 'Only an organiser can do that.');
}
export function canRead(me: Member, task: Task) {
  return me.role === 'organiser' || task.reporter_id === me.id || task.owner_id === me.id;
}
export function context(
  store: Store,
  req: IncomingMessage,
  user: User | undefined,
  eventId: string,
): Context {
  const event = store.get<Event>('SELECT * FROM events WHERE id=?', eventId);
  ensure(event, 404, 'NOT_FOUND', 'Event not found.');
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer?.startsWith('rly_')) {
    const key = store.get<{ member_id: string }>(
      'SELECT member_id FROM api_keys WHERE token_hash=? AND event_id=? AND revoked_at IS NULL',
      hash(bearer),
      eventId,
    );
    ensure(key, 401, 'INVALID_TOKEN', 'The integration token is invalid or revoked.');
    const me = store.get<Member>(
      'SELECT * FROM members WHERE id=? AND event_id=?',
      key.member_id,
      eventId,
    );
    ensure(me, 403, 'FORBIDDEN', 'Event membership has been removed.');
    const issuer = store.get<User>(
      'SELECT id,email,name,email_verified_at FROM users WHERE id=?',
      me.user_id,
    );
    ensure(issuer, 403, 'FORBIDDEN', 'The issuing account is unavailable.');
    requireVerified(issuer);
    return { user: issuer, event, me, isIntegration: true };
  }
  ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  requireVerified(user);
  const persona = req.headers['x-rally-persona'];
  if (persona && persona !== 'self') {
    ensure(
      event.is_demo && event.owner_id === user.id,
      403,
      'FORBIDDEN',
      'Role previews are only available in your own demo event.',
    );
    const me = store.get<Member>(
      'SELECT * FROM members WHERE event_id=? AND role=?',
      eventId,
      String(persona),
    );
    ensure(me, 403, 'FORBIDDEN', 'This demo role does not exist.');
    return { user, event, me };
  }
  const me = store.get<Member>(
    'SELECT * FROM members WHERE event_id=? AND user_id=?',
    eventId,
    user.id,
  );
  ensure(me, 403, 'FORBIDDEN', 'You are not a member of this event.');
  return { user, event, me };
}
function append(
  store: Store,
  ctx: Context,
  key: string,
  requestHash: string,
  result: Record<string, unknown>,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
  recipients: string[],
  message: string,
) {
  const commandId = id(),
    createdAt = now();
  store.run(
    'INSERT INTO commands VALUES (?,?,?,?,?,?,?)',
    commandId,
    ctx.event.id,
    ctx.me.id,
    key,
    requestHash,
    JSON.stringify(result),
    createdAt,
  );
  store.run(
    'INSERT INTO activity (event_id,command_id,actor_id,entity_id,entity_type,action,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ctx.event.id,
    commandId,
    ctx.me.id,
    entityId,
    entityType,
    action,
    before ? JSON.stringify(before) : null,
    JSON.stringify(after),
    createdAt,
  );
  for (const recipient of new Set(recipients.filter((x) => x && x !== ctx.me.id)))
    store.run(
      'INSERT INTO notifications VALUES (?,?,?,?,?,?,NULL,?)',
      id(),
      ctx.event.id,
      recipient,
      commandId,
      entityType === 'task' ? entityId : '',
      message,
      createdAt,
    );
}
export function execute(
  store: Store,
  ctx: Context,
  key: string,
  input: Command,
  options: { failAfterMutation?: boolean } = {},
) {
  ensure(
    /^[A-Za-z0-9_-]{8,100}$/.test(key),
    400,
    'IDEMPOTENCY_REQUIRED',
    'Supply an Idempotency-Key of 8–100 letters, digits, hyphens or underscores.',
  );
  const requestHash = hash(canonical(input));
  return store.transaction(() => {
    const previous = store.get<{ request_hash: string; response_json: string }>(
      'SELECT * FROM commands WHERE actor_id=? AND request_key=?',
      ctx.me.id,
      key,
    );
    if (previous) {
      ensure(
        previous.request_hash === requestHash,
        409,
        'IDEMPOTENCY_MISMATCH',
        'This request ID was already used for a different action.',
      );
      return { ...JSON.parse(previous.response_json), replayed: true };
    }
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
      stamp = now();
    const organisers = store
      .all<Member>('SELECT * FROM members WHERE event_id=? AND role=?', ctx.event.id, 'organiser')
      .map((m) => m.id);
    let entityType = 'task',
      entityId = '',
      before: unknown = null,
      after: unknown,
      action = input.action,
      recipients: string[] = [],
      message = '';
    if (input.action === 'task.create') {
      const owner = p.ownerId ? text(p.ownerId, 'Owner', 100) : null;
      if (owner) {
        organiser(ctx);
        ensure(
          store.get(
            'SELECT id FROM members WHERE id=? AND event_id=? AND role!=?',
            owner,
            ctx.event.id,
            'attendee',
          ),
          422,
          'INVALID_OWNER',
          'Choose a team member from this event.',
        );
      }
      const task: Task = {
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
      store.run(
        'INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        task.id,
        task.event_id,
        task.title,
        task.description,
        task.location,
        task.priority,
        task.status,
        task.owner_id,
        task.reporter_id,
        task.due_at,
        task.resolution,
        1,
        stamp,
        stamp,
      );
      entityId = task.id;
      after = task;
      recipients = [...organisers, owner ?? ''];
      message = `${ctx.me.name} reported: ${task.title}`;
    } else if (input.action === 'task.assign' || input.action === 'task.status') {
      const taskId = text(input.taskId, 'Task ID', 100);
      const task = store.get<Task>(
        'SELECT * FROM tasks WHERE id=? AND event_id=?',
        taskId,
        ctx.event.id,
      );
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
        ensure(
          store.get(
            'SELECT id FROM members WHERE id=? AND event_id=? AND role!=?',
            owner,
            ctx.event.id,
            'attendee',
          ),
          422,
          'INVALID_OWNER',
          'Choose a team member from this event.',
        );
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
        const resolution = ['blocked', 'resolved'].includes(status)
          ? text(p.resolution, 'Resolution or blocker note', 2000, 5)
          : task.resolution;
        updated = { ...updated, status, resolution };
      }
      store.run(
        'UPDATE tasks SET owner_id=?,status=?,due_at=?,resolution=?,version=?,updated_at=? WHERE id=? AND version=?',
        updated.owner_id,
        updated.status,
        updated.due_at,
        updated.resolution,
        updated.version,
        stamp,
        task.id,
        task.version,
      );
      after = updated;
      entityId = task.id;
      recipients = [...organisers, task.reporter_id, task.owner_id ?? '', updated.owner_id ?? ''];
      message = `${task.title} · ${input.action === 'task.assign' ? 'Assigned to ' + store.get<Member>('SELECT * FROM members WHERE id=?', updated.owner_id!)!.name : updated.status.replace('_', ' ')}`;
    } else if (input.action === 'schedule.create') {
      organiser(ctx);
      entityType = 'schedule';
      entityId = id();
      const startsAt = date(p.startsAt, 'Start time'),
        endsAt = date(p.endsAt, 'End time');
      ensure(endsAt > startsAt, 422, 'VALIDATION_ERROR', 'End time must be after start time.');
      after = {
        id: entityId,
        event_id: ctx.event.id,
        title: text(p.title, 'Title', 140, 3),
        location: text(p.location, 'Location', 120),
        starts_at: startsAt,
        ends_at: endsAt,
        version: 1,
      };
      const s = after as Schedule;
      store.run(
        'INSERT INTO schedule VALUES (?,?,?,?,?,?,?)',
        s.id,
        s.event_id,
        s.title,
        s.location,
        s.starts_at,
        s.ends_at,
        1,
      );
    } else if (input.action === 'announcement.create') {
      organiser(ctx);
      entityType = 'announcement';
      entityId = id();
      message = text(p.message, 'Announcement', 1000, 5);
      after = {
        id: entityId,
        event_id: ctx.event.id,
        actor_id: ctx.me.id,
        message,
        created_at: stamp,
      };
      store.run(
        'INSERT INTO announcements VALUES (?,?,?,?,?)',
        entityId,
        ctx.event.id,
        ctx.me.id,
        message,
        stamp,
      );
      recipients = store
        .all<Member>('SELECT * FROM members WHERE event_id=?', ctx.event.id)
        .map((m) => m.id);
    } else throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown command action.');
    if (options.failAfterMutation) throw new Error('Simulated storage interruption');
    const result = { entity: after, entityType, entityId, replayed: false };
    append(
      store,
      ctx,
      key,
      requestHash,
      result,
      entityType,
      entityId,
      action,
      before,
      after,
      recipients,
      message,
    );
    return result;
  });
}
export function bootstrap(store: Store, user: User): string {
  const existing = store.get<{ id: string }>(
    'SELECT e.id FROM events e JOIN members m ON m.event_id=e.id WHERE m.user_id=? ORDER BY e.is_demo ASC,e.created_at DESC LIMIT 1',
    user.id,
  );
  if (existing) return existing.id;
  return createEvent(
    store,
    user,
    {
      name: 'Riverside Makers Festival',
      venue: 'Riverside Park, Lahore',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    },
    true,
  );
}
export function createEvent(store: Store, user: User, p: Record<string, unknown>, demo = false) {
  return store.transaction(() => {
    const eventId = id(),
      stamp = now(),
      name = text(p.name, 'Event name', 100, 3),
      venue = text(p.venue, 'Venue', 140),
      day = text(p.date, 'Event date', 10);
    ensure(
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(day)) &&
        new Date(day).toISOString().slice(0, 10) === day,
      422,
      'VALIDATION_ERROR',
      'Use a valid YYYY-MM-DD event date.',
    );
    store.run(
      'INSERT INTO events VALUES (?,?,?,?,?,?,?)',
      eventId,
      user.id,
      name,
      venue,
      day,
      demo ? 1 : 0,
      stamp,
    );
    store.run(
      'INSERT INTO members VALUES (?,?,?,?,?,?)',
      id(),
      eventId,
      user.id,
      demo ? 'Maya Chen' : user.name,
      'organiser',
      'Event lead',
    );
    if (demo)
      for (const [role, person, team] of [
        ['volunteer', 'Ayesha Khan', 'Guest experience'],
        ['vendor', 'Hamza Ali', 'Food & beverage'],
        ['attendee', 'Sam Rivera', 'Festival attendee'],
      ])
        store.run(
          'INSERT INTO members VALUES (?,?,?,?,?,?)',
          id(),
          eventId,
          `demo:${role}`,
          person,
          role,
          team,
        );
    return eventId;
  });
}
export function seedDemo(store: Store, ctx: Context) {
  if (
    !ctx.event.is_demo ||
    ctx.event.owner_id !== ctx.user.id ||
    store.get('SELECT id FROM tasks WHERE event_id=?', ctx.event.id)
  )
    return;
  const members = store.all<Member>('SELECT * FROM members WHERE event_id=?', ctx.event.id),
    volunteer = members.find((m) => m.role === 'volunteer')!,
    vendor = members.find((m) => m.role === 'vendor')!;
  const rows = [
    [
      'Clear the accessible entrance',
      'A delivery crate is blocking the step-free route. Move it and check the full path.',
      'North entrance',
      'urgent',
      volunteer.id,
      'blocked',
    ],
    [
      'Set up the welcome desk',
      'Put out wristbands, printed maps and the lost property sign.',
      'Welcome tent',
      'high',
      volunteer.id,
      'in_progress',
    ],
    [
      'Confirm power for food stalls',
      'Check the supply with the site electrician before switching on equipment.',
      'Food court',
      'high',
      vendor.id,
      'assigned',
    ],
    [
      'Restock drinking water',
      'The refill station needs two more water containers.',
      'Garden zone',
      'normal',
      vendor.id,
      'assigned',
    ],
    [
      'Add signs to the quiet space',
      'Directional signs are missing at the main junction.',
      'East pavilion',
      'normal',
      null,
      'open',
    ],
    [
      'Check the main stage sound',
      'Complete the final microphone and monitor check.',
      'Main stage',
      'normal',
      volunteer.id,
      'resolved',
    ],
    [
      'Place recycling stations',
      'Put labelled bins at each exit and along the food court.',
      'All zones',
      'normal',
      volunteer.id,
      'closed',
    ],
  ];
  for (let n = 0; n < rows.length; n++) {
    const [title, description, location, priority, ownerId, status] = rows[n];
    const result = execute(store, ctx, `seed-task-${n}`, {
      action: 'task.create',
      payload: {
        title,
        description,
        location,
        priority,
        ownerId,
        dueAt: new Date(Date.now() + (n - 1) * 35 * 60000).toISOString(),
      },
    });
    let task = result.entity as Task;
    if (['in_progress', 'blocked', 'resolved', 'closed'].includes(String(status))) {
      task = execute(store, ctx, `seed-start-${n}`, {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: { status: 'in_progress' },
      }).entity as Task;
    }
    if (['blocked', 'resolved', 'closed'].includes(String(status))) {
      task = execute(store, ctx, `seed-finish-${n}`, {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: {
          status: status === 'blocked' ? 'blocked' : 'resolved',
          resolution:
            status === 'blocked'
              ? 'Waiting for the delivery driver to move the crate.'
              : 'Checked on site. Everything is ready.',
        },
      }).entity as Task;
    }
    if (status === 'closed')
      execute(store, ctx, `seed-close-${n}`, {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: { status: 'closed' },
      });
  }
  for (const [i, title, location, start, end] of [
    [0, 'Crew briefing', 'Welcome tent', '08:30', '09:00'],
    [1, 'Gates open', 'North entrance', '10:00', '10:30'],
    [2, 'Meet the makers', 'Main stage', '11:00', '12:00'],
    [3, 'Lunch & local flavours', 'Food court', '12:30', '14:00'],
    [4, 'Acoustic garden session', 'Garden zone', '16:00', '17:00'],
  ])
    execute(store, ctx, `seed-schedule-${i}`, {
      action: 'schedule.create',
      payload: {
        title,
        location,
        startsAt: `${ctx.event.date}T${start}:00+05:00`,
        endsAt: `${ctx.event.date}T${end}:00+05:00`,
      },
    });
}
export function snapshot(store: Store, ctx: Context): Snapshot {
  const tasks = store
    .all<Task>('SELECT * FROM tasks WHERE event_id=? ORDER BY created_at DESC,id', ctx.event.id)
    .filter((t) => canRead(ctx.me, t));
  const activity = store.all<Activity>(
    "SELECT * FROM activity WHERE event_id=? AND (?='organiser' OR entity_type IN ('schedule','announcement') OR (entity_type='task' AND entity_id IN (SELECT id FROM tasks WHERE event_id=? AND (reporter_id=? OR owner_id=?)))) ORDER BY id DESC LIMIT 200",
    ctx.event.id,
    ctx.me.role,
    ctx.event.id,
    ctx.me.id,
    ctx.me.id,
  );
  const members = store.all<Member>(
    'SELECT * FROM members WHERE event_id=? ORDER BY role,name',
    ctx.event.id,
  );
  const visibleMembers =
    ctx.me.role === 'organiser'
      ? members
      : members.filter(
          (m) =>
            m.id === ctx.me.id || m.role === 'organiser' || tasks.some((t) => t.owner_id === m.id),
        );
  return {
    event: ctx.event,
    me: ctx.me,
    user: publicUser(ctx.user),
    members: visibleMembers.map(({ user_id, ...m }) => ({
      ...m,
      user_id: m.id === ctx.me.id ? user_id : '',
    })),
    tasks,
    activity,
    notifications: store.all<Notification>(
      'SELECT * FROM notifications WHERE member_id=? ORDER BY created_at DESC LIMIT 100',
      ctx.me.id,
    ),
    schedule: store.all<Schedule>(
      'SELECT * FROM schedule WHERE event_id=? ORDER BY starts_at',
      ctx.event.id,
    ),
    announcements: store.all<Announcement>(
      'SELECT * FROM announcements WHERE event_id=? ORDER BY created_at DESC LIMIT 20',
      ctx.event.id,
    ),
    events: store.all<Event>(
      'SELECT e.* FROM events e JOIN members m ON e.id=m.event_id WHERE m.user_id=? ORDER BY e.created_at DESC',
      ctx.user.id,
    ),
    serverTime: now(),
    activityCursor: activity[0]?.id ?? 0,
    hasMoreActivity: activity.length === 200,
  };
}
export function invite(store: Store, ctx: Context, p: Record<string, unknown>) {
  organiser(ctx);
  ensure(
    !ctx.isIntegration,
    403,
    'FORBIDDEN',
    'Manage access through a signed-in organiser account.',
  );
  const role = choice(p.role, ['volunteer', 'vendor', 'attendee'] as const, 'Role'),
    name = text(p.name, 'Name', 100, 2),
    value = token(),
    inviteId = id();
  store.transaction(() => {
    store.run(
      'INSERT INTO invitations VALUES (?,?,?,?,?,?,NULL)',
      inviteId,
      ctx.event.id,
      hash(value),
      role,
      name,
      new Date(Date.now() + 2 * 86400000).toISOString(),
    );
    append(
      store,
      ctx,
      `invite-${inviteId}`,
      hash(inviteId),
      { id: inviteId },
      'invitation',
      inviteId,
      'invitation.create',
      null,
      { id: inviteId, name, role },
      [],
      '',
    );
  });
  return { token: value, name, role, expiresInHours: 48 };
}
export function acceptInvitation(store: Store, user: User, value: string) {
  return store.transaction(() => {
    const invitation = store.get<{
      id: string;
      event_id: string;
      role: string;
      name: string;
      expires_at: string;
      used_by: string | null;
    }>('SELECT * FROM invitations WHERE token_hash=?', hash(value));
    ensure(
      invitation && invitation.expires_at > now(),
      410,
      'INVITATION_EXPIRED',
      'This invitation is invalid or expired.',
    );
    ensure(
      !invitation.used_by || invitation.used_by === user.id,
      409,
      'INVITATION_USED',
      'This invitation has already been accepted.',
    );
    if (invitation.used_by === user.id) return { eventId: invitation.event_id };
    ensure(
      !store.get(
        'SELECT id FROM members WHERE event_id=? AND user_id=?',
        invitation.event_id,
        user.id,
      ),
      409,
      'ALREADY_MEMBER',
      'You already belong to this event.',
    );
    const memberId = id();
    store.run(
      'INSERT INTO members VALUES (?,?,?,?,?,?)',
      memberId,
      invitation.event_id,
      user.id,
      user.name,
      invitation.role,
      invitation.role === 'vendor' ? 'Vendor partner' : 'Event team',
    );
    store.run('UPDATE invitations SET used_by=? WHERE id=?', user.id, invitation.id);
    const event = store.get<Event>('SELECT * FROM events WHERE id=?', invitation.event_id)!;
    const me = store.get<Member>('SELECT * FROM members WHERE id=?', memberId)!;
    append(
      store,
      { event, me, user },
      `accept-${invitation.id}`,
      hash(invitation.id),
      { eventId: event.id },
      'member',
      memberId,
      'member.join',
      null,
      { id: memberId, name: user.name, role: me.role },
      [],
      '',
    );
    return { eventId: event.id };
  });
}
export function createApiKey(store: Store, ctx: Context, name: string) {
  organiser(ctx);
  ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use a signed-in account to issue tokens.');
  const value = `rly_${token()}`,
    keyId = id();
  store.transaction(() => {
    store.run(
      'INSERT INTO api_keys VALUES (?,?,?,?,?,?,NULL)',
      keyId,
      ctx.event.id,
      ctx.me.id,
      hash(value),
      text(name, 'Token name', 80, 2),
      now(),
    );
    append(
      store,
      ctx,
      `key-${keyId}`,
      hash(keyId),
      { id: keyId },
      'integration',
      keyId,
      'integration.create',
      null,
      { id: keyId, name },
      [],
      '',
    );
  });
  return { id: keyId, token: value };
}
export function integrity(store: Store, ctx: Context) {
  organiser(ctx);
  const commands = store.get<{ count: number }>(
    'SELECT count(*) count FROM commands WHERE event_id=?',
    ctx.event.id,
  )!.count;
  const activity = store.get<{ count: number }>(
    'SELECT count(*) count FROM activity WHERE event_id=?',
    ctx.event.id,
  )!.count;
  const mismatches = store.all<{ id: string }>(
    'SELECT t.id FROM tasks t WHERE t.event_id=? AND t.version != (SELECT count(*) FROM activity a WHERE a.entity_id=t.id AND a.entity_type=?)',
    ctx.event.id,
    'task',
  );
  const missing = store.all(
    'SELECT c.id FROM commands c LEFT JOIN activity a ON a.command_id=c.id WHERE c.event_id=? AND a.id IS NULL',
    ctx.event.id,
  );
  const foreign = store.all('PRAGMA foreign_key_check');
  return {
    ok: commands === activity && !mismatches.length && !missing.length && !foreign.length,
    commands,
    activity,
    taskVersionMismatches: mismatches.length,
    missingAuditEntries: missing.length,
    foreignKeyViolations: foreign.length,
    checkedAt: now(),
  };
}
