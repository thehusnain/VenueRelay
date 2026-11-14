import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Modal } from './components';
export function parseRallyLink(value: string, origin: string) {
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    throw new Error('This is not a readable Rally link.');
  }
  if (url.origin !== new URL(origin).origin)
    throw new Error(
      'This QR code belongs to another website. Use an invitation from this Rally server.',
    );
  const invite = url.searchParams.get('invite');
  if (invite && /^[A-Za-z0-9_-]{20,200}$/.test(invite)) return { invite, path: '/sign-in' };
  if (/^\/tasks\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname)) return { path: url.pathname };
  throw new Error('Scan a Rally invitation or task QR code.');
}
export function QrCode({ value }: { value: string }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, { width: 280, margin: 3, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);
  return image ? (
    <img
      className="qr-image"
      src={image}
      alt="QR code for this Rally link"
      width={280}
      height={280}
    />
  ) : (
    <p role="status">Preparing QR code…</p>
  );
}
export function QrScanner({
  onClose,
  onRead,
}: {
  onClose: () => void;
  onRead: (value: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    active = useRef(false);
  const [error, setError] = useState(''),
    [running, setRunning] = useState(false),
    [link, setLink] = useState('');
  const stop = () => {
    active.current = false;
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setRunning(false);
  };
  useEffect(
    () => () => {
      active.current = false;
      clearTimeout(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  const accept = (value: string) => {
    try {
      parseRallyLink(value, location.origin);
      stop();
      onRead(value);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const scan = (source: CanvasImageSource, width: number, height: number) => {
    const canvas = document.createElement('canvas'),
      ratio = Math.min(1, 1200 / Math.max(width, height));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height)?.data;
  };
  const start = async () => {
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera scanning needs HTTPS. Upload a QR image or paste the link below.');
      return;
    }
    stop();
    active.current = true;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!active.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      setRunning(true);
      const tick = () => {
        if (!active.current) return;
        const el = video.current;
        if (el && el.readyState >= 2) {
          const result = scan(el, el.videoWidth, el.videoHeight);
          if (result) {
            accept(result);
            if (!active.current) return;
          }
        }
        timer.current = setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      stop();
      setError(
        (e as Error).name === 'NotAllowedError'
          ? 'Camera access was denied. Allow it in browser settings, or upload a QR image.'
          : (e as Error).name === 'NotFoundError'
            ? 'No camera was found. Upload a QR image or paste the link.'
            : 'The camera could not start. Close other camera apps and retry, or upload an image.',
      );
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    if (file.size > 8 * 1024 * 1024) {
      setError('Choose an image smaller than 8 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
      });
      const value = scan(image, image.naturalWidth, image.naturalHeight);
      if (!value) throw new Error('No QR code was found. Try a clearer image.');
      accept(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This image could not be read. Try PNG or JPEG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  return (
    <Modal title="Scan a Rally QR code" onClose={onClose}>
      <div className="pwa-options">
        <p>Join an event or open a task. Scanning never changes your permissions.</p>
        <video
          ref={video}
          className="qr-camera"
          autoPlay
          muted
          playsInline
          aria-label="QR camera preview"
          hidden={!running}
        />
        <button className="button secondary" onClick={() => (running ? stop() : void start())}>
          {running ? 'Stop camera' : 'Start camera'}
        </button>
        <label>
          Or choose a QR image
          <input type="file" accept="image/*" onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept(link);
          }}
        >
          <label htmlFor="qr-link">Or paste a Rally link</label>
          <input id="qr-link" value={link} onChange={(e) => setLink(e.target.value)} required />
          <button className="button primary" type="submit">
            Open link
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}
