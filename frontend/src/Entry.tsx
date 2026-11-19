import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  Download,
  MapPin,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { request, RequestError } from './use-rally';
import type { Account, Delivery, SessionInfo } from '../../shared/contracts';
import { demoCredentials } from '../../shared/contracts';
import { downloadRecoveryCode } from './AccountSecurity';
import { InstallButton } from './PwaTools';
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="VenueRelay home">
      <span className="rally-logo" aria-hidden="true">
        <img className="brand-symbol" src="/favicon.svg" width="46" height="46" alt="" />
      </span>
      <span className="brand-word">VenueRelay</span>
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
  onSignOut,
  onInstall,
  onScan,
  onGuide,
}: {
  path: string;
  stage: string;
  account: Account | null;
  delivery: Delivery;
  error: string;
  onNavigate: (path: string) => void;
  onReady: (eventId?: string, session?: SessionInfo) => Promise<void>;
  onSignOut: () => Promise<void>;
  onInstall: () => void;
  onScan: () => void;
  onGuide: () => void;
}) {
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState('');
  const openDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    setDemoError('');
    try {
      const session = await request<SessionInfo>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(demoCredentials),
      });
      await onReady(undefined, session);
      onNavigate('/');
    } catch (error) {
      setDemoError((error as Error).message);
    } finally {
      setDemoBusy(false);
    }
  };
  const proof = path === '/verify-email' || path === '/reset-password';
  const authPath = ['/sign-in', '/create-account', '/forgot-password'].includes(path);
  const workflow =
    proof || authPath || ['loading', 'unavailable', 'verify', 'setup'].includes(stage);
  const loading = stage === 'loading' && !authPath && !proof;
  return (
    <div
      className={`entry-shell ${workflow ? 'is-workflow' : 'is-welcome'}${loading ? ' is-loading' : ''}`}
    >
      <header className="entry-header">
        <div className="entry-identity">
          <Brand onClick={() => onNavigate('/')} />
        </div>
        {!workflow ? (
          <nav className="entry-navigation" aria-label="Welcome navigation">
            <InstallButton onClick={onInstall} />
            <button onClick={onScan}>Scan invitation</button>
            <button disabled={demoBusy} onClick={() => void openDemo()}>
              {demoBusy ? 'Opening…' : 'Try the demo'}
            </button>
          </nav>
        ) : null}
        {workflow && authPath ? (
          <button className="text-link account-back" onClick={() => onNavigate('/')}>
            <ArrowLeft size={17} />
            Back to VenueRelay
          </button>
        ) : !workflow ? (
          <button className="button secondary" onClick={() => onNavigate('/sign-in')}>
            Sign in
          </button>
        ) : null}
      </header>
      <main
        id="main"
        className={`entry-main ${workflow ? `entry-workflow ${authPath || stage === 'setup' ? 'is-account' : ''}` : 'entry-welcome'}`}
      >
        {workflow && !authPath && stage !== 'setup' ? (
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
              onReady={(session) => onReady(undefined, session)}
              identifier={account?.username ?? account?.email ?? ''}
              onDemo={openDemo}
              demoBusy={demoBusy}
              demoError={demoError}
            />
          ) : stage === 'loading' ? (
            <div className="opening" role="status">
              <img className="opening-logo" src="/favicon.svg" width="56" height="56" alt="" />
              <h1>Opening VenueRelay…</h1>
              <p className="opening-motto">Every team. Every update. One place.</p>
              <div className="loading-line" aria-hidden="true" />
              <p className="opening-status">Finding your event.</p>
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
              onDemo={async () => onNavigate('/sign-in')}
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
                    Every team.
                    <br />
                    Every update.
                    <br />
                    <span>One place.</span>
                  </h1>
                  <p>
                    Run your event from one place. Attendees ask for help, organisers assign the
                    work, and volunteers or vendors complete it.
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="button primary"
                      onClick={() => onNavigate('/create-account')}
                    >
                      Start your event
                      <ArrowRight size={19} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={demoBusy}
                      onClick={() => void openDemo()}
                    >
                      {demoBusy ? 'Opening demo…' : 'Explore the demo'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <p className="welcome-reassurance">
                    Staff use a username. Attendees scan a QR. No email needed.
                  </p>
                  <button className="text-link welcome-tutorial" onClick={onGuide}>
                    <BookOpen size={18} aria-hidden="true" />
                    New here? Take the six-step tutorial
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  {error || demoError ? (
                    <p className="form-error" role="alert">
                      {error || demoError}
                    </p>
                  ) : null}
                </div>
                <div className="welcome-preview" aria-label="Sample event preview">
                  <div className="preview-heading">
                    <span className="preview-live">
                      <span /> Sample event
                    </span>
                    <span>Event day</span>
                  </div>
                  <h2>Community festival</h2>
                  <p className="preview-venue">
                    <MapPin size={15} /> Riverside Gardens
                  </p>
                  <div className="preview-tasks">
                    {[
                      [
                        'Ready to start',
                        'Welcome the first guests',
                        'Ayesha · North entrance',
                        'assigned',
                      ],
                      [
                        'Being worked on',
                        'Set up the food stalls',
                        'Hamza · Food court',
                        'in_progress',
                      ],
                      ['Finished', 'Check the accessible route', 'Maya · Main entrance', 'closed'],
                    ].map(([status, title, detail, state]) => (
                      <button
                        className="preview-task"
                        key={title}
                        disabled={demoBusy}
                        onClick={() => void openDemo()}
                        aria-label={'Explore demo: ' + title}
                      >
                        <span className={'preview-check ' + state}>
                          <Check size={16} />
                        </span>
                        <span>
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </span>
                        <span className={'preview-status ' + state}>{status}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preview-footer">
                    <ShieldCheck size={17} />
                    <span>One owner. Every change recorded.</span>
                  </div>
                </div>
              </section>
              <section
                id="coordination"
                className="welcome-explanation"
                aria-label="How people work together in VenueRelay"
              >
                {[
                  ['Attendee', 'Ask for help', 'Describe the problem and where it is.'],
                  ['Organiser', 'Choose an owner', 'Give one person a clear task.'],
                  ['Volunteer or vendor', 'Do the work', 'Share progress or ask for support.'],
                  [
                    'Organiser',
                    'Check it’s done',
                    'Confirm the result. The people involved get an update.',
                  ],
                ].map(([role, title, detail]) => (
                  <div key={title}>
                    <span className="handoff-role">{role}</span>
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
        <span>VenueRelay · Every Team. Every Update. One Place.</span>
        {workflow ? <InstallButton onClick={onInstall} /> : null}
      </footer>
    </div>
  );
}
function AccountPage({
  mode,
  identifier,
  onNavigate,
  onReady,
  onDemo,
  demoBusy,
  demoError,
}: {
  mode: 'signin' | 'register' | 'forgot';
  identifier: string;
  onNavigate: (p: string) => void;
  onReady: (session?: SessionInfo) => Promise<void>;
  onDemo: () => Promise<void>;
  demoBusy: boolean;
  demoError: string;
}) {
  const [recovery, setRecovery] = useState('');
  const recoveryHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (recovery) recoveryHeading.current?.focus();
  }, [recovery]);
  const [recovered, setRecovered] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errorField, setErrorField] = useState(''),
    [show, setShow] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [identifierValue, setIdentifierValue] = useState(identifier),
    [passwordValue, setPasswordValue] = useState(''),
    [demoFilled, setDemoFilled] = useState(false);
  const signInButton = useRef<HTMLButtonElement>(null);
  const fillDemo = () => {
    setIdentifierValue(demoCredentials.email);
    setPasswordValue(demoCredentials.password);
    setError('');
    setErrorField('');
    setDemoFilled(true);
    signInButton.current?.focus();
  };
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    setError('');
    setErrorField('');
  }, [mode]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    setErrorField('');
    try {
      const result = await request(
        '/auth/' +
          (mode === 'signin' ? 'login' : mode === 'register' ? 'register' : 'recover-account'),
        { method: 'POST', body: JSON.stringify(values) },
      );
      if (result.recoveryCode) {
        setRecovery(result.recoveryCode);
        setRecovered(mode === 'forgot');
      } else if (mode === 'forgot') {
        throw new Error(
          'The reset response was incomplete. Try signing in with your new password.',
        );
      } else {
        await onReady(result);
        onNavigate('/');
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setErrorField(
        e instanceof RequestError &&
          [
            'INVALID_EMAIL',
            'EMAIL_DOMAIN',
            'EMAIL_EXISTS',
            'INVALID_USERNAME',
            'USERNAME_EXISTS',
          ].includes(e.code)
          ? 'identity'
          : message.startsWith('Password')
            ? 'password'
            : '',
      );
    } finally {
      setBusy(false);
    }
  };
  if (recovery)
    return (
      <section className="entry-form recovery-form">
        <ShieldCheck size={32} className="recovery-symbol" />
        <h1 ref={recoveryHeading} tabIndex={-1}>
          {recovered ? 'You’re back in control.' : 'Your account is ready.'}
        </h1>
        <p className="entry-intro">
          Save your recovery code somewhere private. You’ll need it to reset your password without
          email.{' '}
          {recovered
            ? 'Your old code has been replaced and other sessions have been signed out.'
            : 'We only show it here once.'}
        </p>
        <div className="recovery-code-label">
          <label htmlFor="account-recovery">Your recovery code</label>
          <textarea
            id="account-recovery"
            readOnly
            value={recovery}
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <button
          className="button secondary full-width"
          onClick={() => {
            downloadRecoveryCode(identifierValue, recovery);
          }}
        >
          <Download size={17} />
          Download recovery code
        </button>
        <button
          className="button primary full-width"
          onClick={async () => {
            if (recovered) onNavigate('/sign-in');
            else {
              await onReady();
              onNavigate('/');
            }
          }}
        >
          {recovered ? 'Sign in with new password' : 'Continue to my event'}
          <ArrowRight size={18} />
        </button>
      </section>
    );
  return (
    <section className={`entry-form account-form ${mode === 'signin' ? 'is-signin' : ''}`}>
      <div className="account-heading">
        <h1>
          {mode === 'signin'
            ? 'Welcome back.'
            : mode === 'register'
              ? 'Create your account.'
              : 'Forgot your password?'}
        </h1>
        <p className="entry-intro">
          {mode === 'signin'
            ? 'Sign in to pick up where you left off.'
            : mode === 'register'
              ? 'Choose a username and password for your staff account. No email needed.'
              : 'Use the recovery code you saved when you created your account. No email needed.'}
        </p>
      </div>
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
            />
          </label>
        ) : null}
        <label htmlFor="account-identity">
          {mode === 'register' ? 'Choose a username' : 'Username'}
          <input
            id="account-identity"
            name="username"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="username"
            required
            maxLength={mode === 'register' ? 30 : 254}
            pattern={mode === 'register' ? '[a-zA-Z][a-zA-Z0-9_.-]{2,29}' : undefined}
            title={
              mode === 'register'
                ? '3–30 characters, starting with a letter. Use letters, numbers, dots, underscores or hyphens.'
                : undefined
            }
            value={identifierValue}
            onChange={(e) => {
              setIdentifierValue(e.target.value);
              setDemoFilled(false);
            }}
            aria-invalid={errorField === 'identity' || undefined}
            aria-describedby={errorField === 'identity' ? 'account-identity-error' : undefined}
          />
        </label>
        {errorField === 'identity' ? (
          <p className="inline-error" id="account-identity-error">
            {error}
          </p>
        ) : null}
        {mode === 'forgot' ? (
          <label htmlFor="recovery-code">
            Recovery code
            <input
              id="recovery-code"
              name="recoveryCode"
              required
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
            />
          </label>
        ) : null}
        <>
          <label htmlFor="account-password">
            {mode === 'forgot' ? 'New password' : 'Password'}
            <div className="password-field">
              <input
                id="account-password"
                name="password"
                value={passwordValue}
                onChange={(e) => {
                  setPasswordValue(e.target.value);
                  setDemoFilled(false);
                }}
                type={show ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signin' ? 1 : 10}
                maxLength={200}
                aria-invalid={errorField === 'password' || undefined}
                aria-describedby={mode !== 'signin' ? 'password-hint' : undefined}
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
          {mode !== 'signin' ? (
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
        {error || demoError ? (
          <div className="form-error-summary" ref={errorRef} tabIndex={-1} role="alert">
            <strong>There’s something to check.</strong>
            <p>
              {errorField ? <a href={'#account-' + errorField}>{error}</a> : error || demoError}
            </p>
          </div>
        ) : null}
        <button className="button primary full-width" disabled={busy} ref={signInButton}>
          {busy
            ? 'Please wait…'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create my account'
                : 'Reset password'}
          <ArrowRight size={18} />
        </button>
      </form>
      {mode === 'signin' ? (
        <aside className="demo-access" aria-label="Demo login credentials">
          <h2>Here for a quick look?</h2>
          <button
            type="button"
            className="button secondary"
            disabled={demoBusy}
            onClick={() => void onDemo()}
          >
            {demoBusy ? 'Opening…' : 'Open demo event'}
            <ArrowRight size={17} />
          </button>
          <details className="demo-credentials">
            <summary>View demo credentials</summary>
            <p className="demo-description">
              Run a sample community festival as the organiser. Explore tasks and team roles.
            </p>
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{demoCredentials.email}</dd>
              </div>
              <div>
                <dt>Password</dt>
                <dd>{demoCredentials.password}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="button secondary"
              onClick={fillDemo}
              aria-label="Fill demo credentials"
            >
              Fill demo
            </button>
            {demoFilled ? (
              <p role="status">Credentials filled. Select Sign in to continue.</p>
            ) : null}
          </details>
        </aside>
      ) : null}
      <p className="account-alternative">
        {mode === 'signin' ? 'New to VenueRelay?' : 'Already have an account?'}{' '}
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
  if (delivery.mode === 'disabled')
    return (
      <section className="entry-form">
        <h1>Sign in to continue.</h1>
        <p className="entry-intro">
          Email confirmation is no longer required here. Sign in with your existing password to
          enable your account and save a recovery code.
        </p>
        <button className="button primary full-width" onClick={() => void onDemo()}>
          Go to sign in
          <ArrowRight size={18} />
        </button>
      </section>
    );
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
            link. You can use the demo login while email delivery is being connected.
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
          Use demo login instead
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
            {kind === 'verify' ? 'Continue to VenueRelay' : 'Sign in'}
            <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <>
          <h1>{kind === 'verify' ? 'Is this your email?' : 'Choose a new password.'}</h1>
          <p className="entry-intro">
            {kind === 'verify'
              ? 'Confirm the address this message was sent to. This helps keep event invitations with the right person.'
              : 'Choose a password you have not used for VenueRelay before.'}
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
  const [name, setName] = useState(''),
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
      <h1>Create your event</h1>
      <p className="entry-intro">
        Welcome, {account.name.split(' ')[0]}. Add the basics below. Your event starts empty; you
        choose the people and the work.
      </p>
      <ol className="onboarding-path" aria-label="Getting started">
        <li aria-current="step">Create event</li>
        <li>Invite your team</li>
        <li>Add tasks</li>
      </ol>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const result = await request('/events', {
              method: 'POST',
              body: JSON.stringify({ name, date, venue }),
            });
            await onReady(result.eventId);
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="event-name">
          Event name
          <input
            id="event-name"
            required
            minLength={3}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Community makers fair"
          />
        </label>
        <label htmlFor="event-date">
          Event date
          <input
            id="event-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label htmlFor="event-venue">
          Venue or place
          <input
            id="event-venue"
            required
            maxLength={140}
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Town hall"
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button primary full-width" disabled={busy}>
          {busy ? 'Creating your event…' : 'Create my event'}
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="setup-note">
        Joining someone else’s event? Open their invitation link or scan their QR code, then sign in
        with your own account.
      </p>
      <button className="text-link" onClick={() => void onSignOut()}>
        Sign out
      </button>
    </section>
  );
}
