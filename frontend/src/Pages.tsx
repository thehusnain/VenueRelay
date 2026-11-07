import { useEffect, useState } from 'react';
import {
  Plus,
  Download,
  ShieldCheck,
  KeyRound,
  Check,
  Copy,
  RefreshCw,
  WifiOff,
  Wifi,
  AlertTriangle,
  Code2,
  MapPin,
  CalendarDays,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import type { Snapshot, Pending } from '../../shared/contracts';
import { Avatar, ActivityList, Empty, eventDate, time } from './components';
import { request, API } from './use-rally';
import { statusLabels, type Status } from '../../shared/contracts';
export function TeamPage({ data, onInvite }: { data: Snapshot; onInvite: () => void }) {
  return (
    <>
      <div className="section-intro">
        <div>
          <p>Clarity starts with knowing who owns what.</p>
        </div>
        {data.me.role === 'organiser' ? (
          <button className="button primary" onClick={onInvite}>
            <Plus size={16} />
            Invite a teammate
          </button>
        ) : null}
      </div>
      <section className="surface-panel">
        <div className="panel-heading">
          <h2>Your event team</h2>
          <span className="count-tag">{data.members.length}</span>
        </div>
        <div className="people-table">
          <div className="people-head">
            <span>Team member</span>
            <span>Access</span>
            <span>Team</span>
            <span>Active tasks</span>
          </div>
          {data.members.map((m) => (
            <div className="person-row" key={m.id}>
              <div>
                <Avatar member={m} />
                <span>
                  <strong>
                    {m.name}
                    {m.id === data.me.id ? <small> You</small> : null}
                  </strong>
                  <span>{m.role === 'attendee' ? 'Event guest' : m.team}</span>
                </span>
              </div>
              <span className={`role-badge ${m.role}`}>{m.role}</span>
              <span>{m.team}</span>
              <strong>
                {
                  data.tasks.filter(
                    (t) => t.owner_id === m.id && !['closed', 'resolved'].includes(t.status),
                  ).length
                }
              </strong>
            </div>
          ))}
        </div>
      </section>
      <details className="role-explanation">
        <summary>Who can do what?</summary>
        <section className="permissions-grid">
          {[
            [
              'organiser',
              'Organisers',
              'Assign work, publish updates, invite people, verify resolutions and export the activity log.',
            ],
            [
              'volunteer',
              'Volunteers',
              'View assigned tasks and personal requests. Start work, report blockers and submit a resolution.',
            ],
            [
              'vendor',
              'Vendors',
              'Track your own assignments and requests. Coordinate with the organiser without seeing unrelated work.',
            ],
            [
              'attendee',
              'Attendees',
              'Request help, follow your own requests and read the shared event schedule and announcements.',
            ],
          ].map(([role, title, description]) => (
            <article className="permission-panel" key={role}>
              <span className={`role-badge ${role}`}>{role}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </section>
      </details>
      <div className="inline-note">
        <ShieldCheck size={18} />
        Roles are enforced by the Node.js API for every request. The preview switch works only in
        your own demo workspace.
      </div>
    </>
  );
}
export function SchedulePage({ data, onAdd }: { data: Snapshot; onAdd: () => void }) {
  return (
    <>
      <div className="section-intro">
        <p>
          <CalendarDays size={17} />
          {eventDate(data.event.date)}
          <span className="divider-dot">·</span>All times in Pakistan Standard Time
        </p>
        {data.me.role === 'organiser' ? (
          <button className="button primary" onClick={onAdd}>
            <Plus size={16} />
            Add a session
          </button>
        ) : null}
      </div>
      <section className="schedule-day">
        <div className="day-heading">
          <span>{new Date(data.event.date + 'T12:00:00Z').getDate()}</span>
          <div>
            <strong>
              {new Intl.DateTimeFormat('en', { weekday: 'long' }).format(
                new Date(data.event.date + 'T12:00:00Z'),
              )}
            </strong>
            <p>{data.event.venue}</p>
          </div>
        </div>
        {data.schedule.length ? (
          data.schedule.map((s, i) => {
            const state =
              Date.now() > Date.parse(s.ends_at)
                ? 'Finished'
                : Date.now() >= Date.parse(s.starts_at)
                  ? 'Happening now'
                  : 'Upcoming';
            return (
              <article className="schedule-session" key={s.id}>
                <span className="session-number">{String(i + 1).padStart(2, '0')}</span>
                <div className="session-time">
                  <strong>{time(s.starts_at)}</strong>
                  <span>to {time(s.ends_at)}</span>
                </div>
                <div>
                  <h2>{s.title}</h2>
                  <p>
                    <MapPin size={14} />
                    {s.location}
                  </p>
                </div>
                <span className={`session-state ${state === 'Happening now' ? 'current' : ''}`}>
                  {state}
                </span>
              </article>
            );
          })
        ) : (
          <Empty title="A day full of possibility">
            Add the first session to share the event plan.
          </Empty>
        )}
      </section>
    </>
  );
}
export function LogPage({
  data,
  onTask,
  onExport,
}: {
  data: Snapshot;
  onTask: (id: string) => void;
  onExport: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const items = data.activity.filter((a) => filter === 'all' || a.entity_type === filter);
  return (
    <>
      <div className="section-intro">
        <p>Who did what, when, and how the record changed.</p>
        {data.me.role === 'organiser' ? (
          <button className="button secondary" onClick={onExport}>
            <Download size={16} />
            Export full record
          </button>
        ) : null}
      </div>
      <section className="surface-panel">
        <div className="panel-heading">
          <h2>Event activity</h2>
          <label className="filter-field">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter activity"
            >
              <option value="all">Everything</option>
              <option value="task">Tasks</option>
              <option value="schedule">Schedule</option>
              <option value="announcement">Announcements</option>
              <option value="invitation">Invitations</option>
              <option value="integration">Integrations</option>
            </select>
          </label>
        </div>
        <div className="log-assurance">
          <ShieldCheck size={17} />
          <span>
            Append-only history. Each operational change and its notifications are committed
            together.
          </span>
          <span className="count-tag">{items.length} entries</span>
        </div>
        {items.length ? (
          <ActivityList items={items} members={data.members} onTask={onTask} />
        ) : (
          <Empty title="No activity in this view">
            Confirmed operations appear here automatically.
          </Empty>
        )}
        {data.hasMoreActivity ? (
          <p className="table-foot">
            Showing recent entries. Export the full log or use the cursor-based activity API.
          </p>
        ) : null}
      </section>
    </>
  );
}
export function IntegrationPage({ data, notify }: { data: Snapshot; notify: (m: string) => void }) {
  const [keys, setKeys] = useState<
      { id: string; name: string; created_at: string; revoked_at: string | null }[]
    >([]),
    [secret, setSecret] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const persona = data.event.is_demo ? data.me.role : 'self';
  const load = async () => {
    try {
      setKeys((await request(`/events/${data.event.id}/api-keys`, {}, persona)).items);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [data.event.id]);
  const example = JSON.stringify(
    {
      action: 'task.create',
      payload: { title: 'Restock welcome maps', location: 'Welcome tent', priority: 'normal' },
    },
    null,
    2,
  );
  return (
    <>
      <div className="section-intro">
        <p>A documented connection to the rest of your tools.</p>
        <a
          className="button secondary"
          href={`${API}/api/openapi.json`}
          download="rally-openapi.json"
        >
          <Download size={16} />
          OpenAPI specification
        </a>
      </div>
      <div className="integration-grid">
        <section className="surface-panel">
          <div className="panel-heading">
            <h2>Integration tokens</h2>
            <KeyRound size={18} />
          </div>
          <p className="panel-description">
            Tokens inherit the issuing organiser’s event access. Store them on your server and
            revoke them when no longer needed.
          </p>
          <form
            className="token-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name'));
              setBusy(true);
              setError('');
              try {
                const result = await request(
                  `/events/${data.event.id}/api-keys`,
                  { method: 'POST', body: JSON.stringify({ name }) },
                  persona,
                );
                setSecret(result.token);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Token name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="e.g. Event registration system"
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create token'}
              <Plus size={15} />
            </button>
          </form>
          {secret ? (
            <div className="secret-box">
              <strong>Copy this token now. It is shown only once.</strong>
              <label>
                Integration token
                <textarea
                  readOnly
                  value={secret}
                  rows={2}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    notify('Token copied. Keep it on your server.');
                  } catch {
                    notify('Select and copy the token above.');
                  }
                }}
              >
                <Copy size={14} />
                Copy token
              </button>
              <button className="text-link" onClick={() => setSecret('')}>
                I’ve saved it · dismiss
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="token-list">
            {keys.map((k) => (
              <div key={k.id}>
                <KeyRound size={16} />
                <span>
                  <strong>{k.name}</strong>
                  <small>
                    {new Date(k.created_at).toLocaleDateString()} ·{' '}
                    {k.revoked_at ? 'Revoked' : 'Active'}
                  </small>
                </span>
                {!k.revoked_at ? (
                  <button
                    className="icon-button"
                    aria-label={`Revoke ${k.name}`}
                    onClick={async () => {
                      try {
                        await request(
                          `/events/${data.event.id}/api-keys/${k.id}`,
                          { method: 'DELETE' },
                          persona,
                        );
                        await load();
                        notify('Integration token revoked.');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <section className="api-guide">
          <span className="api-version">API v1</span>
          <h2>Built for the next connection.</h2>
          <p>
            Every write uses the same permission checks, retry protection and activity journal as
            the interface.
          </p>
          <dl>
            <div>
              <dt>Authentication</dt>
              <dd>Bearer token, or a signed-in session</dd>
            </div>
            <div>
              <dt>Safe retries</dt>
              <dd>Idempotency-Key header · stable per intent</dd>
            </div>
            <div>
              <dt>Conflict control</dt>
              <dd>expectedVersion · 409 on stale records</dd>
            </div>
            <div>
              <dt>Live updates</dt>
              <dd>Snapshot polling · 3 seconds in the app</dd>
            </div>
          </dl>
          <a
            href={`${API}/api/openapi.json`}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Read the complete contract
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
      <section className="code-panel">
        <div className="panel-heading">
          <h2>
            <Code2 size={17} />
            Create a task
          </h2>
          <span>POST /api/v1/events/{data.event.id}/commands</span>
        </div>
        <pre>
          <code>{`Authorization: Bearer YOUR_TOKEN\nContent-Type: application/json\nIdempotency-Key: ${'intent_' + data.event.id.slice(0, 8)}\n\n${example}`}</code>
        </pre>
      </section>
    </>
  );
}
export function ReliabilityPage({
  data,
  pending,
  simulatedOffline,
  toggleOffline,
  discard,
  rebase,
  flush,
  notify,
}: {
  data: Snapshot;
  pending: Pending[];
  simulatedOffline: boolean;
  toggleOffline: () => void;
  discard: (key: string) => void;
  rebase: (key: string) => void;
  flush: () => void;
  notify: (message: string) => void;
}) {
  const [result, setResult] = useState<{
      ok: boolean;
      commands: number;
      activity: number;
      taskVersionMismatches: number;
      missingAuditEntries: number;
      foreignKeyViolations: number;
      checkedAt: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <div className="connection-help">
      <section className="surface-panel">
        <div className="panel-heading">
          <h2>Changes waiting to be saved</h2>
          <span className="count-tag">{pending.length}</span>
        </div>
        {pending.length ? (
          pending.map((p) => {
            const task = data.tasks.find((t) => t.id === p.taskId),
              currentOwner = data.members.find((m) => m.id === task?.owner_id)?.name ?? 'No one',
              requestedOwner = data.members.find((m) => m.id === p.payload.ownerId)?.name;
            return (
              <div className="pending-item" key={p.key}>
                <span className="pending-icon">
                  {p.conflict ? <AlertTriangle size={22} /> : <RefreshCw size={22} />}
                </span>
                <div>
                  <strong>{String(p.payload.title ?? task?.title ?? 'Your event change')}</strong>
                  {p.conflict ? (
                    <>
                      <p>Someone else changed this task, or your change could not be accepted.</p>
                      <p>{p.conflict}</p>
                      {task ? (
                        <p>
                          <strong>Saved now:</strong> {currentOwner} is responsible.{' '}
                          {statusLabels[task.status]}.
                        </p>
                      ) : null}
                      <p>
                        <strong>Your change:</strong>{' '}
                        {requestedOwner
                          ? `Ask ${requestedOwner} to help.`
                          : p.payload.status
                            ? statusLabels[p.payload.status as Status]
                            : String(p.payload.title ?? 'Update the task.')}
                      </p>
                    </>
                  ) : (
                    <p>
                      This change is safe on this device. Rally will send it when the connection
                      returns.
                    </p>
                  )}
                  <details className="change-reference">
                    <summary>See change reference</summary>
                    <code>{p.key}</code>
                  </details>
                </div>
                <div className="pending-actions">
                  {p.conflict ? (
                    <>
                      {!p.taskId || task ? (
                        <button className="button secondary" onClick={() => rebase(p.key)}>
                          Use my change instead
                        </button>
                      ) : null}
                      <button className="text-link" onClick={() => discard(p.key)}>
                        Keep the saved version
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="button secondary" onClick={flush}>
                        Try saving now
                      </button>
                      <details className="change-reference">
                        <summary>More options</summary>
                        <p>Stopping retries does not undo anything already saved.</p>
                        <button className="text-link" onClick={() => discard(p.key)}>
                          Stop retrying this change
                        </button>
                      </details>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <Empty title="No changes are waiting on this device">
            Your confirmed task changes are stored in the event record.
          </Empty>
        )}
      </section>
      {data.event.is_demo ? (
        <details className="connection-test">
          <summary>Try working without a connection</summary>
          <p>
            For this sample, pause task updates, add a task, then reconnect. The task stays on your
            device until it can be saved.
          </p>
          <button
            className={`button ${simulatedOffline ? 'primary' : 'secondary'}`}
            onClick={toggleOffline}
          >
            {simulatedOffline ? <Wifi size={18} /> : <WifiOff size={18} />}{' '}
            {simulatedOffline ? 'Reconnect and save changes' : 'Pause task updates'}
          </button>
        </details>
      ) : null}
      {data.me.role === 'organiser' ? (
        <section className="record-check">
          <h2>Check the saved event record</h2>
          <p>
            This compares task changes with their history and checks for missing or conflicting
            records.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(
                  await request(
                    `/events/${data.event.id}/integrity`,
                    {},
                    data.event.is_demo ? data.me.role : 'self',
                  ),
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ShieldCheck size={18} />
            {busy ? 'Checking…' : 'Check saved records'}
          </button>
          {result ? (
            <>
              <div className={`integrity-result ${result.ok ? 'success' : 'warning'}`}>
                <Check size={23} />
                <div>
                  <strong>
                    {result.ok ? 'The saved records match.' : 'Some records need checking.'}
                  </strong>
                  <span>Checked {time(result.checkedAt)}</span>
                </div>
              </div>
              <details className="record-check-details">
                <summary>See the check details</summary>
                <dl className="integrity-counts">
                  {[
                    ['Saved changes', result.commands],
                    ['History entries', result.activity],
                    ['Incorrect task versions', result.taskVersionMismatches],
                    ['Missing history entries', result.missingAuditEntries],
                    ['Broken references', result.foreignKeyViolations],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
