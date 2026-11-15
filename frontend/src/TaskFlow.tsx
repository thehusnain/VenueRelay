import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin, Clock, UserRound } from 'lucide-react';
import type { Snapshot, Task, Pending, Status } from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
import type { Mutate } from './Dialogs';
import { ActivityList, time } from './components';
import { taskSentence } from './Workspace';
export function CreateTask({
  data,
  mutate,
  onBack,
}: {
  data: Snapshot;
  mutate: Mutate;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [location, setLocation] = useState(''),
    [priority, setPriority] = useState('normal'),
    [owner, setOwner] = useState(''),
    [due, setDue] = useState('');
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }, [step]);
  const org = data.me.role === 'organiser';
  const next = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      if (
        await mutate('task.create', {
          title,
          description,
          location,
          priority,
          ownerId: owner || null,
          dueAt: due ? new Date(due).toISOString() : null,
        })
      )
        onBack();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <section className="task-wizard">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to {org ? 'tasks' : 'your event'}
      </button>
      <p className="step-progress">
        {org ? 'Add a task' : 'Ask for help'} · Step {step + 1} of 3
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {
          [
            org ? 'What needs doing?' : 'What do you need help with?',
            'Where is help needed?',
            org ? 'Who can help?' : 'Does this look right?',
          ][step]
        }
      </h1>
      <p className="entry-intro">
        {
          [
            org
              ? 'Give your team one clear thing to take care of.'
              : 'Tell the team what’s happening. You don’t need to know who to ask.',
            'A clear place helps the right person find you.',
            org
              ? 'Choose someone, or leave this for the organiser to decide later.'
              : 'The organiser will see your request and find someone to help.',
          ][step]
        }
      </p>
      <ol className="wizard-stepper" aria-label="Task creation steps">
        {['The task', 'Location', org ? 'Assignment' : 'Review'].map((label, index) => (
          <li
            key={label}
            className={index === step ? 'current' : index < step ? 'complete' : ''}
            aria-current={index === step ? 'step' : undefined}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {label}
          </li>
        ))}
      </ol>
      <form key={step} onSubmit={next}>
        {step === 0 ? (
          <>
            <label htmlFor="task-title">
              {org ? 'What needs to happen?' : 'What do you need?'}
              <input
                id="task-title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                maxLength={140}
                placeholder="e.g. Clear the accessible entrance"
              />
            </label>
            <details className="optional-fields">
              <summary>Add more detail (optional)</summary>
              <label htmlFor="task-description">
                What should the team know?
                <textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
              </label>
            </details>
          </>
        ) : step === 1 ? (
          <>
            <label htmlFor="task-location">
              Place or area
              <input
                id="task-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                maxLength={120}
                placeholder="e.g. North entrance"
              />
            </label>
            <label htmlFor="task-urgency">
              How soon is help needed?
              <select
                id="task-urgency"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="normal">When someone is free</option>
                <option value="high">Soon</option>
                <option value="urgent">Right now</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <div className="request-summary">
              <strong>{title}</strong>
              <p>
                <MapPin size={16} />
                <span>{location}</span>
              </p>
              <p>
                {priority === 'urgent'
                  ? 'Help needed right now'
                  : priority === 'high'
                    ? 'Help needed soon'
                    : 'When someone is free'}
              </p>
              {description ? <p>{description}</p> : null}
            </div>
            {org ? (
              <>
                <label htmlFor="task-person">
                  Choose a person
                  <select
                    id="task-person"
                    aria-label="Choose a person"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">I’ll choose someone later</option>
                    {data.members
                      .filter((m) => m.role !== 'attendee')
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <details className="optional-fields">
                  <summary>Add a due time (optional)</summary>
                  <label htmlFor="task-due">
                    When should this be done?
                    <input
                      id="task-due"
                      type="datetime-local"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                </details>
              </>
            ) : null}
          </>
        )}
        <div className="step-actions">
          {step > 0 ? (
            <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={17} />
              Back
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={saving}>
            {step === 2 ? (org ? 'Add this task' : 'Send my request') : 'Continue'}
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}
export function TaskView({
  task,
  data,
  pending,
  mutate,
  onBack,
}: {
  task: Task;
  data: Snapshot;
  pending: Pending[];
  mutate: Mutate;
  onBack: () => void;
}) {
  const [note, setNote] = useState(''),
    [target, setTarget] = useState<Status | null>(null),
    [actionVersion, setActionVersion] = useState(task.version),
    [assignmentVersion, setAssignmentVersion] = useState(task.version),
    [assignmentDirty, setAssignmentDirty] = useState(false),
    [selectedOwner, setSelectedOwner] = useState(task.owner_id ?? '');
  const noteHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (target) {
      noteHeading.current?.focus({ preventScroll: true });
      noteHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [target]);
  useEffect(() => {
    if (!assignmentDirty) {
      setSelectedOwner(task.owner_id ?? '');
      setAssignmentVersion(task.version);
    }
  }, [task.owner_id, task.version, assignmentDirty]);
  const editAssignment = () => {
    if (!assignmentDirty) {
      setAssignmentVersion(task.version);
      setAssignmentDirty(true);
    }
  };
  const org = data.me.role === 'organiser',
    canWork = org || task.owner_id === data.me.id,
    waiting = pending.some((p) => p.taskId === task.id),
    owner = data.members.find((m) => m.id === task.owner_id);
  const act = (status: Status) => {
    if (['blocked', 'resolved'].includes(status)) {
      setTarget(status);
      setActionVersion(task.version);
      setNote('');
      return;
    }
    mutate('task.status', { status }, task.id, task.version);
  };
  return (
    <section className="task-view">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to tasks
      </button>
      <span className={`task-view-status ${task.status}`}>{statusLabels[task.status]}</span>
      <h1>{task.title}</h1>
      <p className="task-view-explanation">{taskSentence(task, data)}</p>
      <div className="task-facts">
        <span>
          <MapPin size={17} />
          <span>{task.location}</span>
        </span>
        <span>
          <UserRound size={17} />
          <span>{owner?.name ?? 'No one chosen yet'}</span>
        </span>
        {task.due_at ? (
          <span>
            <Clock size={17} />
            Due {time(task.due_at)}
          </span>
        ) : null}
      </div>
      {task.description ? <p className="task-description">{task.description}</p> : null}
      {task.resolution ? (
        <section className={`task-note ${task.status === 'blocked' ? 'warning' : ''}`}>
          <h2>{task.status === 'blocked' ? 'What help is needed' : 'Latest update'}</h2>
          <p>{task.resolution}</p>
        </section>
      ) : null}
      {waiting ? (
        <div className="plain-notice" role="status">
          Your change is saved on this device and waiting for confirmation.
        </div>
      ) : null}
      {!waiting && canWork ? (
        <section className="task-next-step">
          {target ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate(
                    'task.status',
                    { status: target, resolution: note },
                    task.id,
                    actionVersion,
                  )
                ) {
                  setTarget(null);
                  setNote('');
                }
              }}
            >
              <h2 ref={noteHeading} tabIndex={-1}>
                {target === 'blocked'
                  ? 'Ask the organiser for help'
                  : 'Send the result for a check'}
              </h2>
              <p className="field-hint">
                {target === 'blocked'
                  ? 'Explain what is stopping the work so the organiser can help.'
                  : 'Describe what you finished. The organiser checks the result before closing the task.'}
              </p>
              <label htmlFor="task-note">
                {target === 'blocked' ? 'What is stopping you?' : 'What did you do?'}
                <textarea
                  id="task-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <div className="step-actions">
                <button type="button" className="button secondary" onClick={() => setTarget(null)}>
                  Cancel
                </button>
                <button className="button primary">
                  {target === 'blocked' ? 'Ask for help' : 'Send for review'}
                  <ArrowRight size={18} />
                </button>
              </div>
            </form>
          ) : (
            <>
              {task.status === 'assigned' ? (
                <button className="button primary" onClick={() => act('in_progress')}>
                  Start task
                  <ArrowRight size={18} />
                </button>
              ) : null}
              {task.status === 'in_progress' ? (
                <div className="button-row">
                  <button className="button primary" onClick={() => act('resolved')}>
                    This task is done
                    <Check size={18} />
                  </button>
                  <button className="button secondary" onClick={() => act('blocked')}>
                    I need help
                  </button>
                </div>
              ) : null}
              {task.status === 'blocked' ? (
                <button className="button primary" onClick={() => act('in_progress')}>
                  I can continue now
                  <ArrowRight size={18} />
                </button>
              ) : null}
              {task.status === 'resolved' && org ? (
                <>
                  <p>
                    Check the result before finishing this task. The person who asked for help will
                    get an update.
                  </p>
                  <button className="button primary" onClick={() => act('closed')}>
                    Confirm it’s done
                    <Check size={18} />
                  </button>
                  <button className="text-link" onClick={() => act('in_progress')}>
                    It needs more work
                  </button>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {org && task.status !== 'closed' && !waiting ? (
        <section className={`assignment ${task.status === 'open' ? 'assignment-needed' : ''}`}>
          <h2>{task.owner_id ? 'Who is helping' : 'Choose someone to help'}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const p = Object.fromEntries(new FormData(e.currentTarget));
              if (
                await mutate(
                  'task.assign',
                  {
                    ownerId: p.ownerId,
                    dueAt: p.dueAt ? new Date(String(p.dueAt)).toISOString() : task.due_at,
                  },
                  task.id,
                  assignmentVersion,
                )
              )
                setAssignmentDirty(false);
            }}
          >
            <label htmlFor="assigned-person">
              Person responsible
              <select
                id="assigned-person"
                name="ownerId"
                value={selectedOwner}
                onChange={(e) => {
                  editAssignment();
                  setSelectedOwner(e.target.value);
                }}
                required
              >
                <option value="" disabled>
                  Choose a teammate
                </option>
                {data.members
                  .filter((m) => m.role !== 'attendee')
                  .map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <details className="optional-fields">
              <summary>Change the due time (optional)</summary>
              <label htmlFor="assigned-due">
                When should this be done?
                <input
                  id="assigned-due"
                  name="dueAt"
                  type="datetime-local"
                  onChange={editAssignment}
                />
              </label>
            </details>
            <button className={`button ${task.status === 'open' ? 'primary' : 'secondary'}`}>
              {task.owner_id ? 'Save person responsible' : 'Ask this person to help'}
              <ArrowRight size={18} />
            </button>
          </form>
        </section>
      ) : null}
      <details className="task-history">
        <summary>See changes to this task</summary>
        <ActivityList
          items={data.activity.filter((a) => a.entity_id === task.id)}
          members={data.members}
        />
        <p className="record-reference">
          Task reference {task.id.slice(0, 8)} · Record version {task.version}
        </p>
        {org && task.status === 'closed' && !waiting ? (
          <button className="text-link" onClick={() => act('in_progress')}>
            Reopen this task
          </button>
        ) : null}
      </details>
    </section>
  );
}
