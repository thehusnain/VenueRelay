import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { WebSocket } from 'ws';
import { generateVAPIDKeys } from 'web-push';
import { MongoStore } from '../backend/src/mongo/store.ts';
import { MongoBackend } from '../backend/src/mongo/backend.ts';
import { MongoPush } from '../backend/src/mongo/push.ts';
import { createApp } from '../backend/src/api.ts';
import { Store } from '../backend/src/database.ts';
import { bootstrap, seedDemo, context } from '../backend/src/domain.ts';
import { migrate } from '../scripts/migrate-mongo.ts';
import { id, now, hash, type User } from '../backend/src/auth.ts';
import type { Task, Member } from '../shared/contracts.ts';
import type { CommandInput } from '../backend/src/mutations.ts';
import type { Context } from '../backend/src/domain.ts';
import type { EmailSettings } from '../backend/src/email.ts';

let replica: MongoMemoryReplSet, store: MongoStore, backend: MongoBackend;
let app: ReturnType<typeof createApp>, origin: string;
const mail: EmailSettings = {
  mode: 'preview',
  origin: 'http://localhost:3999',
  from: 'VenueRelay <hello@localhost>',
  previewDir: '/tmp/venuerelay-test-mail',
};
const req = (session = '', persona = 'self') =>
  ({
    headers: { cookie: 'rally_session=' + session, 'x-rally-persona': persona },
  }) as unknown as IncomingMessage;
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  store = await MongoStore.connect(replica.getUri(), 'rally_integration');
  backend = new MongoBackend(store, { mail, checkDomain: async () => {}, demo: true });
  await backend.ensureDemo();
  app = createApp({ backend, emailSettings: mail, allowedOrigins: [mail.origin] });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  origin = 'http://127.0.0.1:' + (app.address() as { port: number }).port;
});
after(async () => {
  backend?.stopLive();
  await new Promise<void>((resolve) => app?.close(() => resolve()) ?? resolve());
  await store?.close();
  await replica?.stop();
});
async function api(
  path: string,
  data?: unknown,
  session = '',
  headers: Record<string, string> = {},
) {
  const response = await fetch(origin + '/api/v1' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'rally_session=' + session, ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return {
    response,
    data: (await response.json()) as any,
    session: response.headers.get('set-cookie')?.match(/rally_session=([^;]+)/)?.[1] ?? session,
  };
}
async function account(name: string) {
  const email = id() + '@example.com',
    registered = await api('/auth/register', { name, email, password: 'LongPassword2026!' });
  assert.equal(registered.response.status, 200);
  const job = await store.get<{ body: string }>('email_outbox', {
    user_id: registered.data.user.id,
  });
  const proof = new URL(job!.body.match(/http[^\s]+/)![0]).searchParams.get('token');
  assert.equal((await api('/auth/verify-email', { token: proof })).response.status, 200);
  const user = (await store.get<User>('users', { id: registered.data.user.id }))!;
  return { user, session: registered.session, email, password: 'LongPassword2026!' };
}
async function fixture() {
  const lead = await account('Event lead'),
    created = await api(
      '/events',
      { name: 'Community repair day', venue: 'Town hall', date: '2026-12-01' },
      lead.session,
    );
  assert.equal(created.response.status, 201);
  const ctx = await backend.domain.context(req(lead.session), created.data.eventId);
  return { lead, ctx };
}
async function teammate(ctx: Context, role: Member['role']) {
  const person = await account(role),
    invitation = await backend.domain.invite(ctx, { name: role, role });
  await backend.domain.accept(person.user, invitation.token);
  return {
    ...person,
    ctx: await backend.domain.context(req(person.session), ctx.event.id),
    invitation,
  };
}
const command = (ctx: Context, input: CommandInput, key = id()) =>
  backend.domain.execute(ctx, key, input);
const report = (ctx: Context, key = id()) =>
  command(
    ctx,
    {
      action: 'task.create',
      payload: {
        title: 'Clear the accessible entrance',
        location: 'North gate',
        priority: 'urgent',
      },
    },
    key,
  );

test('real accounts verify once and create an empty event; demo stays isolated', async () => {
  const { lead, ctx } = await fixture(),
    snapshot = await backend.domain.snapshot(ctx);
  assert.equal(snapshot.event.is_demo, 0);
  assert.equal(snapshot.members.length, 1);
  assert.equal(snapshot.tasks.length, 0);
  assert.equal(snapshot.schedule.length, 0);
  assert.equal((await api('/auth/me', undefined, lead.session)).data.user.emailVerified, true);
  const demo = await api('/auth/login', { email: 'demo@rally.local', password: 'RallyDemo2026!' });
  assert.equal(demo.response.status, 200);
  assert.equal((await api('/bootstrap', {}, demo.session)).data.tasks.length, 7);
  assert.equal(
    (
      await api(
        '/events',
        { name: 'Private event', venue: 'Hall', date: '2026-12-01' },
        demo.session,
      )
    ).response.status,
    403,
  );
  const invite = await backend.domain.invite(ctx, { name: 'Guest', role: 'attendee' });
  assert.equal(
    (await api('/invitations/accept', { token: invite.token }, demo.session)).response.status,
    403,
  );
  await backend.ensureDemo();
  assert.equal((await api('/bootstrap', {}, demo.session)).data.tasks.length, 7);
});
test('full attendee, organiser and volunteer journey preserves ownership, private views and history', async () => {
  const { ctx } = await fixture(),
    attendee = await teammate(ctx, 'attendee'),
    volunteer = await teammate(ctx, 'volunteer'),
    vendor = await teammate(ctx, 'vendor');
  let task = (await report(attendee.ctx)).entity as Task;
  assert.equal((await backend.domain.snapshot(vendor.ctx)).tasks.length, 0);
  await assert.rejects(
    command(attendee.ctx, {
      action: 'task.assign',
      taskId: task.id,
      expectedVersion: 1,
      payload: { ownerId: volunteer.ctx.me.id },
    }),
    { code: 'FORBIDDEN' },
  );
  task = (
    await command(ctx, {
      action: 'task.assign',
      taskId: task.id,
      expectedVersion: task.version,
      payload: { ownerId: volunteer.ctx.me.id },
    })
  ).entity as Task;
  for (const status of ['in_progress', 'blocked', 'in_progress', 'resolved', 'closed']) {
    task = (
      await command(status === 'closed' ? ctx : volunteer.ctx, {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: { status, resolution: 'Entrance cleared and inspected' },
      })
    ).entity as Task;
  }
  assert.equal(task.status, 'closed');
  assert.equal(task.version, 7);
  assert.equal((await backend.domain.snapshot(attendee.ctx)).tasks[0].status, 'closed');
  assert.equal((await backend.domain.snapshot(volunteer.ctx)).notifications.length, 2);
  assert.equal(
    (await backend.domain.activity(vendor.ctx)).filter((a) => a.entity_type === 'task').length,
    0,
  );
  const proof = await backend.domain.integrity(ctx);
  assert.equal(proof.ok, true);
  assert.equal(proof.taskVersionMismatches, 0);
  assert.equal(proof.commands, proof.activity);
});
test('interruption before commit rolls back task, command, activity and notifications together', async () => {
  const { ctx } = await fixture(),
    before = await backend.domain.integrity(ctx);
  await assert.rejects(
    backend.domain.execute(
      ctx,
      id(),
      { action: 'task.create', payload: { title: 'A task that must roll back', location: 'Gate' } },
      { failAfterMutation: true },
    ),
    /Simulated storage interruption/,
  );
  assert.equal((await backend.domain.snapshot(ctx)).tasks.length, 0);
  assert.equal((await backend.domain.integrity(ctx)).commands, before.commands);
});
test('simultaneous duplicate retries and lost acknowledgements create exactly one record', async () => {
  const { ctx } = await fixture(),
    key = id();
  const results = await Promise.all(Array.from({ length: 8 }, () => report(ctx, key)));
  assert.equal(new Set(results.map((r) => r.entityId)).size, 1);
  assert.equal(results.filter((r) => !r.replayed).length, 1);
  assert.equal((await report(ctx, key)).replayed, true);
  await assert.rejects(
    command(
      ctx,
      { action: 'task.create', payload: { title: 'Different action', location: 'Elsewhere' } },
      key,
    ),
    { code: 'IDEMPOTENCY_MISMATCH' },
  );
  const proof = await backend.domain.integrity(ctx);
  assert.equal(proof.commands, 1);
  assert.equal(proof.activity, 1);
  assert.equal(proof.ok, true);
});
test('two organisers updating one version produce one winner and an explicit conflict', async () => {
  const { ctx } = await fixture(),
    worker = await teammate(ctx, 'vendor'),
    task = (await report(ctx)).entity as Task;
  const updates = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      command(ctx, {
        action: 'task.assign',
        taskId: task.id,
        expectedVersion: 1,
        payload: { ownerId: worker.ctx.me.id },
      }),
    ),
  );
  assert.equal(updates.filter((r) => r.status === 'fulfilled').length, 1);
  const rejection = updates.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejection.reason.code, 'VERSION_CONFLICT');
  assert.equal((await backend.domain.snapshot(ctx)).tasks[0].version, 2);
  assert.equal((await backend.domain.integrity(ctx)).ok, true);
});
test('invitations cannot be stolen or used twice; malformed actors and cross-event owners are rejected', async () => {
  const { ctx } = await fixture(),
    worker = await teammate(ctx, 'volunteer'),
    outsider = await account('Outsider');
  assert.equal(
    (await backend.domain.accept(worker.user, worker.invitation.token)).eventId,
    ctx.event.id,
  );
  await assert.rejects(backend.domain.accept(outsider.user, worker.invitation.token), {
    code: 'INVITATION_USED',
  });
  await assert.rejects(backend.domain.context(req(outsider.session), ctx.event.id), {
    code: 'FORBIDDEN',
  });
  const other = await fixture(),
    task = (await report(ctx)).entity as Task;
  await assert.rejects(
    command(ctx, {
      action: 'task.assign',
      taskId: task.id,
      expectedVersion: 1,
      payload: { ownerId: other.ctx.me.id },
    }),
    { code: 'INVALID_OWNER' },
  );
  const response = await api(
    `/events/${ctx.event.id}/commands`,
    { action: 'task.create', payload: { title: 'Wrong signed in person', location: 'Hall' } },
    worker.session,
    { 'Idempotency-Key': id(), 'X-Rally-Expected-Actor': ctx.me.id },
  );
  assert.equal(response.response.status, 409);
  assert.equal(response.data.error.code, 'ACTOR_CHANGED');
});
test('API keys are event-scoped, revocable and never exposed in audit responses', async () => {
  const { ctx } = await fixture(),
    key = await backend.domain.createKey(ctx, 'Integration');
  const integration = await backend.domain.context(
    { headers: { authorization: 'Bearer ' + key.token } } as IncomingMessage,
    ctx.event.id,
  );
  await report(integration);
  await backend.domain.revokeKey(ctx, key.id);
  await assert.rejects(
    backend.domain.context(
      { headers: { authorization: 'Bearer ' + key.token } } as IncomingMessage,
      ctx.event.id,
    ),
    { code: 'INVALID_TOKEN' },
  );
  assert.equal(JSON.stringify(await backend.domain.activity(ctx)).includes('token_hash'), false);
  for (const table of ['commands', 'activity', 'account_activity']) {
    assert.throws(() => store.update(table, {}, { $set: { action: 'tampered' } }), {
      code: 'APPEND_ONLY',
    });
    assert.throws(() => store.remove(table, {}), { code: 'APPEND_ONLY' });
  }
});
async function wsDenied(url: string, wsOrigin = mail.origin) {
  const ws = new WebSocket(url, { origin: wsOrigin });
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Socket rejection timed out'));
    }, 5000);
    ws.once('error', () => clearTimeout(timeout));
    ws.once('open', () => {
      ws.terminate();
      reject(new Error('Socket unexpectedly authenticated'));
    });
    ws.once('error', () => resolve());
  });
}
test(
  'one-use origin-bound socket tickets authenticate direct live updates, then logout revokes the socket',
  { timeout: 15000 },
  async () => {
    const { ctx, lead } = await fixture(),
      response = await api(`/events/${ctx.event.id}/live-ticket`, {}, lead.session, {
        Origin: mail.origin,
      });
    const url =
      origin.replace('http:', 'ws:') +
      `/api/v1/events/${ctx.event.id}/live?ticket=` +
      response.data.ticket;
    await wsDenied(url, 'http://untrusted.example');
    const ws = new WebSocket(url, { origin: mail.origin });
    await once(ws, 'open');
    await wsDenied(url);
    const changed = once(ws, 'message');
    await api(
      `/events/${ctx.event.id}/commands`,
      { action: 'task.create', payload: { title: 'Live event change', location: 'Gate' } },
      lead.session,
      { 'Idempotency-Key': id() },
    );
    assert.equal(JSON.parse(String((await changed)[0])).type, 'event.changed');
    const closed = once(ws, 'close');
    await api('/auth/logout', {}, lead.session);
    assert.equal((await closed)[0], 4401);
    assert.equal((await api('/auth/me', undefined, lead.session)).response.status, 401);
    const fresh = await api('/auth/login', { email: lead.email, password: lead.password }),
      ticket = await api(`/events/${ctx.event.id}/live-ticket`, {}, fresh.session, {
        Origin: mail.origin,
      });
    await store.update(
      'live_tickets',
      { token_hash: hash(ticket.data.ticket) },
      { $set: { expires: new Date(Date.now() - 1000) } },
    );
    await wsDenied(url.replace(response.data.ticket, ticket.data.ticket));
  },
);
test(
  'mail retries survive a provider failure and an older worker cannot overwrite a recovered lease',
  { timeout: 15000 },
  async () => {
    const user = await account('Mail worker');
    await api('/auth/forgot-password', { email: user.email });
    const job = (
      await store.all<{ id: string }>('email_outbox', { user_id: user.user.id, status: 'pending' })
    ).find((j) => j)!;
    await backend.accounts.deliver(async () => {
      throw new Error('Provider offline');
    });
    await store.updateMany(
      'email_outbox',
      { user_id: { $ne: user.user.id }, status: 'pending' },
      { $set: { status: 'cancelled' } },
    );
    await store.update(
      'email_outbox',
      { id: job.id },
      { $set: { status: 'pending', next_attempt_at: now() } },
    );
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (entered = r)),
      hold = new Promise<void>((r) => (release = r));
    const first = backend.accounts.deliver(async () => {
      entered();
      await hold;
    });
    await started;
    const leased = await store.get('email_outbox', { id: job.id });
    assert.equal(leased!.status, 'sending');
    await store.update(
      'email_outbox',
      { id: job.id },
      { $set: { lease_until: new Date(Date.now() - 1000).toISOString() } },
    );
    await backend.accounts.deliver(async () => {
      throw new Error('Second provider failure');
    });
    release();
    await first;
    assert.equal((await store.get('email_outbox', { id: job.id }))!.status, 'pending');
    await store.update('email_outbox', { id: job.id }, { $set: { next_attempt_at: now() } });
    await backend.accounts.deliver(async () => {});
    assert.equal((await store.get('email_outbox', { id: job.id }))!.status, 'preview');
  },
);
test('password reset is single use and removes sessions and device push access', async () => {
  const person = await account('Password recovery');
  await api('/auth/forgot-password', { email: person.email });
  const job = await store.get<{ body: string }>('email_outbox', {
      user_id: person.user.id,
      status: 'pending',
    }),
    proof = new URL(job!.body.match(/http[^\s]+/)![0]).searchParams.get('token');
  assert.equal(
    (await api('/auth/reset-password', { token: proof, password: 'ReplacementPassword2026!' }))
      .response.status,
    200,
  );
  assert.equal((await api('/auth/me', undefined, person.session)).response.status, 401);
  assert.equal(
    (await api('/auth/reset-password', { token: proof, password: 'AnotherPassword2026!' })).response
      .status,
    410,
  );
  assert.equal(
    (await api('/auth/login', { email: person.email, password: person.password })).response.status,
    401,
  );
  assert.equal(
    (await api('/auth/login', { email: person.email, password: 'ReplacementPassword2026!' }))
      .response.status,
    200,
  );
});
test('push provider failures retry without duplicate jobs; unsubscribe prevents a delayed acknowledgement recreating records', async () => {
  const { ctx } = await fixture(),
    worker = await teammate(ctx, 'volunteer'),
    keys = generateVAPIDKeys();
  let attempts = 0;
  const push = new MongoPush(store, { ...keys, subject: 'mailto:ops@example.com' }, async () => {
    attempts++;
    throw new Error('Provider offline');
  });
  const endpoint = 'https://fcm.googleapis.com/fcm/send/' + id();
  await push.subscribe(worker.ctx, req(worker.session), {
    endpoint,
    keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
  });
  await command(ctx, {
    action: 'task.create',
    payload: { title: 'Check vendor access', location: 'Gate', ownerId: worker.ctx.me.id },
  });
  await push.runBatch();
  const sub = await store.get('push_subscriptions', { endpoint }),
    job = await store.get('push_deliveries', { subscription_id: sub!.id });
  assert.equal(attempts, 1);
  assert.equal(job!.attempts, 1);
  await push.runBatch();
  assert.equal(attempts, 1);
  assert.equal((await store.all('push_deliveries', { subscription_id: sub!.id })).length, 1);
  await store.update(
    'push_deliveries',
    { subscription_id: sub!.id },
    { $set: { next_attempt_at: 0 } },
  );
  const delayed = new MongoPush(store, { ...keys, subject: 'mailto:ops@example.com' }, async () => {
    await push.unsubscribe(worker.ctx, { endpoint });
    return {} as any;
  });
  await delayed.runBatch();
  assert.equal((await store.all('push_deliveries', { subscription_id: sub!.id })).length, 0);
  assert.equal(await store.get('push_subscriptions', { endpoint }), undefined);
});
test('reconnection preserves records and the read-only migration is atomic and refuses a populated destination', async () => {
  const { ctx } = await fixture(),
    saved = await report(ctx),
    second = await MongoStore.connect(replica.getUri(), 'rally_integration');
  try {
    assert.equal((await second.get<Task>('tasks', { id: saved.entityId }))!.version, 1);
  } finally {
    await second.close();
  }
  const folder = mkdtempSync(join(tmpdir(), 'venuerelay-migration-')),
    source = join(folder, 'source.sqlite'),
    sql = new Store(source),
    user = { id: id(), email: null, name: 'Local demo' };
  sql.run(
    'INSERT INTO users(id,email,name,created_at) VALUES (?,NULL,?,?)',
    user.id,
    user.name,
    now(),
  );
  const event = bootstrap(sql, user);
  const ctxSql = context(sql, req(), user, event);
  seedDemo(sql, ctxSql);
  sql.close();
  const destination = await MongoStore.connect(replica.getUri(), 'rally_migration');
  try {
    const dry = await migrate(source, destination);
    assert.equal(dry.applied, false);
    assert.equal(await destination.get('users', {}), undefined);
    assert.equal((await migrate(source, destination, true)).applied, true);
    assert.equal((await destination.all('tasks')).length, 7);
    assert.equal((await destination.all('sessions')).length, 0);
    await assert.rejects(migrate(source, destination, true), /Destination must be empty/);
  } finally {
    await destination.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
