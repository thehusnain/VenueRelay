import { useEffect, useState } from 'react';
import { Archive, ArrowRight } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { eventDay, eventPeriod, orderedEvents, type EventPeriod } from '../../shared/event-timing';
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
  const [filter, setFilter] = useState<EventPeriod | 'all'>('all');
  const [today, setToday] = useState(eventDay);
  useEffect(() => {
    const refreshDate = () => setToday(eventDay());
    const timer = window.setInterval(refreshDate, 60_000);
    document.addEventListener('visibilitychange', refreshDate);
    window.addEventListener('focus', refreshDate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshDate);
      window.removeEventListener('focus', refreshDate);
    };
  }, []);
  const events = orderedEvents(data.events, today);
  const visible = events.filter(
    (event) => filter === 'all' || eventPeriod(event, today) === filter,
  );
  const filters = [
    ['all', 'All'],
    ['live', 'Live'],
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ] as const;
  const descriptions = {
    all: 'Events you organise or have joined. Dates use Pakistan Standard Time.',
    live: 'Events scheduled for today that have not been ended.',
    upcoming: 'Events scheduled after today, with the nearest date first.',
    past: 'Earlier events and events you ended. Earlier events stay editable until their creator ends them.',
  };
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
            Find events you organise or have joined, and open their tasks, team and history.
          </p>
          <div className="event-filters" role="group" aria-label="Filter my events">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                aria-controls="account-event-results"
                onClick={() => setFilter(value)}
              >
                {label}
                <span>
                  {value === 'all'
                    ? events.length
                    : events.filter((event) => eventPeriod(event, today) === value).length}
                </span>
              </button>
            ))}
          </div>
          <p className="event-filter-description" role="status">
            {visible.length} {visible.length === 1 ? 'event' : 'events'}. {descriptions[filter]}
          </p>
          <div className="account-event-list" id="account-event-results">
            {visible.map((event) => (
              <article className="account-event" key={event.id}>
                <div>
                  <h3>{event.name}</h3>
                  <p>
                    {eventDate(event.date)} · {event.venue}
                  </p>
                  <span className="event-lifecycle-label">
                    {event.ended_at
                      ? 'Ended · read-only'
                      : eventPeriod(event, today) === 'live'
                        ? 'Live today'
                        : eventPeriod(event, today) === 'upcoming'
                          ? 'Upcoming'
                          : 'Past date · still open'}
                    {event.is_demo ? ' · Sample event' : ''}
                  </span>
                </div>
                {event.id === current.id ? (
                  <span className="current-event">Viewing</span>
                ) : (
                  <button
                    className="button secondary"
                    aria-label={`Open ${event.name}`}
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
                    Open <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </article>
            ))}
            {!visible.length ? (
              <div className="account-events-empty">
                <h3>{filter === 'all' ? 'No events yet' : `No ${filter} events`}</h3>
                <p>
                  {filter === 'live'
                    ? 'Nothing is scheduled for today. Check Upcoming for your next event.'
                    : filter === 'upcoming'
                      ? 'Your future events will appear here when you create or join one.'
                      : filter === 'past'
                        ? 'Earlier and ended events will stay here with their saved records.'
                        : 'Create an event or follow a team invitation to get started.'}
                </p>
                {filter !== 'all' ? (
                  <button className="text-link" onClick={() => setFilter('all')}>
                    View all events
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {canManage ? (
            <div className="event-lifecycle-actions">
              <p className="event-lifecycle-current">
                Managing: <strong>{current.name}</strong>
              </p>
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
