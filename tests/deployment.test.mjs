import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentOrigin, outputConfig } from '../scripts/vercel-output.mjs';
test('Vercel configuration preserves same-origin API traffic, SPA routes and private response caching', () => {
  const config = outputConfig('https://venuerelay-api.onrender.com');
  const api = config.routes.find((route) => route.dest?.startsWith('https:'));
  assert.equal(api.dest, 'https://venuerelay-api.onrender.com/api/$1');
  assert.match(api.headers['Cache-Control'], /no-store/);
  assert.ok(
    config.routes.indexOf(api) < config.routes.findIndex((route) => route.handle === 'filesystem'),
  );
  assert.ok(
    config.routes.some(
      (route) => route.src === '/sw.js' && route.headers['Cache-Control'].includes('no-store'),
    ),
  );
  assert.equal(config.routes.at(-1).dest, '/index.html');
  const csp = config.routes.find((route) => route.headers?.['Content-Security-Policy']).headers[
    'Content-Security-Policy'
  ];
  assert.ok(csp.includes("connect-src 'self' wss://venuerelay-api.onrender.com"));
});
test('deployment URL validation stops credentials, paths, queries and insecure upstreams reaching public bundles', () => {
  for (const value of [
    undefined,
    'http://api.example.com',
    'https://user:password@api.example.com',
    'https://api.example.com/path',
    'https://api.example.com?secret=abc',
    'javascript:alert(1)',
  ])
    assert.throws(() => deploymentOrigin(value));
});
