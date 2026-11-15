import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from './components';
import { request } from './use-rally';
import type { Snapshot } from '../../shared/contracts';
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
  return installed ? null : (
    <button
      className={`install-access ${className}`}
      onClick={onClick}
      aria-label="Install VenueRelay"
      aria-haspopup="dialog"
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
    [installing, setInstalling] = useState(false),
    [showSteps, setShowSteps] = useState(false);
  const installed = useInstalled();
  const steps = useRef<HTMLDivElement>(null);
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    if (showSteps) steps.current?.focus();
  }, [showSteps]);
  useEffect(() => {
    if (!open) return;
    setMessage('');
    setShowSteps(false);
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
      setShowSteps(true);
      return;
    }
    installPrompt = undefined;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== 'accepted') setShowSteps(true);
    } catch {
      setMessage('Use your browser’s install menu or Add to Home Screen.');
      setShowSteps(true);
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
    <Modal title="Install VenueRelay and notifications" onClose={onClose}>
      <div className="pwa-options">
        <section>
          <h3>VenueRelay on your Home Screen</h3>
          <p>
            {installed
              ? 'VenueRelay is already running as an installed web app.'
              : 'Install this same website for quick access. No app-store download is needed.'}
          </p>
          {!installed ? (
            <>
              <button
                className="button primary"
                disabled={installing}
                onClick={() => void install()}
                aria-controls={!available ? 'pwa-install-steps' : undefined}
                aria-expanded={!available ? showSteps : undefined}
              >
                {installing
                  ? 'Opening install…'
                  : available
                    ? 'Install VenueRelay'
                    : 'Show installation steps'}
              </button>
              {appleMobile ? <p>Your mobile browser installs from Safari’s Share menu.</p> : null}
              <div
                hidden={!showSteps}
                id="pwa-install-steps"
                className="install-steps"
                tabIndex={-1}
                ref={steps}
                aria-label="Installation steps"
              >
                <h4>Install VenueRelay on mobile</h4>
                {appleMobile ? (
                  <ol>
                    <li>
                      Open this website in Safari. If a link opened inside another app, open it in
                      Safari first.
                    </li>
                    <li>Tap Share. Depending on your Safari layout, open the More menu first.</li>
                    <li>Choose Add to Home Screen. If it is missing, look under Edit Actions.</li>
                    <li>Turn on Open as Web App if shown, then tap Add.</li>
                  </ol>
                ) : (
                  <ol>
                    <li>
                      Open this website directly in Chrome or Edge, outside another app’s browser.
                    </li>
                    <li>Open the browser menu and choose Install app or Add to Home screen.</li>
                    <li>Confirm the installation, then open VenueRelay from your device.</li>
                  </ol>
                )}
                <p>
                  If your browser has no install option, you can keep using every online feature on
                  this website.
                </p>
              </div>
            </>
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
              This browser does not offer push here. Your mobile browser may require you to open the
              installed app first. Updates remain available in the bell.
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
