import { useEffect, useState } from 'react';
import { Modal } from './components';
import { request } from './use-rally';
import type { Snapshot } from '../../shared/contracts';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installPrompt: InstallPrompt | undefined;
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    window.dispatchEvent(new Event('rally:install-available'));
  });
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
    [busy, setBusy] = useState(false);
  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  useEffect(() => {
    const ready = () => setAvailable(true),
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
    try {
      await installPrompt?.prompt();
      await installPrompt?.userChoice;
      installPrompt = undefined;
      setAvailable(false);
    } catch {
      setMessage('Use your browser’s install menu or Add to Home Screen.');
    }
  };
  const notifications = async () => {
    if (!data || !push?.publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error('Notifications are not allowed. You can still read updates inside Rally.');
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw new Error('Offline setup is not ready. Reload Rally and try again.');
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
  const installed = matchMedia('(display-mode: standalone)').matches;
  return (
    <Modal title="Install Rally and notifications" onClose={onClose}>
      <div className="pwa-options">
        <section>
          <h3>Rally on your Home Screen</h3>
          <p>
            {installed
              ? 'Rally is already running as an installed web app.'
              : 'Install this same website for quick access. No app-store download is needed.'}
          </p>
          {!installed && available ? (
            <button className="button primary" onClick={() => void install()}>
              Install Rally
            </button>
          ) : !installed ? (
            <p>
              On iPhone: open in Safari, tap Share → Add to Home Screen, then Add. On other
              browsers, use “Install app” in the browser menu.
            </p>
          ) : null}
          {!window.isSecureContext ? (
            <p role="status">
              A trusted HTTPS connection is required on a phone. Computer localhost also works for
              testing.
            </p>
          ) : null}
        </section>
        <section>
          <h3>Event notifications</h3>
          {!data ? (
            <p>Sign in and open an event first.</p>
          ) : !supported ? (
            <p>
              This browser does not offer push here. On iPhone, install Rally on your Home Screen
              first. Updates remain available in the bell.
            </p>
          ) : !push?.enabled ? (
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
          <h3>Offline work</h3>
          <p>
            Open your event while connected first. Changes are stored on this device and retried
            safely when the connection returns. Some browsers retry only when Rally is reopened.
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
              {waiting ? 'Save waiting changes before updating' : 'Update Rally and reload'}
            </button>
          ) : null}
        </section>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </Modal>
  );
}
