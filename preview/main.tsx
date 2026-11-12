import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import { PortalClient } from '../app/portal-client';
import ReceiptStatus from '../app/receipt-status';
import { WorkspaceRuntimeContext, useWorkspaceRuntime } from '../app/workspace-runtime';
import { createDemoRuntime } from './runtime';
import '../app/globals.css';
import './preview.css';

function ReceiptDownload({ id }: { id: string }) {
  const { request } = useWorkspaceRuntime();
  const [pdf, setPdf] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let url = '';
    let active = true;
    request('/api/receipts/' + encodeURIComponent(id)).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'The sample PDF is unavailable.');
      }
      const blob = await response.blob();
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPdf(url);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, request]);

  return <section className="portal-login">
    <h1>Sample receipt</h1>
    {pdf ? <a className="btn primary" href={pdf} download="coreconstruct-sample-receipt.pdf">Download sample PDF</a> : <p role="status">{error || 'Preparing the sample PDF…'}</p>}
  </section>;
}

function Demo() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get('client');
  const receipt = params.get('receipt');
  const receiptPdf = params.get('receiptPdf');
  if (!client && !receipt && !receiptPdf) return <Workspace />;
  return <>
    <div className="demo-return"><a href="./?view=finance">← Back to workspace</a><span>Fictional sample records</span></div>
    {receipt ? <ReceiptStatus id={receipt} org="" /> : receiptPdf ? <ReceiptDownload id={receiptPdf} /> : <PortalClient projectId={client!} />}
  </>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="preview-loading" role="status">Opening the CoreConstruct demo…</p>);
createDemoRuntime().then((runtime) => {
  root.render(<WorkspaceRuntimeContext.Provider value={runtime}><Demo /></WorkspaceRuntimeContext.Provider>);
}).catch(() => {
  root.render(<p className="preview-loading" role="alert">CoreConstruct could not open browser storage. Try refreshing the page.</p>);
});
