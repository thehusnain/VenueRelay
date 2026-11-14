import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { generateVAPIDKeys } from 'web-push';
import { server, call } from './http-fixture.ts';
import { ensureDemoAccount, demoCredentials } from '../backend/src/demo.ts';
import { Store } from '../backend/src/database.ts';
import { createEvent, execute, context, type Context } from '../backend/src/domain.ts';
import { id, now, session, passwordMatches } from '../backend/src/auth.ts';
import { PushService } from '../backend/src/push.ts';
import type { IncomingMessage } from 'node:http';

test('public demo credentials create an idempotent, verified sample organiser', async () => {
  const store = new Store(':memory:');
  try {
    await ensureDemoAccount(store);
    await ensureDemoAccount(store);
    const user = store.get<{ id: string; password_hash: string; email_verified_at: string }>(
      'SELECT * FROM users WHERE email=?',
      demoCredentials.email,
    )!;
    assert.ok(user.email_verified_at);
    assert.ok(await passwordMatches(demoCredentials.password, user.password_hash));
    assert.equal(
      store.get<{ n: number }>('SELECT COUNT(*) n FROM users WHERE email=?', demoCredentials.email)!
        .n,
      1,
    );
    assert.equal(
      store.get<{ is_demo: number }>('SELECT is_demo FROM events WHERE owner_id=?', user.id)!
        .is_demo,
      1,
    );
  } finally {
    store.close();
  }
});
test('WebSocket requires origin and membership; commits invalidate live views and logout revokes the socket', async () => {
  const s = await server();
  let ws: WebSocket | undefined;
  try {
    const auth = await call(s.url, '/auth/demo', {}),
      state = (await call(s.url, '/bootstrap', {}, auth.cookie)).data;
    const uri = s.url.replace(/^http/, 'ws') + `/api/v1/events/${state.event.id}/live`;
    const denied = new WebSocket(uri, {
      headers: { Origin: 'https://untrusted.example', Cookie: auth.cookie! },
    });
    await assert.rejects(once(denied, 'open'));
    denied.terminate();
    ws = new WebSocket(uri, { headers: { Origin: s.url, Cookie: auth.cookie! } });
    await once(ws, 'open');
    const message = new Promise<unknown[]>((resolve) =>
      ws!.on('message', (data) => {
        if (JSON.parse(String(data)).type === 'event.changed') resolve([data]);
      }),
    );
    await call(
      s.url,
      `/events/${state.event.id}/commands`,
      { action: 'task.create', payload: { title: 'Live task', location: 'Gate' } },
      auth.cookie,
      { 'Idempotency-Key': id() },
    );
    assert.equal(JSON.parse(String((await message)[0])).type, 'event.changed');
    const closed = once(ws, 'close');
    await call(s.url, '/auth/logout', {}, auth.cookie);
    assert.equal((await closed)[0], 4401);
  } finally {
    ws?.terminate();
    await s.close();
  }
});
test('durable browser push retries failed jobs, avoids acknowledged duplicates and rejects arbitrary endpoints', async () => {
  const store = new Store(':memory:');
  try {
    const user = { id: id(), name: 'Push lead', email: null };
    store.run(
      'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,NULL,?,NULL,?)',
      user.id,
      user.name,
      now(),
    );
    const eventId = createEvent(
        store,
        user,
        { name: 'Push event', venue: 'Hall', date: '2026-11-20' },
        true,
      ),
      token = session(store, user.id),
      req = { headers: { cookie: 'rally_session=' + token } } as IncomingMessage;
    const ctx = context(store, req, user, eventId),
      keys = generateVAPIDKeys();
    let calls = 0;
    const service = new PushService(
      store,
      { ...keys, subject: 'mailto:organiser@example.com' },
      async () => {
        calls++;
        if (calls === 1) throw new Error('provider offline');
        return { statusCode: 201, headers: {}, body: '' };
      },
    );
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
    };
    assert.throws(() =>
      service.subscribe(ctx, req, { ...subscription, endpoint: 'https://127.0.0.1/secret' }),
    );
    service.subscribe(ctx, req, subscription);
    const worker = store.get<{ id: string }>(
      "SELECT id FROM members WHERE event_id=? AND role='volunteer'",
      eventId,
    )!;
    const other = {
      ...ctx,
      me: { ...ctx.me, id: worker.id, role: 'volunteer' as const },
    } as Context;
    execute(store, other, id(), {
      action: 'task.create',
      payload: { title: 'Notify organiser', location: 'Gate' },
    });
    await service.runBatch();
    assert.equal(calls, 1);
    assert.equal(
      store.get<{ state: string }>('SELECT state FROM push_deliveries')!.state,
      'pending',
    );
    store.run('UPDATE push_deliveries SET next_attempt_at=0');
    await service.runBatch();
    assert.equal(calls, 2);
    await service.runBatch();
    assert.equal(calls, 2);
    service.subscribe(ctx, req, subscription);
    assert.equal(
      store.get<{ n: number }>('SELECT COUNT(*) n FROM push_deliveries')!.n,
      0,
      'Replacing a device subscription must drop its old delivery jobs',
    );
    store.run('DELETE FROM sessions');
    assert.equal(store.get<{ n: number }>('SELECT COUNT(*) n FROM push_subscriptions')!.n, 0);
  } finally {
    store.close();
  }
});
