import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  QrCode,
  Smartphone,
  Store,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { Modal } from './components';
import './quick-start.css';

const steps = [
  {
    title: 'Create your event',
    description:
      'Organisers set up the event. Volunteers and vendors join through a personal invitation instead.',
    icon: CalendarDays,
    instructions: [
      'Choose Start your event on the welcome page. Create an account with your name, username and password.',
      'Save your recovery code somewhere private. It lets you recover your account without email.',
      'Enter the event name, date and venue, then choose Create my event.',
    ],
    route: ['Start your event', 'Create account', 'Create my event'],
    tip: 'Already organising? More → Create another event adds a separate event.',
  },
  {
    title: 'Invite a volunteer',
    description: 'Give each person their own invitation so everyone joins with the right role.',
    icon: UserRoundPlus,
    instructions: [
      'Open Your team and choose Invite a teammate.',
      'Enter their name, select Volunteer, then choose Create invitation.',
      'Copy and send their personal link. They open it and create an account or sign in to join your event.',
    ],
    route: ['Your team', 'Invite a teammate', 'Volunteer'],
    tip: 'An invitation lasts 48 hours and works once. Your team shows who is still invited and who has joined.',
  },
  {
    title: 'Bring your vendors in',
    description:
      'Catering, sound, equipment and other suppliers can receive and update their own tasks.',
    icon: Store,
    instructions: [
      'In Your team, choose Invite a teammate again.',
      'Enter the vendor’s name and select Vendor before creating the invitation.',
      'Share their personal link. Once they join, you can assign work to them from a task.',
    ],
    route: ['Your team', 'Invite a teammate', 'Vendor'],
    tip: 'Share staff invitations privately. Use the attendee QR for visitors.',
  },
  {
    title: 'Let attendees ask for help',
    description: 'Visitors scan a shared QR or open a link. They do not need an account.',
    icon: QrCode,
    instructions: [
      'As organiser, open More → Share attendee QR, then choose Create attendee QR & link.',
      'Display the QR at your event or copy the attendee link to share.',
      'Attendees describe what they need and where, then send the request. They keep their private tracking link to see updates.',
    ],
    route: ['Share attendee QR', 'Scan or open link', 'Send request'],
    tip: 'Requests appear in the organiser’s Tasks. The private tracking link belongs to the attendee, so keep it private.',
  },
  {
    title: 'Take a task all the way to done',
    description: 'One clear owner, visible progress and a final check keep work from getting lost.',
    icon: CheckCheck,
    instructions: [
      'The organiser opens a task in Tasks and assigns a volunteer or vendor.',
      'The teammate starts the task, adds the result, then chooses Send for review. If stuck, they can ask for help.',
      'The organiser checks the result and chooses Confirm it’s done. The Updates bell keeps people informed.',
    ],
    route: ['Assign', 'Work on it', 'Review & finish'],
    tip: 'Try the sample event to practise. More → Try a different role shows each person’s view in the demo.',
  },
  {
    title: 'Keep your event close',
    description: 'Add VenueRelay to your Home Screen and come back with one tap.',
    icon: Smartphone,
    instructions: [
      'Choose Install VenueRelay, or open More → Alerts & installation, for instructions for your device.',
      'Open the event while connected first. If the connection drops, check the save status before repeating an action.',
      'Waiting changes stay on this device until they sync. More → Connection help explains anything that needs attention.',
    ],
    route: ['Install', 'Open your event', 'Stay up to date'],
    tip: 'You’re ready. Replay this tutorial anytime from More → Step-by-step tutorial.',
  },
];

type Progress = { step: number; state: 'started' | 'dismissed' | 'complete' };
const memory = new Map<string, Progress>();
const keyFor = (account: string) => `venuerelay:tutorial:v1:${account}`;
function readProgress(account: string): Progress | undefined {
  try {
    const raw = localStorage.getItem(keyFor(account));
    const saved = raw ? JSON.parse(raw) : memory.get(account);
    if (
      saved &&
      Number.isInteger(saved.step) &&
      saved.step >= 0 &&
      saved.step < steps.length &&
      ['started', 'dismissed', 'complete'].includes(saved.state)
    )
      return saved;
  } catch {
    return memory.get(account);
  }
}
function saveProgress(account: string, progress: Progress) {
  memory.set(account, progress);
  try {
    localStorage.setItem(keyFor(account), JSON.stringify(progress));
  } catch {
    /* Guidance remains usable when device storage is restricted. */
  }
  window.dispatchEvent(new Event('venuerelay:tutorial-progress'));
}

export function QuickStartOffer({ account, onOpen }: { account: string; onOpen: () => void }) {
  const [hidden, setHidden] = useState(() => !!readProgress(account));
  useEffect(() => {
    const update = () => setHidden(!!readProgress(account));
    update();
    window.addEventListener('venuerelay:tutorial-progress', update);
    return () => window.removeEventListener('venuerelay:tutorial-progress', update);
  }, [account]);
  if (hidden) return null;
  return (
    <aside className="quick-start-offer" aria-label="Getting started tutorial">
      <BookOpen size={21} aria-hidden="true" />
      <div>
        <strong>First time here?</strong>
        <span>Get to know your event in six short steps.</span>
      </div>
      <button className="text-link" onClick={onOpen}>
        Start tutorial <ArrowRight size={16} aria-hidden="true" />
      </button>
      <button
        className="icon-button"
        aria-label="Dismiss tutorial invitation"
        onClick={() => saveProgress(account, { step: 0, state: 'dismissed' })}
      >
        <X size={17} />
      </button>
    </aside>
  );
}

export function QuickStart({
  account,
  onClose,
  onInstall,
}: {
  account: string;
  onClose: () => void;
  onInstall: () => void;
}) {
  const [step, setStep] = useState(() => {
    const saved = readProgress(account);
    return saved?.state === 'complete' ? 0 : (saved?.step ?? 0);
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const content = steps[step];
  const Icon = content.icon;
  const last = step === steps.length - 1;
  const changeStep = (next: number) => {
    setStep(next);
    saveProgress(account, { step: next, state: 'started' });
  };
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [step]);
  const close = () => {
    saveProgress(account, { step, state: 'dismissed' });
    onClose();
  };
  const finish = () => {
    saveProgress(account, { step, state: 'complete' });
    onClose();
  };
  return (
    <Modal title="Your VenueRelay quick start" onClose={close} wide>
      <div className="quick-start">
        <div className="quick-start-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <ol aria-label="Tutorial progress">
            {steps.map((item, index) => (
              <li
                key={item.title}
                className={index <= step ? 'reached' : ''}
                aria-current={index === step ? 'step' : undefined}
              >
                <span className="sr-only">{item.title}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="quick-start-body">
          <div className="quick-start-visual" aria-label="Where to go">
            <Icon size={48} strokeWidth={1.4} aria-hidden="true" />
            <ol>
              {content.route.map((label, index) => (
                <li key={label}>
                  <span className="quick-start-stop">{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <section className="quick-start-copy" aria-labelledby="quick-start-heading">
            <h3 id="quick-start-heading" ref={heading} tabIndex={-1}>
              {content.title}
            </h3>
            <p>{content.description}</p>
            <ol>
              {content.instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </section>
        </div>
        <p className="quick-start-tip">{content.tip}</p>
        <div className="quick-start-actions">
          <button className="text-link" onClick={close}>
            Skip for now
          </button>
          <div>
            {step > 0 ? (
              <button className="button secondary" onClick={() => changeStep(step - 1)}>
                <ArrowLeft size={17} aria-hidden="true" />
                Back
              </button>
            ) : null}
            <button
              className="button primary"
              onClick={() => (last ? finish() : changeStep(step + 1))}
            >
              {last ? 'Finish tutorial' : 'Next'}
              {last ? (
                <Check size={17} aria-hidden="true" />
              ) : (
                <ArrowRight size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {last ? (
          <button
            className="text-link quick-start-install"
            onClick={() => {
              saveProgress(account, { step, state: 'complete' });
              onInstall();
            }}
          >
            <Smartphone size={17} aria-hidden="true" />
            Show installation steps
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
