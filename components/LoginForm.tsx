'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus('Signing in...');
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setStatus('Supabase is not configured yet. Add the public Supabase URL and anon key to enable owner login.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setStatus(error.message);
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
      <p role="status">{status}</p>
    </form>
  );
}
