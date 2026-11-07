import { resolve } from 'node:path';
import { Store } from './database.ts';
import { createApp } from './api.ts';
import { emailSettings, startEmailWorker } from './email.ts';
const port = Number(process.env.PORT ?? 3001);
const store = new Store(process.env.DATABASE_PATH ?? resolve('data/rally.sqlite'));
const mail = emailSettings();
const stopMail = startEmailWorker(store, mail);
const app = createApp({
  emailSettings: mail,
  store,
  staticDir: resolve('frontend/dist'),
  secureCookies: process.env.COOKIE_SECURE === 'true',
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://127.0.0.1:5173,http://localhost:5173,https://localhost,capacitor://localhost')
  )
    .split(',')
    .filter(Boolean),
});
app.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`Rally Node.js API · http://${process.env.HOST ?? '127.0.0.1'}:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    const closed = new Promise<void>((resolve) => app.close(() => resolve()));
    await Promise.all([stopMail(), closed]);
    store.close();
    process.exit(0);
  });
