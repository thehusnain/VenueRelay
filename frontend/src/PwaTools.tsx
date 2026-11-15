import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from './components';
import { request } from './use-rally';
import type { Snapshot } from '../../shared/contracts';
import { playAlertSound, useAlertSound } from './notification-alerts';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installPrompt: InstallPrompt | undefined;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    window.dispatchEvent(new Event('rally:install-available'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    window.dispatchEvent(new Event('rally:install-available'));
  });
}
function isInstalled() {
  return (
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
  const [available, setAvailable] = useState(!!installPrompt);
  useEffect(() => {
    const changed = () => setAvailable(!!installPrompt);
    window.addEventListener('rally:install-available', changed);
    return () => window.removeEventListener('rally:install-available', changed);
  }, []);
  return installed || !available ? null : (
    <button
      className={`install-access ${className}`}
      onClick={async () => {
        const prompt = installPrompt;
        if (!prompt) return;
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
    setMessage('');
    void request('/push/public-key')
      .then(setPush)
      .catch(() => setMessage('Push settings could not be checked. Retry when connected.'));
    void navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) setUpdate(true);
    });
    if (data)
      void request(
        `/events/${data.event.id}/push/subscription`,
        {},
        data.event.is_demo ? data.me.role : 'self',
      )
        .then((result) => setSubscribed(result.enabled))
        .catch(() => setSubscribed(false));
  }, [open, data?.event.id, data?.me.id]);
  const install = async () => {
    const prompt = installPrompt;
    if (!prompt) {
      setAvailable(false);
      setMessage('Installation is not available in this browser. Continue using VenueRelay here.');
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
    }
  };
  if (!open) return null;
  return (
    <Modal title="Alerts & installation" onClose={onClose}>
      <div className="pwa-options">
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
          ) : !push ? (
            <p role="status">Checking notification availability…</p>
          ) : !push.enabled ? (
            <p>Browser push is not configured on this server. Your in-app updates still work.</p>
          ) : subscribed ? (
            <button className="button secondary" onClick={() => void disable()}>
              Turn off browser notifications
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
          <h3>VenueRelay on your Home Screen</h3>
          <p>
            {installed
              ? 'VenueRelay is already running as an installed web app.'
              : 'Install this same website for quick access. No app-store download is needed.'}
          </p>
          {!installed && available ? (
            <button className="button primary" disabled={installing} onClick={() => void install()}>
              {installing ? 'Opening install…' : 'Install VenueRelay'}
            </button>
          ) : !installed ? (
            <p>Installation is not available here. Your event works directly in this browser.</p>
          ) : null}
          {!window.isSecureContext ? (
            <p role="status">
              A trusted HTTPS connection is required on a phone. Computer localhost also works for
              testing.
            </p>
          ) : null}
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
