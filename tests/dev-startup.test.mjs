import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/dev.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
function launch(cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

test('dev startup explains missing dependencies without a module stack trace', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rally-no-dependencies-'));
  try {
    const result = await launch(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /Run npm install/);
    assert.doesNotMatch(result.output, /ERR_MODULE_NOT_FOUND/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('dev startup detects occupied ports before building or launching children', async () => {
  const occupied = createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = occupied.address().port;
    const result = await launch(root, { PORT: String(port), HOST: '127.0.0.1', WEB_PORT: '5174' });
    assert.equal(result.code, 1);
    assert.match(result.output, new RegExp(`Port ${port} is already in use`));
    assert.match(result.output, /Ctrl\+C/);
    assert.doesNotMatch(result.output, /Preparing VenueRelay/);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test('dev startup rejects invalid and shared ports with actionable messages', async () => {
  for (const env of [{ PORT: 'abc' }, { PORT: '3001', WEB_PORT: '3001' }]) {
    const result = await launch(root, env);
    assert.equal(result.code, 1);
    assert.match(result.output, /must be/);
    assert.doesNotMatch(result.output, /Preparing VenueRelay/);
  }
});
