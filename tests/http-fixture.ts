import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../backend/src/database.ts';
import { createApp } from '../backend/src/api.ts';
import { id } from '../backend/src/auth.ts';
export async function server() {
  if (process.env.RALLY_TEST_URL)
    return { url: process.env.RALLY_TEST_URL, store: undefined, close: async () => {} };
  const dir = mkdtempSync(join(tmpdir(), 'rally-http-')),
    store = new Store(':memory:'),
    app = createApp({
      store,
      emailSettings: {
        mode: 'preview',
        origin: 'http://127.0.0.1:3001',
        from: 'Rally <hello@localhost>',
        previewDir: dir,
      },
      checkEmailDomain: async () => {},
    });
  try {
    await new Promise<void>((accept, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', accept);
    });
  } catch (error) {
    store.close();
    rmSync(dir, { recursive: true });
    throw error;
  }
  const address = app.address() as { port: number };
  return {
    store,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((accept) => app.close(() => accept()));
      store.close();
      rmSync(dir, { recursive: true });
    },
  };
}
export type Fixture = Awaited<ReturnType<typeof server>>;
export async function call(
  url: string,
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url + '/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: (await response.json()) as any,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
export async function register(s: Fixture, name = 'Event lead') {
  const guard = await call(s.url, '/auth/demo', {});
  if (guard.data.delivery?.mode !== 'preview')
    throw new Error('HTTP account tests require local preview mode and never send real email.');
  const email = `rally-qa-${id()}@gmail.com`,
    password = 'test account password with spaces';
  const account = await call(s.url, '/auth/register', { name, email, password });
  if (account.status !== 200) throw new Error(JSON.stringify(account.data));
  return { ...account, email, password };
}
export async function confirmation(s: Fixture, email: string, purpose = 'verify') {
  if (s.store) {
    const row = s.store.get<{ body: string }>(
      'SELECT body FROM email_outbox WHERE recipient=? AND token_id IN (SELECT id FROM account_tokens WHERE purpose=?) ORDER BY created_at DESC LIMIT 1',
      email,
      purpose,
    );
    return row!.body.match(/token=([A-Za-z0-9_-]+)/)![1];
  }
  const dir = resolve(process.env.EMAIL_PREVIEW_DIR ?? 'data/mail-preview');
  for (let attempt = 0; attempt < 40; attempt++) {
    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch {}
    for (const file of files) {
      const value = readFileSync(join(dir, file), 'utf8');
      if (
        value.includes(`To: ${email}\n`) &&
        value.includes(purpose === 'verify' ? '/verify-email?' : '/reset-password?')
      )
        return value.match(/token=([A-Za-z0-9_-]+)/)![1];
    }
    await delay(250);
  }
  throw new Error('No local email preview was produced. Start the local mail worker.');
}
export async function verifiedAccount(s: Fixture, name = 'Event lead') {
  const account = await register(s, name),
    secret = await confirmation(s, account.email);
  const response = await call(s.url, '/auth/verify-email', { token: secret }, account.cookie);
  if (response.status !== 200) throw new Error(JSON.stringify(response.data));
  return account;
}
