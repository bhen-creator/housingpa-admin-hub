import {useState, type FormEvent} from 'react';
import {api} from '../lib/api';
import type {AppConfig} from '../../shared/types';
import {IconLock} from '../lib/icons';

export function SignIn({config, onSignedIn}: {config: AppConfig; onSignedIn: () => void}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.signIn(code.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-mark">{config.brandShort.slice(0, 3)}</div>
        <h1 style={{fontSize: 19, fontWeight: 650, marginBottom: 3}}>{config.brandTagline}</h1>
        <p className="small muted" style={{marginBottom: 20}}>
          {config.brandName}
        </p>

        <label className="label" htmlFor="access-code" style={{display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
          Access code
        </label>
        <input
          id="access-code"
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter your access code"
        />

        {error && (
          <div className="callout callout-danger tiny" style={{marginTop: 12}}>
            {error}
          </div>
        )}

        <button className="btn btn-primary btn-lg btn-block" style={{marginTop: 16}} disabled={busy || !code.trim()}>
          <IconLock size={15} /> {busy ? 'Checking…' : 'Sign in'}
        </button>

        {config.supportEmail && (
          <p className="tiny muted" style={{marginTop: 16, textAlign: 'center'}}>
            Need a code? Contact <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>
          </p>
        )}
      </form>
    </div>
  );
}
