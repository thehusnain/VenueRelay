import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server, call } from './http-fixture.ts';
import { token } from '../backend/src/auth.ts';
import { SqliteAttendees } from '../backend/src/attendees.ts';

async function staff(s: Awaited<ReturnType<typeof server>>, username: string) {
  const account = await call(s.url, '/auth/register', {
    username,
    name: username,
    password: 'staff password 2026',
  });
  assert.equal(account.status, 200, JSON.stringify(account.data));
  const event = await call(
    s.url,
    '/events',
    { name: 'Community day', venue: 'Town hall', date: '2026-12-01' },
    account.cookie,
  );
  assert.equal(event.status, 201, JSON.stringify(event.data));
  return { ...account, eventId: event.data.eventId };
}
test('username accounts create real empty events and support login, private recovery and staff invitations', async () => {
  const s = await server('disabled');
  try {
    const lead = await staff(s, 'event_lead');
    assert.equal(lead.data.user.email, null);
    assert.equal(lead.data.user.username, 'event_lead');
    assert.equal((await call(s.url, '/bootstrap', {}, lead.cookie)).data.tasks.length, 0);
    assert.equal(
      (
        await call(s.url, '/auth/register', {
          username: 'EVENT_LEAD',
          name: 'Other person',
          password: 'staff password 2026',
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(s.url, '/auth/login', { username: 'event_lead', password: 'wrong password' }))
        .status,
      401,
    );
    assert.equal(
      (
        await call(s.url, '/auth/login', {
          username: 'EVENT_LEAD',
          password: 'staff password 2026',
        })
      ).status,
      200,
    );
    const person = await call(s.url, '/auth/register', {
      username: 'volunteer_one',
      name: 'Volunteer one',
      password: 'staff password 2026',
    });
    const invitation = await call(
      s.url,
      `/events/${lead.eventId}/invitations`,
      { name: 'Volunteer one', role: 'volunteer' },
      lead.cookie,
    );
    assert.equal(
      (await call(s.url, '/invitations/accept', { token: invitation.data.token }, person.cookie))
        .status,
      200,
    );
    const context = await call(s.url, '/bootstrap', {}, person.cookie);
    assert.equal(context.data.me.role, 'volunteer');
    assert.equal(
      (await call(s.url, `/events/${lead.eventId}/attendee-links`, {}, person.cookie)).status,
      403,
    );
    const recovered = await call(s.url, '/auth/recover-account', {
      username: 'event_lead',
      recoveryCode: lead.data.recoveryCode,
      password: 'new staff password 2026',
    });
    assert.equal(recovered.status, 200);
    assert.equal(
      (
        await call(s.url, '/auth/login', {
          username: 'event_lead',
          password: 'new staff password 2026',
        })
      ).status,
      200,
    );
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM email_outbox')!.n, 0);
  } finally {
    await s.close();
  }
});
test('account-free requests have private tracking, safe duplicate retries, revocation and a correct activity log', async () => {
  const s = await server('disabled');
  try {
    const lead = await staff(s, 'guest_event_lead');
    const base = `/events/${lead.eventId}`;
    const shared = await call(s.url, base + '/attendee-links', {}, lead.cookie);
    assert.equal(shared.status, 201, JSON.stringify(shared.data));
    const headers = {
      'X-VenueRelay-Event-Key': shared.data.token,
      'Idempotency-Key': 'guest-request-one',
    };
    const info = await call(
      s.url,
      `/attendee-events/${lead.eventId}`,
      undefined,
      undefined,
      headers,
    );
    assert.deepEqual(Object.keys(info.data).sort(), ['date', 'id', 'name', 'venue']);
    const input = {
      title: 'Help at the accessible entrance',
      location: 'North gate',
      receiptKey: token(),
    };
    const replies = await Promise.all(
      [1, 2, 3].map(() =>
        call(s.url, `/attendee-events/${lead.eventId}/requests`, input, undefined, headers),
      ),
    );
    assert.ok(replies.every((r) => r.status === 201));
    assert.equal(new Set(replies.map((r) => r.data.requestId)).size, 1);
    assert.equal(replies.filter((r) => !r.data.replayed).length, 1);
    assert.equal(
      (
        await call(
          s.url,
          `/attendee-events/${lead.eventId}/requests`,
          { ...input, title: 'Changed request' },
          undefined,
          headers,
        )
      ).status,
      409,
    );
    const track = () =>
      call(s.url, '/attendee-requests', undefined, undefined, {
        Authorization: 'Bearer vr_guest_' + input.receiptKey,
      });
    const view = await track();
    assert.equal(view.status, 200);
    assert.equal(view.data.request.status, 'open');
    assert.ok(!JSON.stringify(view.data).includes('password_hash'));
    assert.ok(!('members' in view.data));
    const unknown = await call(s.url, '/attendee-requests', undefined, undefined, {
      Authorization: 'Bearer vr_guest_' + token(),
    });
    assert.equal(unknown.status, 404);
    assert.equal(
      (
        await call(s.url, base + '/snapshot', undefined, undefined, {
          Authorization: 'Bearer vr_guest_' + input.receiptKey,
        })
      ).status,
      401,
    );
    const snapshot = await call(s.url, base + '/snapshot', undefined, lead.cookie);
    assert.equal(snapshot.data.tasks.length, 1);
    assert.equal(
      s.store!.get<{ n: number }>('SELECT count(*) n FROM users')!.n,
      1,
      'Guests must not create accounts',
    );
    const task = snapshot.data.tasks[0];
    let version = task.version;
    const command = async (action: string, payload: unknown) => {
      const r = await call(
        s.url,
        base + '/commands',
        { action, taskId: task.id, expectedVersion: version, payload },
        lead.cookie,
        { 'Idempotency-Key': token() },
      );
      assert.equal(r.status, 200, JSON.stringify(r.data));
      version = r.data.entity.version;
    };
    await command('task.assign', { ownerId: snapshot.data.me.id });
    await command('task.status', { status: 'in_progress' });
    await command('task.status', {
      status: 'resolved',
      resolution: 'The accessible route is clear now.',
    });
    await command('task.status', { status: 'closed' });
    assert.equal((await track()).data.request.status, 'closed');
    assert.equal((await track()).data.updates.length, 5);
    const revoke = await fetch(s.url + '/api/v1' + base + '/attendee-links/' + shared.data.id, {
      method: 'DELETE',
      headers: { Cookie: lead.cookie! },
    });
    assert.equal(revoke.status, 200);
    assert.equal(
      (await call(s.url, `/attendee-events/${lead.eventId}`, undefined, undefined, headers)).status,
      410,
    );
    assert.equal(
      (await call(s.url, `/attendee-events/${lead.eventId}/requests`, input, undefined, headers))
        .status,
      201,
      'Confirmed requests still replay after revocation',
    );
    assert.equal(
      (
        await call(
          s.url,
          `/attendee-events/${lead.eventId}/requests`,
          { ...input, receiptKey: token() },
          undefined,
          { ...headers, 'Idempotency-Key': 'new-request-after-revoke' },
        )
      ).status,
      410,
    );
    assert.equal((await track()).status, 200, 'Private tracking survives link revocation');
    const integrity = await call(s.url, base + '/integrity', undefined, lead.cookie);
    assert.equal(integrity.data.ok, true, JSON.stringify(integrity.data));
    assert.equal(integrity.data.commands, integrity.data.activity);
    assert.ok(s.store!.get<{ n: number }>('SELECT count(*) n FROM notifications')!.n > 0);
  } finally {
    await s.close();
  }
});
test('failed guest receipt storage rolls back the request, reporter, notifications and audit atomically', async () => {
  const s = await server('disabled');
  try {
    const lead = await staff(s, 'rollback_event');
    const link = await call(s.url, `/events/${lead.eventId}/attendee-links`, {}, lead.cookie);
    const snapshot = await call(s.url, `/events/${lead.eventId}/snapshot`, undefined, lead.cookie);
    const before = s.store!.get<{ n: number }>('SELECT count(*) n FROM members')!.n;
    s.store!.db.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON attendee_receipts BEGIN SELECT RAISE(ABORT,'Injected receipt storage failure'); END;",
    );
    assert.throws(
      () =>
        new SqliteAttendees(s.store!).submit(lead.eventId, link.data.token, 'rollback-guest-key', {
          title: 'Help at the gate',
          location: 'Gate',
          receiptKey: token(),
        }),
      /Injected/,
    );
    const after = await call(s.url, `/events/${lead.eventId}/snapshot`, undefined, lead.cookie);
    assert.equal(after.data.tasks.length, 0);
    assert.equal(after.data.activity.length, snapshot.data.activity.length);
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM members')!.n, before);
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM notifications')!.n, 0);
  } finally {
    await s.close();
  }
});

test('attendee QR parser keeps secret fragments and rejects foreign origins', async () => {
  const { parseRallyLink } = await import('../frontend/src/qr.tsx');
  const origin = 'https://venuerelay.onrender.com',
    secret = token();
  assert.equal(
    parseRallyLink(origin + '/attend/example-event#key=' + secret, origin).path,
    '/attend/example-event#key=' + secret,
  );
  assert.equal(
    parseRallyLink(origin + '/request#key=' + secret, origin).path,
    '/request#key=' + secret,
  );
  assert.throws(
    () => parseRallyLink('https://foreign.example/attend/example-event#key=' + secret, origin),
    /another website/,
  );
  assert.throws(() => parseRallyLink(origin + '/attend/example-event#key=short', origin), /Scan/);
});

test('a throttled caller cannot allocate new event counters by varying event IDs', async () => {
  const s = await server('disabled');
  try {
    const { hash } = await import('../backend/src/auth.ts');
    s.store!.run(
      'INSERT INTO auth_rate_limits VALUES (?,?,?)',
      hash('guest-write-peer:127.0.0.1'),
      60,
      new Date(Date.now() + 60000).toISOString(),
    );
    const before = s.store!.get<{ n: number }>('SELECT count(*) n FROM auth_rate_limits')!.n;
    for (const eventId of ['unknown-event-one', 'unknown-event-two', 'unknown-event-three']) {
      const response = await call(
        s.url,
        `/attendee-events/${eventId}/requests`,
        { title: 'Test request', location: 'Gate', receiptKey: token() },
        undefined,
        { 'X-VenueRelay-Event-Key': token(), 'Idempotency-Key': 'throttled-intent' },
      );
      assert.equal(response.status, 429);
    }
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM auth_rate_limits')!.n, before);
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM tasks')!.n, 0);
  } finally {
    await s.close();
  }
});
