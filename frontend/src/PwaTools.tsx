import { useEffect, useState } from 'react';
import { Download, Smartphone, CheckCircle2 } from 'lucide-react';
import { Modal } from './components';
import { request } from './use-rally';
import type { Snapshot } from '../../shared/contracts';
import { playAlertSound, useAlertSound } from './notification-alerts';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installPrompt: InstallPrompt | undefined;
let installedThisSession = false;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    window.dispatchEvent(new Event('rally:install-available'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    installedThisSession = true;
    window.dispatchEvent(new Event('rally:install-available'));
  });
}
function isInstalled() {
  return (
    installedThisSession ||
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
function useInstalled() {
  const [installed, setInstalled] = useState(isInstalled);
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)');
    const changed = () => setInstalled(isInstalled());
    const accepted = () => setInstalled(true);
    media.addEventListener('change', changed);
    window.addEventListener('appinstalled', accepted);
    return () => {
      media.removeEventListener('change', changed);
      window.removeEventListener('appinstalled', accepted);
    };
  }, []);
  return installed;
}
export function InstallButton({
  onClick,
  className = '',
  label = 'Install VenueRelay',
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  const installed = useInstalled();
  return installed ? null : (
    <button
      className={`install-access ${className}`}
      onClick={async () => {
        const prompt = installPrompt;
        if (!prompt) {
          onClick();
          return;
        }
        installPrompt = undefined;
        window.dispatchEvent(new Event('rally:install-available'));
        try {
          await prompt.prompt();
          await prompt.userChoice;
        } catch {
          onClick();
        }
      }}
      aria-label="Install VenueRelay"
    >
      <Download size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
type InstallPlatform = 'ios' | 'android' | 'desktop';
function suggestedPlatform(): InstallPlatform {
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
    return 'ios';
  return /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
}
function InstallGuide() {
  const [platform, setPlatform] = useState<InstallPlatform>(suggestedPlatform);
  return (
    <div className="install-guide">
      <div className="button-row install-platforms" role="group" aria-label="Installation device">
        {(
          [
            ['ios', 'iPhone / iPad'],
            ['android', 'Android'],
            ['desktop', 'Computer'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`button ${platform === value ? 'primary' : 'secondary'}`}
            aria-pressed={platform === value}
            onClick={() => setPlatform(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {platform === 'ios' ? (
        <ol className="install-steps" aria-label="iPhone and iPad installation steps">
          <li>
            Open this website in <strong>Safari</strong>.
          </li>
          <li>
            Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. You may need to
            scroll or tap More to find it.
          </li>
          <li>
            Keep <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.
          </li>
        </ol>
      ) : platform === 'android' ? (
        <ol className="install-steps" aria-label="Android installation steps">
          <li>
            Open this website in <strong>Chrome</strong>.
          </li>
          <li>
            Open the <strong>three-dot menu</strong> and choose{' '}
            <strong>Install and create shortcut</strong>, <strong>Install app</strong>, or{' '}
            <strong>Add to Home screen</strong>.
          </li>
          <li>
            Choose <strong>Install</strong> and follow the confirmation on your phone.
          </li>
        </ol>
      ) : (
        <ol className="install-steps" aria-label="Computer installation steps">
          <li>
            Open this website in <strong>Chrome or Edge</strong>.
          </li>
          <li>
            Use the <strong>install icon in the address bar</strong> or the browser menu’s app
            installation option.
          </li>
          <li>
            Confirm installation, then open <strong>VenueRelay</strong> from your apps.
          </li>
        </ol>
      )}
      <p>
        Then open VenueRelay from its icon whenever you need it. If an install option is missing,
        use your regular browser instead of an in-app or private browser, or bookmark this page.
      </p>
    </div>
  );
}
export function PwaTools({
  open,
  onClose,
  data,
  waiting,
}: {
  open: boolean;
  onClose: () => void;
  data: Snapshot | null;
  waiting: boolean;
}) {
  const [available, setAvailable] = useState(!!installPrompt),
    [message, setMessage] = useState(''),
    [update, setUpdate] = useState(false),
    [push, setPush] = useState<{ enabled: boolean; publicKey: string | null }>(),
    [pushError, setPushError] = useState(false),
    [subscribed, setSubscribed] = useState(false),
    [busy, setBusy] = useState(false),
    [installing, setInstalling] = useState(false);
  const installed = useInstalled();
  const sound = useAlertSound(data?.user.id ?? '');
  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  useEffect(() => {
    const ready = () => setAvailable(!!installPrompt),
      updated = () => setUpdate(true);
    window.addEventListener('rally:install-available', ready);
    window.addEventListener('rally:update-ready', updated);
    const controller = () => location.reload();
    if (navigator.serviceWorker?.controller)
      navigator.serviceWorker.addEventListener('controllerchange', controller);
    return () => {
      window.removeEventListener('rally:install-available', ready);
      window.removeEventListener('rally:update-ready', updated);
      navigator.serviceWorker?.removeEventListener('controllerchange', controller);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage('');
    setPushError(false);
    setPush(undefined);
    setSubscribed(false);
    void request('/push/public-key')
      .then((result) => {
        if (!cancelled) setPush(result);
      })
      .catch(() => {
        if (!cancelled) setPushError(true);
      });
    void navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => {
        if (!cancelled && reg?.waiting) setUpdate(true);
      })
      .catch(() => {
        /* Installation guidance stays available without service-worker access. */
      });
    if (data)
      void request(
        `/events/${data.event.id}/push/subscription`,
        {},
        data.event.is_demo ? data.me.role : 'self',
      )
        .then((result) => {
          if (!cancelled) setSubscribed(result.enabled);
        })
        .catch(() => {
          if (!cancelled) setPushError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [open, data?.event.id, data?.me.id]);
  const install = async () => {
    const prompt = installPrompt;
    if (!prompt) {
      setAvailable(false);
      setMessage('Follow the steps for your device below to add VenueRelay.');
      return;
    }
    installPrompt = undefined;
    window.dispatchEvent(new Event('rally:install-available'));
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(
        choice.outcome === 'accepted'
          ? 'Installation accepted. Your browser will add VenueRelay.'
          : 'Installation cancelled. You can keep using VenueRelay here.',
      );
    } catch {
      setMessage('Your browser could not start installation. Continue using VenueRelay here.');
    } finally {
      setAvailable(!!installPrompt);
      setInstalling(false);
    }
  };
  const notifications = async () => {
    if (!data || !push?.publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error(
          'Notifications are not allowed. You can still read updates inside VenueRelay.',
        );
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw new Error('Offline setup is not ready. Reload VenueRelay and try again.');
      const key = Uint8Array.from(atob(push.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await request(
        `/events/${data.event.id}/push/subscription`,
        { method: 'POST', body: JSON.stringify(subscription.toJSON()) },
        data.event.is_demo ? data.me.role : 'self',
      );
      setSubscribed(true);
      setMessage('Browser notifications enabled for this event and device.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(),
        subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        await request(
          `/events/${data.event.id}/push/subscription`,
          { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) },
          data.event.is_demo ? data.me.role : 'self',
        );
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage('Browser notifications disabled on this device.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) return null;
  return (
    <Modal title="Alerts & installation" onClose={onClose}>
      <div className="pwa-options">
        <section className="install-section" aria-labelledby="install-heading">
          <div className="install-intro">
            {installed ? (
              <CheckCircle2 size={24} aria-hidden="true" />
            ) : (
              <Smartphone size={24} aria-hidden="true" />
            )}
            <h3 id="install-heading">VenueRelay on your Home Screen</h3>
          </div>
          <p>
            {installed
              ? 'VenueRelay is installed. Open it from your Home Screen or app launcher.'
              : 'Your event, one tap away. Add VenueRelay to your phone or computer. No app-store download needed.'}
          </p>
          {!installed && available ? (
            <button className="button primary" disabled={installing} onClick={() => void install()}>
              <Download size={18} aria-hidden="true" />
              {installing ? 'Opening install…' : 'Install VenueRelay'}
            </button>
          ) : null}
          {!installed ? <InstallGuide /> : null}
          {!window.isSecureContext ? (
            <p role="status" className="install-notice">
              Use the event’s HTTPS website on your phone for installation and offline features. A
              local network HTTP address does not support these features. Computer localhost works
              for testing.
            </p>
          ) : null}
        </section>
        <section>
          <h3>Event notifications</h3>
          {!data ? (
            <p>Sign in and open an event first.</p>
          ) : !supported ? (
            <p>
              Background notifications are not available in this browser window. On iPhone, they
              require the Home Screen app and notification permission. In-app alerts and the bell
              work here.
            </p>
          ) : pushError ? (
            <p role="status">
              Notification settings could not be checked. Reconnect and reopen this panel to try
              again.
            </p>
          ) : !push ? (
            <p role="status">Checking notification availability…</p>
          ) : !push.enabled ? (
            <p>Browser push is not configured on this server. Your in-app updates still work.</p>
          ) : subscribed ? (
            <button className="button secondary" disabled={busy} onClick={() => void disable()}>
              {busy ? 'Turning off…' : 'Turn off browser notifications'}
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void notifications()}
            >
              Enable browser notifications
            </button>
          )}
        </section>
        <section>
          <h3>Sound while VenueRelay is open</h3>
          <p>
            Hear a short chime when a new update arrives. Your phone controls the sound of
            notifications outside the app.
          </p>
          {data ? (
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() =>
                  void sound
                    .change(!sound.enabled)
                    .then(() =>
                      setMessage(
                        sound.enabled ? 'Alert sound turned off.' : 'Alert sound turned on.',
                      ),
                    )
                    .catch((error) => setMessage(error.message))
                }
              >
                {sound.enabled ? 'Turn off alert sound' : 'Turn on alert sound'}
              </button>
              {sound.enabled ? (
                <button
                  className="text-link"
                  onClick={() => {
                    if (!playAlertSound())
                      void sound.change(true).catch((error) => setMessage(error.message));
                  }}
                >
                  Test sound
                </button>
              ) : null}
            </div>
          ) : (
            <p>Sign in to choose your alert settings.</p>
          )}
        </section>
        <section>
          <h3>Offline work</h3>
          <p>
            Open your event while connected first. Changes are stored on this device and retried
            safely when the connection returns. Some browsers retry only when VenueRelay is
            reopened.
          </p>
          {update ? (
            <button
              className="button secondary"
              disabled={waiting}
              onClick={() =>
                void navigator.serviceWorker
                  .getRegistration()
                  .then((reg) => reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }))
                  .catch(() =>
                    setMessage(
                      'The update could not start. Close and reopen this panel to try again.',
                    ),
                  )
              }
            >
              {waiting ? 'Save waiting changes before updating' : 'Update VenueRelay and reload'}
            </button>
          ) : null}
        </section>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </Modal>
  );
}
