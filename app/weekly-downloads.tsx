'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useWorkspaceRuntime } from './workspace-runtime';

export function WeeklyDownloads({ endpoint, weekStart }: { endpoint: string; weekStart: string }) {
  const { request } = useWorkspaceRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(format: 'pdf' | 'xlsx') {
    setBusy(true);
    setError('');
    try {
      const url = endpoint + '&' + new URLSearchParams({ week: weekStart, export: format });
      const response = await request(url, { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'This update could not be downloaded.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'coreconstruct-weekly-update-' + weekStart + '.' + format;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This update could not be downloaded.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="weekly-downloads">
    <div className="row-actions" aria-label={'Downloads for week starting ' + weekStart}>
      <button className="btn small" type="button" disabled={busy} onClick={() => void save('pdf')}><Download size={14} />Download PDF</button>
      <button className="btn small" type="button" disabled={busy} onClick={() => void save('xlsx')}><Download size={14} />Download Excel</button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
  </div>;
}
