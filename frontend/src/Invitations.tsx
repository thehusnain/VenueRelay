import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clipboard, RefreshCw, Share2, ShieldCheck } from 'lucide-react';
import type { Invitation, InvitationPage, Snapshot } from '../../shared/contracts';
import { Modal } from './components';
import { QrCode } from './qr';
import { copyText } from './clipboard';
import { request, RequestError } from './use-rally';

export function InvitationDialog({
  data,
  invitation,
  savedLink,
  onClose,
  onChanged,
  onCreated,
  onPending,
}: {
  data: Snapshot;
  invitation?: Invitation;
  savedLink?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreated: (id: string, link: string) => void;
  onPending: () => void;
}) {
  const [link, setLink] = useState(savedLink ?? ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [duplicate, setDuplicate] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null),
    result = useRef<HTMLHeadingElement>(null);
  const persona = data.event.is_demo ? data.me.role : 'self';
  useEffect(() => {
    if (!link) return;
    result.current?.focus({ preventScroll: true });
    result.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [link]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setDuplicate(false);
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const response = await request(
        `/events/${data.event.id}/invitations${invitation ? '/' + invitation.id + '/renew' : ''}`,
        { method: 'POST', body: JSON.stringify(payload) },
        persona,
      );
      const next = `${location.origin}/?invite=${encodeURIComponent(response.token)}`;
      setLink(next);
      setCopied(false);
      onCreated(response.id, next);
      void onChanged();
    } catch (error) {
      setError((error as Error).message);
      setDuplicate(
        error instanceof RequestError &&
          ['ALREADY_INVITED', 'ALREADY_MEMBER', 'INVITATION_USED'].includes(error.code),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        link
          ? 'Share this invitation'
          : invitation
            ? 'Replace invitation link'
            : 'Invite a teammate'
      }
      onClose={onClose}
    >
      {link ? (
        <div className="invitation-result">
          <h3 ref={result} tabIndex={-1}>
            <Check size={18} /> Your invitation is ready
          </h3>
          <p>
            Send this personal link to your teammate. They sign in or create a staff account to
            join. It works once and expires in 48 hours.
          </p>
          <label>
            Invitation link
            <textarea
              ref={field}
              className="invitation-link"
              aria-label="Invitation link"
              rows={3}
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="invitation-share-actions">
            <button
              className="button primary"
              onClick={async () => {
                setError('');
                if (field.current && (await copyText(link, field.current))) setCopied(true);
                else
                  setError(
                    'Your browser blocked copying. The link is selected; use Copy or share the QR below.',
                  );
              }}
            >
              <Clipboard size={17} />
              {copied ? 'Copied' : 'Copy invitation'}
            </button>
            {typeof navigator.share === 'function' ? (
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.share({ title: `Join ${data.event.name}`, url: link });
                  } catch (error) {
                    if ((error as Error).name !== 'AbortError')
                      setError('Sharing could not open. Use Copy invitation or the QR code.');
                  }
                }}
              >
                <Share2 size={17} /> Share
              </button>
            ) : null}
          </div>
          <span className="copy-status" role="status">
            {copied ? 'Invitation link copied.' : ''}
          </span>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <details className="invitation-qr">
            <summary>Show invitation QR code</summary>
            <QrCode value={link} />
          </details>
          <div className="invitation-footer">
            <button className="text-link" onClick={onPending}>
              View pending invitations
            </button>
            <button className="button secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          {invitation ? (
            <>
              <p className="form-intro">
                Create a new link for <strong>{invitation.name}</strong> ({invitation.role}). The
                previous link will stop working. Their invitation stays in your pending list.
              </p>
            </>
          ) : (
            <>
              <p className="form-intro">
                Choose a name and role, then share their personal link. Attendees use the event QR
                instead.
              </p>
              <label>
                Person’s name
                <input name="name" required minLength={2} maxLength={100} autoComplete="off" />
              </label>
              <label>
                Role
                <select name="role" aria-label="Role">
                  <option value="volunteer">Volunteer</option>
                  <option value="vendor">Vendor</option>
                </select>
              </label>
            </>
          )}
          <div className="form-note">
            <ShieldCheck size={17} />
            <span>Each invitation is single-use and lasts 48 hours.</span>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {duplicate ? (
            <button type="button" className="text-link" onClick={onPending}>
              View your team & invitations
              <ArrowRight size={16} />
            </button>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? 'Creating…' : invitation ? 'Create replacement link' : 'Create invitation'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const expiry = (value: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export function InvitationPanel({
  data,
  savedLinks,
  onShare,
  onChanged,
}: {
  data: Snapshot;
  savedLinks: Record<string, string>;
  onShare: (invitation: Invitation) => void;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState<InvitationPage | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const persona = data.event.is_demo ? data.me.role : 'self';
  const generation = useRef(0);
  const load = useCallback(
    async (offset = 0) => {
      const run = ++generation.current;
      try {
        const next = await request<InvitationPage>(
          `/events/${data.event.id}/invitations?offset=${offset}&limit=50`,
          {},
          persona,
        );
        if (run !== generation.current) return;
        setPage((previous) => ({
          ...next,
          items: offset && previous ? [...previous.items, ...next.items] : next.items,
        }));
        setError('');
      } catch (error) {
        if (run === generation.current) setError((error as Error).message);
      }
    },
    [data.event.id, persona],
  );
  useEffect(() => {
    void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const interval = setInterval(refreshWhenVisible, 60000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      generation.current++;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load, data.activityCursor]);
  const row = (invitation: Invitation) => (
    <article className="invitation-row" key={invitation.id}>
      <div className="invitation-person">
        <h3>{invitation.name}</h3>
        <p>
          <span className="invitation-role">{invitation.role}</span> ·{' '}
          {invitation.status === 'pending'
            ? `Expires ${expiry(invitation.expiresAt)}`
            : invitation.status === 'accepted'
              ? 'Joined your team'
              : invitation.status === 'cancelled'
                ? 'Invitation cancelled'
                : `Expired ${expiry(invitation.expiresAt)}`}
        </p>
      </div>
      <div className="invitation-row-actions">
        <span className={`invitation-status ${invitation.status}`}>
          {invitation.status === 'accepted'
            ? 'Joined'
            : invitation.status === 'pending'
              ? 'Pending'
              : invitation.status === 'expired'
                ? 'Expired'
                : 'Cancelled'}
        </span>
        {['pending', 'expired'].includes(invitation.status) ? (
          <button className="text-link" onClick={() => onShare(invitation)}>
            {invitation.status === 'pending' && savedLinks[invitation.id]
              ? 'Share invitation'
              : 'Replace link'}
          </button>
        ) : null}
        {invitation.status === 'pending' ? (
          <button
            className="text-link cancel-invitation"
            disabled={!!busy}
            onClick={async () => {
              setBusy(invitation.id);
              setError('');
              try {
                await request(
                  `/events/${data.event.id}/invitations/${invitation.id}`,
                  { method: 'DELETE' },
                  persona,
                );
                await load();
                void onChanged();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy('');
              }
            }}
          >
            {busy === invitation.id ? 'Cancelling…' : 'Cancel invitation'}
          </button>
        ) : null}
      </div>
    </article>
  );
  const pending = page?.items.filter((invitation) => invitation.status === 'pending') ?? [],
    history = page?.items.filter((invitation) => invitation.status !== 'pending') ?? [];
  return (
    <section className="invitation-panel" aria-labelledby="pending-invitations">
      <div className="panel-heading">
        <h2 id="pending-invitations">
          Pending invitations{page ? <span className="count-tag">{page.pendingCount}</span> : null}
        </h2>
        <button
          className="icon-button"
          aria-label="Refresh invitations"
          onClick={() => void load()}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {!page && !error ? <p role="status">Loading invitations…</p> : null}
      {error ? (
        <div className="form-error" role="alert">
          <p>{error}</p>
          <button className="text-link" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}
      {page ? (
        <>
          {!pending.length && page.pendingCount === 0 ? (
            <p className="invitation-empty">
              No one is waiting to join. New staff invitations will appear here until they’re
              accepted.
            </p>
          ) : null}
          {pending.map(row)}
          {history.length ? (
            <details className="invitation-history">
              <summary>Previous invitations ({history.length})</summary>
              {history.map(row)}
            </details>
          ) : null}
          {page.nextOffset !== null ? (
            <button className="text-link" onClick={() => void load(page.nextOffset!)}>
              Load more invitations
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
