import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../backend/src/database.ts';
import { createEvent, execute, snapshot, integrity, type Context } from '../backend/src/domain.ts';
import { id, now } from '../backend/src/auth.ts';
import {
  addIntent,
  deviceDB,
  readQueue,
  scopeOf,
  writeState,
  migrateDeviceStorage,
} from '../frontend/src/offline-store.ts';
import { syncOutbox } from '../frontend/src/sync-engine.ts';
function fixture() {
  const store = new Store(':memory:'),
    user = { id: id(), name: 'Offline lead', email: null };
  store.run(
    'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,NULL,?,NULL,?)',
    user.id,
    user.name,
    now(),
  );
  const eventId = createEvent(
    store,
    user,
    { name: 'Offline test', venue: 'Hall', date: '2026-11-20' },
    true,
  );
  const ctx = {
    user,
    event: store.get('SELECT * FROM events WHERE id=?', eventId),
    me: store.get("SELECT * FROM members WHERE event_id=? AND role='organiser'", eventId),
  } as Context;
  return { store, ctx, snapshot: snapshot(store, ctx) };
}
async function empty() {
  const db = await deviceDB();
  await db.clear('outbox');
  await db.clear('state');
}
test('IndexedDB replay after a lost committed response has exactly one server effect', async () => {
  await empty();
  const f = fixture(),
    original = globalThis.fetch;
  let lost = true;
  try {
    await writeState('activeUser', f.ctx.user.id);
    await addIntent(f.snapshot, {
      key: 'retained-intent',
      eventId: f.ctx.event.id,
      persona: 'self',
      action: 'task.create',
      payload: { title: 'Prepare water', location: 'Gate' },
      createdAt: now(),
    });
    globalThis.fetch = async (_url, options) => {
      if (String(_url).endsWith('/auth/me'))
        return new Response(JSON.stringify({ user: { id: f.ctx.user.id } }));
      const body = JSON.parse(String(options?.body));
      const key = (options?.headers as Record<string, string>)['Idempotency-Key'];
      const result = execute(f.store, f.ctx, key, body);
      if (lost) {
        lost = false;
        throw new TypeError('response lost');
      }
      return new Response(JSON.stringify(result));
    };
    const first = await syncOutbox();
    assert.equal(first.retry, true);
    assert.equal((await readQueue()).length, 1);
    const db = await deviceDB(),
      item = (await readQueue())[0];
    await db.put('outbox', { ...item, nextAttemptAt: 0 });
    await Promise.all([syncOutbox(), syncOutbox()]);
    assert.equal((await readQueue()).length, 0);
    assert.equal(snapshot(f.store, f.ctx).tasks.length, 1);
    assert.equal(integrity(f.store, f.ctx).ok, true);
    assert.equal(integrity(f.store, f.ctx).commands, 1);
  } finally {
    globalThis.fetch = original;
    f.store.close();
  }
});
test('IndexedDB task guard is atomic across tabs and a changed account cannot send queued work', async () => {
  await empty();
  const f = fixture(),
    original = globalThis.fetch;
  try {
    const intent = {
      key: 'first',
      eventId: f.ctx.event.id,
      persona: 'self',
      action: 'task.status',
      taskId: 'task-one',
      expectedVersion: 1,
      payload: { status: 'in_progress' },
      createdAt: now(),
    };
    const results = await Promise.allSettled([
      addIntent(f.snapshot, intent),
      addIntent(f.snapshot, { ...intent, key: 'second' }),
    ]);
    assert.equal(results.filter((v) => v.status === 'fulfilled').length, 1);
    await writeState('activeUser', f.ctx.user.id);
    let posts = 0;
    globalThis.fetch = async (_url, options) => {
      if (options?.method === 'POST') posts++;
      return new Response(JSON.stringify({ user: { id: 'another-account' } }));
    };
    assert.equal((await syncOutbox()).authRequired, true);
    assert.equal(posts, 0);
    assert.equal((await readQueue(scopeOf(f.snapshot))).length, 1);
  } finally {
    globalThis.fetch = original;
    f.store.close();
  }
});
test('legacy outbox migration retains IDs and quarantines unreadable entries without dropping raw data', async () => {
  await empty();
  const f = fixture();
  const legacy = new Map<string, string>();
  const key = `rally:v1:outbox:${scopeOf(f.snapshot)}:damaged`;
  legacy.set(key, '{broken');
  legacy.set('rally:v1:snapshot:broken', 'unreadable');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return legacy.size;
      },
      key: (n: number) => [...legacy.keys()][n],
      getItem: (key: string) => legacy.get(key) ?? null,
      removeItem: (key: string) => legacy.delete(key),
    },
  });
  try {
    await migrateDeviceStorage();
    const items = await readQueue();
    assert.equal(items.length, 1);
    assert.equal(items[0].key, 'damaged');
    assert.equal(items[0].raw, '{broken');
    assert.equal(items[0].action, 'device.unreadable');
    assert.ok(!legacy.has(key));
    assert.ok(legacy.has('rally:v1:snapshot:broken'));
    await migrateDeviceStorage();
    assert.equal((await readQueue()).length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as any).localStorage;
    f.store.close();
  }
});

test('an expired old worker cannot resurrect an intent already confirmed by another tab', async () => {
  await empty();
  const f = fixture(),
    original = globalThis.fetch;
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
      release = resolve;
    }),
    begun = new Promise<void>((resolve) => {
      started = resolve;
    });
  let posts = 0;
  try {
    await writeState('activeUser', f.ctx.user.id);
    await addIntent(f.snapshot, {
      key: 'lease-recovery',
      eventId: f.ctx.event.id,
      persona: 'self',
      action: 'task.create',
      payload: { title: 'Only one result', location: 'Gate' },
      createdAt: now(),
    });
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/auth/me'))
        return new Response(JSON.stringify({ user: { id: f.ctx.user.id } }));
      posts++;
      const result = execute(f.store, f.ctx, 'lease-recovery', JSON.parse(String(options?.body)));
      if (posts === 1) {
        started();
        await waiting;
        throw new TypeError('Old request lost');
      }
      return new Response(JSON.stringify(result));
    };
    const first = syncOutbox();
    await begun;
    const db = await deviceDB(),
      item = (await readQueue())[0];
    await db.put('outbox', { ...item, leaseUntil: 0 });
    await syncOutbox();
    release();
    await first;
    assert.equal((await readQueue()).length, 0);
    assert.equal(integrity(f.store, f.ctx).commands, 1);
  } finally {
    release();
    globalThis.fetch = original;
    f.store.close();
  }
});
