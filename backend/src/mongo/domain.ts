import type { IncomingMessage } from 'node:http';
import type { Document } from 'mongodb';
import type { Context } from '../domain.ts';
import { canonical } from '../domain.ts';
import { organiser } from '../permissions.ts';
import { planCommand, type CommandInput } from '../mutations.ts';
import { id, now, hash, token, requireVerified, publicUser, type User } from '../auth.ts';
import { ensure, text, choice } from '../errors.ts';
import type {
  Event,
  Member,
  Task,
  Activity,
  Snapshot,
  Schedule,
  Announcement,
  Notification,
} from '../../../shared/contracts.ts';
import { MongoStore } from './store.ts';
import { MongoAccounts } from './accounts.ts';
export class MongoDomain {
  constructor(
    readonly store: MongoStore,
    readonly accounts: MongoAccounts,
  ) {}
  async context(
    req: IncomingMessage,
    eventId: string,
    store = this.store,
    user?: User,
  ): Promise<Context> {
    const event = await store.get<Event>('events', { id: eventId });
    ensure(event, 404, 'NOT_FOUND', 'Event not found.');
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer?.startsWith('rly_')) {
      const key = await store.get<{ member_id: string }>('api_keys', {
        token_hash: hash(bearer),
        event_id: eventId,
        revoked_at: null,
      });
      ensure(key, 401, 'INVALID_TOKEN', 'The integration token is invalid or revoked.');
      const me = await store.get<Member>('members', { id: key.member_id, event_id: eventId });
      ensure(me, 403, 'FORBIDDEN', 'Event membership has been removed.');
      const issuer = await store.get<User>('users', { id: me.user_id });
      ensure(issuer, 403, 'FORBIDDEN', 'The issuing account is unavailable.');
      requireVerified(issuer);
      return { event, me, user: issuer, isIntegration: true };
    }
    user ??= await this.accounts.user(req);
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
      const me = await store.get<Member>('members', { event_id: eventId, role: String(persona) });
      ensure(me, 403, 'FORBIDDEN', 'This demo role does not exist.');
      return { event, me, user };
    }
    const me = await store.get<Member>('members', { event_id: eventId, user_id: user.id });
    ensure(me, 403, 'FORBIDDEN', 'You are not a member of this event.');
    return { event, me, user };
  }
  async createEvent(user: User, p: Record<string, unknown>, demo = false, store = this.store) {
    return store.transaction(async (tx) => {
      const day = text(p.date, 'Event date', 10);
      ensure(
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          Number.isFinite(Date.parse(day)) &&
          new Date(day).toISOString().slice(0, 10) === day,
        422,
        'VALIDATION_ERROR',
        'Use a valid YYYY-MM-DD event date.',
      );
      const event: Event = {
        id: id(),
        owner_id: user.id,
        name: text(p.name, 'Event name', 100, 3),
        venue: text(p.venue, 'Venue', 140),
        date: day,
        is_demo: demo ? 1 : 0,
        created_at: now(),
      };
      await tx.insert('events', event);
      await tx.insert('members', {
        id: id(),
        event_id: event.id,
        user_id: user.id,
        name: demo ? 'Maya Chen' : user.name,
        role: 'organiser',
        team: 'Event lead',
      });
      if (demo)
        for (const [role, name, team] of [
          ['volunteer', 'Ayesha Khan', 'Guest experience'],
          ['vendor', 'Hamza Ali', 'Food & beverage'],
          ['attendee', 'Sam Rivera', 'Festival attendee'],
        ])
          await tx.insert('members', {
            id: id(),
            event_id: event.id,
            user_id: 'demo:' + role,
            name,
            role,
            team,
          });
      return event.id;
    });
  }
  async realUser(user: User) {
    ensure(
      !(await this.store.get<{ is_demo: boolean }>('users', { id: user.id }))?.is_demo,
      403,
      'ACCOUNT_REQUIRED',
      'Create your own verified account to manage a real event.',
    );
  }
  async eventForUser(userId: string, store = this.store) {
    const memberships = await store.all<Member>('members', { user_id: userId });
    return (
      await store.all<Event>(
        'events',
        { id: { $in: memberships.map((m) => m.event_id) } },
        { is_demo: 1, created_at: -1 },
        1,
      )
    )[0];
  }
  async append(
    tx: MongoStore,
    ctx: Context,
    key: string,
    requestHash: string,
    result: Document,
    type: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
    recipients: string[] = [],
    message = '',
  ) {
    const commandId = id(),
      stamp = now();
    await tx.insert('commands', {
      id: commandId,
      event_id: ctx.event.id,
      actor_id: ctx.me.id,
      request_key: key,
      request_hash: requestHash,
      response_json: JSON.stringify(result),
      created_at: stamp,
    });
    const seq = await tx.sequence('activity:' + ctx.event.id);
    await tx.insert('activity', {
      id: seq,
      event_id: ctx.event.id,
      command_id: commandId,
      actor_id: ctx.me.id,
      entity_id: entityId,
      entity_type: type,
      action,
      before_json: before ? JSON.stringify(before) : null,
      after_json: JSON.stringify(after),
      created_at: stamp,
    });
    for (const memberId of new Set(recipients.filter((x) => x && x !== ctx.me.id))) {
      ensure(
        await tx.get('members', { id: memberId, event_id: ctx.event.id }),
        422,
        'INVALID_MEMBER',
        'Notification recipient must belong to this event.',
      );
      await tx.insert('notifications', {
        id: id(),
        event_id: ctx.event.id,
        member_id: memberId,
        command_id: commandId,
        task_id: type === 'task' ? entityId : '',
        message,
        read_at: null,
        created_at: stamp,
      });
    }
  }
  async execute(
    ctx: Context,
    key: string,
    input: CommandInput,
    options: { failAfterMutation?: boolean } = {},
  ) {
    ensure(
      /^[A-Za-z0-9_-]{8,100}$/.test(key),
      400,
      'IDEMPOTENCY_REQUIRED',
      'Supply an Idempotency-Key of 8–100 letters, digits, hyphens or underscores.',
    );
    const digest = hash(canonical(input));
    const replay = (previous: { request_hash: string; response_json: string }) => {
      ensure(
        previous.request_hash === digest,
        409,
        'IDEMPOTENCY_MISMATCH',
        'This request ID was already used for a different action.',
      );
      return { ...JSON.parse(previous.response_json), replayed: true };
    };
    try {
      return await this.store.transaction(async (tx) => {
        const previous = await tx.get<{ request_hash: string; response_json: string }>('commands', {
          actor_id: ctx.me.id,
          request_key: key,
        });
        if (previous) return replay(previous);
        ensure(
          await tx.get('members', { id: ctx.me.id, event_id: ctx.event.id, role: ctx.me.role }),
          403,
          'FORBIDDEN',
          'Event membership has changed. Reopen the event.',
        );
        const members = await tx.all<Member>('members', { event_id: ctx.event.id });
        const task =
          typeof input?.taskId === 'string'
            ? await tx.get<Task>('tasks', { id: input.taskId, event_id: ctx.event.id })
            : undefined;
        const change = planCommand(ctx, input, members, task);
        const table = { task: 'tasks', schedule: 'schedule', announcement: 'announcements' }[
          change.entityType
        ]!;
        if (change.before) {
          const saved = await tx.update(
            table,
            { id: change.entityId, event_id: ctx.event.id, version: change.before.version },
            { $set: { ...change.after } },
          );
          ensure(
            saved.modifiedCount === 1,
            409,
            'VERSION_CONFLICT',
            'This task changed. Review its latest version.',
          );
        } else await tx.insert(table, change.after);
        if (options.failAfterMutation) throw new Error('Simulated storage interruption');
        const result = {
          entity: change.after,
          entityType: change.entityType,
          entityId: change.entityId,
          replayed: false,
        };
        await this.append(
          tx,
          ctx,
          key,
          digest,
          result,
          change.entityType,
          change.entityId,
          input.action,
          change.before,
          change.after,
          change.recipients,
          change.message,
        );
        return result;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const previous = await this.store.get<{ request_hash: string; response_json: string }>(
          'commands',
          { actor_id: ctx.me.id, request_key: key },
        );
        if (previous) return replay(previous);
      }
      throw error;
    }
  }
  taskFilter(ctx: Context) {
    return ctx.me.role === 'organiser'
      ? { event_id: ctx.event.id }
      : { event_id: ctx.event.id, $or: [{ owner_id: ctx.me.id }, { reporter_id: ctx.me.id }] };
  }
  async activity(ctx: Context, after = 0, limit = 200, reverse = false, store = this.store) {
    let filter: Document = { event_id: ctx.event.id, id: { $gt: after } };
    if (ctx.me.role !== 'organiser') {
      const tasks = await store.all<Task>('tasks', this.taskFilter(ctx));
      filter = {
        $and: [
          filter,
          {
            $or: [
              { entity_type: { $in: ['schedule', 'announcement'] } },
              { entity_type: 'task', entity_id: { $in: tasks.map((t) => t.id) } },
            ],
          },
        ],
      };
    }
    return store.all<Activity>('activity', filter, { id: reverse ? -1 : 1 }, limit);
  }
  async snapshot(ctx: Context): Promise<Snapshot> {
    return this.store.transaction(async (tx) => {
      const tasks = await tx.all<Task>('tasks', this.taskFilter(ctx), { created_at: -1, id: 1 });
      const activity = await this.activity(ctx, 0, 200, true, tx);
      const members = await tx.all<Member>(
        'members',
        { event_id: ctx.event.id },
        { role: 1, name: 1 },
      );
      const visible =
        ctx.me.role === 'organiser'
          ? members
          : members.filter(
              (m) =>
                m.id === ctx.me.id ||
                m.role === 'organiser' ||
                tasks.some((t) => t.owner_id === m.id),
            );
      const joins = await tx.all<Member>('members', { user_id: ctx.user.id });
      return {
        event: ctx.event,
        me: ctx.me,
        user: publicUser(ctx.user),
        tasks,
        members: visible.map(({ user_id, ...m }) => ({
          ...m,
          user_id: m.id === ctx.me.id ? user_id : '',
        })),
        activity,
        notifications: await tx.all<Notification>(
          'notifications',
          { member_id: ctx.me.id },
          { created_at: -1 },
          100,
        ),
        schedule: await tx.all<Schedule>('schedule', { event_id: ctx.event.id }, { starts_at: 1 }),
        announcements: await tx.all<Announcement>(
          'announcements',
          { event_id: ctx.event.id },
          { created_at: -1 },
          20,
        ),
        events: await tx.all<Event>(
          'events',
          { id: { $in: joins.map((m) => m.event_id) } },
          { created_at: -1 },
        ),
        serverTime: now(),
        activityCursor: activity[0]?.id ?? 0,
        hasMoreActivity: activity.length === 200,
      };
    });
  }
  async invite(ctx: Context, p: Record<string, unknown>) {
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
    await this.store.transaction(async (tx) => {
      await tx.insert('invitations', {
        id: inviteId,
        event_id: ctx.event.id,
        token_hash: hash(value),
        role,
        name,
        expires_at: new Date(Date.now() + 172800000).toISOString(),
        used_by: null,
      });
      await this.append(
        tx,
        ctx,
        'invite-' + inviteId,
        hash(inviteId),
        { id: inviteId },
        'invitation',
        inviteId,
        'invitation.create',
        null,
        { id: inviteId, name, role },
      );
    });
    return { token: value, name, role, expiresInHours: 48 };
  }
  async accept(user: User, value: string) {
    await this.realUser(user);
    return this.store.transaction(async (tx) => {
      const invitation = await tx.get<{
        id: string;
        event_id: string;
        role: Member['role'];
        expires_at: string;
        used_by: string | null;
      }>('invitations', { token_hash: hash(value) });
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
        !(await tx.get('members', { event_id: invitation.event_id, user_id: user.id })),
        409,
        'ALREADY_MEMBER',
        'You already belong to this event.',
      );
      const me: Member = {
        id: id(),
        event_id: invitation.event_id,
        user_id: user.id,
        name: user.name,
        role: invitation.role,
        team: invitation.role === 'vendor' ? 'Vendor partner' : 'Event team',
      };
      await tx.insert('members', me);
      await tx.update(
        'invitations',
        { id: invitation.id, used_by: null },
        { $set: { used_by: user.id } },
      );
      const event = await tx.get<Event>('events', { id: me.event_id });
      ensure(event, 404, 'NOT_FOUND', 'Event not found.');
      await this.append(
        tx,
        { event, me, user },
        'accept-' + invitation.id,
        hash(invitation.id),
        { eventId: event.id },
        'member',
        me.id,
        'member.join',
        null,
        { id: me.id, name: me.name, role: me.role },
      );
      return { eventId: event.id };
    });
  }
  async createKey(ctx: Context, name: string) {
    organiser(ctx);
    ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use a signed-in account to issue tokens.');
    const value = 'rly_' + token(),
      keyId = id();
    await this.store.transaction(async (tx) => {
      await tx.insert('api_keys', {
        id: keyId,
        event_id: ctx.event.id,
        member_id: ctx.me.id,
        token_hash: hash(value),
        name: text(name, 'Token name', 80, 2),
        created_at: now(),
        revoked_at: null,
      });
      await this.append(
        tx,
        ctx,
        'key-' + keyId,
        hash(keyId),
        { id: keyId },
        'integration',
        keyId,
        'integration.create',
        null,
        { id: keyId, name },
      );
    });
    return { id: keyId, token: value };
  }
  async revokeKey(ctx: Context, keyId: string) {
    organiser(ctx);
    ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use a signed-in account to revoke tokens.');
    await this.store.transaction(async (tx) => {
      const old = await tx.get('api_keys', { id: keyId, event_id: ctx.event.id });
      ensure(old, 404, 'NOT_FOUND', 'Token not found.');
      if (!old.revoked_at) {
        await tx.update('api_keys', { id: keyId }, { $set: { revoked_at: now() } });
        await this.append(
          tx,
          ctx,
          'revoke-' + keyId,
          hash(keyId),
          {},
          'integration',
          keyId,
          'integration.revoke',
          { id: keyId, name: old.name, revoked_at: old.revoked_at },
          { id: keyId, name: old.name, revoked_at: now() },
        );
      }
    });
    return { ok: true };
  }
  async integrity(ctx: Context) {
    organiser(ctx);
    return this.store.transaction(async (tx) => {
      const commands = await tx.all<{ id: string }>('commands', { event_id: ctx.event.id });
      const activity = await tx.all<Activity>('activity', { event_id: ctx.event.id }, { id: 1 });
      const tasks = await tx.all<Task>('tasks', { event_id: ctx.event.id });
      const members = await tx.all<Member>('members', { event_id: ctx.event.id });
      const missing = commands.filter((c) => !activity.some((a) => a.command_id === c.id)).length;
      const mismatches = tasks.filter(
        (t) =>
          t.version !==
          activity.filter((a) => a.entity_type === 'task' && a.entity_id === t.id).length,
      ).length;
      const foreign = tasks.filter(
        (t) =>
          !members.some((m) => m.id === t.reporter_id) ||
          (t.owner_id && !members.some((m) => m.id === t.owner_id)),
      ).length;
      return {
        ok: commands.length === activity.length && !missing && !mismatches && !foreign,
        commands: commands.length,
        activity: activity.length,
        taskVersionMismatches: mismatches,
        missingAuditEntries: missing,
        foreignKeyViolations: foreign,
        checkedAt: now(),
      };
    });
  }
}
