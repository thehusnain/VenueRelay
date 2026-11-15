import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id } from '../backend/src/auth.ts';
import { server, call } from './http-fixture.ts';

test('staff invitations survive reload, reject duplicates, rotate and cancel with event permissions and an intact audit', async () => {
  const s = await server('disabled');
  try {
    const signup = (name: string) =>
      call(s.url, '/auth/register', {
        name,
        username: 'staff_' + id().replaceAll('-', '').slice(0, 24),
        password: 'Staff password 2026!',
      });
    const lead = await signup('Event lead'),
      worker = await signup('Ayesha Khan'),
      outsider = await signup('Other lead');
    const eventId = (
      await call(
        s.url,
        '/events',
        { name: 'Invitation test', venue: 'Town hall', date: '2026-12-01' },
        lead.cookie,
      )
    ).data.eventId;
    const path = `/events/${eventId}/invitations`;
    const created = await call(
      s.url,
      path,
      { name: 'Ayesha Khan', role: 'volunteer' },
      lead.cookie,
    );
    assert.equal(created.status, 201);
    const duplicate = await call(
      s.url,
      path,
      { name: '  AYESHA   khan ', role: 'vendor' },
      lead.cookie,
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error.code, 'ALREADY_INVITED');
    const list = await call(s.url, path, undefined, lead.cookie);
    assert.equal(list.data.pendingCount, 1);
    assert.equal(list.data.items[0].status, 'pending');
    assert.equal(list.data.items[0].id, created.data.id);
    assert.ok(!JSON.stringify(list.data).includes(created.data.token));
    assert.ok(!JSON.stringify(list.data).includes('token_hash'));
    assert.equal((await call(s.url, path + '?limit=0', undefined, lead.cookie)).status, 422);
    assert.equal((await call(s.url, path, undefined, outsider.cookie)).status, 403);
    const replacement = await call(s.url, path + '/' + created.data.id + '/renew', {}, lead.cookie);
    assert.equal(replacement.status, 200);
    assert.notEqual(replacement.data.token, created.data.token);
    assert.equal(
      (await call(s.url, '/invitations/accept', { token: created.data.token }, worker.cookie))
        .status,
      410,
    );
    assert.equal(
      (await call(s.url, '/invitations/accept', { token: replacement.data.token }, worker.cookie))
        .status,
      200,
    );
    assert.equal(
      (await call(s.url, path, undefined, lead.cookie)).data.items[0].status,
      'accepted',
    );
    assert.equal((await call(s.url, path, undefined, worker.cookie)).status, 403);
    const joined = await call(s.url, path, { name: 'ayesha khan', role: 'volunteer' }, lead.cookie);
    assert.equal(joined.status, 409);
    assert.equal(joined.data.error.code, 'ALREADY_MEMBER');
    assert.equal(
      (await call(s.url, path + '/' + created.data.id + '/renew', {}, lead.cookie)).status,
      409,
    );
    const pending = await call(s.url, path, { name: 'Hamza Ali', role: 'vendor' }, lead.cookie);
    const cancel = () =>
      fetch(s.url + '/api/v1' + path + '/' + pending.data.id, {
        method: 'DELETE',
        headers: { Cookie: lead.cookie! },
      });
    assert.equal((await cancel()).status, 200);
    assert.equal((await cancel()).status, 200);
    assert.equal(
      (await call(s.url, '/invitations/accept', { token: pending.data.token }, outsider.cookie))
        .status,
      410,
    );
    assert.equal(
      (await call(s.url, path + '/' + pending.data.id + '/renew', {}, lead.cookie)).status,
      410,
    );
    const history = (await call(s.url, path, undefined, lead.cookie)).data;
    assert.equal(history.pendingCount, 0);
    assert.equal(
      history.items.find((row: { id: string }) => row.id === pending.data.id).status,
      'cancelled',
    );
    assert.equal(
      (await call(s.url, path, { name: 'Hamza Ali', role: 'vendor' }, lead.cookie)).status,
      201,
    );
    const snapshot = (await call(s.url, `/events/${eventId}/snapshot`, undefined, lead.cookie))
      .data;
    assert.equal(
      snapshot.activity.filter((row: { action: string }) => row.action === 'invitation.revoke')
        .length,
      1,
    );
    assert.equal(
      (await call(s.url, `/events/${eventId}/integrity`, undefined, lead.cookie)).data.ok,
      true,
    );
    const page = (await call(s.url, path + '?limit=1', undefined, lead.cookie)).data;
    assert.equal(page.items.length, 1);
    assert.equal(page.nextOffset, 1);
  } finally {
    await s.close();
  }
});
