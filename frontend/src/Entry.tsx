import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Mail, RefreshCw } from 'lucide-react';
import { request, RequestError } from './use-rally';
import type { Account, Delivery } from '../../shared/contracts';
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Rally home">
      <span className="rally-logo" aria-hidden="true">
        <span className="rally-mark">
          <i />
          <i />
        </span>
      </span>
      <span className="brand-word">Rally</span>
    </button>
  );
}
export function Entry({
  path,
  stage,
  account,
  delivery,
  error,
  onNavigate,
  onReady,
  onDemo,
  onSignOut,
  onInstall,
  onScan,
}: {
  path: string;
  stage: string;
  account: Account | null;
  delivery: Delivery;
  error: string;
  onNavigate: (path: string) => void;
  onReady: (eventId?: string) => Promise<void>;
  onDemo: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onInstall: () => void;
  onScan: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [demoError, setDemoError] = useState('');
  const demo = async () => {
    setBusy(true);
    setDemoError('');
    try {
      await onDemo();
      onNavigate('/');
    } catch (e) {
      setDemoError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const proof = path === '/verify-email' || path === '/reset-password';
  const authPath = ['/sign-in', '/create-account', '/forgot-password'].includes(path);
  const workflow =
    proof || authPath || ['loading', 'unavailable', 'verify', 'setup'].includes(stage);
  return (
    <div className={`entry-shell ${workflow ? 'is-workflow' : 'is-welcome'}`}>
      <header className="entry-header">
        <div className="entry-identity">
          <Brand onClick={() => onNavigate('/')} />
          <span className="entry-tagline">The event, organised.</span>
        </div>
        {!workflow ? (
          <nav className="entry-navigation" aria-label="Welcome navigation">
            <button className="active" onClick={() => onNavigate('/')}>
              Home
            </button>
            <button onClick={onInstall}>Install Rally</button>
            <button onClick={onScan}>Scan invitation</button>
            <button onClick={() => void demo()} disabled={busy}>
              Explore sample
            </button>
          </nav>
        ) : null}
        {!proof ? (
          <button className="button secondary" onClick={() => onNavigate('/sign-in')}>
            Sign in
          </button>
        ) : null}
      </header>
      <main id="main" className={`entry-main ${workflow ? 'entry-workflow' : 'entry-welcome'}`}>
        {workflow ? (
          <aside className="entry-brand-panel" aria-hidden="true">
            <div>
              <p>
                Behind every
                <br />
                great event.
              </p>
              <span>A shared plan. A team that knows what comes next.</span>
            </div>
          </aside>
        ) : null}
        <div
          className={workflow ? 'entry-workflow-content' : 'entry-public-content'}
          key={authPath || proof ? path : path + stage}
        >
          {proof ? (
            <ProofPage
              kind={path === '/verify-email' ? 'verify' : 'reset'}
              onNavigate={onNavigate}
              onReady={onReady}
            />
          ) : authPath ? (
            <AccountPage
              mode={
                path === '/sign-in' ? 'signin' : path === '/forgot-password' ? 'forgot' : 'register'
              }
              onNavigate={onNavigate}
              onReady={onReady}
              email={account?.email ?? ''}
            />
          ) : stage === 'loading' ? (
            <div className="opening">
              <h1>Opening Rally…</h1>
              <p>Finding your event.</p>
              <div className="loading-line" />
            </div>
          ) : stage === 'unavailable' ? (
            <div className="entry-form">
              <h1>Let’s get you connected.</h1>
              <p>{error}</p>
              <button className="button primary" onClick={() => void onReady()}>
                <RefreshCw size={18} />
                Try again
              </button>
            </div>
          ) : stage === 'verify' && account ? (
            <ConfirmWaiting
              account={account}
              delivery={delivery}
              onReady={onReady}
              onDemo={demo}
              onSignOut={onSignOut}
            />
          ) : stage === 'setup' && account ? (
            <EventSetup
              account={account}
              onReady={onReady}
              onSignOut={onSignOut}
              invitationError={error}
            />
          ) : (
            <>
              <section className="welcome">
                <div className="welcome-copy">
                  <h1>
                    <span>Your event.</span>
                    <span>Working together.</span>
                  </h1>
                  <p>
                    Coordinate your team, manage the plan, and follow every request through to
                    completion. One shared place for your event.
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="button primary"
                      onClick={() => onNavigate('/create-account')}
                    >
                      Start your event
                      <ArrowRight size={19} />
                    </button>
                    <button className="text-link" disabled={busy} onClick={() => void demo()}>
                      {busy ? 'Opening the sample…' : 'Try a sample event'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <p className="welcome-reassurance">
                    Already invited? Sign in using the email on your invitation.
                  </p>
                  {demoError ? (
                    <p className="form-error" role="alert">
                      {demoError}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </section>
              <section
                id="coordination"
                className="welcome-explanation"
                aria-label="Event coordination features"
              >
                {[
                  ['Clear ownership', 'The right person, on every task.'],
                  ['Team updates', 'Keep everyone informed.'],
                  ['Offline recovery', 'Save now. Sync when connected.'],
                  ['Recorded history', 'Know what changed and when.'],
                ].map(([title, detail]) => (
                  <div key={title}>
                    <h2>{title}</h2>
                    <p>{detail}</p>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </main>
      <footer className="entry-footer">
        <span>Rally · event coordination for people</span>
      </footer>
    </div>
  );
}
function AccountPage({
  mode,
  email,
  onNavigate,
  onReady,
}: {
  mode: 'signin' | 'register' | 'forgot';
  email: string;
  onNavigate: (p: string) => void;
  onReady: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errorField, setErrorField] = useState(''),
    [show, setShow] = useState(false),
    [sent, setSent] = useState(false),
    [connected, setConnected] = useState(true);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    setError('');
    setErrorField('');
    setSent(false);
  }, [mode]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    setErrorField('');
    try {
      const result = await request(
        '/auth/' +
          (mode === 'signin' ? 'login' : mode === 'register' ? 'register' : 'forgot-password'),
        { method: 'POST', body: JSON.stringify(values) },
      );
      if (mode === 'forgot') {
        setSent(true);
        setConnected(result.delivery?.connected ?? false);
      } else {
        await onReady();
        onNavigate('/');
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setErrorField(
        e instanceof RequestError &&
          ['INVALID_EMAIL', 'EMAIL_DOMAIN', 'EMAIL_EXISTS'].includes(e.code)
          ? 'email'
          : message.startsWith('Password')
            ? 'password'
            : '',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="entry-form">
      <button className="back-link" onClick={() => onNavigate('/')}>
        <ArrowLeft size={17} />
        Back to Rally
      </button>
      <h1>
        {sent
          ? 'Check your email'
          : mode === 'signin'
            ? 'Welcome back.'
            : mode === 'register'
              ? 'Let’s get your team together.'
              : 'Forgot your password?'}
      </h1>
      <p className="entry-intro">
        {sent
          ? connected
            ? 'If your email has an account, you’ll receive a link to choose a new password.'
            : 'If your email has an account, a reset request is saved. Email delivery needs to be connected before it can reach your inbox.'
          : mode === 'signin'
            ? 'Sign in to pick up where you left off.'
            : mode === 'register'
              ? 'First, create your account. We’ll help you set up the event next.'
              : 'Enter the email you use for Rally. We’ll help you get back in.'}
      </p>
      {sent ? (
        <button className="button primary" onClick={() => onNavigate('/sign-in')}>
          Back to sign in
          <ArrowRight size={18} />
        </button>
      ) : (
        <form onSubmit={submit}>
          {mode === 'register' ? (
            <label htmlFor="account-name">
              Your name
              <input
                id="account-name"
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                autoFocus
              />
            </label>
          ) : null}
          <label htmlFor="account-email">
            Email address
            <input
              id="account-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              defaultValue={email}
              aria-invalid={errorField === 'email' || undefined}
              aria-describedby={errorField === 'email' ? 'account-email-error' : undefined}
              autoFocus={mode !== 'register'}
            />
          </label>
          {errorField === 'email' ? (
            <p className="inline-error" id="account-email-error">
              {error}
            </p>
          ) : null}
          {mode !== 'forgot' ? (
            <>
              <label htmlFor="account-password">
                Password
                <div className="password-field">
                  <input
                    id="account-password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'register' ? 10 : 1}
                    maxLength={200}
                    aria-invalid={errorField === 'password' || undefined}
                    aria-describedby={mode === 'register' ? 'password-hint' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>
              {mode === 'register' ? (
                <p className="field-hint" id="password-hint">
                  Use at least 10 characters. You can paste a password from your password manager.
                </p>
              ) : (
                <button
                  className="text-link forgot-link"
                  type="button"
                  onClick={() => onNavigate('/forgot-password')}
                >
                  Forgot your password?
                </button>
              )}
            </>
          ) : null}
          {error ? (
            <div className="form-error-summary" ref={errorRef} tabIndex={-1} role="alert">
              <strong>There’s something to check.</strong>
              <p>{errorField ? <a href={'#account-' + errorField}>{error}</a> : error}</p>
            </div>
          ) : null}
          <button className="button primary full-width" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'register'
                  ? 'Create my account'
                  : 'Send reset link'}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
      <p className="account-alternative">
        {mode === 'signin' ? 'New to Rally?' : 'Already have an account?'}{' '}
        <button
          className="text-link"
          onClick={() => onNavigate(mode === 'signin' ? '/create-account' : '/sign-in')}
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </section>
  );
}
function ConfirmWaiting({
  account,
  delivery,
  onReady,
  onDemo,
  onSignOut,
}: {
  account: Account;
  delivery: Delivery;
  onReady: () => Promise<void>;
  onDemo: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [wait, setWait] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  return (
    <section className="entry-form">
      <span className="entry-state-icon">
        <Mail size={28} />
      </span>
      <h1>Confirm your email.</h1>
      <p className="entry-intro">
        {delivery.connected
          ? 'We’re sending a confirmation link to:'
          : 'Your account is saved with this email:'}
      </p>
      <strong className="confirmation-address">{account.email}</strong>
      {!delivery.connected ? (
        <div className="plain-notice">
          <strong>Email delivery isn’t connected yet.</strong>
          <p>
            The message hasn’t reached your inbox. Once delivery is connected, you can request a new
            link. You can explore a sample event for now.
          </p>
        </div>
      ) : (
        <p className="entry-intro">
          The link lasts 30 minutes. Check your spam folder if you can’t see it.
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onReady();
            setMessage('If you have opened the email link, confirm your address there first.');
          } finally {
            setBusy(false);
          }
        }}
      >
        I’ve confirmed my email
        <ArrowRight size={18} />
      </button>
      {delivery.connected ? (
        <button
          className="text-link resend-link"
          disabled={!!wait || busy}
          onClick={async () => {
            setError('');
            try {
              await request('/auth/resend-verification', { method: 'POST', body: '{}' });
              setWait(60);
              setMessage('A new confirmation message is waiting to be sent.');
            } catch (e) {
              setError((e as Error).message);
              if (e instanceof RequestError)
                setWait(Number((e.details as { retryAfter?: number })?.retryAfter ?? 0));
            }
          }}
        >
          {wait ? `You can request another link in ${wait}s` : 'Send another confirmation link'}
        </button>
      ) : (
        <button className="text-link resend-link" onClick={() => void onDemo()}>
          Try a sample event instead
          <ArrowRight size={17} />
        </button>
      )}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="back-link" onClick={() => void onSignOut()}>
        Use a different account
      </button>
    </section>
  );
}
function ProofPage({
  kind,
  onNavigate,
  onReady,
}: {
  kind: 'verify' | 'reset';
  onNavigate: (p: string) => void;
  onReady: () => Promise<void>;
}) {
  const [secret] = useState(() => new URLSearchParams(location.search).get('token') ?? ''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const p = Object.fromEntries(new FormData(e.currentTarget));
      if (kind === 'reset' && p.password !== p.confirm)
        throw new Error('The passwords do not match. Please enter the same password twice.');
      await request(kind === 'verify' ? '/auth/verify-email' : '/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: secret, password: p.password }),
      });
      setDone(true);
      history.replaceState({}, '', kind === 'verify' ? '/verify-email' : '/reset-password');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="entry-form">
      {done ? (
        <>
          <span className="entry-state-icon">
            <Check size={28} />
          </span>
          <h1>{kind === 'verify' ? 'Email confirmed.' : 'Your password is updated.'}</h1>
          <p className="entry-intro">
            {kind === 'verify'
              ? 'Your email address is ready. You can now create or join your event.'
              : 'Sign in with your new password. Your other sessions have been signed out.'}
          </p>
          <button
            className="button primary"
            onClick={async () => {
              if (kind === 'verify') await onReady();
              onNavigate(kind === 'verify' ? '/' : '/sign-in');
            }}
          >
            {kind === 'verify' ? 'Continue to Rally' : 'Sign in'}
            <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <>
          <h1>{kind === 'verify' ? 'Is this your email?' : 'Choose a new password.'}</h1>
          <p className="entry-intro">
            {kind === 'verify'
              ? 'Confirm the address this message was sent to. This helps keep event invitations with the right person.'
              : 'Choose a password you have not used for Rally before.'}
          </p>
          {secret ? (
            <form onSubmit={submit}>
              {kind === 'reset' ? (
                <>
                  <label htmlFor="new-password">
                    New password
                    <input
                      id="new-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={200}
                    />
                  </label>
                  <label htmlFor="confirm-password">
                    Enter it again
                    <input
                      id="confirm-password"
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={200}
                    />
                  </label>
                </>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="button primary full-width" disabled={busy}>
                {busy
                  ? 'Checking…'
                  : kind === 'verify'
                    ? 'Yes, confirm my email'
                    : 'Save new password'}
                <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <p className="form-error" role="alert">
              This page needs the link from your email. Open the message and try the link again.
            </p>
          )}
          <button
            className="back-link"
            onClick={() => onNavigate(kind === 'verify' ? '/sign-in' : '/forgot-password')}
          >
            {kind === 'verify' ? 'Back to sign in' : 'Request another reset link'}
          </button>
        </>
      )}
    </section>
  );
}
function EventSetup({
  account,
  onReady,
  onSignOut,
  invitationError,
}: {
  account: Account;
  onReady: (id?: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  invitationError?: string;
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(''),
    [date, setDate] = useState(''),
    [venue, setVenue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="entry-form setup-form">
      {invitationError ? (
        <div className="plain-notice warning" role="alert">
          <strong>Your invitation needs checking.</strong>
          <p>{invitationError} Ask your organiser for a new link.</p>
        </div>
      ) : null}
      <p className="step-progress">Set up your event · Step {step + 1} of 3</p>
      <h1>
        {['What is your event called?', 'When is it happening?', 'Where will it happen?'][step]}
      </h1>
      <p className="entry-intro">
        {
          [
            'Welcome, ' +
              account.name.split(' ')[0] +
              '. A few details will give your team a clear place to start.',
            'Choose the day so everyone is working from the same plan.',
            'Give people a place they will recognise. You can add more details in your tasks.',
          ][step]
        }
      </p>
      <form
        key={step}
        onSubmit={async (e) => {
          e.preventDefault();
          if (step < 2) {
            setStep(step + 1);
            return;
          }
          setBusy(true);
          setError('');
          try {
            const result = await request('/events', {
              method: 'POST',
              body: JSON.stringify({ name, date, venue }),
            });
            await onReady(result.eventId);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {step === 0 ? (
          <label htmlFor="event-name">
            Event name
            <input
              id="event-name"
              required
              minLength={3}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riverside community fair"
              autoFocus
            />
          </label>
        ) : step === 1 ? (
          <label htmlFor="event-date">
            Event date
            <input
              id="event-date"
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              autoFocus
            />
          </label>
        ) : (
          <label htmlFor="event-venue">
            Venue or place
            <input
              id="event-venue"
              required
              maxLength={140}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Riverside Park, Lahore"
              autoFocus
            />
          </label>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="step-actions">
          {step > 0 ? (
            <button className="button secondary" type="button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={17} />
              Back
            </button>
          ) : null}
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating your event…' : step === 2 ? 'Create my event' : 'Continue'}
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
      <p className="setup-note">
        Joining someone else’s event? Open the invitation link they sent you.
      </p>
      <button className="text-link" onClick={() => void onSignOut()}>
        Sign out
      </button>
    </section>
  );
}
