import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server, call } from './http-fixture.ts';
import { recoveryHash, hash } from '../backend/src/auth.ts';

test('no-email signup, event access and single-use recovery preserve records and revoke sessions', async () => {
  const s = await server('disabled');
  try {
    const email = 'no-email@example.com';
    const signup = await call(s.url, '/auth/register', {
      name: 'Festival lead',
      email,
      password: 'first password 2026',
    });
    assert.equal(signup.status, 200);
    assert.equal(signup.data.user.emailVerified, false);
    assert.equal(signup.data.user.accessGranted, true);
    const code = signup.data.recoveryCode;
    assert.match(code, /^[a-f0-9]{8}(?:-[a-f0-9]{8}){4}$/);
    const stored = s.store!.get<{ recovery_code_hash: string }>(
      'SELECT recovery_code_hash FROM users WHERE email=?',
      email,
    )!;
    assert.equal(stored.recovery_code_hash, recoveryHash(code));
    assert.equal(s.store!.get<{ n: number }>('SELECT count(*) n FROM email_outbox')!.n, 0);
    const me = await call(s.url, '/auth/me', undefined, signup.cookie);
    assert.ok(!('recoveryCode' in me.data));
    assert.ok(!JSON.stringify(me.data).includes(stored.recovery_code_hash));
    assert.equal((await call(s.url, '/bootstrap', {}, signup.cookie)).data.requiresSetup, true);
    const event = await call(
      s.url,
      '/events',
      { name: 'Community day', venue: 'Town hall', date: '2026-12-01' },
      signup.cookie,
    );
    assert.equal(event.status, 201);
    const snapshot = await call(
      s.url,
      `/events/${event.data.eventId}/snapshot`,
      undefined,
      signup.cookie,
    );
    assert.equal(snapshot.data.tasks.length, 0);
    assert.equal(snapshot.data.members.length, 1);
    assert.equal(
      (await call(s.url, '/auth/recovery-code', { password: 'wrong password' }, signup.cookie))
        .status,
      401,
    );
    const replacement = await call(
      s.url,
      '/auth/recovery-code',
      { password: 'first password 2026' },
      signup.cookie,
    );
    assert.equal(replacement.status, 200);
    assert.equal(
      (
        await call(s.url, '/auth/recover-account', {
          email,
          recoveryCode: code,
          password: 'cannot use old code',
        })
      ).status,
      401,
    );
    const recovered = await call(s.url, '/auth/recover-account', {
      email,
      recoveryCode: replacement.data.recoveryCode,
      password: 'replacement password 2026',
    });
    assert.equal(recovered.status, 200);
    assert.notEqual(recovered.data.recoveryCode, code);
    assert.equal((await call(s.url, '/auth/me', undefined, signup.cookie)).status, 401);
    assert.equal(
      (await call(s.url, '/auth/login', { email, password: 'first password 2026' })).status,
      401,
    );
    assert.equal(
      (
        await call(s.url, '/auth/recover-account', {
          email,
          recoveryCode: code,
          password: 'stolen password 2026',
        })
      ).status,
      401,
    );
    const login = await call(s.url, '/auth/login', {
      email,
      password: 'replacement password 2026',
    });
    assert.equal(login.status, 200);
    const after = await call(
      s.url,
      `/events/${event.data.eventId}/snapshot`,
      undefined,
      login.cookie,
    );
    assert.deepEqual(after.data.event, snapshot.data.event);
    assert.deepEqual(after.data.members, snapshot.data.members);
    const outcomes = await Promise.all(
      [1, 2].map(() =>
        call(s.url, '/auth/recover-account', {
          email,
          recoveryCode: recovered.data.recoveryCode,
          password: 'concurrent password 2026',
        }),
      ),
    );
    assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 401]);
  } finally {
    await s.close();
  }
});

test('existing unconfirmed users can sign in without email; incorrect credentials never enable access', async () => {
  const s = await server('disabled');
  try {
    const { registerAccount } = await import('../backend/src/accounts.ts');
    const user = await registerAccount(
      s.store!,
      { name: 'Existing user', email: 'pending@example.com', password: 'old password 2026' },
      { mode: 'preview', origin: s.url, from: 'test@localhost', previewDir: '/tmp' },
      async () => {},
    );
    const secret = 'unconfirmed-session';
    s.store!.run(
      'INSERT INTO sessions VALUES (?,?,?)',
      hash(secret),
      user.id,
      new Date(Date.now() + 60000).toISOString(),
    );
    assert.equal((await call(s.url, '/bootstrap', {}, 'rally_session=' + secret)).status, 403);
    assert.equal(
      (await call(s.url, '/auth/login', { email: user.email, password: 'incorrect password' }))
        .status,
      401,
    );
    assert.equal(
      s.store!.get<{ access_approved_at: string | null }>(
        'SELECT access_approved_at FROM users WHERE id=?',
        user.id,
      )!.access_approved_at,
      null,
    );
    const login = await call(s.url, '/auth/login', {
      email: user.email,
      password: 'old password 2026',
    });
    assert.equal(login.data.user.emailVerified, false);
    assert.equal(login.data.user.accessGranted, true);
    assert.ok(login.data.recoveryCode);
    assert.equal((await call(s.url, '/bootstrap', {}, login.cookie)).status, 200);
  } finally {
    await s.close();
  }
});
