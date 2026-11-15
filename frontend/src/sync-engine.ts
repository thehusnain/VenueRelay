import {
  deviceDB,
  readQueue,
  readState,
  announceDeviceChange,
  type StoredIntent,
} from './offline-store';
import { fetchJson, RequestError } from './transport';
import { intentId } from './intent-id';
export interface SyncResult {
  saved: number;
  retry: boolean;
  authRequired: boolean;
}
export async function syncOutbox(
  scope?: string,
  api = '',
  onConfirmed?: (
    item: StoredIntent,
    response: { entityId?: string; entityType?: string; entity?: object; ok?: boolean },
  ) => Promise<void>,
): Promise<SyncResult> {
  const result = { saved: 0, retry: false, authRequired: false },
    db = await deviceDB();
  const activeUser = await readState<string>('activeUser');
  if (!activeUser) return result;
  const items = (await readQueue(scope)).filter(
    (item) => item.userId === activeUser && !item.conflict,
  );
  if (!items.length) return result;
  const auth = await fetchJson<{ user: { id: string } }>(`${api}/api/v1/auth/me`, {
    credentials: 'include',
  }).catch((error) => {
    if (error instanceof RequestError && error.status === 401) result.authRequired = true;
    else result.retry = true;
    return null;
  });
  if (auth && typeof auth.user?.id !== 'string') {
    result.retry = true;
    return result;
  }
  if (!auth || auth.user?.id !== activeUser) {
    if (auth) result.authRequired = true;
    return result;
  }
  for (const item of items) {
    if (await readState('paused:' + item.scope)) continue;
    const tx = db.transaction('outbox', 'readwrite');
    const current: StoredIntent | undefined = await tx.store.get(item.id);
    if (!current || current.conflict || (current.leaseUntil ?? 0) > Date.now()) {
      await tx.done;
      if (current && !current.conflict) result.retry = true;
      continue;
    }
    if (current.nextAttemptAt > Date.now()) {
      await tx.done;
      result.retry = true;
      continue;
    }
    current.leaseUntil = Date.now() + 30000;
    current.leaseToken = intentId();
    const finish = async (value?: StoredIntent) => {
      const tx = db.transaction('outbox', 'readwrite');
      const latest = await tx.store.get(item.id);
      if (latest?.leaseToken === current.leaseToken) {
        if (value) await tx.store.put(value);
        else await tx.store.delete(item.id);
      } else {
        await tx.done;
        return false;
      }
      await tx.done;
      return true;
    };
    await tx.store.put(current);
    await tx.done;
    try {
      const read = item.action === 'notification.read';
      const response = await fetchJson<{
        entityId?: string;
        entityType?: string;
        entity?: object;
        ok?: boolean;
      }>(`${api}/api/v1/events/${item.eventId}/${read ? 'notifications/read' : 'commands'}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.key,
          'X-Rally-Persona': item.persona,
          'X-Rally-Expected-Actor': item.actorId,
        },
        body: JSON.stringify(
          read
            ? { ids: item.payload.ids }
            : {
                action: item.action,
                taskId: item.taskId,
                expectedVersion: item.expectedVersion,
                payload: item.payload,
              },
        ),
      });
      if (
        read
          ? response.ok !== true
          : !response.entityId ||
            !response.entityType ||
            !response.entity ||
            typeof response.entity !== 'object'
      )
        throw new RequestError(
          502,
          'UNCONFIRMED_CHANGE',
          'The server did not confirm this change. It remains queued for a safe retry.',
        );
      if (await finish()) {
        result.saved++;
        try {
          await onConfirmed?.(item, response);
        } catch {
          /* The server acknowledgement remains authoritative; refresh can recover its view. */
        }
      }
    } catch (error) {
      current.leaseUntil = 0;
      if (
        error instanceof RequestError &&
        (error.status === 401 || error.code === 'ACTOR_CHANGED')
      ) {
        result.authRequired = true;
        await finish(current);
        break;
      }
      if (
        error instanceof RequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      )
        current.conflict = error.message;
      else {
        current.attempts++;
        current.nextAttemptAt =
          Date.now() +
          (error instanceof RequestError && error.status === 429
            ? (error.retryAfterMs ?? 15000)
            : Math.min(300000, 1000 * 2 ** Math.min(current.attempts, 8)) +
              Math.floor(Math.random() * 500));
        result.retry = true;
      }
      await finish(current);
    }
  }
  announceDeviceChange();
  return result;
}
export async function requestBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && 'sync' in registration)
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> };
        }
      ).sync.register('rally-outbox');
  } catch {
    /* Foreground retries remain available. */
  }
}
