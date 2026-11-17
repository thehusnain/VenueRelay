import { useState } from 'react';
import { Archive, ArrowRight } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { Modal, eventDate } from './components';
import { request } from './use-rally';

export function MyEvents({
  data,
  pending,
  onClose,
  onOpen,
  onChanged,
}: {
  data: Snapshot;
  pending: boolean;
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = data.event;
  const canManage = current.owner_id === data.user.id && data.me.role === 'organiser';
  const change = async () => {
    setBusy(true);
    setError('');
    try {
      await request(
        `/events/${current.id}/lifecycle`,
        {
          method: 'POST',
          body: JSON.stringify({ ended: !current.ended_at }),
        },
        current.is_demo ? data.me.role : 'self',
      );
      await onChanged();
      setConfirm(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="My events & history" onClose={onClose}>
      {confirm ? (
        <section className="event-end-confirm">
          <h3>End {current.name}?</h3>
          <p>
            Tasks, team members, the event plan and activity history stay in your account. The event
            becomes read-only and its invitation and attendee links stop accepting new joins or
            requests.
          </p>
          <p>
            {data.tasks.filter((task) => task.status !== 'closed').length} tasks are not marked
            finished. Ending the event preserves their current status; it does not complete them.
          </p>
          <p>
            You can reopen this event here. Existing, unexpired links will work again unless you
            disable or replace them.
          </p>
          <div className="modal-actions">
            <button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>
              Keep event active
            </button>
            <button
              className="button primary"
              disabled={busy || pending}
              onClick={() => void change()}
            >
              {busy ? 'Ending…' : 'End event & keep history'}
            </button>
          </div>
        </section>
      ) : (
        <>
          <p className="form-intro">
            Active and ended events stay connected to your account. Open an event to view its
            details, team and history.
          </p>
          <div className="account-event-list">
            {data.events.map((event) => (
              <article className="account-event" key={event.id}>
                <div>
                  <h3>{event.name}</h3>
                  <p>
                    {eventDate(event.date)} · {event.venue}
                  </p>
                  <span className="event-lifecycle-label">
                    {event.ended_at ? 'Ended · read-only' : 'Active'}
                    {event.is_demo ? ' · Sample event' : ''}
                  </span>
                </div>
                {event.id === current.id ? (
                  <span className="current-event">Viewing</span>
                ) : (
                  <button
                    className="button secondary"
                    disabled={busy || pending}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onOpen(event.id);
                        onClose();
                      } catch (error) {
                        setError((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Open <ArrowRight size={16} />
                  </button>
                )}
              </article>
            ))}
          </div>
          {canManage ? (
            <div className="event-lifecycle-actions">
              <button
                className="button secondary"
                disabled={busy || pending}
                onClick={() => (current.ended_at ? void change() : setConfirm(true))}
              >
                <Archive size={17} />
                {busy ? 'Saving…' : current.ended_at ? 'Reopen this event' : 'End this event'}
              </button>
              <p>
                {pending
                  ? 'Sync or review your waiting changes before ending or switching events.'
                  : 'Your event records are kept when an event ends.'}
              </p>
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
