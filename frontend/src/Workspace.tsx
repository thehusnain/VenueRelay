import { sessionPreference } from './session-preferences';
import { useState } from 'react';
import { ArrowDownRight, ArrowRight, Check, ChevronDown, MapPin, Plus, Search } from 'lucide-react';
import type { Snapshot, Task, Pending } from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
import { Empty, eventDate, time } from './components';
function PendingTasks({ items, search = '' }: { items: Pending[]; search?: string }) {
  const requests = items.filter(
    (item) =>
      item.action === 'task.create' &&
      String(item.payload.title ?? '')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (!requests.length) return null;
  return (
    <section className="pending-task-list" aria-label="Requests waiting to save">
      {requests.map((item) => (
        <article className="pending-task" key={item.key}>
          <span className="pending-task-status">
            {item.conflict ? 'Needs review' : 'Waiting for confirmation'}
          </span>
          <h2>{String(item.payload.title ?? 'Your request')}</h2>
          <p>
            <MapPin size={15} />
            <span>{String(item.payload.location ?? '')}</span>
          </p>
          <p role="status">
            {item.conflict
              ? item.conflict
              : 'Saved on this device. It will appear in the event once the team receives it.'}
          </p>
        </article>
      ))}
    </section>
  );
}
export function taskSentence(task: Task, data: Snapshot) {
  if (data.event.ended_at) return 'Event ended. This task is saved in its history.';
  const owner = data.members.find((m) => m.id === task.owner_id)?.name ?? 'Your teammate';
  switch (task.status) {
    case 'open':
      return data.me.role === 'organiser'
        ? 'Choose someone to take care of this.'
        : 'The organiser is finding someone to help.';
    case 'assigned':
      return `${owner} will take care of this.`;
    case 'in_progress':
      return `${owner} is working on this.`;
    case 'blocked':
      return `${owner} needs help to continue.`;
    case 'resolved':
      return data.me.role === 'organiser'
        ? `${owner} has submitted the result for your check.`
        : 'The organiser will check the result.';
    case 'closed':
      return 'Checked and finished by the organiser.';
  }
}
function TaskItem({
  task,
  data,
  onOpen,
  pending,
}: {
  task: Task;
  data: Snapshot;
  onOpen: () => void;
  pending: boolean;
}) {
  const urgent = task.priority === 'urgent' && !['closed', 'resolved'].includes(task.status);
  const action =
    data.me.role === 'organiser'
      ? (
          { open: 'Choose owner', blocked: 'Help teammate', resolved: 'Check result' } as Partial<
            Record<Task['status'], string>
          >
        )[task.status]
      : task.owner_id === data.me.id && task.status === 'assigned'
        ? 'Start task'
        : undefined;
  return (
    <button
      className={`plain-task ${urgent ? 'is-urgent' : ''}`}
      onClick={onOpen}
      aria-label={`Open task: ${task.title}`}
    >
      <span className="plain-task-content">
        <span className={`plain-task-state ${task.status}`}>
          <span className={`task-state-mark ${task.status}`} aria-hidden="true" />
          {statusLabels[task.status]}
        </span>
        <span className="plain-task-title">
          {task.title}
          {urgent ? <span className="urgent-word">Urgent</span> : null}
        </span>
        <span className="plain-task-explanation">
          {pending ? 'Your change is waiting to be saved.' : taskSentence(task, data)}
        </span>
        <span className="plain-task-place">
          <MapPin size={13} />
          {task.location}
          {task.due_at ? <span> · Due {time(task.due_at)}</span> : null}
        </span>
      </span>
      <span className="plain-task-action">
        {action ? <span>{action}</span> : null}
        <ArrowRight size={19} className="plain-task-arrow" />
      </span>
    </button>
  );
}
export function Home({
  data,
  pending,
  onTask,
  onCreate,
  onTasks,
  onSchedule,
  onInvite,
}: {
  data: Snapshot;
  pending: Pending[];
  onTask: (id: string) => void;
  onCreate: () => void;
  onTasks: () => void;
  onSchedule: () => void;
  onInvite: () => void;
}) {
  const org = data.me.role === 'organiser',
    attendee = data.me.role === 'attendee';
  const [focus, setFocus] = useState('all');
  const guideKey = `rally:demo-guide:${data.event.id}:${data.me.role}`;
  const [guideDetails, setGuideDetails] = useState(false);
  const [compactGuideOpen, setCompactGuideOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(() => sessionPreference.get(guideKey) !== 'hidden');
  const gettingStarted = org && !data.event.ended_at && !data.event.is_demo && !data.tasks.length;
  const important = data.tasks.filter((t) =>
    org
      ? ['open', 'blocked', 'resolved'].includes(t.status)
      : attendee
        ? t.reporter_id === data.me.id && t.status !== 'closed'
        : t.owner_id === data.me.id && !['closed', 'resolved'].includes(t.status),
  );
  const priority = { urgent: 0, high: 1, normal: 2 };
  important.sort((a, b) => priority[a.priority] - priority[b.priority]);
  const finished = data.tasks.filter((task) => task.status === 'closed').length;
  const nextSession = data.schedule.find((s) => Date.parse(s.ends_at) > Date.now());
  const planItems = data.schedule.filter((s) => Date.parse(s.ends_at) > Date.now()).slice(0, 3);
  const focusOptions = [
    { id: 'all', label: 'All next steps', count: important.length },
    {
      id: 'open',
      label: 'Choose owner',
      count: important.filter((t) => t.status === 'open').length,
    },
    {
      id: 'blocked',
      label: 'Needs help',
      count: important.filter((t) => t.status === 'blocked').length,
    },
    {
      id: 'resolved',
      label: 'Check result',
      count: important.filter((t) => t.status === 'resolved').length,
    },
  ];
  const visible = important.filter((t) => !org || focus === 'all' || t.status === focus);
  const firstDemoTask = data.tasks.find((t) =>
    org
      ? t.status === 'open'
      : t.owner_id === data.me.id && ['assigned', 'in_progress', 'blocked'].includes(t.status),
  );
  return (
    <div className="home-content">
      <section className="event-cover">
        <div className="event-cover-main">
          <h1>{data.event.name}</h1>
          <div className="cover-meta">
            <span>{org ? 'Organiser' : attendee ? 'Attendee' : data.me.role} workspace</span>
            <span>{eventDate(data.event.date)}</span>
            <span>
              <MapPin size={14} />
              {data.event.venue}
            </span>
          </div>
        </div>
        {data.tasks.length ? (
          <button
            className="event-progress"
            onClick={onTasks}
            aria-label={`View tasks: ${finished} of ${data.tasks.length} checked and finished`}
          >
            <span className="event-progress-label">
              <Check size={16} /> {finished} of {data.tasks.length} tasks finished{' '}
              <ArrowRight size={16} />
            </span>
            <span className="event-progress-track" aria-hidden="true">
              <span style={{ width: `${(finished / data.tasks.length) * 100}%` }} />
            </span>
          </button>
        ) : null}
      </section>
      <PendingTasks items={pending} />
      <div className="home-workspace">
        <section className="next-actions">
          <div className="section-heading">
            <div>
              <h2>
                {org ? 'Needs your attention' : attendee ? 'Your help requests' : 'Your next tasks'}
              </h2>
            </div>
            {!gettingStarted ? (
              <button
                className="button primary"
                onClick={onCreate}
                disabled={!!data.event.ended_at}
              >
                <Plus size={18} />
                {org ? 'Add a task' : 'Ask for help'}
              </button>
            ) : null}
          </div>
          {gettingStarted ? (
            <ol className="start-checklist" aria-label="Set up your event team">
              <li>
                <span className="checklist-step">
                  <Check size={18} />
                </span>
                <div>
                  <h3>Event created</h3>
                  <p>{data.event.name}. Your workspace is ready.</p>
                </div>
              </li>
              <li>
                <span className="checklist-step">
                  {data.members.length > 1 ? <Check size={18} /> : '2'}
                </span>
                <div>
                  <h3>{data.members.length > 1 ? 'Your team is connected' : 'Invite your team'}</h3>
                  <p>
                    Choose each person’s role. Share their invitation link or QR code; they join
                    using their own account.
                  </p>
                  <button
                    className="button primary"
                    onClick={onInvite}
                    disabled={!!data.event.ended_at}
                  >
                    Invite a teammate
                  </button>
                </div>
              </li>
              <li>
                <span className="checklist-step">3</span>
                <div>
                  <h3>Add the first task</h3>
                  <p>Say what needs doing and where. Assign it once your teammate has joined.</p>
                  <button
                    className="button secondary"
                    onClick={onCreate}
                    disabled={!!data.event.ended_at}
                  >
                    Add your first task
                  </button>
                </div>
              </li>
            </ol>
          ) : null}
          {org && important.length ? (
            <div className="attention-filters" role="group" aria-label="Next step to handle">
              <label className="attention-select">
                Show
                <select
                  aria-label="Filter next steps"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                >
                  {focusOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </select>
              </label>
              {focusOptions.map((option) => (
                <button
                  key={option.id}
                  aria-pressed={focus === option.id}
                  onClick={() => setFocus(option.id)}
                >
                  {option.label}
                  <span>{option.count}</span>
                </button>
              ))}
            </div>
          ) : null}
          {gettingStarted ? null : visible.length ? (
            <div className="plain-task-list">
              {visible.slice(0, 3).map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  data={data}
                  pending={pending.some((p) => p.taskId === t.id)}
                  onOpen={() => onTask(t.id)}
                />
              ))}
            </div>
          ) : important.length ? (
            <div className="friendly-empty">
              <h3>No tasks need this step.</h3>
              <button className="text-link" onClick={() => setFocus('all')}>
                Show all next steps
              </button>
            </div>
          ) : (
            <div className="friendly-empty">
              <Check size={28} />
              <h3>
                {data.tasks.length
                  ? 'Nothing needs your attention.'
                  : org
                    ? 'Start with the first task.'
                    : attendee
                      ? 'Contact your event team.'
                      : 'No assignments yet.'}
              </h3>
              <p>
                {data.tasks.length
                  ? 'You can review the rest of your tasks at any time.'
                  : org
                    ? 'Add the work that needs doing, then assign it to your team.'
                    : attendee
                      ? 'Send a request with a location so the team can help.'
                      : 'Your organiser’s assignments will appear here.'}
              </p>
              {!data.tasks.length && org ? (
                <button
                  className="button primary"
                  onClick={onCreate}
                  disabled={!!data.event.ended_at}
                >
                  Add your first task
                  <ArrowRight size={18} />
                </button>
              ) : null}
              {!data.tasks.length && org ? (
                <button className="text-link" onClick={onInvite} disabled={!!data.event.ended_at}>
                  Invite someone to your team
                </button>
              ) : null}
            </div>
          )}
          {data.tasks.length ? (
            <button className="all-tasks-link" onClick={onTasks}>
              <span>See all {attendee ? 'requests' : 'tasks'}</span>
              <ArrowRight size={19} />
            </button>
          ) : null}
        </section>
        <aside className="event-side-column">
          {data.event.is_demo ? (
            showGuide ? (
              <section
                className={`demo-context ${compactGuideOpen ? 'is-expanded' : ''}`}
                aria-label="About this demo"
              >
                <button
                  className="demo-mobile-summary"
                  aria-expanded={compactGuideOpen}
                  aria-controls="demo-guide-body"
                  onClick={() => setCompactGuideOpen(!compactGuideOpen)}
                >
                  How this demo works
                  <ChevronDown size={17} />
                </button>
                <div className="demo-guide-body" id="demo-guide-body">
                  <div className="demo-guide-heading">
                    <h2>Demo guide</h2>
                    <button
                      className="text-link"
                      onClick={() => {
                        sessionPreference.set(guideKey, 'hidden');
                        setShowGuide(false);
                      }}
                    >
                      Hide guide
                    </button>
                  </div>
                  <p>
                    {org
                      ? 'You’re the organiser. Start by assigning one task.'
                      : attendee
                        ? 'Ask for help, then follow the team’s updates.'
                        : 'Open your task and update the organiser as you work.'}
                  </p>
                  <div className="demo-guide-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        sessionPreference.set(guideKey, 'hidden');
                        setShowGuide(false);
                        if (attendee) onCreate();
                        else if (firstDemoTask) onTask(firstDemoTask.id);
                        else onTasks();
                      }}
                    >
                      {attendee
                        ? 'Try asking for help'
                        : firstDemoTask
                          ? org
                            ? 'Try assigning a task'
                            : 'Open your first task'
                          : 'View event tasks'}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-link"
                      aria-expanded={guideDetails}
                      aria-controls="demo-event-explanation"
                      onClick={() => setGuideDetails(!guideDetails)}
                    >
                      How it works
                    </button>
                  </div>
                  <p id="demo-event-explanation" hidden={!guideDetails}>
                    This sample festival has a stage, stalls and visitors. The people and tasks are
                    examples. An attendee asks for help, the organiser assigns it, a teammate does
                    the work, and the organiser checks the result. Use Switch role to try each
                    person’s view.
                  </p>
                </div>
              </section>
            ) : (
              <button className="demo-guide-toggle text-link" onClick={() => setShowGuide(true)}>
                How this demo works
              </button>
            )
          ) : null}

          <section className="plan-preview">
            <div className="section-heading">
              <h2>On the programme</h2>
              <ArrowDownRight size={24} aria-hidden="true" />
            </div>
            {nextSession ? (
              <div className="programme-preview">
                {planItems.map((s) => (
                  <div className="next-session" key={s.id}>
                    <time dateTime={s.starts_at}>{time(s.starts_at)}</time>
                    <div>
                      <strong>{s.title}</strong>
                      <span>{s.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                {data.schedule.length
                  ? 'The programme is complete. Review the full event plan.'
                  : org
                    ? 'Add activities, times and locations to share the plan.'
                    : 'The organiser will publish the event programme here.'}
              </p>
            )}
            <button className="text-link" onClick={onSchedule}>
              View the plan
              <ArrowRight size={16} />
            </button>
          </section>
          {data.announcements[0] ? (
            <section className="team-message">
              <span>From your organiser</span>
              <p>{data.announcements[0].message}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
export function TaskWorkspace({
  data,
  pending,
  onTask,
  onCreate,
  search,
  setSearch,
}: {
  data: Snapshot;
  pending: Pending[];
  onTask: (id: string) => void;
  onCreate: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const filterKey = `rally:task-filter:${data.event.id}:${data.me.id}`;
  const [finished, setFinished] = useState(() => sessionPreference.get(filterKey) === 'finished');
  const chooseFilter = (value: boolean) => {
    setFinished(value);
    sessionPreference.set(filterKey, value ? 'finished' : 'todo');
  };
  const attendee = data.me.role === 'attendee';
  const tasks = data.tasks.filter(
    (t) =>
      (finished ? t.status === 'closed' : t.status !== 'closed') &&
      `${t.title} ${t.location}`.toLowerCase().includes(search.toLowerCase()),
  );
  const order = { urgent: 0, high: 1, normal: 2 };
  tasks.sort((a, b) => order[a.priority] - order[b.priority]);
  const finishedCount = data.tasks.filter((t) => t.status === 'closed').length;
  return (
    <section className="tasks-page">
      <div className="task-page-cover">
        <div>
          <span className="section-reference">{data.event.name}</span>
          <h1>{attendee ? 'Your help requests' : 'Tasks'}</h1>
          <p>
            {attendee
              ? 'Follow your requests, from first report to final update.'
              : 'Open a task to assign it, update progress or check the result.'}
          </p>
        </div>
        <button className="button primary" onClick={onCreate} disabled={!!data.event.ended_at}>
          <Plus size={19} />
          {data.me.role === 'organiser' ? 'Add a task' : 'Ask for help'}
        </button>
      </div>
      <div className="simple-task-controls">
        <div className="simple-tabs" role="group" aria-label="Which tasks to show">
          <button
            aria-label={attendee ? 'Waiting for help' : 'To do'}
            aria-pressed={!finished}
            className={!finished ? 'selected' : ''}
            onClick={() => chooseFilter(false)}
          >
            {attendee ? 'Waiting for help' : 'To do'}
            <span>{data.tasks.length - finishedCount}</span>
          </button>
          <button
            aria-label="Finished"
            aria-pressed={finished}
            className={finished ? 'selected' : ''}
            onClick={() => chooseFilter(true)}
          >
            Finished<span>{finishedCount}</span>
          </button>
        </div>
        <label className="simple-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Find a task"
            placeholder="Find a task…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {search ? (
        <p className="search-results" role="status">
          {tasks.length} {tasks.length === 1 ? 'result' : 'results'} for “{search}”{' '}
          <button className="text-link" onClick={() => setSearch('')}>
            Clear search
          </button>
        </p>
      ) : null}
      {!finished ? <PendingTasks items={pending} search={search} /> : null}
      {tasks.length ? (
        <div className="plain-task-list">
          {tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              data={data}
              pending={pending.some((p) => p.taskId === t.id)}
              onOpen={() => onTask(t.id)}
            />
          ))}
        </div>
      ) : !finished && pending.some((item) => item.action === 'task.create') && !search ? (
        <p className="pending-task-hint">
          Your saved request is shown above. You can open it when it has been confirmed.
        </p>
      ) : (
        <Empty
          title={
            search
              ? 'No matching tasks'
              : finished
                ? 'No finished tasks yet'
                : 'Nothing waiting here'
          }
        >
          {search
            ? 'Try a different word.'
            : 'Tasks will appear here as your event team gets started.'}
        </Empty>
      )}
    </section>
  );
}
