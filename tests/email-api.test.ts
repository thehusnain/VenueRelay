import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../backend/src/database.ts';
import { id, now } from '../backend/src/auth.ts';
import { registerAccount, verifyEmail } from '../backend/src/accounts.ts';
import {
  sendMail,
  emailSettings,
  emailReady,
  deliverMail,
  type MailJob,
  type EmailSettings,
} from '../backend/src/email.ts';
const settings: EmailSettings = {
  mode: 'brevo',
  origin: 'https://venuerelay.example.com',
  from: 'VenueRelay <sender@example.com>',
  apiKey: 'private-test-key',
  previewDir: '/tmp/venuerelay-api-test',
};
const job: MailJob = {
  id: id(),
  user_id: id(),
  token_id: id(),
  recipient: 'recipient@example.com',
  subject: 'Confirm your email',
  body: 'https://venuerelay.example.com/verify-email?token=private-proof',
  attempts: 1,
  lease_id: id(),
  created_at: now(),
};
test('HTTPS delivery validates configuration without exposing credentials to account responses', () => {
  const configured = emailSettings({
    NODE_ENV: 'production',
    APP_ORIGIN: settings.origin,
    EMAIL_TRANSPORT: 'brevo',
    EMAIL_FROM: settings.from,
    BREVO_API_KEY: settings.apiKey,
  });
  assert.equal(emailReady(configured), true);
  assert.throws(() => emailSettings({ EMAIL_TRANSPORT: 'brevo' }), /BREVO_API_KEY/);
  assert.throws(
    () => emailSettings({ EMAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'test' }),
    /EMAIL_FROM/,
  );
  assert.throws(
    () =>
      emailSettings({
        EMAIL_TRANSPORT: 'brevo',
        BREVO_API_KEY: 'test',
        EMAIL_FROM: 'Sender <sender@example.com>\r\nInjected: header',
      }),
    /EMAIL_FROM/,
  );
  assert.equal(emailReady({ ...settings, apiKey: undefined }), false);
});
test('Brevo uses HTTPS, plain-text verification links and stable per-message idempotency', async () => {
  let calls = 0;
  const http: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(new Headers(options!.headers).get('api-key'), settings.apiKey);
    assert.equal(options!.redirect, 'error');
    assert.ok(options!.signal);
    const body = JSON.parse(String(options!.body));
    assert.deepEqual(body.sender, { name: 'VenueRelay', email: 'sender@example.com' });
    assert.equal(body.headers.idempotencyKey, job.id);
    assert.equal(body.textContent, job.body);
    assert.deepEqual(body.to, [{ email: job.recipient }]);
    return Response.json({ messageId: '<accepted@example.com>' }, { status: 201 });
  };
  await sendMail(settings, job, http);
  await sendMail(settings, job, http);
  assert.equal(calls, 2);
});
test('provider errors, missing receipts and timeouts never falsely acknowledge delivery or leak provider details', async () => {
  for (const response of [
    Response.json({ message: 'private-test-key rejected' }, { status: 401 }),
    Response.json({ message: 'Sender not verified' }, { status: 403 }),
    Response.json({ message: 'Outage' }, { status: 503 }),
    new Response('not json', { status: 200 }),
    Response.json({}, { status: 201 }),
  ]) {
    await assert.rejects(
      sendMail(settings, job, async () => response),
      (error: Error) => {
        assert.equal(error.message.includes('private-test-key'), false);
        return true;
      },
    );
  }
  await assert.rejects(
    sendMail(settings, job, async () => {
      throw new Error('private network failure');
    }),
    { code: 'EMAIL_NETWORK' },
  );
  await assert.rejects(sendMail({ ...settings, mode: 'disabled' }, job), {
    code: 'EMAIL_NOT_CONFIGURED',
  });
});
test('only an explicit idempotency replay acknowledges an already accepted email', async () => {
  await sendMail(settings, job, async () =>
    Response.json(
      {
        code: 'duplicate_parameter',
        message: 'Email for this idempotency key has already been processed',
      },
      { status: 400 },
    ),
  );
  await assert.rejects(
    sendMail(settings, job, async () =>
      Response.json(
        { code: 'duplicate_parameter', message: 'Another field is duplicated' },
        { status: 400 },
      ),
    ),
  );
});
test('registration retains a rate-limited email, respects provider delay, then verifies the actual delivered link once', async () => {
  const store = new Store(':memory:');
  try {
    const user = await registerAccount(
      store,
      { name: 'New organiser', email: 'new@example.com', password: 'PrivatePassword2026!' },
      settings,
      async () => {},
    );
    const stamp = now();
    await deliverMail(
      store,
      settings,
      (mail) =>
        sendMail(settings, mail, async () =>
          Response.json(
            { message: 'Quota reached' },
            { status: 429, headers: { 'Retry-After': '120' } },
          ),
        ),
      stamp,
    );
    const pending = store.get<{
      id: string;
      status: string;
      body: string;
      next_attempt_at: string;
    }>('SELECT * FROM email_outbox')!;
    assert.equal(pending.status, 'pending');
    assert.ok(Date.parse(pending.next_attempt_at) >= Date.parse(stamp) + 120000);
    assert.equal(
      await deliverMail(
        store,
        settings,
        async () => {},
        new Date(Date.parse(stamp) + 60000).toISOString(),
      ),
      false,
    );
    let delivered = '';
    await deliverMail(
      store,
      settings,
      (mail) =>
        sendMail(settings, mail, async (_url, options) => {
          const payload = JSON.parse(String(options!.body));
          assert.equal(payload.headers.idempotencyKey, pending.id);
          delivered = payload.textContent;
          return Response.json({ messageId: '<accepted@example.com>' }, { status: 201 });
        }),
      new Date(Date.parse(stamp) + 121000).toISOString(),
    );
    assert.equal(store.get<{ status: string }>('SELECT status FROM email_outbox')!.status, 'sent');
    assert.equal(store.get<{ body: string }>('SELECT body FROM email_outbox')!.body, '');
    const proof = delivered.match(/token=([A-Za-z0-9_-]+)/)![1];
    verifyEmail(store, proof);
    assert.ok(
      store.get<{ email_verified_at: string }>(
        'SELECT email_verified_at FROM users WHERE id=?',
        user.id,
      )!.email_verified_at,
    );
    assert.throws(() => verifyEmail(store, proof), { code: 'LINK_EXPIRED' });
  } finally {
    store.close();
  }
});
