import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import { PortalClient } from '../app/portal-client';
import ReceiptStatus from '../app/receipt-status';
import JoinClient from '../app/join-client';
import { WorkspaceRuntimeContext, useWorkspaceRuntime } from '../app/workspace-runtime';
import { clientUpdatesSampleId } from '../lib/sample-client-updates';
import { createDemoRuntime } from './runtime';
import { isPortfolioProject, portfolioProject } from './portfolio-state';
import '../app/globals.css';
import './preview.css';
import '../app/workspace-design.css';
import '../app/site-ultra.css';

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
  const { demo } = useWorkspaceRuntime();
  const client = params.get('client');
  const invite = demo?.onboarding ? params.get('invite') : null;
  const receipt = params.get('receipt');
  const receiptPdf = params.get('receiptPdf');
  const drawing = params.get('drawing');
  const activeDocument = drawing?.split(':') ?? [];
  const sample = client ? portfolioProject(client) : undefined;
  if (!client && !invite && !receipt && !receiptPdf && !drawing) return <Workspace />;
  const returnTo = (demo?.onboarding ? demo.onboardingHref : demo?.portfolio?.href) ?? (drawing || client === clientUpdatesSampleId ? "./?view=design" : "./?view=finance");
  const documentName = activeDocument.length === 2 && isPortfolioProject(activeDocument[0])
    ? portfolioProject(activeDocument[0])!.code + '-' + activeDocument[1] + '.pdf'
    : 'coreconstruct-drawing.pdf';
  return <>
    <div className="demo-return"><a href={returnTo}>← {demo?.onboarding ? 'Back to workspace setup' : demo?.portfolio ? 'Back to project portfolio' : 'Back to workspace'}</a><span>Fictional sample records</span></div>
    {invite ? <JoinClient token={invite} /> : drawing ? <PdfDownload path={'/api/files/' + encodeURIComponent(drawing)} title="Project document" filename={documentName} />
      : receipt ? <ReceiptStatus id={receipt} org="" />
        : receiptPdf ? <PdfDownload path={'/api/receipts/' + encodeURIComponent(receiptPdf)} title="Sample receipt" filename="coreconstruct-sample-receipt.pdf" />
          : <PortalClient projectId={client!} sampleSummary={sample && { code: sample.code, client: sample.client, start: sample.start, type: sample.type }} />}
  </>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="preview-loading" role="status">Opening the CoreConstruct demo…</p>);
createDemoRuntime().then((runtime) => {
  if (runtime.demo.billing) document.title = 'CoreConstruct · Test subscription billing';
  else if (runtime.demo.onboarding) document.title = 'CoreConstruct · Ridgeway Works onboarding';
  else if (runtime.demo.scorecard) document.title = 'CoreConstruct · Pilot scorecard';
  else if (runtime.demo.portfolio) document.title = 'CoreConstruct · Five-year project portfolio';
  root.render(<WorkspaceRuntimeContext.Provider value={runtime}><Demo /></WorkspaceRuntimeContext.Provider>);
}).catch(() => {
  root.render(<p className="preview-loading" role="alert">CoreConstruct could not open browser storage. Try refreshing the page.</p>);
});
