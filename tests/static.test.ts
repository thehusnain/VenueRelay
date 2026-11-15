import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../backend/src/api.ts';
import { Store } from '../backend/src/database.ts';

test('a temporarily missing frontend returns a retry response and keeps the API alive', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rally-build-recovery-'));
  const store = new Store(':memory:');
  const app = createApp({ store, staticDir: directory });
  try {
    await new Promise<void>((resolve, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
    const missing = await fetch(base + '/sign-in');
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('retry-after'), '1');
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.match(await missing.text(), /Refresh this page/);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Rally</title>Ready');
    const restored = await fetch(base + '/sign-in');
    assert.equal(restored.status, 200);
    assert.match(await restored.text(), /Ready/);
    const head = await fetch(base + '/sign-in', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
