import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../backend/src/database.ts';
import { hash, now, passwordMatches, requireVerified, session } from '../backend/src/auth.ts';
import {
  registerAccount,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  limitAttempt,
} from '../backend/src/accounts.ts';
import {
  normaliseEmail,
  deliverMail,
  claimMail,
  type EmailSettings,
} from '../backend/src/email.ts';
const settings: EmailSettings = {
  mode: 'preview',
  origin: 'http://127.0.0.1:3001',
  from: 'Rally <hello@localhost>',
  previewDir: '/tmp/rally-mail-test',
};
const input = {
  name: 'Event organiser',
  email: 'organiser@rally.test',
  password: '  a unique password with spaces  ',
};
const domain = async () => {};
function proof(store: Store, purpose = 'verify') {
  const mail = store.get<{ body: string }>(
    'SELECT body FROM email_outbox WHERE token_id IN (SELECT id FROM account_tokens WHERE purpose=?) ORDER BY created_at DESC LIMIT 1',
    purpose,
  )!;
  return mail.body.match(/token=([A-Za-z0-9_-]+)/)![1];
}
test('registration saves a real unverified account and an atomic confirmation email', async () => {
  const s = new Store(':memory:');
  const user = await registerAccount(s, input, settings, domain);
  assert.equal(user.email_verified_at, null);
  assert.throws(() => requireVerified(user), /confirm your email/);
  const raw = proof(s),
    record = s.get<{ token_hash: string }>('SELECT token_hash FROM account_tokens')!;
  assert.equal(record.token_hash, hash(raw));
  assert.notEqual(record.token_hash, raw);
  const saved = s.get<{ password_hash: string }>('SELECT password_hash FROM users')!;
  assert.ok(await passwordMatches(input.password, saved.password_hash));
  assert.ok(!(await passwordMatches(input.password.trim(), saved.password_hash)));
  s.close();
});
test('valid confirmation unlocks the account, with replay and wrong-purpose links rejected', async () => {
  const s = new Store(':memory:');
  const user = await registerAccount(s, input, settings, domain),
    value = proof(s),
    verified = verifyEmail(s, value);
  assert.ok(verified.email_verified_at);
  assert.equal(requireVerified(verified).id, user.id);
  assert.throws(() => verifyEmail(s, value), /already been used/);
  requestPasswordReset(s, input.email, settings);
  assert.throws(() => verifyEmail(s, proof(s, 'reset')), /expired/);
  s.close();
});
test('expired and replaced email links cannot verify an account', async () => {
  const s = new Store(':memory:');
  const user = await registerAccount(s, input, settings, domain),
    old = proof(s);
  assert.throws(() => resendVerification(s, user, settings), /wait a minute/);
  s.run(
    'UPDATE account_tokens SET created_at=?,expires_at=?',
    new Date(Date.now() - 120000).toISOString(),
    new Date(Date.now() - 1000).toISOString(),
  );
  assert.throws(() => verifyEmail(s, old), /expired/);
  resendVerification(s, user, settings);
  const newer = proof(s);
  assert.notEqual(newer, old);
  assert.throws(() => verifyEmail(s, old), /expired/);
  assert.ok(verifyEmail(s, newer).email_verified_at);
  s.close();
});
test('password reset is single-use and revokes every existing session', async () => {
  const s = new Store(':memory:');
  const user = await registerAccount(s, input, settings, domain);
  verifyEmail(s, proof(s));
  session(s, user.id);
  session(s, user.id);
  requestPasswordReset(s, input.email, settings);
  const value = proof(s, 'reset');
  await resetPassword(s, value, 'a completely different password');
  assert.equal(s.get<{ n: number }>('SELECT count(*) n FROM sessions')!.n, 0);
  assert.ok(
    await passwordMatches(
      'a completely different password',
      s.get<{ password_hash: string }>('SELECT password_hash FROM users')!.password_hash,
    ),
  );
  await assert.rejects(
    () => resetPassword(s, value, 'another password again'),
    /already been used/,
  );
  s.close();
});
test('unknown password-reset accounts receive the same response without mail or account creation', async () => {
  const s = new Store(':memory:');
  await registerAccount(s, input, settings, domain);
  const known = requestPasswordReset(s, input.email, settings),
    before = s.get<{ n: number }>('SELECT count(*) n FROM email_outbox')!.n,
    unknown = requestPasswordReset(s, 'missing@rally.test', settings);
  assert.deepEqual(known, unknown);
  assert.equal(s.get<{ n: number }>('SELECT count(*) n FROM email_outbox')!.n, before);
  s.close();
});
test('an outbox storage failure rolls back registration and its verification proof', async () => {
  const s = new Store(':memory:');
  s.db.exec(
    "CREATE TRIGGER simulate_full_disk BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;",
  );
  await assert.rejects(() => registerAccount(s, input, settings, domain), /storage unavailable/);
  for (const table of ['users', 'account_tokens', 'email_outbox', 'account_activity'])
    assert.equal(s.get<{ n: number }>(`SELECT count(*) n FROM ${table}`)!.n, 0);
  s.close();
});
test('SMTP interruption retains a durable job, retries with the same identity and clears the delivered body', async () => {
  const s = new Store(':memory:');
  await registerAccount(s, input, settings, domain);
  const smtp = { ...settings, mode: 'smtp' as const };
  const stamp = now();
  let firstId = '';
  await deliverMail(
    s,
    smtp,
    async (job) => {
      firstId = job.id;
      throw new Error('connection lost');
    },
    stamp,
  );
  let job = s.get<{ status: string; attempts: number; body: string }>(
    'SELECT * FROM email_outbox',
  )!;
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 1);
  assert.ok(job.body.includes('verify-email'));
  assert.equal(await deliverMail(s, smtp, async () => {}, stamp), false);
  await deliverMail(
    s,
    smtp,
    async (job) => {
      assert.equal(job.id, firstId);
    },
    new Date(Date.parse(stamp) + 31000).toISOString(),
  );
  job = s.get('SELECT * FROM email_outbox')!;
  assert.equal(job.status, 'sent');
  assert.equal(job.attempts, 2);
  assert.equal(job.body, '');
  s.close();
});
test('mail leases exclude another worker and recover after a worker interruption', async () => {
  const s = new Store(':memory:');
  await registerAccount(s, input, settings, domain);
  const stamp = now(),
    a = claimMail(s, stamp)!;
  assert.ok(a);
  assert.equal(claimMail(s, stamp), undefined);
  const recovered = claimMail(s, new Date(Date.parse(stamp) + 61000).toISOString())!;
  assert.equal(recovered.id, a.id);
  assert.notEqual(recovered.lease_id, a.lease_id);
  s.close();
});
test('local preview creates a private message file and never claims remote delivery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rally-mail-')),
    s = new Store(':memory:');
  try {
    await registerAccount(s, input, { ...settings, previewDir: dir }, domain);
    await deliverMail(s, { ...settings, previewDir: dir });
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(readFileSync(join(dir, files[0]), 'utf8'), /verify-email\?token=/);
    assert.equal(s.get<{ status: string }>('SELECT status FROM email_outbox')!.status, 'preview');
  } finally {
    s.close();
    rmSync(dir, { recursive: true });
  }
});
test('persistent rate limits survive database restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rally-limit-')),
    file = join(dir, 'rally.sqlite');
  let s = new Store(file);
  limitAttempt(s, 'test', 1, 60000);
  s.close();
  s = new Store(file);
  assert.throws(() => limitAttempt(s, 'test', 1, 60000), /wait a little/);
  s.close();
  rmSync(dir, { recursive: true });
});
test('schema upgrade preserves existing accounts and event data without assuming email ownership', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rally-upgrade-')),
    file = join(dir, 'rally.sqlite'),
    old = new DatabaseSync(file);
  old.exec(readFileSync(new URL('../backend/migrations/001_initial.sql', import.meta.url), 'utf8'));
  old
    .prepare('INSERT INTO users VALUES (?,?,?,?,?)')
    .run('existing', 'old@example.test', 'Existing person', 'hash', now());
  old.close();
  const s = new Store(file);
  assert.equal(
    s.get<{ email_verified_at: string | null }>(
      'SELECT email_verified_at FROM users WHERE id=?',
      'existing',
    )!.email_verified_at,
    null,
  );
  assert.equal(s.get<{ user_version: number }>('PRAGMA user_version')!.user_version, 4);
  s.close();
  rmSync(dir, { recursive: true });
});
test('invalid email formats and a failed domain check cannot create accounts', async () => {
  for (const value of [
    'name',
    'a@@gmail.com',
    'name..other@gmail.com',
    'name@',
    'name@example.invalid\nBcc: other@test.com',
  ])
    assert.throws(() => normaliseEmail(value), /email address/);
  assert.equal(normaliseEmail(' Person@Gmail.com '), 'person@gmail.com');
  const s = new Store(':memory:');
  await assert.rejects(
    () =>
      registerAccount(s, input, settings, async () => {
        throw new Error('domain not found');
      }),
    /domain not found/,
  );
  assert.equal(s.get<{ n: number }>('SELECT count(*) n FROM users')!.n, 0);
  s.close();
});
test('mail domain checks distinguish null MX, missing domains, address fallback and temporary DNS failures', async () => {
  const { checkEmailDomain } = await import('../backend/src/email.ts');
  const fail = (code: string) => Object.assign(new Error(code), { code });
  const fake = {
    resolveMx: async () => [{ exchange: 'mail.example.test', priority: 10 }],
    resolve4: async () => ['192.0.2.1'],
    resolve6: async () => ['2001:db8::1'],
    cancel: () => {},
  };
  await checkEmailDomain('person@example.test', fake);
  await assert.rejects(
    () =>
      checkEmailDomain('person@example.test', {
        ...fake,
        resolveMx: async () => [{ exchange: '.', priority: 0 }],
      }),
    { code: 'EMAIL_DOMAIN' },
  );
  await assert.rejects(
    () =>
      checkEmailDomain('person@example.test', {
        ...fake,
        resolveMx: async () => {
          throw fail('ENOTFOUND');
        },
      }),
    { code: 'EMAIL_DOMAIN' },
  );
  await checkEmailDomain('person@example.test', {
    ...fake,
    resolveMx: async () => {
      throw fail('ENODATA');
    },
  });
  await assert.rejects(
    () =>
      checkEmailDomain('person@example.test', {
        ...fake,
        resolveMx: async () => {
          throw fail('ENODATA');
        },
        resolve4: async () => {
          throw fail('ETIMEOUT');
        },
        resolve6: async () => {
          throw fail('ENODATA');
        },
      }),
    { code: 'EMAIL_LOOKUP_UNAVAILABLE' },
  );
});
test('expired confirmation mail is cancelled instead of being retried indefinitely', async () => {
  const store = new Store(':memory:');
  await registerAccount(store, input, settings, domain);
  store.run('UPDATE account_tokens SET expires_at=?', new Date(Date.now() - 1000).toISOString());
  assert.equal(claimMail(store), undefined);
  const mail = store.get<{ status: string; body: string }>('SELECT status,body FROM email_outbox')!;
  assert.equal(mail.status, 'cancelled');
  assert.equal(mail.body, '');
  store.close();
});
