import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2, X } from 'lucide-react';
import type { Notification, Snapshot } from '../../shared/contracts';
let audio: AudioContext | undefined;
const preferenceKey = (userId: string) => 'venuerelay:alert-sound:' + userId;
const readSound = (userId: string) => {
  try {
    return localStorage.getItem(preferenceKey(userId)) === 'on';
  } catch {
    return false;
  }
};
export async function unlockAlertSound() {
  const Audio =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio)
    throw new Error('This browser does not support alert sound. Visual updates remain available.');
  audio ??= new Audio();
  if (audio.state !== 'running') await audio.resume();
  if (audio.state !== 'running') throw new Error('Tap again to allow sound in this browser.');
}
export function playAlertSound() {
  if (audio?.state !== 'running') return false;
  const start = audio.currentTime;
  for (const [offset, pitch] of [
    [0, 660],
    [0.16, 880],
  ]) {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.frequency.value = pitch;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(0.12, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.18);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.2);
  }
  return true;
}
export function useAlertSound(userId: string) {
  const [enabled, setEnabled] = useState(() => readSound(userId));
  useEffect(() => {
    const changed = () => setEnabled(readSound(userId));
    changed();
    window.addEventListener('venuerelay:sound-preference', changed);
    return () => window.removeEventListener('venuerelay:sound-preference', changed);
  }, [userId]);
  const change = async (value: boolean) => {
    if (value) await unlockAlertSound();
    try {
      localStorage.setItem(preferenceKey(userId), value ? 'on' : 'off');
    } catch {
      throw new Error('Sound preference could not be saved on this device.');
    }
    setEnabled(value);
    window.dispatchEvent(new Event('venuerelay:sound-preference'));
    if (value) playAlertSound();
  };
  return { enabled, change };
}
export function NotificationAlerts({
  data,
  onOpen,
}: {
  data: Snapshot;
  onOpen: (note: Notification) => void;
}) {
  const [note, setNote] = useState<Notification | null>(null),
    [error, setError] = useState('');
  const { enabled, change } = useAlertSound(data.user.id);
  const state = useRef<{ scope: string; seen: Set<string> }>({ scope: '', seen: new Set() });
  const scope = data.user.id + ':' + data.event.id + ':' + data.me.id;
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      void unlockAlertSound().catch(() => {});
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [enabled]);
  useEffect(() => {
    const ids = data.notifications.map((item) => item.id);
    if (state.current.scope !== scope) {
      state.current = { scope, seen: new Set(ids) };
      setNote(null);
      return;
    }
    const incoming = data.notifications.find(
      (item) => !item.read_at && !state.current.seen.has(item.id),
    );
    state.current.seen = new Set([...ids, ...state.current.seen].slice(0, 500));
    if (incoming && document.visibilityState === 'visible') {
      setNote(incoming);
      if (enabled) playAlertSound();
    }
    if (note && data.notifications.some((item) => item.id === note.id && item.read_at))
      setNote(null);
  }, [scope, data.notifications, enabled]);
  if (!note) return null;
  return (
    <aside className="notification-alert" aria-label="New event update">
      <Bell size={20} aria-hidden="true" />
      <div>
        <p role="status">{note.message}</p>
        <div className="notification-alert-actions">
          <button
            className="text-link"
            onClick={() => {
              onOpen(note);
              setNote(null);
            }}
          >
            {note.task_id ? 'Open task' : 'View update'}
          </button>
          {!enabled ? (
            <button
              className="text-link"
              onClick={() => void change(true).catch((error) => setError(error.message))}
            >
              <Volume2 size={16} /> Enable sound
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss update alert"
        onClick={() => setNote(null)}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
