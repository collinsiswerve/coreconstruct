import { useState } from 'react';
import { Download } from 'lucide-react';
import { dateKey } from '../lib/domain';
import { fieldHeaders, requireFieldResponse } from '../lib/offline';
import type { Actor } from '../lib/suite-types';
import { useWorkspaceRuntime } from './workspace-runtime';

export function WorkspaceBackup({ actor, online, exportRecords }: { actor: Actor; online: boolean; exportRecords: () => void }) {
  const { request, demo } = useWorkspaceRuntime();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function downloadArchive() {
    setWorking(true);setError('');
    try {
      const response = await request('/api/recovery', { cache: 'no-store', headers: fieldHeaders(actor) });
      await requireFieldResponse(response, 'The recovery archive could not be downloaded.');
      if (response.headers.get('Content-Type') !== 'application/zip') throw new Error('Sign in to download the recovery archive.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `coreconstruct-recovery-${dateKey()}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The recovery archive could not be downloaded.');
    } finally {
      setWorking(false);
    }
  }
  return <section className="panel">
    <div className="panel-heading"><div><h2>Workspace backup</h2>
      <p>{demo ? 'Download the fictional workspace records' : 'Download workspace records and attachments'}</p>
    </div><Download size={19} /></div>
    <div className="settings-body">
      {!demo && <>
        <p>The recovery ZIP includes the firm’s records, decision history and up to 24 MB of workspace data and attachments. Restore it into a fresh local workspace.</p>
        <button className="btn primary" disabled={!online || working} onClick={() => void downloadArchive()}>
          <Download size={16} />{working ? 'Preparing archive…' : 'Download recovery ZIP'}
        </button>
        <p className="fine-print">Keep the archive private. Team access, invitation links and protected worker identities are managed separately.</p>
      </>}
      <button className={demo ? 'btn primary' : 'btn'} disabled={!online} onClick={exportRecords}>Export records as JSON</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}
