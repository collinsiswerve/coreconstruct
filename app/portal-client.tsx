'use client';
import { useEffect,useState } from 'react';
import { Building2,CheckCircle2,Download,ExternalLink,FileText,MapPin,ShieldCheck } from 'lucide-react';
import { kes } from '../lib/domain';
import { brandForeground, fullDate } from '../lib/display';
import type { clientView } from '../lib/security';
import { WeeklyDownloads } from './weekly-downloads';
import { sampleEvidenceAsset } from '../lib/sample-client-updates';
import { Badge } from './ui';
import { loginPagePath } from '../lib/auth-navigation';
import { useWorkspaceRuntime } from './workspace-runtime';
type PortalData=ReturnType<typeof clientView>;
type SampleSummary = { code: string; client: string; start: string; type: string };
export function PortalClient({token,projectId,organizationId,sampleSummary}:{token?:string;projectId?:string;organizationId?:string;sampleSummary?:SampleSummary}){
 const { request: fetch, href, demo } = useWorkspaceRuntime();
 const [data,setData]=useState<PortalData|null>(null),[org,setOrg]=useState(''),[role,setRole]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const endpoint = projectId
   ? '/api/client-view?' + new URLSearchParams({ projectId, org: organizationId || org })
   : '/api/portal?' + new URLSearchParams({ token: token || '' });
 async function load(){try{const r=await fetch(endpoint,{cache:'no-store'}),v=await r.json() as {portal:PortalData;organizationId:string;actor:{role:string};error?:string};if(!r.ok)throw new Error(v.error||'Unable to open the client view.');setData(v.portal);setOrg(v.organizationId);setRole(v.actor.role);setError('');}catch(e){setData(null);setError(e instanceof Error?e.message:'Unable to connect.');}}
 useEffect(()=>{void load();},[token,projectId,organizationId]);
 async function decide(id:string,revision:number,decision:string,type='variation.decide'){setBusy(true);setError('');try{const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','x-organization-id':org},body:JSON.stringify({id:crypto.randomUUID(),type,payload:type==='design.accept'?{drawingId:id,revision}:{variationId:id,revision,decision}})}),v=await r.json() as {error?:string};if(!r.ok){if(r.status===409)await load();throw new Error(v.error||'Decision could not be recorded.');}setMessage('Your decision on revision '+revision+' has been recorded.');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to connect.');}finally{setBusy(false);}}
 const file = (id: string) => href('/api/files/' + encodeURIComponent(id) + '?org=' + encodeURIComponent(org));
 const mediaFile = (id: string) => {
   const sample = sampleEvidenceAsset(id);
   return sample ? href(sample) : file(id);
 };
 if(!data)return <div className="portal-shell"><div className="portal-login"><Building2 size={30}/><h1>Client project view</h1><p>{error||'Opening the published project records…'}</p>{error&&!demo&&<><a className="btn primary" href={loginPagePath(projectId ? '/client/' + encodeURIComponent(projectId) + '?org=' + encodeURIComponent(organizationId || '') : '/portal/' + token)} target="_top">Sign in with your invited account</a><button className="btn" onClick={()=>void load()}>Try again</button></>}</div></div>;
 const figures=data.figures as unknown as Record<string,number>,isFixed=data.project.mode==='fixed';
 const concepts = sampleSummary ? data.media.filter(item => item.caption.startsWith('Concept render · ')) : [];
 const evidence = data.media.filter(item => !concepts.includes(item));
 const reports = data.reports.slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart));
 const [latest, ...history] = reports;
 const awaitingDecision = data.variations.filter(item => item.status === 'sent');
 const decisionHistory = data.variations.filter(item => item.status !== 'sent');
 const invoiceBalance = data.milestones.reduce((sum, bill) => sum + Math.max(0, bill.amountCents - bill.appliedCents), 0);
 const drawingsToReview = role === 'client' && data.modules.design ? data.drawings.filter(drawing =>
   !drawing.designAccepted && (!sampleSummary || /^A-/.test(drawing.sheetCode))).length : 0;
 const brand = { '--brand-primary': data.brand.primary, '--brand-foreground': brandForeground(data.brand.primary) } as React.CSSProperties;

 function renderUpdate(report: PortalData['reports'][number]) {
   return <article className="portal-update" key={report.id}>
     <div className="portal-update-head"><time dateTime={report.weekStart}>Week of {fullDate(report.weekStart)}</time>
       <WeeklyDownloads endpoint={endpoint} weekStart={report.weekStart} /></div>
     <h3>{report.stage} · {report.progress}% reported progress</h3>
     <p className="pre-wrap">{report.summary}</p>
     <div className="report-two-col">
       {report.nextSteps && <div><h4>Next steps</h4><p className="pre-wrap">{report.nextSteps}</p></div>}
       {report.risks && <div><h4>Decisions and open issues</h4><p className="pre-wrap">{report.risks}</p></div>}
     </div>
   </article>;
 }

 function renderVariation(variation: PortalData['variations'][number]) {
   return <article className="portal-update portal-decision-entry" key={variation.id}>
     <div className="section-actions">
       <Badge tone={variation.status === 'accepted' ? 'green' : variation.status === 'sent' ? 'amber' : 'neutral'}>
         {variation.number} · Revision {variation.revision} · {variation.status === 'sent' ? 'Awaiting decision'
           : variation.status === 'accepted' ? 'Accepted' : 'Rejected'}
       </Badge>
       <strong>{kes(variation.amountCents)}</strong>
     </div>
     <h3>{variation.title}</h3>
     <p className="pre-wrap">{variation.description}</p>
     <p>Time assessment · {variation.days} days · {variation.affectsCompletion ? 'Affects completion forecast' : 'Activity effect only'}</p>
     {variation.programmeReason && <p>{variation.programmeReason}</p>}
     {variation.decisionAt && <p>Decision recorded for revision {variation.approvedRevision ?? variation.revision} · {fullDate(variation.decisionAt)}</p>}
     {variation.status === 'sent' && role === 'client' && <ClientDecision key={variation.id + ':' + variation.revision} busy={busy}
       revision={variation.revision} onDecision={decision => void decide(variation.id, variation.revision, decision)} />}
   </article>;
 }

 return <div className="portal-shell" style={brand}>
   <header className="portal-top"><div>{data.brand.logoFileId && <img src={file(data.brand.logoFileId)} alt={data.firm + ' logo'} />}
     <strong>{data.firm}</strong></div>
     <Badge><ShieldCheck size={14} aria-hidden="true" />{demo ? 'Sample client view' : 'Published project records'}</Badge>
   </header>
   <main className="portal-main">
     <div className="portal-hero"><h1>{data.project.name}</h1><p><MapPin size={16} aria-hidden="true" />{data.project.location}</p>
       {sampleSummary && <div className="sample-client-details"><span><b>Client</b> {sampleSummary.client}</span>
         <span><b>Project</b> {sampleSummary.code} · {sampleSummary.type}</span><span><b>Started</b> {fullDate(sampleSummary.start)}</span></div>}
       {role !== 'client' && <div className="notice subtle">Principal / PM preview. Client decisions require the assigned client’s account.</div>}
     </div>
     {error && <div className="notice error" role="alert">{error}</div>}
     {message && <div className="notice subtle" role="status"><CheckCircle2 size={16} />{message}</div>}
     <section className="portal-scorecard" aria-label="Project and payment summary">
       <div><span>Reported progress</span><strong>{data.project.progress}%</strong><small>{data.project.stage}</small></div>
       <div><span>{isFixed ? 'Contract including variations' : 'Approved costs + management fee'}</span><strong>{kes(isFixed ? figures.contractCents : figures.totalCents)}</strong></div>
       <div><span>Client payments recorded</span><strong>{kes(figures.receivedCents)}</strong></div>
       <div><span>{figures.balanceCents < 0 ? 'Credit balance' : isFixed ? 'Remaining contract balance' : 'Outstanding project balance'}</span><strong>{kes(Math.abs(figures.balanceCents))}</strong></div>
     </section>
     {data.project.currency !== 'KES' && <p className="notice subtle">Reference value {new Intl.NumberFormat('en', { style: 'currency', currency: data.project.currency }).format((isFixed ? figures.contractCents : figures.totalCents) / 100 / data.project.fxKesPerUnit)} · Exchange reference {fullDate(data.project.fxAsOf)} · Ledger in KES</p>}
     <div className="portal-summary-actions">
       {data.project.estimatedCompletion && <p>PM completion forecast <strong>{fullDate(data.project.estimatedCompletion)}</strong></p>}
       {data.milestones.length > 0 && <a href="#client-billing">Balance on published bills <strong>{kes(invoiceBalance)}</strong></a>}
       {data.project.latitude !== undefined && <a href={'https://www.google.com/maps/search/?api=1&query=' + data.project.latitude + ',' + data.project.longitude}
         target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true" />View plot location</a>}
     </div>
     {!!awaitingDecision.length && <section className="panel portal-panel">
       <div className="panel-heading"><h2>Changes for your decision</h2></div>{awaitingDecision.map(renderVariation)}
     </section>}
     <section className="panel portal-panel portal-latest">
       <div className="panel-heading">
         <h2>Latest progress update</h2>
         {drawingsToReview > 0 && <a className="btn" href="#client-drawings">Review drawings <Badge tone="amber">{drawingsToReview}</Badge></a>}
       </div>
       {latest ? renderUpdate(latest) : <p className="panel-copy">The team has not published a weekly update yet.</p>}
       {!!history.length && <details className="portal-history">
         <summary>Earlier updates ({history.length})</summary>{history.map(renderUpdate)}
       </details>}
     </section>
     {!!concepts.length && <section className="panel portal-panel sample-concept">
       <div className="panel-heading"><h2>Concept render</h2></div>
       {concepts.map(item => <figure key={item.id}><a href={mediaFile(item.fileId)} target="_blank" rel="noopener noreferrer">
         <img src={mediaFile(item.fileId)} alt={item.caption} loading="lazy" /></a><figcaption>{item.caption.replace('Concept render · ', '')}</figcaption>
       </figure>)}
     </section>}
 {evidence.length>0&&<section className="panel portal-panel"><div className="panel-heading"><h2>Reviewed site evidence</h2></div><div className="media-grid">{evidence.map(m=><article className="media-card" key={m.id}><a href={mediaFile(m.fileId)} target="_blank" rel="noopener noreferrer">{m.contentType==='video/mp4'?<video src={mediaFile(m.fileId)} controls preload="metadata"/>:<img src={mediaFile(m.fileId)} alt={m.caption} loading="lazy"/>}</a><div><Badge tone={m.locationStatus==='matched'?'green':'amber'}>{m.locationStatus==='matched'?'Reported location match':m.locationStatus+' location'}</Badge><p>{m.caption}</p><small>{m.stage} · {m.createdAt.slice(0,10)}</small></div></article>)}</div></section>}
 {data.modules.design&&<section id="client-drawings" className="panel portal-panel"><div className="panel-heading"><h2>Current published drawings</h2></div>{data.drawings.map(d=><div className="portal-file" key={d.id}><FileText size={20}/><div><strong>{d.sheetCode} · {d.title}</strong><small>Revision {d.revision} · current issued drawing</small></div><a className="btn small" href={file(d.fileId)} target="_blank" rel="noopener noreferrer">Open PDF <ExternalLink size={12}/></a>{d.designAccepted?<Badge tone="green">Design accepted</Badge>:role==='client'&&(!sampleSummary||/^A-/.test(d.sheetCode))&&<button className="btn small" disabled={busy} onClick={()=>void decide(d.id,d.revision,'accept','design.accept')}>Accept design revision {d.revision}</button>}</div>)}{!data.drawings.length&&<p className="panel-copy">No issued drawings have been published yet.</p>}</section>}
 {!!decisionHistory.length && <section className="panel portal-panel">
   <div className="panel-heading"><h2>Decision history</h2></div>{decisionHistory.map(renderVariation)}
 </section>}
 {data.milestones.length>0&&<section id="client-billing" className="panel portal-panel">
   <div className="panel-heading"><h2>Invoices and payment certificates</h2></div>
   {data.milestones.map(bill=><div className="portal-file" key={bill.id}><FileText size={20}/><div><strong>{bill.reference ? bill.reference+' · ' : ''}{bill.title}</strong>
   <small>{kes(bill.amountCents)} billed · {kes(bill.appliedCents)} received against this item · {kes(bill.amountCents-bill.appliedCents)} due</small></div></div>)}
 </section>}
 <section className="panel portal-panel"><div className="panel-heading"><h2>Payment receipts</h2></div>{data.receipts.map(r=><div className="portal-file" key={r.id}><FileText size={20}/><div><strong>{r.number} · {r.title}</strong><small>{r.date} · {kes(r.amountCents)}{r.voided?' · VOID':''}</small></div><a className="btn small" href={href(`/api/receipts/${r.id}?org=${encodeURIComponent(org)}`)} target="_blank" rel="noopener noreferrer"><Download size={12}/>PDF</a></div>)}{!data.receipts.length&&<p className="panel-copy">No payment receipts recorded yet.</p>}</section><footer className="portal-footer">Published by {data.firm}. Progress and evidence are firm-reported; CoreConstruct does not independently inspect construction work.</footer></main></div>;
}
function ClientDecision({busy,revision,onDecision}:{busy:boolean;revision:number;onDecision:(d:string)=>void}){const [confirmed,setConfirmed]=useState(false);return <div className="client-decision"><label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed revision {revision}, its scope, price and stated time effect, and I am authorised to decide.</span></label><div><button className="btn primary" disabled={busy||!confirmed} onClick={()=>onDecision('accept')}>Accept this revision</button><button className="btn" disabled={busy||!confirmed} onClick={()=>onDecision('reject')}>Reject this revision</button></div></div>;}
