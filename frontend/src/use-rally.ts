import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, Pending, Account, Delivery } from '../../shared/contracts';
export class RequestError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const API = import.meta.env.VITE_API_URL ?? '';
let nativeSession: string | null = null;
const nativeReady = Capacitor.isNativePlatform()
  ? import('@capacitor/preferences').then(async ({ Preferences }) => {
      nativeSession = (await Preferences.get({ key: 'rally.session' })).value;
    })
  : Promise.resolve();
export async function request<T = any>(
  path: string,
  options: RequestInit = {},
  persona = 'self',
): Promise<T> {
  await nativeReady;
  const response = await fetch(`${API}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Rally-Persona': persona,
      ...(Capacitor.isNativePlatform()
        ? {
            'X-Rally-Client': 'native',
            ...(nativeSession ? { Authorization: `Bearer ${nativeSession}` } : {}),
          }
        : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      response.status,
      data.error?.code ?? 'ERROR',
      data.error?.message ?? 'The action could not be completed.',
      data.error?.details,
    );
  if (['/auth/login', '/auth/register', '/auth/demo'].includes(path) && data.user?.id) {
    try {
      const previous = savedSnapshot();
      if (previous && previous.user.id !== data.user.id) localStorage.removeItem(lastKey);
    } catch {}
  }
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    if (data.sessionToken) {
      nativeSession = data.sessionToken;
      await Preferences.set({ key: 'rally.session', value: nativeSession! });
    }
    if (path === '/auth/logout') {
      nativeSession = null;
      await Preferences.remove({ key: 'rally.session' });
    }
  }
  return data;
}
const lastKey = 'rally:v1:last';
const cacheKey = (s: Snapshot) => `rally:v1:snapshot:${s.user.id}:${s.event.id}:${s.me.id}`;
const outboxPrefix = (s: Snapshot) => `rally:v1:outbox:${s.user.id}:${s.event.id}:${s.me.id}:`;
function readQueue(s: Snapshot) {
  const prefix = outboxPrefix(s),
    items: Pending[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(prefix))
      try {
        items.push(JSON.parse(localStorage.getItem(k)!));
      } catch {}
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key));
}
function savedSnapshot(): Snapshot | null {
  try {
    const key = localStorage.getItem(lastKey);
    return key ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
  } catch {
    return null;
  }
}
export function useRally() {
  const [stage, setStage] = useState<
    'loading' | 'welcome' | 'verify' | 'setup' | 'workspace' | 'unavailable'
  >('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({ mode: 'disabled', connected: false });
  const [data, setData] = useState<Snapshot | null>(null),
    [pending, setPending] = useState<Pending[]>([]),
    [persona, setPersona] = useState('self'),
    [simulatedOffline, setSimulatedOffline] = useState(false),
    [connection, setConnection] = useState<'connecting' | 'live' | 'offline' | 'syncing'>(
      'connecting',
    ),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  const current = useRef<Snapshot | null>(null),
    personaRef = useRef('self'),
    paused = useRef(false),
    flushing = useRef(false),
    generation = useRef(0),
    lastSuccess = useRef(Date.now());
  const apply = useCallback((next: Snapshot) => {
    current.current = next;
    setData(next);
    setPending(readQueue(next));
    try {
      const key = cacheKey(next);
      localStorage.setItem(key, JSON.stringify(next));
      localStorage.setItem(lastKey, key);
    } catch {
      setError('Device storage is full. Offline copies cannot be refreshed.');
    }
  }, []);
  const load = useCallback(
    async (eventId?: string, nextPersona = personaRef.current) => {
      const run = ++generation.current;
      let invitationMessage = '';
      try {
        ensureConnected();
        if (!eventId) {
          const auth = await request<{ user: Account; delivery: Delivery }>('/auth/me');
          if (run !== generation.current) return;
          setAccount(auth.user);
          setDelivery(auth.delivery);
          if (!auth.user.email && sessionStorage.getItem('rally:demo') !== 'yes') {
            setStage('welcome');
            setData(null);
            current.current = null;
            return;
          }
          if (!auth.user.emailVerified) {
            setStage('verify');
            setData(null);
            current.current = null;
            return;
          }
          const invitation = sessionStorage.getItem('rally:invitation');
          if (invitation && auth.user.email) {
            try {
              await request('/invitations/accept', {
                method: 'POST',
                body: JSON.stringify({ token: invitation }),
              });
              sessionStorage.removeItem('rally:invitation');
            } catch (error) {
              invitationMessage = (error as Error).message;
              setError(invitationMessage);
              sessionStorage.removeItem('rally:invitation');
            }
          }
        }
        const next = eventId
          ? await request<Snapshot>(`/events/${eventId}/snapshot`, {}, nextPersona)
          : await request<Snapshot | { requiresSetup: true; user: Account }>(
              '/bootstrap',
              { method: 'POST', body: '{}' },
              nextPersona,
            );
        if ('requiresSetup' in next) {
          setStage('setup');
          setData(null);
          current.current = null;
          return;
        }
        if (run !== generation.current) return;
        personaRef.current = nextPersona;
        setPersona(nextPersona);
        apply(next);
        setStage('workspace');
        setConnection('live');
        setError(invitationMessage);
        lastSuccess.current = Date.now();
      } catch (e) {
        if (e instanceof RequestError && e.status === 401) {
          setStage('welcome');
          setAccount(null);
          setData(null);
          current.current = null;
          setError('');
          setConnection('connecting');
        } else {
          const cached = current.current ?? savedSnapshot();
          if (cached && !eventId) {
            apply(cached);
            setStage('workspace');
            personaRef.current = cached.event.is_demo ? cached.me.role : 'self';
            setPersona(personaRef.current);
          }
          setConnection('offline');
          if (e instanceof RequestError) setError(e.message);
          else if (!cached) {
            setStage('unavailable');
            setError('We cannot reach Rally right now. Please try again in a moment.');
          }
        }
      }
      function ensureConnected() {
        if (paused.current || !navigator.onLine) throw new Error('Offline');
      }
    },
    [apply],
  );
  const refresh = useCallback(async () => {
    const s = current.current;
    if (!s || paused.current || !navigator.onLine) {
      setConnection('offline');
      return;
    }
    const run = generation.current;
    try {
      const next = await request<Snapshot>(
        `/events/${s.event.id}/snapshot`,
        {},
        personaRef.current,
      );
      if (run !== generation.current) return;
      apply(next);
      lastSuccess.current = Date.now();
      setConnection('live');
      setError('');
    } catch (e) {
      setConnection('offline');
      if (e instanceof RequestError) {
        setError(e.message);
        if (e.status === 401) setStage('welcome');
      }
    }
  }, [apply]);
  const flush = useCallback(async () => {
    const s = current.current;
    if (!s || flushing.current || paused.current || !navigator.onLine) return;
    const run = generation.current;
    flushing.current = true;
    try {
      for (const item of readQueue(s)) {
        if (item.conflict || paused.current || !navigator.onLine) break;
        setConnection('syncing');
        try {
          await request(
            `/events/${s.event.id}/commands`,
            {
              method: 'POST',
              headers: { 'Idempotency-Key': item.key },
              body: JSON.stringify({
                action: item.action,
                taskId: item.taskId,
                expectedVersion: item.expectedVersion,
                payload: item.payload,
              }),
            },
            item.persona,
          );
          localStorage.removeItem(outboxPrefix(s) + item.key);
          setPending(readQueue(s));
          setToast('Your change is saved.');
        } catch (e) {
          if (e instanceof RequestError && e.status === 401) {
            setStage('welcome');
            setError('Please sign in again. Your unsent changes are safe on this device.');
          } else if (e instanceof RequestError && e.status < 500 && e.status !== 429) {
            localStorage.setItem(
              outboxPrefix(s) + item.key,
              JSON.stringify({ ...item, conflict: e.message }),
            );
            setPending(readQueue(s));
            setToast('Someone else changed this task. Please check it before continuing.');
            await refresh();
          } else setConnection('offline');
          break;
        }
      }
      if (run === generation.current) await refresh();
    } finally {
      flushing.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void flush();
        if (!flushing.current) void refresh();
      }
    }, 3000);
    const online = () => {
      void flush();
      void refresh();
    };
    const offline = () => setConnection('offline');
    const storage = () => {
      if (current.current) setPending(readQueue(current.current));
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storage);
    };
  }, [load, flush, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const mutate = useCallback(
    (
      action: string,
      payload: Record<string, unknown>,
      taskId?: string,
      expectedVersion?: number,
    ) => {
      const s = current.current;
      if (!s) return false;
      if (taskId && readQueue(s).some((x) => x.taskId === taskId)) {
        setToast('This task already has an action waiting to sync.');
        return false;
      }
      const item: Pending = {
        key: crypto.randomUUID(),
        eventId: s.event.id,
        persona: personaRef.current,
        action,
        payload,
        taskId,
        expectedVersion,
        createdAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(outboxPrefix(s) + item.key, JSON.stringify(item));
        setPending(readQueue(s));
        setToast(
          paused.current || !navigator.onLine
            ? 'Saved on this device. Will send when connected.'
            : 'Saving your action…',
        );
        void flush();
        return true;
      } catch {
        setToast(
          'Device storage is unavailable. Your action was not sent. Free some space and retry.',
        );
        return false;
      }
    },
    [flush],
  );
  const discard = (key: string) => {
    if (!current.current) return;
    localStorage.removeItem(outboxPrefix(current.current) + key);
    setPending(readQueue(current.current));
    void flush();
  };
  const rebase = (key: string) => {
    const s = current.current;
    if (!s) return;
    const item = readQueue(s).find((x) => x.key === key);
    if (!item) return;
    const task = s.tasks.find((t) => t.id === item.taskId);
    if (item.taskId && !task) {
      setToast('You no longer have access to this task. Discard the pending action.');
      return;
    }
    const next = {
      ...item,
      key: crypto.randomUUID(),
      expectedVersion: task?.version,
      createdAt: new Date().toISOString(),
      conflict: undefined,
    };
    localStorage.setItem(outboxPrefix(s) + next.key, JSON.stringify(next));
    localStorage.removeItem(outboxPrefix(s) + key);
    setPending(readQueue(s));
    void flush();
  };
  const switchContext = async (eventId: string, nextPersona: string) => {
    if (pending.length) {
      setToast('Sync or discard pending actions before switching roles or events.');
      return;
    }
    await load(eventId, nextPersona);
  };
  const toggleOffline = () => {
    paused.current = !paused.current;
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
    beginDemo: async () => {
      if (pending.length) {
        setToast('Please send or remove your waiting changes first.');
        return;
      }
      await request('/auth/demo', { method: 'POST', body: '{}' });
      sessionStorage.setItem('rally:demo', 'yes');
      paused.current = false;
      setSimulatedOffline(false);
      await load(undefined, 'self');
    },
    signOut: async () => {
      const owner = current.current?.user.id ?? account?.id;
      const waitingAnywhere =
        owner &&
        Object.keys(localStorage).some((key) => key.startsWith(`rally:v1:outbox:${owner}:`));
      if (pending.length || waitingAnywhere) {
        setToast('You have changes waiting to be saved. Open Connection help first.');
        return;
      }
      await request('/auth/logout', { method: 'POST', body: '{}' });
      for (const key of Object.keys(localStorage))
        if (key.startsWith('rally:') && !key.startsWith('rally:v1:outbox:'))
          localStorage.removeItem(key);
      sessionStorage.removeItem('rally:demo');
      paused.current = false;
      setSimulatedOffline(false);
      personaRef.current = 'self';
      setPersona('self');
      setPending([]);
      generation.current++;
      current.current = null;
      setData(null);
      setAccount(null);
      setStage('welcome');
      setError('');
    },
    pending,
    persona,
    connection,
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
  };
}
