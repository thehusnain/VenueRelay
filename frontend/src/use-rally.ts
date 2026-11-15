import { sessionPreference } from './session-preferences';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, Account, Delivery } from '../../shared/contracts';
import { fetchJson, RequestError } from './transport';
import { isSnapshot } from './device-state';
import {
  addIntent,
  announceDeviceChange,
  cachedSnapshot,
  clearSnapshots,
  migrateDeviceStorage,
  readQueue,
  readState,
  removeIntent,
  replaceIntent,
  saveSnapshot,
  scopeOf,
  writeState,
  type StoredIntent,
} from './offline-store';
import { requestBackgroundSync, syncOutbox } from './sync-engine';
export { RequestError } from './transport';
export const API = import.meta.env.VITE_API_URL ?? '';
export async function request<T = any>(
  path: string,
  options: RequestInit = {},
  persona = 'self',
): Promise<T> {
  const data = await fetchJson<any>(`${API}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Rally-Persona': persona, ...options.headers },
  });
  if (['/auth/me', '/auth/login', '/auth/register', '/auth/demo'].includes(path) && data.user?.id) {
    await migrateDeviceStorage();
    const previous = await cachedSnapshot();
    if (previous && previous.user.id !== data.user.id) await writeState('lastScope', null);
    await writeState('activeUser', data.user.id);
    announceDeviceChange();
  }
  return data;
}
export function useRally() {
  const [stage, setStage] = useState<
    'loading' | 'welcome' | 'verify' | 'setup' | 'workspace' | 'unavailable'
  >('loading');
  const [account, setAccount] = useState<Account | null>(null),
    [delivery, setDelivery] = useState<Delivery>({ mode: 'disabled', connected: false });
  const [data, setData] = useState<Snapshot | null>(null),
    [pending, setPending] = useState<StoredIntent[]>([]),
    [persona, setPersona] = useState('self');
  const [simulatedOffline, setSimulatedOffline] = useState(false),
    [connection, setConnection] = useState<'connecting' | 'live' | 'offline' | 'syncing'>(
      'connecting',
    );
  const [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [realtime, setRealtime] = useState(false);
  const current = useRef<Snapshot | null>(null),
    personaRef = useRef('self'),
    paused = useRef(false),
    flushing = useRef(false),
    generation = useRef(0),
    lastSuccess = useRef(Date.now()),
    refreshing = useRef(false),
    liveRef = useRef(false),
    lastPoll = useRef(0);
  const updateQueue = useCallback(async () => {
    const s = current.current;
    if (s) setPending(await readQueue(scopeOf(s)));
  }, []);
  const apply = useCallback(async (next: Snapshot) => {
    if (!isSnapshot(next))
      throw new RequestError(
        502,
        'INVALID_SNAPSHOT',
        'The event response could not be read. Please retry; waiting changes have not been cleared.',
      );
    current.current = next;
    setData(next);
    try {
      const isPaused = !!(await readState('paused:' + scopeOf(next)));
      paused.current = isPaused;
      setSimulatedOffline(isPaused);
      await saveSnapshot(next);
      setPending(await readQueue(scopeOf(next)));
      return true;
    } catch {
      setError(
        'Device storage is unavailable or full. Your live event is visible, but an offline copy could not be saved.',
      );
      return false;
    }
  }, []);
  const load = useCallback(
    async (eventId?: string, nextPersona = personaRef.current) => {
      const run = ++generation.current;
      try {
        await migrateDeviceStorage();
        if (paused.current || !navigator.onLine)
          throw new Error('You are offline. Showing the last saved event where available.');
        if (!eventId) {
          const auth = await request<{ user: Account; delivery: Delivery }>('/auth/me');
          if (run !== generation.current) return;
          setAccount(auth.user);
          setDelivery(auth.delivery);
          if (
            !auth.user.email &&
            !auth.user.username &&
            sessionPreference.get('rally:demo') !== 'yes'
          ) {
            setStage('welcome');
            setData(null);
            current.current = null;
            return;
          }
          if (!(auth.user.accessGranted ?? auth.user.emailVerified)) {
            setStage('verify');
            setData(null);
            current.current = null;
            return;
          }
          const invitation = sessionPreference.get('rally:invitation');
          if (invitation && (auth.user.username || auth.user.email)) {
            const joined = await request<{ eventId: string }>('/invitations/accept', {
              method: 'POST',
              body: JSON.stringify({ token: invitation }),
            });
            sessionPreference.remove('rally:invitation');
            eventId = joined.eventId;
          }
        }
        const next = eventId
          ? await request(`/events/${eventId}/snapshot`, {}, nextPersona)
          : await request('/bootstrap', { method: 'POST', body: '{}' }, nextPersona);
        if (run !== generation.current) return;
        if (next.requiresSetup) {
          setStage('setup');
          setData(null);
          current.current = null;
          return;
        }
        personaRef.current = nextPersona;
        setPersona(nextPersona);
        if (await apply(next)) setError('');
        setStage('workspace');
        setConnection(paused.current ? 'offline' : 'live');
        lastSuccess.current = Date.now();
      } catch (e) {
        if (run !== generation.current) return;
        if (e instanceof RequestError && e.status === 401) {
          current.current = null;
          setData(null);
          setAccount(null);
          setStage('welcome');
          setError('');
          return;
        }
        const cached = current.current ?? (await cachedSnapshot().catch(() => null));
        if (cached && !eventId) {
          await apply(cached);
          personaRef.current = cached.event.is_demo ? cached.me.role : 'self';
          setPersona(personaRef.current);
          setStage('workspace');
        } else if (!current.current) setStage('unavailable');
        setConnection('offline');
        setError(e instanceof Error ? e.message : 'VenueRelay could not open. Please retry.');
      }
    },
    [apply],
  );
  const refresh = useCallback(async () => {
    const s = current.current;
    if (!s || paused.current || !navigator.onLine || refreshing.current) return;
    refreshing.current = true;
    const run = generation.current;
    try {
      const next = await request<Snapshot>(
        `/events/${s.event.id}/snapshot`,
        {},
        personaRef.current,
      );
      if (run !== generation.current) return;
      if (!isSnapshot(next))
        throw new RequestError(
          502,
          'INVALID_SNAPSHOT',
          'The event response could not be read. Please retry; waiting changes have not been cleared.',
        );
      if (next.user.id !== s.user.id || next.me.id !== s.me.id)
        throw new RequestError(
          401,
          'ACTOR_CHANGED',
          'Your account changed. Sign in again; waiting changes remain on this device.',
        );
      if (await apply(next)) setError('');
      setConnection(paused.current ? 'offline' : 'live');
      lastSuccess.current = Date.now();
    } catch (e) {
      setConnection('offline');
      if (e instanceof RequestError) {
        setError(e.message);
        if (e.status === 401 || e.status === 403) {
          generation.current++;
          current.current = null;
          setData(null);
          setAccount(null);
          setStage('welcome');
        }
      }
    } finally {
      refreshing.current = false;
    }
  }, [apply]);
  const flush = useCallback(async () => {
    const s = current.current;
    if (!s || flushing.current || paused.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      if ((await readQueue(scopeOf(s))).some((item) => !item.conflict)) setConnection('syncing');
      const result = await syncOutbox(scopeOf(s), API);
      await updateQueue();
      if (result.authRequired) {
        generation.current++;
        current.current = null;
        setData(null);
        setAccount(null);
        setStage('welcome');
        setError(`Sign in as ${s.user.name} to send waiting changes. They remain on this device.`);
        return;
      }
      if (result.saved) setToast('Your changes are saved.');
      if (result.retry) {
        setConnection('offline');
        void requestBackgroundSync();
      }
      await refresh();
    } catch (e) {
      setConnection('offline');
      setError(e instanceof Error ? e.message : 'Device storage could not be opened.');
    } finally {
      flushing.current = false;
    }
  }, [refresh, updateQueue]);
  useEffect(() => {
    void load();
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastPoll.current >= (liveRef.current ? 60000 : 10000)) {
          lastPoll.current = Date.now();
          void flush();
        }
      }
    }, 10000);
    const online = () => {
        void flush();
        void refresh();
      },
      offline = () => setConnection('offline'),
      visible = () => {
        if (document.visibilityState === 'visible') online();
      };
    const changed = () => {
      void updateQueue().catch(() => {});
    };
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rally-device') : null;
    if (channel) channel.onmessage = changed;
    const worker = (e: MessageEvent) => {
      if (e.data?.type === 'rally:outbox') online();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    navigator.serviceWorker?.addEventListener('message', worker);
    return () => {
      clearInterval(tick);
      channel?.close();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
      navigator.serviceWorker?.removeEventListener('message', worker);
    };
  }, [load, flush, refresh, updateQueue]);
  useEffect(() => {
    if (!data) return;
    let socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      disposed = false,
      attempt = 0;
    const retry = () => {
      liveRef.current = false;
      setRealtime(false);
      if (!disposed)
        timer = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 300,
        );
    };
    const connect = async () => {
      if (disposed || paused.current) return;
      try {
        const remote = import.meta.env.VITE_WS_URL;
        const url = new URL(
          `${remote || API}/api/v1/events/${data.event.id}/live`,
          location.origin,
        );
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        if (remote) {
          const proof = await request<{ ticket: string }>(
            `/events/${data.event.id}/live-ticket`,
            { method: 'POST', body: '{}' },
            persona,
          );
          if (disposed || paused.current) return;
          url.searchParams.set('ticket', proof.ticket);
        } else url.searchParams.set('persona', persona);
        socket = new WebSocket(url);
        socket.onopen = () => {
          attempt = 0;
          liveRef.current = true;
          setRealtime(true);
          void flush();
        };
        socket.onmessage = (e) => {
          try {
            if (JSON.parse(e.data).type === 'event.changed') void refresh();
          } catch {}
        };
        socket.onerror = () => socket?.close();
        socket.onclose = retry;
      } catch {
        retry();
      }
    };
    void connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
      liveRef.current = false;
      setRealtime(false);
    };
  }, [data?.event.id, data?.me.id, persona, simulatedOffline, refresh, flush]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const mutate = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
      taskId?: string,
      expectedVersion?: number,
    ) => {
      const s = current.current;
      if (!s) return false;
      try {
        await addIntent(s, {
          key: crypto.randomUUID(),
          eventId: s.event.id,
          persona: personaRef.current,
          action,
          payload,
          taskId,
          expectedVersion,
          createdAt: new Date().toISOString(),
        });
        await updateQueue();
        announceDeviceChange();
        setToast(
          paused.current || !navigator.onLine
            ? 'Saved on this device. Will send when connected.'
            : 'Saving your action…',
        );
        void requestBackgroundSync();
        void flush();
        return true;
      } catch (e) {
        setToast(
          e instanceof Error && e.message.includes('already')
            ? e.message
            : 'Device storage is unavailable. Your action was not sent. Free space and retry.',
        );
        return false;
      }
    },
    [flush, updateQueue],
  );
  const discard = async (key: string) => {
    const s = current.current;
    if (!s) return;
    try {
      const item = (await readQueue(scopeOf(s))).find((i) => i.key === key);
      if (item) {
        if ((item.leaseUntil ?? 0) > Date.now())
          throw new Error('This change is syncing. Try again in a moment.');
        await removeIntent(item.id);
      }
      await updateQueue();
      announceDeviceChange();
      void flush();
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const rebase = async (key: string) => {
    const s = current.current;
    if (!s) return;
    try {
      const item = (await readQueue(scopeOf(s))).find((i) => i.key === key);
      if (!item || item.action === 'device.unreadable') return;
      const task = s.tasks.find((t) => t.id === item.taskId);
      if (item.taskId && !task)
        throw new Error('You no longer have access to this task. Keep the saved version.');
      const nextKey = crypto.randomUUID();
      await replaceIntent(item, {
        ...item,
        key: nextKey,
        id: item.scope + ':' + nextKey,
        expectedVersion: task?.version,
        createdAt: new Date().toISOString(),
        conflict: undefined,
        attempts: 0,
        nextAttemptAt: 0,
        leaseUntil: 0,
      });
      await updateQueue();
      announceDeviceChange();
      void flush();
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const switchContext = async (eventId: string, nextPersona: string) => {
    if (pending.length) {
      setToast('Sync or remove pending changes before switching events or roles.');
      return;
    }
    await load(eventId, nextPersona);
  };
  const toggleOffline = async () => {
    const s = current.current;
    if (!s) return;
    paused.current = !paused.current;
    await writeState('paused:' + scopeOf(s), paused.current);
    setSimulatedOffline(paused.current);
    if (paused.current) setConnection('offline');
    else {
      void flush();
      void refresh();
    }
  };
  return {
    data,
    stage,
    account,
    delivery,
    pending,
    persona,
    connection,
    realtime,
    simulatedOffline,
    error,
    toast,
    setToast,
    mutate,
    refresh,
    load,
    switchContext,
    flush,
    discard,
    rebase,
    toggleOffline,
    lastSuccess,
    beginDemo: async () => {
      if ((await readQueue()).length)
        throw new Error('Send or remove your waiting changes before opening another sample.');
      if (!sessionPreference.set('rally:demo', 'yes'))
        throw new Error('Enable browser storage and retry.');
      await request('/auth/demo', { method: 'POST', body: '{}' });
      paused.current = false;
      setSimulatedOffline(false);
      await load(undefined, 'self');
    },
    signOut: async () => {
      try {
        const owner = current.current?.user.id ?? account?.id;
        if ((await readQueue()).some((i) => i.userId === owner)) {
          setToast('You have changes waiting. Open Connection help first.');
          return;
        }
        await request('/auth/logout', { method: 'POST', body: '{}' });
        await clearSnapshots();
        sessionPreference.remove('rally:demo');
        generation.current++;
        current.current = null;
        setData(null);
        setAccount(null);
        setPending([]);
        setPersona('self');
        personaRef.current = 'self';
        paused.current = false;
        setSimulatedOffline(false);
        setStage('welcome');
        setError('');
        announceDeviceChange();
      } catch {
        setToast(
          'Could not sign out safely. Reconnect and try again; waiting data has not been removed.',
        );
      }
    },
  };
}
