import { QrCode } from './qr';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clipboard, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { Modal } from './components';
import { request, API } from './use-rally';
export type Mutate = (
  action: string,
  payload: Record<string, unknown>,
  taskId?: string,
  expectedVersion?: number,
) => Promise<boolean>;
const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
};
export function SimpleForm({
  kind,
  data,
  onClose,
  onDone,
  mutate,
}: {
  kind: 'event' | 'invite' | 'announcement' | 'schedule';
  data: Snapshot;
  onClose: () => void;
  onDone: (eventId?: string) => void;
  mutate: Mutate;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(''),
    [copied, setCopied] = useState(false);
  const title = {
    event: 'Make room for a great event',
    invite: 'Invite someone to your team',
    announcement: 'Send an update to your team',
    schedule: 'Add an activity to the event plan',
  }[kind];
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const p = values(e);
    setError('');
    setBusy(true);
    try {
      if (kind === 'announcement') {
        if (await mutate('announcement.create', { message: p.message })) onClose();
      }
      if (kind === 'schedule') {
        if (
          !Number.isFinite(Date.parse(p.startsAt)) ||
          !Number.isFinite(Date.parse(p.endsAt)) ||
          Date.parse(p.endsAt) <= Date.parse(p.startsAt)
        ) {
          setError('Choose an end time after the start time.');
          return;
        }
        if (
          await mutate('schedule.create', {
            ...p,
            startsAt: new Date(p.startsAt).toISOString(),
            endsAt: new Date(p.endsAt).toISOString(),
          })
        )
          onClose();
      }
      if (kind === 'event') {
        const r = await request('/events', { method: 'POST', body: JSON.stringify(p) });
        onDone(r.eventId);
        onClose();
      }
      if (kind === 'invite') {
        const r = await request(
          `/events/${data.event.id}/invitations`,
          { method: 'POST', body: JSON.stringify(p) },
          data.event.is_demo ? data.me.role : 'self',
        );
        setLink(`${API || location.origin}/?invite=${encodeURIComponent(r.token)}`);
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      {link ? (
        <div className="invite-result">
          <QrCode value={link} />
          <div className="success-mark">
            <Check size={24} />
          </div>
          <h3>Your invitation is ready</h3>
          <p>Send this link to your teammate. It can be used once and expires in 48 hours.</p>
          <label>
            Invitation link
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button
            className="button primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError('Select and copy the link above.');
              }
            }}
          >
            <Clipboard size={16} />
            {copied ? 'Copied' : 'Copy invitation'}
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {kind === 'event' ? (
            <>
              <p className="form-intro">Start with a clean workspace. Your demo stays separate.</p>
              <label>
                Event name
                <input name="name" required minLength={3} maxLength={100} autoFocus />
              </label>
              <label>
                Venue
                <input name="venue" required maxLength={140} />
              </label>
              <label>
                Event date
                <input name="date" type="date" required />
              </label>
            </>
          ) : null}
          {kind === 'invite' ? (
            <>
              <p className="form-intro">
                Each person gets their own account and the right level of access.
              </p>
              <label>
                Person’s name
                <input name="name" required minLength={2} maxLength={100} autoFocus />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="volunteer">Volunteer · helps with tasks</option>
                  <option value="vendor">Vendor · runs a stall or service</option>
                  <option value="attendee">Attendee · can ask for help</option>
                </select>
              </label>
              <div className="form-note">
                <ShieldCheck size={16} />
                Invitation links are single-use and expire in 48 hours.
              </div>
            </>
          ) : null}
          {kind === 'announcement' ? (
            <>
              <p className="form-intro">
                A persistent update for everyone in the event. All members receive an in-app
                notification.
              </p>
              <label>
                Announcement
                <textarea
                  name="message"
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={5}
                  autoFocus
                />
              </label>
            </>
          ) : null}
          {kind === 'schedule' ? (
            <>
              <label>
                Session title
                <input name="title" required minLength={3} maxLength={140} autoFocus />
              </label>
              <label>
                Location
                <input name="location" required maxLength={120} />
              </label>
              <div className="form-grid">
                <label>
                  Starts at
                  <input name="startsAt" type="datetime-local" required />
                </label>
                <label>
                  Ends at
                  <input name="endsAt" type="datetime-local" required />
                </label>
              </div>
            </>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy
                ? 'Saving…'
                : kind === 'invite'
                  ? 'Create invitation'
                  : kind === 'event'
                    ? 'Create event'
                    : 'Publish'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
