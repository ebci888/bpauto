'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [setupWarning, setSetupWarning] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSetupStatus() {
      try {
        const response = await fetch('/api/setup/status');
        const result = await response.json();
        if (!cancelled && !result.auth?.readyForLogin && result.nextStep) {
          setSetupWarning(result.nextStep);
        }
      } catch {
        if (!cancelled) setSetupWarning('');
      }
    }

    loadSetupStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus('Signing in...');
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setStatus('Production is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Netlify env vars, then redeploy.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        setStatus(error.message);
        return;
      }
    } catch (error) {
      setLoading(false);
      setStatus(error instanceof Error ? error.message : 'Could not sign in.');
      return;
    }

    window.location.href = '/dashboard';
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input value={email} type="email" autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        <span>Password</span>
        <input
          value={password}
          type="password"
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      {setupWarning ? <p className="login-warning">{setupWarning}</p> : null}
      <p role="status">{status}</p>
    </form>
  );
}
