import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, RequestError } from '../frontend/src/transport.ts';
import { isSnapshot } from '../frontend/src/device-state.ts';

async function withFetch(implementation: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('client classifies connection, cancellation and timeout failures without AbortSignal.timeout', async () => {
  await withFetch(
    async () => {
      throw new TypeError('offline');
    },
    async () => {
      await assert.rejects(
        fetchJson('/'),
        (e: unknown) => e instanceof RequestError && e.status === 0 && e.code === 'NETWORK_ERROR',
      );
    },
  );
  await withFetch(
    async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (options?.signal?.aborted) abort();
        else options?.signal?.addEventListener('abort', abort, { once: true });
      }),
    async () => {
      const original = AbortSignal.timeout;
      Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
      try {
        await assert.rejects(
          fetchJson('/', {}, 15),
          (e: unknown) => e instanceof RequestError && e.code === 'TIMEOUT',
        );
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
          fetchJson('/', { signal: controller.signal }),
          (e: unknown) => e instanceof RequestError && e.code === 'CANCELLED',
        );
      } finally {
        Object.defineProperty(AbortSignal, 'timeout', { value: original, configurable: true });
      }
    },
  );
});

test('client rejects unreadable success responses and preserves actionable HTTP errors', async () => {
  for (const body of ['<html>proxy error</html>', 'null', '[]', '"ok"']) {
    await withFetch(
      async () => new Response(body),
      async () => {
        await assert.rejects(
          fetchJson('/'),
          (e: unknown) =>
            e instanceof RequestError && e.status === 502 && e.code === 'INVALID_RESPONSE',
        );
      },
    );
  }
  await withFetch(
    async () =>
      new Response(
        JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'Review the new owner.' } }),
        { status: 409 },
      ),
    async () => {
      await assert.rejects(
        fetchJson('/'),
        (e: unknown) =>
          e instanceof RequestError &&
          e.code === 'VERSION_CONFLICT' &&
          e.message === 'Review the new owner.',
      );
    },
  );
  await withFetch(
    async () => new Response(JSON.stringify({ ok: true })),
    async () => {
      assert.deepEqual(await fetchJson('/'), { ok: true });
    },
  );
});

test('client respects rate limits with bounded retry delays', async () => {
  for (const [header, expected] of [
    ['2', 2000],
    ['999999', 300000],
    ['invalid', 15000],
  ] as const) {
    await withFetch(
      async () =>
        new Response('{"error":{"message":"Please wait"}}', {
          status: 429,
          headers: { 'Retry-After': header },
        }),
      async () => {
        await assert.rejects(
          fetchJson('/'),
          (e: unknown) =>
            e instanceof RequestError && e.status === 429 && e.retryAfterMs === expected,
        );
      },
    );
  }
});

test('corrupt device snapshots are rejected before rendering while valid empty events remain usable', () => {
  const snapshot = {
    user: { id: 'u' },
    event: { id: 'e', name: 'Festival', date: '2026-11-08' },
    me: { id: 'm', name: 'Lead' },
    tasks: [],
    members: [],
    events: [],
    schedule: [],
    announcements: [],
    notifications: [],
    activity: [],
  };
  assert.ok(isSnapshot(snapshot));
  for (const bad of [
    null,
    [],
    {},
    { ...snapshot, event: null },
    { ...snapshot, tasks: [null] },
    { ...snapshot, event: { ...snapshot.event, date: 'broken' } },
    { ...snapshot, schedule: [{ title: 'Opening', starts_at: 'invalid', ends_at: 'invalid' }] },
    { ...snapshot, activity: [{ after_json: null, created_at: 'invalid' }] },
  ])
    assert.equal(isSnapshot(bad), false);
});
