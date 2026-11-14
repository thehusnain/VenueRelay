import { sessionPreference } from './session-preferences';
import { useState } from 'react';
import { ArrowDownRight, ArrowRight, Check, MapPin, Plus, Search } from 'lucide-react';
import type { Snapshot, Task, Pending } from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
import { Avatar, Empty, eventDate, time } from './components';
export function taskSentence(task: Task, data: Snapshot) {
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
  const owner = data.members.find((m) => m.id === task.owner_id);
  return (
    <button
      className={`plain-task ${urgent ? 'is-urgent' : ''}`}
      onClick={onOpen}
      aria-label={`Open task: ${task.title}`}
    >
      <span className={`task-state-mark ${task.status}`} aria-hidden="true">
        {task.status === 'closed' ? <Check size={16} /> : null}
      </span>
      <span className="plain-task-content">
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
      <span className="task-row-person">
        <Avatar member={owner} size="small" />
      </span>
      <span className={`plain-task-state ${task.status}`}>{statusLabels[task.status]}</span>
      <ArrowRight size={19} className="plain-task-arrow" />
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
  const important = data.tasks.filter((t) =>
    org
      ? ['open', 'blocked', 'resolved'].includes(t.status)
      : attendee
        ? t.reporter_id === data.me.id && t.status !== 'closed'
        : t.owner_id === data.me.id && !['closed', 'resolved'].includes(t.status),
  );
  const priority = { urgent: 0, high: 1, normal: 2 };
  important.sort((a, b) => priority[a.priority] - priority[b.priority]);
  const nextSession = data.schedule.find((s) => Date.parse(s.ends_at) > Date.now());
  const completed = data.tasks.filter((t) => t.status === 'closed').length;
  const eventDay = new Date(data.event.date + 'T12:00:00Z');
  const planItems = data.schedule.filter((s) => Date.parse(s.ends_at) > Date.now()).slice(0, 3);
  return (
    <div className="home-content">
      <section className="event-cover">
        <div className="event-cover-main">
          <div className="cover-meta">
            <span>{org ? 'Organiser' : attendee ? 'Attendee' : data.me.role} workspace</span>
            <span>{eventDate(data.event.date)}</span>
          </div>
          <h1>{data.event.name}</h1>
          <div className="cover-bottom">
            <span>
              <MapPin size={17} />
              {data.event.venue}
            </span>
            <ArrowDownRight size={48} aria-hidden="true" />
          </div>
        </div>
        <div className="event-cover-side">
          <div className="event-date-stamp">
            <strong>{String(eventDay.getUTCDate()).padStart(2, '0')}</strong>
            <span>{new Intl.DateTimeFormat('en', { month: 'long' }).format(eventDay)}</span>
          </div>
          <span className="cover-date-year">{eventDay.getUTCFullYear()}</span>
          <div className="event-progress">
            <span>
              {completed} of {data.tasks.length} {org ? 'tasks' : 'visible tasks'} finished
            </span>
            <progress value={completed} max={data.tasks.length || 1} aria-label="Finished tasks" />
          </div>
        </div>
      </section>
      <div className="home-workspace">
        <section className="next-actions">
          <div className="section-heading">
            <div>
              <h2>
                {org ? 'Needs your attention' : attendee ? 'Your help requests' : 'Your next tasks'}
              </h2>
            </div>
            <button className="button primary" onClick={onCreate}>
              <Plus size={18} />
              {org ? 'Add a task' : 'Ask for help'}
            </button>
          </div>
          {important.length ? (
            <div className="plain-task-list">
              {important.slice(0, 3).map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  data={data}
                  pending={pending.some((p) => p.taskId === t.id)}
                  onOpen={() => onTask(t.id)}
                />
              ))}
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
                <button className="button primary" onClick={onCreate}>
                  Add your first task
                  <ArrowRight size={18} />
                </button>
              ) : null}
              {!data.tasks.length && org ? (
                <button className="text-link" onClick={onInvite}>
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
              : 'A clear owner. A clear next step. Keep the work moving.'}
          </p>
        </div>
        <button className="button primary" onClick={onCreate}>
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
            aria-label="Find a task"
            placeholder="Find a task…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
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
