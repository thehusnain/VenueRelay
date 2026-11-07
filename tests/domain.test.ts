import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../backend/src/database.ts';
import {
  createEvent,
  execute,
  integrity,
  seedDemo,
  snapshot,
  context,
  invite,
  acceptInvitation,
  createApiKey,
  type Context,
} from '../backend/src/domain.ts';
import { id, now } from '../backend/src/auth.ts';
import type { Task, Member, Event } from '../shared/contracts.ts';
function fixture(path = ':memory:') {
  const store = new Store(path),
    user = { id: id(), email: null, name: 'Organiser' };
  store.run(
    'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,NULL,?,NULL,?)',
    user.id,
    user.name,
    now(),
  );
  const eventId = createEvent(
      store,
      user,
      { name: 'Community day', venue: 'Riverside Park', date: '2026-11-08' },
      true,
    ),
    event = store.get<Event>('SELECT * FROM events WHERE id=?', eventId)!;
  const members = store.all<Member>('SELECT * FROM members WHERE event_id=?', eventId),
    ctx = { user, event, me: members.find((m) => m.role === 'organiser')! };
  const volunteer = { ...ctx, me: members.find((m) => m.role === 'volunteer')! },
    vendor = { ...ctx, me: members.find((m) => m.role === 'vendor')! },
    attendee = { ...ctx, me: members.find((m) => m.role === 'attendee')! };
  return { store, ctx, volunteer, vendor, attendee };
}
const report = (store: Store, ctx: Context, key = id()) =>
  execute(store, ctx, key, {
    action: 'task.create',
    payload: {
      title: 'Accessible entrance blocked',
      description: 'Move the delivery crate away from the step-free route.',
      location: 'North gate',
      priority: 'urgent',
    },
  }).entity as Task;
test('full attendee → organiser → volunteer → verified closure journey', () => {
  const { store, ctx, volunteer, vendor, attendee } = fixture();
  let task = report(store, attendee);
  assert.equal(snapshot(store, attendee).tasks.length, 1);
  assert.equal(snapshot(store, vendor).tasks.length, 0);
  task = execute(store, ctx, id(), {
    action: 'task.assign',
    taskId: task.id,
    expectedVersion: task.version,
    payload: { ownerId: volunteer.me.id },
  }).entity as Task;
  task = execute(store, volunteer, id(), {
    action: 'task.status',
    taskId: task.id,
    expectedVersion: task.version,
    payload: { status: 'in_progress' },
  }).entity as Task;
  task = execute(store, volunteer, id(), {
    action: 'task.status',
    taskId: task.id,
    expectedVersion: task.version,
    payload: { status: 'blocked', resolution: 'Waiting for the driver to move the crate.' },
  }).entity as Task;
  task = execute(store, volunteer, id(), {
    action: 'task.status',
    taskId: task.id,
    expectedVersion: task.version,
    payload: { status: 'in_progress' },
  }).entity as Task;
  task = execute(store, volunteer, id(), {
    action: 'task.status',
    taskId: task.id,
    expectedVersion: task.version,
    payload: {
      status: 'resolved',
      resolution: 'Crate moved and the full accessible route checked.',
    },
  }).entity as Task;
  assert.throws(
    () =>
      execute(store, volunteer, id(), {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: { status: 'closed' },
      }),
    /cannot move/,
  );
  task = execute(store, ctx, id(), {
    action: 'task.status',
    taskId: task.id,
    expectedVersion: task.version,
    payload: { status: 'closed' },
  }).entity as Task;
  assert.equal(task.version, 7);
  assert.equal(snapshot(store, attendee).tasks[0].status, 'closed');
  assert.ok(snapshot(store, attendee).notifications.length >= 6);
  assert.equal(integrity(store, ctx).ok, true);
  store.close();
});
test('lost response retries return the same result without duplicate state, audit or notifications', () => {
  const { store, ctx, attendee } = fixture(),
    key = id(),
    input = {
      action: 'task.create',
      payload: { title: 'Need drinking water', location: 'Food court' },
    };
  const a = execute(store, attendee, key, input),
    before = integrity(store, ctx),
    notifications = store.get<{ n: number }>('SELECT count(*) n FROM notifications')!.n;
  const b = execute(store, attendee, key, {
    payload: { location: 'Food court', title: 'Need drinking water' },
    action: 'task.create',
  });
  assert.equal(a.entityId, b.entityId);
  assert.equal(b.replayed, true);
  assert.equal(store.get<{ n: number }>('SELECT count(*) n FROM tasks')!.n, 1);
  assert.equal(integrity(store, ctx).commands, before.commands);
  assert.equal(store.get<{ n: number }>('SELECT count(*) n FROM notifications')!.n, notifications);
  assert.throws(
    () =>
      execute(store, attendee, key, {
        ...input,
        payload: { ...input.payload, title: 'Different problem' },
      }),
    /different action/,
  );
  store.close();
});
test('two writers with the same expected version cannot overwrite one another', () => {
  const { store, ctx, volunteer, vendor } = fixture(),
    task = report(store, ctx);
  execute(store, ctx, id(), {
    action: 'task.assign',
    taskId: task.id,
    expectedVersion: 1,
    payload: { ownerId: volunteer.me.id },
  });
  assert.throws(
    () =>
      execute(store, ctx, id(), {
        action: 'task.assign',
        taskId: task.id,
        expectedVersion: 1,
        payload: { ownerId: vendor.me.id },
      }),
    /changed while/,
  );
  assert.equal(
    store.get<Task>('SELECT * FROM tasks WHERE id=?', task.id)!.owner_id,
    volunteer.me.id,
  );
  assert.equal(integrity(store, ctx).commands, 2);
  assert.equal(integrity(store, ctx).ok, true);
  store.close();
});
test('storage interruption rolls back task, audit, request claim and notifications together', () => {
  const { store, ctx } = fixture(),
    key = id(),
    input = { action: 'task.create', payload: { title: 'Test rollback', location: 'Stage' } };
  assert.throws(
    () => execute(store, ctx, key, input, { failAfterMutation: true }),
    /storage interruption/,
  );
  for (const table of ['tasks', 'commands', 'activity', 'notifications'])
    assert.equal(store.get<{ n: number }>(`SELECT count(*) n FROM ${table}`)!.n, 0);
  execute(store, ctx, key, input);
  assert.equal(integrity(store, ctx).commands, 1);
  store.close();
});
test('role and event boundaries prevent owner spoofing and foreign assignments', () => {
  const { store, ctx, attendee, volunteer, vendor } = fixture(),
    task = report(store, attendee);
  assert.throws(
    () =>
      execute(store, attendee, id(), {
        action: 'task.assign',
        taskId: task.id,
        expectedVersion: 1,
        payload: { ownerId: attendee.me.id },
      }),
    /Only an organiser/,
  );
  assert.throws(
    () =>
      execute(store, attendee, id(), {
        action: 'task.create',
        payload: { title: 'Spoof owner', location: 'Gate', ownerId: volunteer.me.id },
      }),
    /Only an organiser/,
  );
  const other = createEvent(store, ctx.user, {
      name: 'Other event',
      venue: 'Other venue',
      date: '2026-11-09',
    }),
    foreign = store.get<Member>('SELECT * FROM members WHERE event_id=?', other)!;
  assert.throws(
    () =>
      execute(store, ctx, id(), {
        action: 'task.assign',
        taskId: task.id,
        expectedVersion: 1,
        payload: { ownerId: foreign.id },
      }),
    /from this event/,
  );
  assert.throws(
    () =>
      execute(store, vendor, id(), {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: 1,
        payload: { status: 'resolved', resolution: 'Pretend complete' },
      }),
    /Task not found/,
  );
  assert.equal(integrity(store, ctx).ok, true);
  store.close();
});
test('audit and request journal are immutable at the database boundary', () => {
  const { store, ctx } = fixture();
  report(store, ctx);
  assert.throws(() => store.run('UPDATE activity SET action=?', 'changed'), /append-only/);
  assert.throws(() => store.run('DELETE FROM activity'), /append-only/);
  assert.throws(() => store.run('DELETE FROM commands'), /immutable/);
  assert.throws(() => store.run('UPDATE commands SET request_key=?', 'changed'), /immutable/);
  store.close();
});
test('records and deduplication survive a database restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rally-test-')),
    path = join(dir, 'test.sqlite');
  const { store, ctx } = fixture(path),
    key = id(),
    input = { action: 'task.create', payload: { title: 'Persistent work', location: 'Gate' } };
  const result = execute(store, ctx, key, input);
  store.close();
  const reopened = new Store(path);
  assert.equal(execute(reopened, ctx, key, input).entityId, result.entityId);
  assert.equal(integrity(reopened, ctx).ok, true);
  assert.equal(integrity(reopened, ctx).commands, 1);
  reopened.close();
  rmSync(dir, { recursive: true });
});
test('single-use invitations bind the actual signed-in user and reject other accounts', () => {
  const { store, ctx } = fixture(),
    invitation = invite(store, ctx, { name: 'New volunteer', role: 'volunteer' }),
    user = { id: id(), email: 'a@example.test', name: 'New teammate' },
    other = { id: id(), email: 'b@example.test', name: 'Other teammate' };
  for (const u of [user, other])
    store.run(
      'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,?,?,NULL,?)',
      u.id,
      u.email,
      u.name,
      now(),
    );
  assert.equal(acceptInvitation(store, user, invitation.token).eventId, ctx.event.id);
  assert.equal(acceptInvitation(store, user, invitation.token).eventId, ctx.event.id);
  assert.throws(() => acceptInvitation(store, other, invitation.token), /already been accepted/);
  assert.equal(integrity(store, ctx).ok, true);
  store.close();
});
test('seeded demonstration data satisfies the same operational invariants', () => {
  const { store, ctx } = fixture();
  store.transaction(() => seedDemo(store, ctx));
  const count = integrity(store, ctx).commands;
  seedDemo(store, ctx);
  assert.equal(integrity(store, ctx).commands, count);
  assert.equal(integrity(store, ctx).ok, true);
  assert.equal(snapshot(store, ctx).tasks.length, 7);
  store.close();
});
test('integration tokens are stored hashed, constrained to one event, and revocable', () => {
  const { store, ctx } = fixture(),
    key = createApiKey(store, ctx, 'Test integration');
  assert.ok(!JSON.stringify(store.all('SELECT * FROM api_keys')).includes(key.token));
  const req = { headers: { authorization: `Bearer ${key.token}` } } as any;
  assert.equal(context(store, req, undefined, ctx.event.id).me.id, ctx.me.id);
  const other = createEvent(store, ctx.user, {
    name: 'Other event',
    venue: 'Venue',
    date: '2026-11-09',
  });
  assert.throws(() => context(store, req, undefined, other), /invalid or revoked/);
  store.run('UPDATE api_keys SET revoked_at=? WHERE id=?', now(), key.id);
  assert.throws(() => context(store, req, undefined, ctx.event.id), /invalid or revoked/);
  store.close();
});
