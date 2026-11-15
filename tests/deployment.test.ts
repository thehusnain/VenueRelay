import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeSettings } from '../backend/src/runtime.ts';
import { createApp } from '../backend/src/api.ts';
import { ApiError } from '../backend/src/errors.ts';
import { once } from 'node:events';
import { startupError } from '../backend/src/startup-error.ts';
test('cloud startup requires explicit durable storage, secure cookies and exact HTTPS origins', () => {
  const env = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://cluster.example.com',
    APP_ORIGIN: 'https://venuerelay.example.com',
    COOKIE_SECURE: 'true',
  };
  assert.equal(runtimeSettings(env).host, '0.0.0.0');
  assert.equal(runtimeSettings(env).demo, false);
  for (const bad of [
    { MONGODB_URI: '' },
    { MONGODB_URI: 'mongodb://localhost' },
    { MONGODB_URI: 'mongodb+srv://cluster.example.com/?tls=false' },
    { APP_ORIGIN: 'http://venuerelay.example.com' },
    { APP_ORIGIN: 'https://venuerelay.example.com/path' },
    { COOKIE_SECURE: 'false' },
    { ALLOWED_ORIGINS: '*' },
    { PORT: 'invalid' },
    { MONGODB_DATABASE: 'bad/name' },
  ])
    assert.throws(() => runtimeSettings({ ...env, ...bad }));
  assert.equal(runtimeSettings({ ...env, DEMO_ACCOUNT_ENABLED: 'true' }).demo, true);
});
test('local judge startup stays database-free and explicit local MongoDB is supported', () => {
  const local = runtimeSettings({});
  assert.equal(local.mongoUri, undefined);
  assert.equal(local.demo, true);
  assert.equal(local.port, 3001);
  assert.equal(
    runtimeSettings({ MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=test' }).database,
    'rally',
  );
});
test('startup diagnostics distinguish Atlas failures without logging credentials or raw provider messages', () => {
  const privateUri = 'mongodb+srv://private-user:private-password@cluster.example.com/';
  for (const [failure, category] of [
    [{ name: 'MongoServerError', code: 18, message: privateUri }, 'MONGODB_AUTH'],
    [
      {
        name: 'MongoServerError',
        code: 8000,
        message: 'bad auth : authentication failed ' + privateUri,
      },
      'MONGODB_AUTH',
    ],
    [{ name: 'MongoServerError', code: 13, message: privateUri }, 'MONGODB_PERMISSIONS'],
    [{ name: 'MongoParseError', message: privateUri }, 'MONGODB_URI_FORMAT'],
    [{ name: 'Error', code: 'ENOTFOUND', syscall: 'querySrv', message: privateUri }, 'MONGODB_DNS'],
    [
      { name: 'MongoServerSelectionError', cause: { code: 'ECONNREFUSED', message: privateUri } },
      'MONGODB_NETWORK',
    ],
    [
      { name: 'MongoNetworkError', cause: { code: 'CERT_HAS_EXPIRED', message: privateUri } },
      'MONGODB_TLS',
    ],
  ] as const) {
    const message = startupError(failure);
    assert.ok(message.startsWith(category), message);
    assert.equal(message.includes('private-user'), false);
    assert.equal(message.includes('private-password'), false);
  }
  assert.equal(startupError(new Error('Connection ' + privateUri)).includes(privateUri), false);
  assert.match(startupError(new Error('Set COOKIE_SECURE=true.')), /COOKIE_SECURE/);
});
test('database outages fail readiness and throttled requests include a retry delay', async () => {
  const app = createApp({
    backend: {
      storage: 'mongodb',
      async health() {
        throw new Error('Database unavailable');
      },
      async handle() {
        throw new ApiError(429, 'RATE_LIMIT', 'Please wait.', { retryAfter: 90 });
      },
      attach() {
        return { invalidate() {} };
      },
    },
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = 'http://127.0.0.1:' + (app.address() as { port: number }).port;
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 503);
    assert.equal((await health.json()).error.code, 'DATABASE_UNAVAILABLE');
    const limited = await fetch(base + '/api/v1/auth/me');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '90');
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
  }
});
