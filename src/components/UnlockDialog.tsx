import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CryptoUnavailableError, WrongPasswordError } from '../lib/lock.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Resolves when unlocked; rejects with WrongPasswordError for a wrong password. */
  onUnlock: (password: string) => Promise<void>;
}

export function UnlockDialog({ open, onClose, onUnlock }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPassword('');
      setError('');
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onUnlock(password);
      setPassword('');
    } catch (err) {
      if (err instanceof WrongPasswordError) setError("That isn't the password. The ratings stay locked.");
      else if (err instanceof CryptoUnavailableError) setError(err.message);
      else setError('Something went wrong while unlocking. Try again.');
      setPassword('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-labelledby="unlock-title"
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="unlock-title">Unlock the ratings</h2>
        <p className="sub">Once unlocked, Unlock works again without the password until you reload or close the tab.</p>
        <label className="field">
          <span>Password</span>
          <input
            ref={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'unlock-error' : undefined}
          />
        </label>
        <p id="unlock-error" className="err" role="alert">
          {error}
        </p>
        <div className="act">
          <button type="submit" className="btn" disabled={busy || !password}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
