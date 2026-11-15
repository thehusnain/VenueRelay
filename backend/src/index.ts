import { ensureDemoAccount } from './demo.ts';
import { PushService, pushSettings } from './push.ts';
import { resolve } from 'node:path';
import { Store } from './database.ts';
import { createApp } from './api.ts';
import { emailSettings, startEmailWorker } from './email.ts';
import { runtimeSettings } from './runtime.ts';
import { MongoStore } from './mongo/store.ts';
import { MongoBackend } from './mongo/backend.ts';
async function main() {
  const config = runtimeSettings(),
    mail = emailSettings();
  let sqlite: Store | undefined,
    mongo: MongoStore | undefined,
    backend: MongoBackend | undefined,
    stopWorkers: () => Promise<void>;
  try {
    if (config.mongoUri) {
      mongo = await MongoStore.connect(config.mongoUri, config.database);
      backend = new MongoBackend(mongo, { mail, secure: config.secure, demo: config.demo });
      await backend.ensureDemo();
      stopWorkers = backend.startWorkers();
    } else {
      sqlite = new Store(process.env.DATABASE_PATH ?? resolve('data/rally.sqlite'));
      if (config.demo) await ensureDemoAccount(sqlite);
      const push = new PushService(sqlite, pushSettings()),
        stopPush = push.start(),
        stopMail = startEmailWorker(sqlite, mail);
      stopWorkers = async () => {
        await Promise.all([stopPush(), stopMail()]);
      };
    }
  } catch (error) {
    await mongo?.close();
    sqlite?.close();
    throw error;
  }
  const app = createApp({
    store: sqlite,
    backend,
    emailSettings: mail,
    staticDir: config.apiOnly ? undefined : resolve('frontend/dist'),
    secureCookies: config.secure,
    allowedOrigins: config.allowedOrigins,
  });
  const closeDb = async () => {
    await mongo?.close();
    sqlite?.close();
  };
  app.once('error', async (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use.`
        : 'VenueRelay could not open its server port.',
    );
    await stopWorkers();
    await closeDb();
    process.exitCode = 1;
  });
  app.listen(config.port, config.host, () =>
    console.log(
      `VenueRelay API (${backend ? 'MongoDB' : 'SQLite'}) · http://${config.host}:${config.port}`,
    ),
  );
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      backend?.stopLive();
      let deadline: ReturnType<typeof setTimeout>;
      await Promise.race([
        Promise.all([stopWorkers(), new Promise<void>((resolve) => app.close(() => resolve()))]),
        new Promise<void>((resolve) => {
          deadline = setTimeout(() => {
            app.closeAllConnections();
            resolve();
          }, 20000);
        }),
      ]);
      clearTimeout(deadline!);
      await closeDb();
      process.exit(0);
    });
}
main().catch((error) => {
  console.error(
    'VenueRelay startup failed:',
    error instanceof Error && ['Error', 'ApiError'].includes(error.name)
      ? error.message
      : 'Database unavailable. Check Atlas access and credentials.',
  );
  process.exitCode = 1;
});
