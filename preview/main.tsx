import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import { PortalClient } from '../app/portal-client';
import ReceiptStatus from '../app/receipt-status';
import { WorkspaceRuntimeContext, useWorkspaceRuntime } from '../app/workspace-runtime';
import { clientUpdatesSampleId } from '../lib/sample-client-updates';
import { createDemoRuntime } from './runtime';
import '../app/globals.css';
import './preview.css';

function PdfDownload({ path, title, filename }: { path: string; title: string; filename: string }) {
  const { request } = useWorkspaceRuntime();
  const [pdf, setPdf] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let url = '';
    let active = true;
    request(path).then(async response => {
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'This PDF is unavailable.');
      }
      const blob = await response.blob();
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPdf(url);
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [path, request]);

  return <section className="portal-login">
    <h1>{title}</h1>
    {pdf ? <a className="btn primary" href={pdf} download={filename}>Download PDF</a>
      : <p role={error ? 'alert' : 'status'}>{error || 'Preparing the PDF…'}</p>}
  </section>;
}

function Demo() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get('client');
  const receipt = params.get('receipt');
  const receiptPdf = params.get('receiptPdf');
  const drawing = params.get('drawing');
  if (!client && !receipt && !receiptPdf && !drawing) return <Workspace />;
  return <>
    <div className="demo-return"><a href={drawing || client === clientUpdatesSampleId ? "./?view=design" : "./?view=finance"}>← Back to workspace</a><span>Fictional sample records</span></div>
    {drawing ? <PdfDownload path={'/api/files/' + encodeURIComponent(drawing)} title="Drawing PDF" filename="coreconstruct-drawing.pdf" />
      : receipt ? <ReceiptStatus id={receipt} org="" />
        : receiptPdf ? <PdfDownload path={'/api/receipts/' + encodeURIComponent(receiptPdf)} title="Sample receipt" filename="coreconstruct-sample-receipt.pdf" />
          : <PortalClient projectId={client!} />}
  </>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="preview-loading" role="status">Opening the CoreConstruct demo…</p>);
createDemoRuntime().then((runtime) => {
  root.render(<WorkspaceRuntimeContext.Provider value={runtime}><Demo /></WorkspaceRuntimeContext.Provider>);
}).catch(() => {
  root.render(<p className="preview-loading" role="alert">CoreConstruct could not open browser storage. Try refreshing the page.</p>);
});
