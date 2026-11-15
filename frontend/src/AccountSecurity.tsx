import { useEffect, useRef, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { Modal } from './components';
import { request } from './use-rally';

export function downloadRecoveryCode(email: string, code: string) {
  const url = URL.createObjectURL(
    new Blob(
      [
        `VenueRelay recovery code\nEmail: ${email}\nCode: ${code}\nKeep this private. It can reset your password.\n`,
      ],
      { type: 'text/plain' },
    ),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'venuerelay-recovery.txt';
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountSecurity({ email, onClose }: { email: string; onClose: () => void }) {
  const [code, setCode] = useState('');
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (code) resultHeading.current?.focus();
  }, [code]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Account security" onClose={onClose}>
      {code ? (
        <div className="recovery-form">
          <h3 ref={resultHeading} tabIndex={-1}>
            Recovery code replaced
          </h3>
          <p className="entry-intro">
            Save this replacement recovery code privately. Your previous code no longer works.
          </p>
          <div className="recovery-code-label">
            <label htmlFor="security-recovery">Your recovery code</label>
            <textarea
              id="security-recovery"
              value={code}
              readOnly
              rows={2}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <button
            className="button secondary full-width"
            onClick={() => downloadRecoveryCode(email, code)}
          >
            <Download size={17} />
            Download recovery code
          </button>
          <button className="button primary full-width" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const password = new FormData(event.currentTarget).get('password');
            setBusy(true);
            setError('');
            try {
              const result = await request('/auth/recovery-code', {
                method: 'POST',
                body: JSON.stringify({ password }),
              });
              setCode(result.recoveryCode);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Lost your recovery code? Create a replacement while you’re signed in. You can use it to
            reset your password without email.
          </p>
          <label htmlFor="security-password">
            Current password
            <input
              id="security-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button primary full-width" disabled={busy}>
            <ShieldCheck size={17} />
            {busy ? 'Creating…' : 'Create replacement code'}
          </button>
        </form>
      )}
    </Modal>
  );
}
