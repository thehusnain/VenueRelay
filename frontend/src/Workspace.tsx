import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, MapPin, Plus, Search } from 'lucide-react';
import type { Snapshot, Task, Pending } from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
import { Empty, eventDate, time } from './components';
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
        ? `${owner} says it’s done. Please check the result.`
        : 'The organiser will check that everything is done.';
    case 'closed':
      return 'The organiser has checked and finished this task.';
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
  return (
    <button className="plain-task" onClick={onOpen} aria-label={`Open task: ${task.title}`}>
      <span className={`task-state-mark ${task.status}`} aria-hidden="true">
        {task.status === 'closed' ? <Check size={19} /> : null}
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
          <MapPin size={14} />
          {task.location}
          {task.due_at ? <span> · Due {time(task.due_at)}</span> : null}
        </span>
      </span>
      <span className={`plain-task-state ${task.status}`}>{statusLabels[task.status]}</span>
      <ArrowRight size={20} className="plain-task-arrow" />
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
  return (
    <div className="home-content">
      <section className="event-introduction">
        <span className="event-day">
          <strong>{new Date(data.event.date + 'T12:00:00Z').getUTCDate()}</strong>
          <span>
            {new Intl.DateTimeFormat('en', { month: 'short' }).format(
              new Date(data.event.date + 'T12:00:00Z'),
            )}
          </span>
        </span>
        <div>
          <p>{data.event.name}</p>
          <span>
            <CalendarDays size={15} />
            {eventDate(data.event.date)}
            <span className="event-meta-separator">·</span>
            {data.event.venue}
          </span>
        </div>
      </section>
      <div className="home-introduction">
        <div>
          <h1>
            {org
              ? 'Let’s get your event ready.'
              : attendee
                ? 'Need a hand? You’re in the right place.'
                : 'Here’s where you can help.'}
          </h1>
          <p>
            {org
              ? 'Add a task, choose someone to help, and check when it’s done.'
              : attendee
                ? 'Ask the event team for help and follow their updates here.'
                : 'Open a task to see what’s needed. Let the organiser know when it’s done.'}
          </p>
        </div>
        {data.tasks.length || attendee ? (
          <button className="button primary" onClick={onCreate}>
            <Plus size={19} />
            {org ? 'Add a task' : 'Ask for help'}
          </button>
        ) : null}
      </div>
      {data.announcements[0] ? (
        <section className="team-message">
          <strong>A message from your organiser</strong>
          <p>{data.announcements[0].message}</p>
        </section>
      ) : null}
      <section className="next-actions">
        <div className="section-heading">
          <h2>
            {org
              ? 'What needs your attention'
              : attendee
                ? 'Your help requests'
                : 'Your next tasks'}
          </h2>
          {data.tasks.length ? (
            <button className="text-link" onClick={onTasks}>
              See all {attendee ? 'requests' : 'tasks'}
              <ArrowRight size={17} />
            </button>
          ) : null}
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
            <span className="empty-check">
              <Check size={24} />
            </span>
            <h3>
              {data.tasks.length
                ? 'You’re all caught up.'
                : org
                  ? 'Your event starts with one small task.'
                  : attendee
                    ? 'The event team is here to help.'
                    : 'Your tasks will appear here.'}
            </h3>
            <p>
              {data.tasks.length
                ? 'There’s nothing needing your attention right now. You can still view all your tasks.'
                : org
                  ? 'What needs to happen before the doors open? Add it here, then choose someone to help.'
                  : attendee
                    ? 'Need directions, a facility fixed, or another helping hand? Send a request to the team.'
                    : 'When the organiser assigns you a task, you’ll see what to do and where to go.'}
            </p>
            {!data.tasks.length && org ? (
              <button className="button primary" onClick={onCreate}>
                Add your first task
                <ArrowRight size={18} />
              </button>
            ) : null}
            {!data.tasks.length && org ? (
              <button className="text-link" onClick={onInvite}>
                Or invite someone to your team
              </button>
            ) : null}
          </div>
        )}
      </section>
      <section className="plan-preview">
        <div className="section-heading">
          <h2>{nextSession ? 'Coming up at your event' : 'Your event plan'}</h2>
          <button className="text-link" onClick={onSchedule}>
            View the plan
            <ArrowRight size={17} />
          </button>
        </div>
        {nextSession ? (
          <div className="next-session">
            <time dateTime={nextSession.starts_at}>{time(nextSession.starts_at)}</time>
            <div>
              <strong>{nextSession.title}</strong>
              <span>{nextSession.location}</span>
            </div>
          </div>
        ) : (
          <p>
            {data.schedule.length
              ? 'You can look back at the full event schedule.'
              : org
                ? 'Add times and activities so everyone knows the plan.'
                : 'Your organiser will share the day’s activities here.'}
          </p>
        )}
      </section>
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
  const [finished, setFinished] = useState(() => sessionStorage.getItem(filterKey) === 'finished');
  const chooseFilter = (value: boolean) => {
    setFinished(value);
    sessionStorage.setItem(filterKey, value ? 'finished' : 'todo');
  };
  const attendee = data.me.role === 'attendee';
  const tasks = data.tasks.filter(
    (t) =>
      (finished ? t.status === 'closed' : t.status !== 'closed') &&
      `${t.title} ${t.location}`.toLowerCase().includes(search.toLowerCase()),
  );
  const order = { urgent: 0, high: 1, normal: 2 };
  tasks.sort((a, b) => order[a.priority] - order[b.priority]);
  return (
    <section>
      <div className="page-introduction">
        <div>
          <h1>{attendee ? 'Your help requests' : 'Tasks'}</h1>
          <p>
            {attendee
              ? 'See how the team is helping you.'
              : 'Open a task to see who is helping and what to do next.'}
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
            aria-pressed={!finished}
            className={!finished ? 'selected' : ''}
            onClick={() => chooseFilter(false)}
          >
            {attendee ? 'Waiting for help' : 'To do'}
          </button>
          <button
            aria-pressed={finished}
            className={finished ? 'selected' : ''}
            onClick={() => chooseFilter(true)}
          >
            Finished
          </button>
        </div>
        {data.tasks.length > 6 || search ? (
          <label className="simple-search">
            <Search size={18} />
            <input
              aria-label="Find a task"
              placeholder="Find a task…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        ) : null}
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
