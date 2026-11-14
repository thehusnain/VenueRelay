import { openDB } from 'idb';
import type { Pending, Snapshot } from '../../shared/contracts';
import { isSnapshot } from './device-state';

export interface StoredIntent extends Pending {
  id: string;
  scope: string;
  userId: string;
  actorId: string;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil?: number;
  leaseToken?: string;
  raw?: string;
}
export const scopeOf = (s: Snapshot) => `${s.user.id}:${s.event.id}:${s.me.id}`;
let opening: ReturnType<typeof openDB> | undefined;
export function deviceDB() {
  if (!opening)
    opening = openDB('rally-device', 1, {
      upgrade(db) {
        db.createObjectStore('state');
        const queue = db.createObjectStore('outbox', { keyPath: 'id' });
        queue.createIndex('scope', 'scope');
        queue.createIndex('userId', 'userId');
      },
      blocking() {
        void opening?.then((db) => db.close());
        opening = undefined;
      },
      terminated() {
        opening = undefined;
      },
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
export async function readState<T>(key: string): Promise<T | undefined> {
  return (await deviceDB()).get('state', key);
}
export async function writeState(key: string, value: unknown) {
  await (await deviceDB()).put('state', value, key);
}
export async function migrateDeviceStorage() {
  const db = await deviceDB();
  if (await db.get('state', 'legacyImported')) return;
  const entries: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('rally:v1:')) entries.push([key, localStorage.getItem(key)!]);
    }
  } catch {
    return;
  }
  const migrated = new Set<string>();
  const tx = db.transaction(['state', 'outbox'], 'readwrite');
  try {
    for (const [key, raw] of entries) {
      if (key.startsWith('rally:v1:snapshot:')) {
        try {
          const snapshot = JSON.parse(raw);
          if (isSnapshot(snapshot)) {
            await tx.objectStore('state').put(snapshot, 'snapshot:' + scopeOf(snapshot));
            migrated.add(key);
          }
        } catch {
          /* Keep the original unreadable cache. */
        }
      }
      if (key.startsWith('rally:v1:outbox:')) {
        const [userId, eventId, actorId, ...rest] = key.slice('rally:v1:outbox:'.length).split(':');
        if (!userId || !eventId || !actorId || !rest.length) continue;
        const scope = `${userId}:${eventId}:${actorId}`,
          intentKey = rest.join(':');
        let item: Pending;
        try {
          item = JSON.parse(raw);
          if (
            !item ||
            item.key !== intentKey ||
            typeof item.action !== 'string' ||
            !item.payload ||
            typeof item.payload !== 'object' ||
            typeof item.createdAt !== 'string'
          )
            throw new Error();
        } catch {
          item = {
            key: intentKey,
            eventId,
            persona: 'self',
            action: 'device.unreadable',
            payload: { title: 'Unreadable saved change' },
            createdAt: new Date(0).toISOString(),
            conflict:
              'This old saved change cannot be read. Download its recovery copy before removing it.',
          };
        }
        const id = scope + ':' + intentKey;
        if (!(await tx.objectStore('outbox').get(id)))
          await tx.objectStore('outbox').add({
            ...item,
            eventId,
            id,
            scope,
            userId,
            actorId,
            attempts: 0,
            nextAttemptAt: 0,
            raw,
          });
        migrated.add(key);
      }
    }
    const last = entries.find(([key]) => key === 'rally:v1:last')?.[1];
    const cached = entries.find(([key]) => key === last)?.[1];
    if (cached) {
      try {
        const s = JSON.parse(cached);
        if (isSnapshot(s)) {
          migrated.add('rally:v1:last');
          await tx.objectStore('state').put(scopeOf(s), 'lastScope');
          await tx.objectStore('state').put(s.user.id, 'activeUser');
        }
      } catch {}
    }
    await tx.objectStore('state').put(true, 'legacyImported');
    await tx.done;
  } catch (error) {
    tx.abort();
    throw error;
  }
  for (const key of migrated) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}
export async function saveSnapshot(snapshot: Snapshot) {
  const db = await deviceDB(),
    tx = db.transaction('state', 'readwrite');
  await tx.store.put(snapshot, 'snapshot:' + scopeOf(snapshot));
  await tx.store.put(scopeOf(snapshot), 'lastScope');
  await tx.done;
}
export async function cachedSnapshot() {
  const db = await deviceDB(),
    scope = await db.get('state', 'lastScope');
  const value = scope ? await db.get('state', 'snapshot:' + scope) : undefined;
  return isSnapshot(value) ? value : null;
}
export async function readQueue(scope?: string): Promise<StoredIntent[]> {
  const db = await deviceDB();
  const items = scope
    ? await db.getAllFromIndex('outbox', 'scope', scope)
    : await db.getAll('outbox');
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export async function addIntent(s: Snapshot, item: Pending) {
  const db = await deviceDB(),
    tx = db.transaction('outbox', 'readwrite'),
    scope = scopeOf(s);
  const waiting: StoredIntent[] = await tx.store.index('scope').getAll(scope);
  if (item.taskId && waiting.some((v) => v.taskId === item.taskId)) {
    await tx.done;
    throw new Error('This task already has a change waiting to sync.');
  }
  await tx.store.add({
    ...item,
    id: scope + ':' + item.key,
    scope,
    userId: s.user.id,
    actorId: s.me.id,
    attempts: 0,
    nextAttemptAt: 0,
  });
  await tx.done;
}
export async function removeIntent(id: string) {
  await (await deviceDB()).delete('outbox', id);
}
export async function replaceIntent(old: StoredIntent, next: StoredIntent) {
  const tx = (await deviceDB()).transaction('outbox', 'readwrite');
  const current = await tx.store.get(old.id);
  if (!current || current.leaseUntil > Date.now()) {
    await tx.done;
    throw new Error('This change is syncing. Wait a moment and try again.');
  }
  await tx.store.delete(old.id);
  await tx.store.add(next);
  await tx.done;
}
export async function clearSnapshots() {
  const tx = (await deviceDB()).transaction('state', 'readwrite');
  for (const key of await tx.store.getAllKeys())
    if (String(key).startsWith('snapshot:') || ['lastScope', 'activeUser'].includes(String(key)))
      await tx.store.delete(key);
  await tx.done;
}
export function announceDeviceChange() {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('rally-device');
    channel.postMessage('changed');
    channel.close();
  }
}
