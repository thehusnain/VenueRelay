import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationLink } from '../shared/notification-link.ts';
import {
  pendingReads,
  confirmedState,
  retainConfirmedVersions,
} from '../frontend/src/confirmed-state.ts';
import { intentId } from '../frontend/src/intent-id.ts';
import { Store } from '../backend/src/database.ts';
import { createEvent, snapshot, execute, type Context } from '../backend/src/domain.ts';
import { id, now } from '../backend/src/auth.ts';
import type { Event, Member, Task, Pending } from '../shared/contracts.ts';

test('request IDs remain cryptographically generated when an older browser has no randomUUID method', () => {
  const previous = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  try {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    const a = intentId(),
      b = intentId();
    assert.match(a, /^[a-f0-9]{32}$/);
    assert.notEqual(a, b);
  } finally {
    if (previous) Object.defineProperty(crypto, 'randomUUID', previous);
    else delete (crypto as { randomUUID?: unknown }).randomUUID;
  }
});
function stateFixture() {
  const store = new Store(':memory:'),
    user = { id: id(), name: 'Lead', email: null };
  store.run(
    'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,NULL,?,NULL,?)',
    user.id,
    user.name,
    now(),
  );
  const eventId = createEvent(
    store,
    user,
    { name: 'State test', venue: 'Hall', date: '2026-12-01' },
    true,
  );
  const ctx: Context = {
    user,
    event: store.get<Event>('SELECT * FROM events WHERE id=?', eventId)!,
    me: store.get<Member>("SELECT * FROM members WHERE event_id=? AND role='organiser'", eventId)!,
  };
  return { store, ctx };
}

test('notification destinations retain event and request context while rejecting foreign or executable URLs', () => {
  const origin = 'https://venuerelay.onrender.com';
  assert.equal(
    notificationLink({ url: '/tasks/task-1?event=event-2&notification=note-3' }, origin),
    '/tasks/task-1?event=event-2&notification=note-3',
  );
  assert.equal(
    notificationLink({ eventId: 'event-2', taskId: 'task-1', id: 'note-3' }, origin),
    '/tasks/task-1?event=event-2&notification=note-3',
  );
  for (const url of [
    'https://evil.example/tasks/t',
    'javascript:alert(1)',
    '//evil.example/',
    '/api/v1/auth/logout',
    '/request#key=secret',
  ])
    assert.equal(notificationLink({ url }, origin), '/');
  assert.equal(
    notificationLink({ url: '/?event=%3Cscript%3E&notification=a#secret' }, origin),
    '/?notification=a',
  );
  assert.equal(notificationLink(null as never, origin), '/');
});
test('pending read acknowledgements respond locally without inventing task changes or marking another event', () => {
  const { store, ctx } = stateFixture();
  try {
    const state = snapshot(store, ctx),
      stamp = now();
    state.notifications = [
      {
        id: 'note',
        member_id: ctx.me.id,
        task_id: 'task',
        message: 'Updated',
        read_at: null,
        created_at: stamp,
      },
    ];
    const read: Pending = {
      key: id(),
      eventId: ctx.event.id,
      persona: 'self',
      action: 'notification.read',
      payload: { ids: ['note'] },
      createdAt: stamp,
    };
    assert.equal(pendingReads(state, [read]).notifications[0].read_at, stamp);
    assert.equal(
      pendingReads(state, [{ ...read, eventId: 'another-event' }]).notifications[0].read_at,
      null,
    );
    assert.deepEqual(pendingReads(state, [read]).tasks, state.tasks);
    assert.equal(state.notifications[0].read_at, null);
  } finally {
    store.close();
  }
});
test('confirmed task responses appear immediately and cannot regress a newer version or cross event boundaries', () => {
  const { store, ctx } = stateFixture();
  try {
    const before = snapshot(store, ctx),
      result = execute(store, ctx, id(), {
        action: 'task.create',
        payload: { title: 'Prepare water station', location: 'West gate' },
      });
    const next = confirmedState(before, result)!;
    assert.equal(next.tasks.length, 1);
    assert.equal(next.tasks[0].id, result.entityId);
    const updated = { ...next, tasks: next.tasks.map((task) => ({ ...task, version: 2 })) };
    assert.equal(confirmedState(updated, result), updated);
    assert.equal(retainConfirmedVersions(updated, next).tasks[0].version, 2);
    assert.deepEqual(retainConfirmedVersions(updated, before).tasks, []);
    assert.equal(
      retainConfirmedVersions(updated, { ...next, me: { ...next.me, id: 'other-member' } }).tasks[0]
        .version,
      1,
    );
    assert.equal(
      confirmedState(before, {
        ...result,
        entity: { ...(result.entity as Task), event_id: 'foreign-event' },
      }),
      null,
    );
    assert.equal(
      confirmedState(before, {
        entityType: 'task',
        entity: { id: 'invalid', event_id: ctx.event.id },
      }),
      null,
    );
    assert.equal(next.activity.length, before.activity.length);
  } finally {
    store.close();
  }
});
