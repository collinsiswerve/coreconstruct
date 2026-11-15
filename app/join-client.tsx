'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useWorkspaceRuntime } from './workspace-runtime';

export default function JoinClient({ token }: { token: string }) {
  const { request, demo } = useWorkspaceRuntime();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const response = await request('/api/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const value = await response.json() as { error?: string; organizationId: string };
      if (!response.ok) throw new Error(value.error || 'Invitation could not be accepted.');
      if (!demo) localStorage.setItem('cc-organization', value.organizationId);
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="portal-shell"><section className="portal-login">
    <Building2 size={32} aria-hidden="true" />
    <h1>{done ? 'Project access accepted' : 'Join your project team'}</h1>
    <p>{done ? 'Your assigned firm and project roles are ready.'
      : demo?.onboarding ? 'Accept this fictional invitation in the Ridgeway rehearsal.'
      : 'Use the email account invited by the principal. Invitations expire after seven days and can be used once.'}</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    {done ? <a className="btn primary" href={demo?.onboardingHref ?? '/'}>{demo?.onboarding ? 'Return to workspace setup' : 'Open workspace'}</a> : <>
      <button className="btn primary" disabled={busy} onClick={() => void accept()}>{busy ? 'Checking invitation…' : 'Accept project invitation'}</button>
      {!demo && <a className="btn" href={'/signin-with-chatgpt?return_to=' + encodeURIComponent('/join/' + token)} target="_top">Sign in with invited account</a>}
    </>}
  </section></div>;
}
