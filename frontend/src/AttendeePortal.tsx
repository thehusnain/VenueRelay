import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Copy, RefreshCw, MapPin } from 'lucide-react';
import type {
  AttendeeEvent,
  AttendeeRequestInput,
  AttendeeRequestView,
  Snapshot,
} from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
import { Brand } from './Entry';
import { Modal, eventDate } from './components';
import { QrCode } from './qr';
import { fetchJson, RequestError } from './transport';
import { request } from './use-rally';

interface SavedRequest {
  key: string;
  input: AttendeeRequestInput;
}
function readSaved<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function savedEvent(key: string): AttendeeEvent | null {
  const value = readSaved<AttendeeEvent>(key);
  return value &&
    ['id', 'name', 'venue', 'date'].every(
      (field) => typeof value[field as keyof AttendeeEvent] === 'string',
    ) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    Number.isFinite(Date.parse(value.date))
    ? value
    : null;
}
function savedRequest(key: string): SavedRequest | null {
  const value = readSaved<SavedRequest>(key);
  return value &&
    typeof value.key === 'string' &&
    /^[A-Za-z0-9_-]{8,100}$/.test(value.key) &&
    value.input &&
    typeof value.input.title === 'string' &&
    typeof value.input.location === 'string' &&
    typeof value.input.receiptKey === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value.input.receiptKey)
    ? value
    : null;
}
function privateKey() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function trackingUrl(key: string) {
  return location.origin + '/request#key=' + key;
}

export function AttendeePortal({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const secret = new URLSearchParams(location.hash.slice(1)).get('key') ?? '';
  const tracking = path === '/request';
  const eventId = path.split('/')[2] ?? '';
  const storageKey = 'venuerelay:attendee:' + eventId + ':' + secret;
  const [event, setEvent] = useState<AttendeeEvent | null>(() =>
    tracking ? null : savedEvent(storageKey + ':event'),
  );
  const [view, setView] = useState<AttendeeRequestView | null>(null);
  const [pending, setPending] = useState<SavedRequest | null>(() =>
    tracking ? null : savedRequest(storageKey),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const sending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const load = useCallback(async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      setError(
        'This link is incomplete. Ask the event team for the full link or scan their QR code.',
      );
      return;
    }
    try {
      if (tracking) {
        const next = await fetchJson<AttendeeRequestView>('/api/v1/attendee-requests', {
          headers: { Authorization: 'Bearer vr_guest_' + secret },
          cache: 'no-store',
        });
        setView(next);
        setEvent(next.event);
      } else {
        const next = await fetchJson<AttendeeEvent>('/api/v1/attendee-events/' + eventId, {
          headers: { 'X-VenueRelay-Event-Key': secret },
          cache: 'no-store',
        });
        setEvent(next);
        try {
          localStorage.setItem(storageKey + ':event', JSON.stringify(next));
        } catch {}
      }
      setError('');
    } catch (error) {
      if (error instanceof RequestError && error.status === 410 && !tracking) setEvent(null);
      setError((error as Error).message);
    }
  }, [eventId, secret, tracking, storageKey]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = tracking ? setInterval(refresh, 15000) : undefined;
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, tracking]);
  const send = useCallback(
    async (intent: SavedRequest) => {
      if (sending.current) return;
      sending.current = true;
      setBusy(true);
      setError('');
      try {
        await fetchJson('/api/v1/attendee-events/' + eventId + '/requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-VenueRelay-Event-Key': secret,
            'Idempotency-Key': intent.key,
          },
          body: JSON.stringify(intent.input),
        });
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        onNavigate('/request#key=' + intent.input.receiptKey);
      } catch (error) {
        setError((error as Error).message);
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [eventId, secret, storageKey, onNavigate],
  );
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!pending || tracking) return;
    const retry = () => void sendRef.current(pending);
    if (navigator.onLine) retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [pending, tracking]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const title = String(values.title ?? '').trim(),
      location = String(values.location ?? '').trim();
    if (title.length < 3 || !location) {
      setError('Describe what you need in at least three characters, and add your location.');
      return;
    }
    const intent: SavedRequest = {
      key: crypto.randomUUID(),
      input: {
        name: String(values.name || '').trim(),
        title,
        location,
        description: String(values.description || ''),
        priority: String(values.priority) as AttendeeRequestInput['priority'],
        receiptKey: privateKey(),
      },
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(intent));
      setPending(intent);
    } catch {
      setError(
        'Your browser could not save this request for safe retries. Enable website storage and try again.',
      );
    }
  };
  return (
    <div className="entry-shell attendee-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="entry-header">
        <Brand onClick={() => onNavigate('/')} />
        <button className="text-link" onClick={() => onNavigate('/sign-in')}>
          Staff sign in
          <ArrowRight size={16} />
        </button>
      </header>
      <main id="main" className="attendee-main" tabIndex={-1}>
        <h1 ref={heading} tabIndex={-1}>
          {tracking ? 'Your help request' : (event?.name ?? 'Event help')}
        </h1>
        {event ? (
          <p className="attendee-event">
            <MapPin size={15} />
            <span>{event.venue}</span>
            <span>· {eventDate(event.date)}</span>
          </p>
        ) : null}
        {error ? (
          <p className="form-error-summary" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </p>
        ) : null}
        {!event ? (
          <div className="attendee-loading">
            <p>{error ? 'Check your link or try again when connected.' : 'Opening your event…'}</p>
            <button className="text-link" onClick={() => void load()}>
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        ) : tracking ? (
          view ? (
            <>
              <section className="attendee-request surface-panel">
                <span className={'task-view-status ' + view.request.status} role="status">
                  {statusLabels[view.request.status]}
                </span>
                <h2>{view.request.title}</h2>
                <p className="attendee-location">
                  <MapPin size={15} />
                  <span>{view.request.location}</span>
                </p>
                {view.request.resolution ? (
                  <div className="task-note">
                    <h3>From the event team</h3>
                    <p>{view.request.resolution}</p>
                  </div>
                ) : (
                  <p className="entry-intro">
                    The event team has your request. This page checks for updates while it is open.
                  </p>
                )}
                <button className="text-link" onClick={() => void load()}>
                  <RefreshCw size={16} />
                  Check for updates
                </button>
                <details className="task-history">
                  <summary>Request history</summary>
                  <ol className="attendee-history">
                    {view.updates.map((update, i) => (
                      <li key={i}>
                        <span>{statusLabels[update.status]}</span>
                        <time dateTime={update.createdAt}>
                          {new Date(update.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                </details>
              </section>
              <section className="attendee-tracking">
                <h2>Keep your private tracking link</h2>
                <p>
                  No account is needed. Save this link to reopen your request. Anyone with it can
                  see the request and its updates.
                </p>
                <label htmlFor="tracking-link">Private tracking link</label>
                <textarea
                  id="tracking-link"
                  readOnly
                  value={trackingUrl(secret)}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(trackingUrl(secret));
                      setCopied(true);
                    } catch {
                      setError('Select and copy your private link from the field above.');
                    }
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                  {copied ? 'Copied' : 'Copy tracking link'}
                </button>
              </section>
            </>
          ) : (
            <p className="entry-intro">Opening your request…</p>
          )
        ) : (
          <>
            <p className="entry-intro">
              Ask the event team for help. You don’t need to sign up or remember a password.
            </p>
            {pending ? (
              <section className="surface-panel attendee-pending" role="status">
                <h2>{busy ? 'Sending your request…' : 'Waiting for confirmation'}</h2>
                <p>{pending.input.title}</p>
                <p>
                  Your request is saved on this device. Keep this page or reopen the same event link
                  to retry safely.
                </p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void sendRef.current(pending)}
                >
                  {busy ? 'Sending…' : 'Retry this request'}
                  <RefreshCw size={16} />
                </button>
                <button
                  className="text-link"
                  onClick={() => onNavigate('/request#key=' + pending.input.receiptKey)}
                >
                  Check whether it was received
                </button>
              </section>
            ) : (
              <form className="surface-panel attendee-form" onSubmit={submit}>
                <label htmlFor="guest-title">
                  What do you need?
                  <input
                    id="guest-title"
                    name="title"
                    required
                    minLength={3}
                    maxLength={140}
                    placeholder="e.g. Help finding the accessible entrance"
                  />
                </label>
                <label htmlFor="guest-location">
                  Where are you?
                  <input
                    id="guest-location"
                    name="location"
                    required
                    maxLength={120}
                    placeholder="e.g. North gate"
                  />
                </label>
                <label htmlFor="guest-priority">
                  How soon is help needed?
                  <select id="guest-priority" name="priority">
                    <option value="normal">When someone is free</option>
                    <option value="high">Soon</option>
                    <option value="urgent">Right now</option>
                  </select>
                </label>
                <details className="optional-fields">
                  <summary>Add your name or more detail (optional)</summary>
                  <label htmlFor="guest-name">
                    Your name
                    <input
                      id="guest-name"
                      name="name"
                      autoComplete="given-name"
                      minLength={2}
                      maxLength={80}
                    />
                  </label>
                  <label htmlFor="guest-description">
                    Anything else the team should know?
                    <textarea id="guest-description" name="description" rows={3} maxLength={2000} />
                  </label>
                </details>
                <p className="field-hint">
                  Your request goes to event staff. You’ll receive a private tracking link.
                </p>
                <button className="button primary full-width" type="submit">
                  Send request
                  <ArrowRight size={17} />
                </button>
              </form>
            )}
          </>
        )}
      </main>
      <footer className="entry-footer">
        <span>VenueRelay · Your event team, within reach.</span>
      </footer>
    </div>
  );
}

export function AttendeeAccess({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const [links, setLinks] = useState<
    { id: string; created_at: string; revoked_at: string | null }[]
  >([]);
  const [shared, setShared] = useState<{ id: string; url: string } | null>(null);
  const sharedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (shared) sharedHeading.current?.focus();
  }, [shared]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const persona = data.event.is_demo ? data.me.role : 'self';
  const base = '/events/' + data.event.id + '/attendee-links';
  const load = async () => {
    try {
      setLinks((await request(base, {}, persona)).items);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [data.event.id]);
  return (
    <Modal title="Attendee access" onClose={onClose}>
      <div className="attendee-access">
        <p>
          Share an event QR or link so attendees can ask for help without an account. Staff still
          join through personal invitations.
        </p>
        {shared ? (
          <section className="attendee-share-result">
            <h3 tabIndex={-1} ref={sharedHeading}>
              Attendee link ready
            </h3>
            <QrCode value={shared.url} />
            <label htmlFor="attendee-link">Attendee help link</label>
            <textarea
              id="attendee-link"
              readOnly
              value={shared.url}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              className="button secondary full-width"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shared.url);
                  setCopied(true);
                } catch {
                  setError('Select and copy the link from the field above.');
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
              {copied ? 'Copied' : 'Copy attendee link'}
            </button>
          </section>
        ) : null}
        <button
          className="button primary full-width"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const result = await request(base, { method: 'POST', body: '{}' }, persona);
              setShared({
                id: result.id,
                url: location.origin + '/attend/' + data.event.id + '#key=' + result.token,
              });
              setCopied(false);
              await load();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? 'Creating…'
            : shared
              ? 'Create another attendee link'
              : 'Create attendee QR & link'}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="field-hint">
          Disabling a link stops new requests. Existing private tracking links keep working. Each
          link is shown once; save it before closing.
        </p>
        {links.length ? (
          <section className="attendee-link-list" aria-label="Attendee links">
            {links.map((link, i) => (
              <div key={link.id}>
                <span>
                  <strong>Attendee link {links.length - i}</strong>
                  <small>
                    {new Date(link.created_at).toLocaleString()} ·{' '}
                    {link.revoked_at ? 'Disabled' : 'Active'}
                  </small>
                </span>
                {!link.revoked_at ? (
                  <button
                    className="text-link"
                    onClick={async () => {
                      try {
                        await request(base + '/' + link.id, { method: 'DELETE' }, persona);
                        if (shared?.id === link.id) setShared(null);
                        await load();
                      } catch (error) {
                        setError((error as Error).message);
                      }
                    }}
                  >
                    Disable link
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
