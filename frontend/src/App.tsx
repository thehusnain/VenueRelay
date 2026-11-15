import { PwaTools } from './PwaTools';
import { QrScanner, parseRallyLink } from './qr';
import { sessionPreference } from './session-preferences';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Home as HomeIcon,
  ListChecks,
  MoreHorizontal,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { useRally, request } from './use-rally';
import { Entry, Brand } from './Entry';
import { Home, TaskWorkspace } from './Workspace';
import { CreateTask, TaskView } from './TaskFlow';
import { Modal } from './components';
import { TeamPage, SchedulePage, LogPage, IntegrationPage, ReliabilityPage } from './Pages';
import { SimpleForm } from './Dialogs';
import { Inbox } from './Inbox';
function useLocation() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    addEventListener('popstate', listener);
    return () => removeEventListener('popstate', listener);
  }, []);
  const navigate = (next: string) => {
    if (location.pathname !== next) history.pushState({}, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return { path, navigate };
}
export function App() {
  const rally = useRally(),
    { data, pending, connection } = rally,
    { path, navigate } = useLocation();
  const [search, setSearch] = useState(''),
    [dialog, setDialog] = useState(''),
    [inbox, setInbox] = useState(false),
    more = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const invitation = new URLSearchParams(location.search).get('invite');
    if (invitation) {
      if (!sessionPreference.set('rally:invitation', invitation)) {
        rally.setToast(
          'This browser could not save your invitation. Restore storage access, then reopen the invitation link.',
        );
        return;
      }
      history.replaceState({}, '', '/sign-in');
      navigate('/sign-in');
    }
  }, []);
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (more.current?.open && !more.current.contains(e.target as Node)) more.current.open = false;
    };
    document.addEventListener('pointerdown', click);
    return () => document.removeEventListener('pointerdown', click);
  }, []);
  const go = (next: string) => {
    if (more.current) more.current.open = false;
    setSearch('');
    navigate(next);
  };
  const ready = async (id?: string) => {
    await rally.load(id, 'self');
  };
  useEffect(() => {
    if (rally.stage === 'loading') return;
    const active = document.activeElement;
    if (
      active &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) &&
      active.closest('main')
    )
      return;
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [path, rally.stage, data?.me.id]);
  const scanned = (value: string) => {
    try {
      const target = parseRallyLink(value, location.origin);
      if (target.invite && !sessionPreference.set('rally:invitation', target.invite))
        throw new Error('Device storage is unavailable. Retry after enabling storage.');
      setDialog('');
      go(target.path);
    } catch (e) {
      rally.setToast((e as Error).message);
    }
  };
  const browserTools = (
    <>
      <PwaTools
        open={dialog === 'pwa'}
        onClose={() => setDialog('')}
        data={data}
        waiting={!!pending.length}
      />
      {dialog === 'qr' ? <QrScanner onClose={() => setDialog('')} onRead={scanned} /> : null}
    </>
  );
  const entryPath = [
    '/sign-in',
    '/create-account',
    '/forgot-password',
    '/verify-email',
    '/reset-password',
  ].includes(path);
  if (rally.stage !== 'workspace' || !data || entryPath)
    return (
      <>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Entry
          onInstall={() => setDialog('pwa')}
          onScan={() => setDialog('qr')}
          path={path}
          stage={rally.stage}
          account={rally.account}
          delivery={rally.delivery}
          error={rally.error}
          onNavigate={go}
          onReady={ready}
          onSignOut={async () => {
            await rally.signOut();
            go('/');
          }}
        />
        {browserTools}
        {rally.toast ? (
          <div className="toast" role="status">
            {rally.toast}
          </div>
        ) : null}
      </>
    );
  const org = data.me.role === 'organiser',
    unread = data.notifications.filter((n) => !n.read_at).length,
    selected = /^\/tasks\/[^/]+$/.test(path)
      ? data.tasks.find((t) => t.id === path.split('/')[2])
      : undefined;
  const currentPage =
    path === '/tasks' || path === '/new-task' || selected
      ? 'tasks'
      : path === '/schedule'
        ? 'schedule'
        : path === '/team'
          ? 'team'
          : path === '/'
            ? 'home'
            : '';
  const openTask = (id: string) => go('/tasks/' + id),
    create = () => {
      sessionPreference.set(`rally:task-filter:${data.event.id}:${data.me.id}`, 'todo');
      go('/new-task');
    };
  const account = () => {
    if (pending.length) {
      rally.setToast('Please save or remove your waiting changes before changing accounts.');
      return;
    }
    go('/create-account');
  };
  const exportRecords = async () => {
    try {
      const result = await request(
          `/events/${data.event.id}/export`,
          {},
          data.event.is_demo ? data.me.role : 'self',
        ),
        blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'rally-event-record.json';
      a.click();
      URL.revokeObjectURL(url);
      rally.setToast('Your event record has been downloaded.');
    } catch (e) {
      rally.setToast((e as Error).message);
    }
  };
  const labels: Record<string, [string, string]> = {
    '/schedule': ['Your event plan', 'The times and places everyone needs to know.'],
    '/team': ['Your team', 'People helping your event happen.'],
    '/history': ['What changed', 'See who did what and when.'],
    '/connections': [
      'Connect another app',
      'For connecting your registration system or other tools.',
    ],
    '/connection-help': [
      'Connection help',
      'See changes waiting to be saved and check for problems.',
    ],
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className={`rally-app page-${currentPage || path.slice(1) || 'home'}`}>
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-identity">
              <Brand onClick={() => go('/')} />
              <span
                className={`device-save-state ${connection}`}
                role="status"
                aria-label="Save status"
              >
                {connection === 'offline'
                  ? 'Offline · saved on device'
                  : pending.length
                    ? 'Changes waiting to save'
                    : connection === 'syncing'
                      ? 'Saving changes…'
                      : 'All changes saved'}
              </span>
            </div>
            {currentPage !== 'home' ? (
              <span className="header-event-name">{data.event.name}</span>
            ) : null}
            <div className="header-actions">
              <button
                className="updates-button"
                onClick={() => setInbox(true)}
                aria-label={`Updates, ${unread} unread`}
              >
                <Bell size={20} />
                <span>Updates</span>
                {unread ? <span className="updates-count">{unread}</span> : null}
              </button>
              <details
                className="more-menu"
                ref={more}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.currentTarget.open = false;
                    e.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary>
                  <MoreHorizontal size={21} />
                  <span>More</span>
                </summary>
                <div className="more-panel">
                  <button
                    onClick={() => {
                      if (more.current) more.current.open = false;
                      setDialog('pwa');
                    }}
                  >
                    Install Rally & notifications
                  </button>
                  <button
                    onClick={() => {
                      if (more.current) more.current.open = false;
                      setDialog('qr');
                    }}
                  >
                    Scan a QR code
                  </button>
                  <strong>{data.me.name}</strong>
                  <span className="account-caption">{data.user.email ?? 'Sample account'}</span>
                  {data.events.length > 1 ? (
                    <label htmlFor="switch-event">
                      Change event
                      <select
                        id="switch-event"
                        aria-label="Change event"
                        value={data.event.id}
                        disabled={!!pending.length}
                        onChange={async (e) => {
                          await rally.switchContext(e.target.value, 'self');
                          go('/');
                        }}
                      >
                        {data.events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {data.event.is_demo ? (
                    <label htmlFor="preview-role">
                      Try a different role
                      <select
                        id="preview-role"
                        aria-label="Try a different role"
                        value={data.me.role}
                        disabled={!!pending.length}
                        onChange={async (e) => {
                          await rally.switchContext(data.event.id, e.target.value);
                          go('/');
                        }}
                      >
                        <option value="organiser">Organiser</option>
                        <option value="volunteer">Volunteer</option>
                        <option value="vendor">Vendor</option>
                        <option value="attendee">Attendee</option>
                      </select>
                    </label>
                  ) : null}
                  <button onClick={() => go('/history')}>What changed</button>
                  <button onClick={() => go('/connection-help')}>
                    Connection help{pending.length ? ` (${pending.length})` : ''}
                  </button>
                  {org ? (
                    <>
                      <button
                        onClick={() => {
                          if (more.current) more.current.open = false;
                          setDialog('announcement');
                        }}
                      >
                        Send a team update
                      </button>
                      <button onClick={() => go('/connections')}>Connect another app</button>
                      <button
                        onClick={() => {
                          if (data.user.email) setDialog('event');
                          else account();
                          if (more.current) more.current.open = false;
                        }}
                      >
                        Create another event
                      </button>
                    </>
                  ) : null}
                  <button
                    onClick={() => {
                      if (more.current) more.current.open = false;
                      setDialog('help');
                    }}
                  >
                    How to use Rally
                  </button>
                  {!data.user.email ? (
                    <button onClick={account}>Create your own account</button>
                  ) : null}
                  <button
                    onClick={async () => {
                      await rally.signOut();
                      go('/');
                    }}
                  >
                    {data.user.email ? 'Sign out' : 'Leave the sample event'}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <nav className="main-navigation" aria-label="Main navigation">
          <div>
            {[
              { id: 'home', path: '/', label: 'Home', icon: HomeIcon },
              {
                id: 'tasks',
                path: '/tasks',
                label: data.me.role === 'attendee' ? 'My requests' : 'Tasks',
                icon: ListChecks,
              },
              { id: 'schedule', path: '/schedule', label: 'Event plan', icon: CalendarDays },
              { id: 'team', path: '/team', label: 'Your team', icon: UsersRound },
            ].map((item) => (
              <button
                key={item.id}
                className={currentPage === item.id ? 'active' : ''}
                aria-current={currentPage === item.id ? 'page' : undefined}
                onClick={() => go(item.path)}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
        {data.event.is_demo ? (
          <div className="sample-strip">
            <span>Sample event</span>
            <button
              disabled={!!pending.length}
              onClick={() => {
                if (more.current) more.current.open = true;
                document.getElementById('preview-role')?.focus();
              }}
            >
              Switch role
            </button>
            <button onClick={account}>
              Use your own event
              <ArrowRight size={15} />
            </button>
          </div>
        ) : null}
        <main id="main" className="app-main" tabIndex={-1}>
          <div className="page-scene" key={path + data.me.id}>
            {rally.error ? (
              <div className="plain-notice warning" role="alert">
                <p>{rally.error}</p>
                <button className="text-link" onClick={() => void rally.refresh()}>
                  Try again
                </button>
              </div>
            ) : null}
            {connection === 'offline' || pending.length ? (
              <div className="connection-banner" role="status">
                <WifiOff size={21} />
                <p>
                  {connection === 'offline'
                    ? rally.simulatedOffline
                      ? 'Task updates are paused. '
                      : 'Connection interrupted. '
                    : ''}
                  {pending.length
                    ? `${pending.length} ${pending.length === 1 ? 'change is' : 'changes are'} waiting to be saved. Keep this device’s data until they are confirmed.`
                    : 'You can still read your saved event.'}
                </p>
                <button className="text-link" onClick={() => go('/connection-help')}>
                  See waiting changes
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : null}
            {(!selected && path.startsWith('/tasks/')) ||
            (!selected && !['/', '/new-task', '/tasks', ...Object.keys(labels)].includes(path)) ? (
              <section className="missing-page">
                <h1>{path.startsWith('/tasks/') ? 'Task unavailable' : 'Page not found'}</h1>
                <p>
                  {path.startsWith('/tasks/')
                    ? 'This task may have moved or may no longer be available to your role.'
                    : 'This address does not lead to a Rally page.'}
                </p>
                <div className="button-row">
                  <button className="button primary" onClick={() => go('/tasks')}>
                    View tasks
                  </button>
                  <button className="button secondary" onClick={() => go('/')}>
                    Go to Home
                  </button>
                </div>
              </section>
            ) : selected ? (
              <TaskView
                key={selected.id}
                data={data}
                task={selected}
                pending={pending}
                mutate={rally.mutate}
                onBack={() => go('/tasks')}
              />
            ) : path === '/new-task' ? (
              <CreateTask data={data} mutate={rally.mutate} onBack={() => go('/tasks')} />
            ) : path === '/tasks' ? (
              <TaskWorkspace
                data={data}
                pending={pending}
                onTask={openTask}
                onCreate={create}
                search={search}
                setSearch={setSearch}
              />
            ) : labels[path] ? (
              <>
                <div className={`page-introduction page-cover cover-${path.slice(1)}`}>
                  <div>
                    <h1>{labels[path][0]}</h1>
                    <p>{labels[path][1]}</p>
                  </div>
                </div>
                {path === '/schedule' ? (
                  <SchedulePage data={data} onAdd={() => setDialog('schedule')} />
                ) : path === '/team' ? (
                  <TeamPage data={data} onInvite={() => setDialog('invite')} />
                ) : path === '/history' ? (
                  <LogPage data={data} onTask={openTask} onExport={() => void exportRecords()} />
                ) : path === '/connections' && org ? (
                  <IntegrationPage data={data} notify={rally.setToast} />
                ) : path === '/connection-help' ? (
                  <ReliabilityPage
                    data={data}
                    pending={pending}
                    simulatedOffline={rally.simulatedOffline}
                    toggleOffline={rally.toggleOffline}
                    discard={rally.discard}
                    rebase={rally.rebase}
                    flush={() => void rally.flush()}
                    notify={rally.setToast}
                  />
                ) : (
                  <p>Only the organiser can use this page.</p>
                )}
              </>
            ) : (
              <Home
                data={data}
                pending={pending}
                onTask={openTask}
                onCreate={create}
                onTasks={() => go('/tasks')}
                onSchedule={() => go('/schedule')}
                onInvite={() => setDialog('invite')}
              />
            )}
          </div>
          <footer className="app-footer">
            <span>Rally · {data.event.name}</span>
            <button onClick={() => setDialog('help')}>Need a hand using Rally?</button>
          </footer>
        </main>
      </div>
      {rally.toast ? (
        <div className="toast" role="status">
          <Check size={18} />
          {rally.toast}
        </div>
      ) : null}
      {browserTools}
      {['invite', 'event', 'schedule', 'announcement'].includes(dialog) ? (
        <SimpleForm
          kind={dialog as 'invite' | 'event' | 'schedule' | 'announcement'}
          data={data}
          onClose={() => setDialog('')}
          mutate={rally.mutate}
          onDone={async (id) => {
            if (id) await rally.switchContext(id, 'self');
            else await rally.refresh();
            go('/');
          }}
        />
      ) : null}
      {inbox ? (
        <Inbox
          data={data}
          onClose={() => setInbox(false)}
          onTask={openTask}
          onRefresh={rally.refresh}
          notify={rally.setToast}
        />
      ) : null}
      {dialog === 'help' ? (
        <Modal title="A little help with Rally" onClose={() => setDialog('')}>
          <div className="help-content">
            <p>Rally helps everyone know what needs doing and who is helping.</p>
            <ol>
              <li>
                <strong>Ask or add a task.</strong> Say what’s needed and where.
              </li>
              <li>
                <strong>Choose someone.</strong> The organiser finds a person to help.
              </li>
              <li>
                <strong>Keep the team updated.</strong> Start the task, ask for help if needed, then
                say when it’s done.
              </li>
              <li>
                <strong>Check the result.</strong> The organiser confirms the task is finished.
              </li>
            </ol>
            <p>
              Updates appear in the bell at the top. Waiting changes can be checked in More →
              Connection help.
            </p>
            <button className="button primary" onClick={() => setDialog('')}>
              Got it
              <Check size={18} />
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
