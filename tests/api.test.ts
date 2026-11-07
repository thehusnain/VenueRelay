import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id } from '../backend/src/auth.ts';
import { server, call, register, confirmation, verifiedAccount } from './http-fixture.ts';
test('HTTP auth, cookies, origin protection and logout', async () => {
  const s = await server();
  try {
    assert.equal((await call(s.url, '/bootstrap', {})).status, 401);
    assert.equal(
      (await call(s.url, '/auth/demo', {}, undefined, { Origin: 'https://untrusted.example' }))
        .status,
      403,
    );
    const guest = await call(s.url, '/auth/demo', {});
    assert.equal(guest.status, 200);
    assert.ok(guest.cookie);
    const snapshot = await call(s.url, '/bootstrap', {}, guest.cookie);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.data.me.role, 'organiser');
    assert.equal((await call(s.url, '/auth/logout', {}, guest.cookie)).status, 200);
    assert.equal((await call(s.url, '/auth/me', undefined, guest.cookie)).status, 401);
  } finally {
    await s.close();
  }
});
test('parallel duplicate HTTP commands create exactly one record and one activity entry', async () => {
  const s = await server();
  try {
    const auth = await call(s.url, '/auth/demo', {}),
      state = (await call(s.url, '/bootstrap', {}, auth.cookie)).data,
      eventId = state.event.id,
      key = id(),
      input = {
        action: 'task.create',
        payload: { title: 'Parallel retry test', location: 'West gate' },
      };
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        call(s.url, `/events/${eventId}/commands`, input, auth.cookie, { 'Idempotency-Key': key }),
      ),
    );
    assert.ok(results.every((x) => x.status === 200));
    assert.equal(new Set(results.map((x) => x.data.entityId)).size, 1);
    const snapshot = await call(s.url, `/events/${eventId}/snapshot`, undefined, auth.cookie);
    assert.equal(
      snapshot.data.tasks.filter((task: { title: string }) => task.title === 'Parallel retry test')
        .length,
      1,
    );
    const check = await call(s.url, `/events/${eventId}/integrity`, undefined, auth.cookie);
    assert.equal(check.data.ok, true);
  } finally {
    await s.close();
  }
});
test('live event role spoofing and cross-user access are rejected at the HTTP boundary', async () => {
  const s = await server();
  try {
    const a = await verifiedAccount(s),
      event = (
        await call(
          s.url,
          '/events',
          { name: 'Real event', venue: 'Town hall', date: '2026-11-10' },
          a.cookie,
        )
      ).data.eventId,
      b = await call(s.url, '/auth/demo', {});
    assert.equal((await call(s.url, `/events/${event}/snapshot`, undefined, b.cookie)).status, 403);
    assert.equal(
      (
        await call(s.url, `/events/${event}/snapshot`, undefined, a.cookie, {
          'X-Rally-Persona': 'organiser',
        })
      ).status,
      403,
    );
    assert.equal((await call(s.url, `/events/${event}/snapshot`, undefined, a.cookie)).status, 200);
  } finally {
    await s.close();
  }
});
test('register, invite, accept, assign and volunteer completion use real separate accounts', async () => {
  const s = await server();
  try {
    const lead = await verifiedAccount(s, 'Event lead');
    const eventId = (
      await call(
        s.url,
        '/events',
        { name: 'Community makers', venue: 'Town hall', date: '2026-11-10' },
        lead.cookie,
      )
    ).data.eventId;
    const invitation = (
      await call(
        s.url,
        `/events/${eventId}/invitations`,
        { name: 'Team volunteer', role: 'volunteer' },
        lead.cookie,
      )
    ).data;
    const worker = await verifiedAccount(s, 'Team volunteer');
    assert.equal(
      (await call(s.url, '/invitations/accept', { token: invitation.token }, worker.cookie)).status,
      200,
    );
    const workerState = (await call(s.url, `/events/${eventId}/snapshot`, undefined, worker.cookie))
      .data;
    assert.equal(workerState.me.role, 'volunteer');
    let task = (
      await call(
        s.url,
        `/events/${eventId}/commands`,
        {
          action: 'task.create',
          payload: {
            title: 'Prepare welcome packs',
            location: 'Entrance',
            ownerId: workerState.me.id,
          },
        },
        lead.cookie,
        { 'Idempotency-Key': id() },
      )
    ).data.entity;
    assert.equal(task.status, 'assigned');
    for (const status of ['in_progress', 'resolved']) {
      const response = await call(
        s.url,
        `/events/${eventId}/commands`,
        {
          action: 'task.status',
          taskId: task.id,
          expectedVersion: task.version,
          payload: { status, resolution: 'All welcome packs prepared and counted.' },
        },
        worker.cookie,
        { 'Idempotency-Key': id() },
      );
      assert.equal(response.status, 200);
      task = response.data.entity;
    }
    assert.equal(
      (
        await call(
          s.url,
          `/events/${eventId}/commands`,
          {
            action: 'task.status',
            taskId: task.id,
            expectedVersion: task.version,
            payload: { status: 'closed' },
          },
          worker.cookie,
          { 'Idempotency-Key': id() },
        )
      ).status,
      422,
    );
    const closed = await call(
      s.url,
      `/events/${eventId}/commands`,
      {
        action: 'task.status',
        taskId: task.id,
        expectedVersion: task.version,
        payload: { status: 'closed' },
      },
      lead.cookie,
      { 'Idempotency-Key': id() },
    );
    assert.equal(closed.data.entity.status, 'closed');
    const login = await call(s.url, '/auth/login', {
      email: worker.email,
      password: worker.password,
    });
    assert.equal(login.status, 200);
    assert.equal(
      (await call(s.url, `/events/${eventId}/snapshot`, undefined, login.cookie)).data.tasks[0]
        .status,
      'closed',
    );
  } finally {
    await s.close();
  }
});
test('native clients can use revocable bearer sessions without cross-site cookies', async () => {
  const s = await server();
  try {
    const auth = await call(s.url, '/auth/demo', {}, undefined, { 'X-Rally-Client': 'native' });
    assert.ok(auth.data.sessionToken);
    const headers = { Authorization: `Bearer ${auth.data.sessionToken}` };
    const state = await call(s.url, '/bootstrap', {}, undefined, headers);
    assert.equal(state.status, 200);
    const event = state.data.event.id;
    assert.equal(
      (await call(s.url, `/events/${event}/snapshot`, undefined, undefined, headers)).status,
      200,
    );
    await call(s.url, '/auth/logout', {}, undefined, headers);
    assert.equal(
      (await call(s.url, `/events/${event}/snapshot`, undefined, undefined, headers)).status,
      401,
    );
  } finally {
    await s.close();
  }
});

test('unverified accounts cannot open events and real accounts start with empty onboarding', async () => {
  const s = await server();
  try {
    const a = await register(s);
    assert.equal(a.data.user.emailVerified, false);
    assert.ok(!JSON.stringify(a.data).includes('token='));
    assert.equal((await call(s.url, '/bootstrap', {}, a.cookie)).status, 403);
    assert.equal(
      (
        await call(
          s.url,
          '/events',
          { name: 'Test event', date: '2026-11-10', venue: 'Hall' },
          a.cookie,
        )
      ).status,
      403,
    );
    const secret = await confirmation(s, a.email);
    assert.equal(
      (await call(s.url, '/auth/verify-email', { token: secret }, a.cookie)).status,
      200,
    );
    const setup = await call(s.url, '/bootstrap', {}, a.cookie);
    assert.equal(setup.data.requiresSetup, true);
    assert.ok(!setup.data.tasks);
    assert.equal(
      (await call(s.url, '/auth/verify-email', { token: secret }, a.cookie)).status,
      410,
    );
  } finally {
    await s.close();
  }
});
