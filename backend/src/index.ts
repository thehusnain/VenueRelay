import { ensureDemoAccount } from './demo.ts';
import { PushService, pushSettings } from './push.ts';
import { resolve } from 'node:path';
import { Store } from './database.ts';
import { createApp } from './api.ts';
import { emailSettings, startEmailWorker } from './email.ts';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Rally could not start: PORT must be a number between 1 and 65535.');
  process.exit(1);
}
const store = new Store(process.env.DATABASE_PATH ?? resolve('data/rally.sqlite'));
if (process.env.DEMO_ACCOUNT_ENABLED !== 'false' && process.env.NODE_ENV !== 'production')
  await ensureDemoAccount(store);
const push = new PushService(store, pushSettings());
const stopPush = push.start();
const mail = emailSettings();
const stopMail = startEmailWorker(store, mail);
const app = createApp({
  emailSettings: mail,
  push,
  store,
  staticDir: resolve('frontend/dist'),
  secureCookies: process.env.COOKIE_SECURE === 'true',
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5173,http://localhost:5173')
  )
    .split(',')
    .filter(Boolean),
});
app.once('error', async (error: NodeJS.ErrnoException) => {
  const reason =
    error.code === 'EADDRINUSE'
      ? `port ${port} is already in use. Stop the other Rally process, or choose another PORT.`
      : error.code === 'EACCES' || error.code === 'EPERM'
        ? 'this environment does not allow the local server to open a port.'
        : error.message;
  console.error(`Rally could not start: ${reason}`);
  await Promise.all([stopMail(), stopPush()]);
  store.close();
  process.exitCode = 1;
});
app.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`Rally Node.js API · http://${process.env.HOST ?? '127.0.0.1'}:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    const closed = new Promise<void>((resolve) => app.close(() => resolve()));
    await Promise.all([stopMail(), stopPush(), closed]);
    store.close();
    process.exit(0);
  });
