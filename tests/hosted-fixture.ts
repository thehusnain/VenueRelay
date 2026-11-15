import { createServer, request } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoStore } from '../backend/src/mongo/store.ts';
import { MongoBackend } from '../backend/src/mongo/backend.ts';
import { createApp } from '../backend/src/api.ts';

const website = 'http://127.0.0.1:3003';
const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
const store = await MongoStore.connect(replica.getUri(), 'rally_hosted_browser');
const backend = new MongoBackend(store, {
  demo: true,
  mail: {
    mode: 'disabled',
    origin: website,
    from: 'VenueRelay <hello@localhost>',
    previewDir: '/tmp/venuerelay-browser-mail',
  },
});
await backend.ensureDemo();
const api = createApp({ backend, allowedOrigins: [website] });
api.listen(3002, '127.0.0.1');
const root = resolve('frontend/dist');
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const web = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 3002,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: '127.0.0.1:3002' },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'Cache-Control': 'no-store' });
      res.end('API unavailable');
    });
    req.pipe(upstream);
    return;
  }
  let file = resolve(root, '.' + new URL(req.url ?? '/', website).pathname);
  if (!file.startsWith(root + sep) || !existsSync(file) || file === root)
    file = resolve(root, 'index.html');
  res.writeHead(200, {
    'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});
web.listen(3003, '127.0.0.1', () =>
  console.log('Disposable MongoDB website proxy ready at ' + website),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    backend.stopLive();
    api.closeAllConnections();
    web.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => api.close(() => r())),
      new Promise<void>((r) => web.close(() => r())),
    ]);
    await store.close();
    await replica.stop();
    process.exit(0);
  });
