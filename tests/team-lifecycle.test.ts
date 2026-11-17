import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id } from '../backend/src/auth.ts';
import { server, call } from './http-fixture.ts';

test('shared role links admit separate accounts, notify once per join, rotate and respect event history', async () => {
  const s = await server('disabled');
  try {
    const signup = (name: string) =>
      call(s.url, '/auth/register', {
        name,
        username: 'staff_' + id().replaceAll('-', '').slice(0, 22),
        password: 'Long team password 2026!',
      });
    const lead = await signup('Event creator'),
      a = await signup('First volunteer'),
      b = await signup('Second volunteer'),
      vendor = await signup('Catering supplier'),
      outsider = await signup('Other person');
    const eventId = (
      await call(
        s.url,
        '/events',
        { name: 'Team lifecycle test', venue: 'Town hall', date: '2026-12-01' },
        lead.cookie,
      )
    ).data.eventId;
    const root = `/events/${eventId}`,
      path = root + '/invitations';
    const link = await call(s.url, path, { role: 'volunteer', reusable: true }, lead.cookie);
    assert.equal(link.status, 201);
    assert.equal(link.data.expiresInHours, 168);
    assert.equal(
      (await call(s.url, path, { role: 'organiser', reusable: true }, lead.cookie)).status,
      422,
    );
    assert.equal(
      (await call(s.url, path, { role: 'attendee', reusable: true }, lead.cookie)).status,
      422,
    );
    assert.equal(
      (await call(s.url, path, { role: 'volunteer', reusable: true }, lead.cookie)).data.error.code,
      'ROLE_LINK_EXISTS',
    );
    const accept = (token: string, cookie: string) =>
      call(s.url, '/invitations/accept', { token }, cookie);
    const joined = await Promise.all([
      accept(link.data.token, a.cookie!),
      accept(link.data.token, b.cookie!),
      accept(link.data.token, a.cookie!),
    ]);
    assert.ok(joined.every((result) => result.status === 200));
    let snapshot = (await call(s.url, root + '/snapshot', undefined, lead.cookie)).data;
    assert.equal(snapshot.members.length, 3);
    assert.equal(snapshot.notifications.length, 2);
    assert.ok(
      snapshot.notifications.some(
        (n: any) => n.message === 'First volunteer joined as a volunteer.',
      ),
    );
    let listed = (await call(s.url, path, undefined, lead.cookie)).data;
    assert.equal(listed.roleLinks[0].joinCount, 2);
    assert.equal(listed.pendingCount, 0);
    assert.ok(!JSON.stringify(listed).includes(link.data.token));
    assert.ok(!JSON.stringify(listed).includes('token_hash'));
    const vendorLink = await call(s.url, path, { role: 'vendor', reusable: true }, lead.cookie);
    assert.equal(
      (await accept(vendorLink.data.token, a.cookie!)).status,
      409,
      'Joining another role must not change existing permissions',
    );
    assert.equal((await accept(vendorLink.data.token, vendor.cookie!)).status, 200);
    assert.equal((await call(s.url, path, undefined, a.cookie)).status, 403);
    const replacement = await call(s.url, path + '/' + link.data.id + '/renew', {}, lead.cookie);
    assert.equal((await accept(link.data.token, outsider.cookie!)).status, 410);
    const command = {
      action: 'task.create',
      payload: { title: 'Prepare registration desk', location: 'Entrance', priority: 'normal' },
    };
    const key = id();
    const task = await call(s.url, root + '/commands', command, lead.cookie, {
      'Idempotency-Key': key,
    });
    assert.equal(task.status, 200);
    assert.equal((await call(s.url, root + '/lifecycle', { ended: true }, a.cookie)).status, 403);
    assert.equal(
      (await call(s.url, root + '/lifecycle', { ended: true }, outsider.cookie)).status,
      403,
    );
    assert.equal(
      (await call(s.url, root + '/lifecycle', { ended: 'yes' }, lead.cookie)).status,
      422,
    );
    assert.equal(
      (await call(s.url, root + '/lifecycle', { ended: true }, lead.cookie)).status,
      200,
    );
    assert.equal(
      (await call(s.url, root + '/lifecycle', { ended: true }, lead.cookie)).status,
      200,
    );
    snapshot = (await call(s.url, root + '/snapshot', undefined, lead.cookie)).data;
    assert.ok(snapshot.event.ended_at);
    assert.equal(snapshot.tasks.length, 1);
    assert.equal(snapshot.members.length, 4);
    assert.equal(snapshot.activity.filter((x: any) => x.action === 'event.end').length, 1);
    assert.equal(
      snapshot.events.find((x: any) => x.id === eventId).ended_at,
      snapshot.event.ended_at,
    );
    assert.equal(
      (await accept(replacement.data.token, outsider.cookie!)).data.error.code,
      'EVENT_ENDED',
    );
    assert.equal(
      (await call(s.url, root + '/commands', command, lead.cookie, { 'Idempotency-Key': id() }))
        .data.error.code,
      'EVENT_ENDED',
    );
    assert.equal(
      (await call(s.url, root + '/commands', command, lead.cookie, { 'Idempotency-Key': key }))
        .status,
      200,
      'A lost response still replays after ending',
    );
    assert.equal(
      (await call(s.url, root + '/lifecycle', { ended: false }, lead.cookie)).status,
      200,
    );
    assert.equal((await accept(replacement.data.token, outsider.cookie!)).status, 200);
    const cancel = await fetch(s.url + '/api/v1' + path + '/' + replacement.data.id, {
      method: 'DELETE',
      headers: { Cookie: lead.cookie! },
    });
    assert.equal(cancel.status, 200);
    assert.equal((await accept(replacement.data.token, outsider.cookie!)).status, 410);
    listed = (await call(s.url, path, undefined, lead.cookie)).data;
    assert.equal(listed.roleLinks.length, 1);
    assert.equal((await call(s.url, root + '/integrity', undefined, lead.cookie)).status, 200);
  } finally {
    await s.close();
  }
});

test('ending an event preserves attendee tracking and retries while rejecting new requests', async () => {
  const s = await server('disabled');
  try {
    const lead = await call(s.url, '/auth/register', {
      name: 'Archive lead',
      username: 'archive_' + id().slice(0, 8),
      password: 'Archive password 2026!',
    });
    const eventId = (
      await call(
        s.url,
        '/events',
        { name: 'Attendee archive test', date: '2026-12-01', venue: 'Town hall' },
        lead.cookie,
      )
    ).data.eventId;
    const root = `/events/${eventId}`;
    const link = (await call(s.url, root + '/attendee-links', {}, lead.cookie)).data;
    const { token } = await import('../backend/src/auth.ts');
    const input = {
      name: 'Visiting attendee',
      title: 'Help with accessible entrance',
      location: 'North gate',
      receiptKey: token(),
    };
    const headers = { 'X-VenueRelay-Event-Key': link.token, 'Idempotency-Key': id() };
    const first = await call(
      s.url,
      `/attendee-events/${eventId}/requests`,
      input,
      undefined,
      headers,
    );
    assert.equal(first.status, 201);
    let view = (await call(s.url, root + '/snapshot', undefined, lead.cookie)).data;
    assert.equal(view.notifications.length, 1, 'Guest request notifies the organiser');
    await call(s.url, root + '/lifecycle', { ended: true }, lead.cookie);
    const retry = await call(
      s.url,
      `/attendee-events/${eventId}/requests`,
      input,
      undefined,
      headers,
    );
    assert.equal(retry.status, 201);
    assert.equal(retry.data.requestId, first.data.requestId);
    const rejected = await call(
      s.url,
      `/attendee-events/${eventId}/requests`,
      { ...input, receiptKey: token() },
      undefined,
      { ...headers, 'Idempotency-Key': id() },
    );
    assert.equal(rejected.data.error.code, 'EVENT_ENDED');
    assert.equal(
      (
        await call(s.url, '/attendee-requests', undefined, undefined, {
          Authorization: 'Bearer vr_guest_' + input.receiptKey,
        })
      ).status,
      200,
    );
    view = (await call(s.url, root + '/snapshot', undefined, lead.cookie)).data;
    assert.equal(view.tasks.length, 1);
    assert.equal(view.members.length, 2, 'Failed requests do not leave phantom guests');
    assert.equal(view.notifications.length, 1, 'Retries do not duplicate the notification');
    await call(s.url, root + '/lifecycle', { ended: false }, lead.cookie);
    assert.equal(
      (await call(s.url, `/attendee-events/${eventId}`, undefined, undefined, headers)).status,
      200,
    );
  } finally {
    await s.close();
  }
});
