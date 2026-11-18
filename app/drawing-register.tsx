'use client';

import { FileText, Upload } from 'lucide-react';
import { displayDate } from '../lib/domain';
import type { Actor, Drawing, Role, SuiteState } from '../lib/suite-types';
import { Badge } from './ui';

type DrawingRegisterProps = {
  state: SuiteState; drawings: Drawing[]; role: Role; actor: Actor; saving: boolean;
  fileUrl: (id: string) => string; upload: () => void;
  command: (type: string, payload: Record<string, unknown>, message?: string) => Promise<boolean>;
};

export function DrawingRegister({ state, drawings, role, actor, saving, fileUrl, upload, command }: DrawingRegisterProps) {
  const current = drawings.filter(row => row.status === 'current');
  const archive = drawings.filter(row => row.status !== 'current');
  const canIssue = role === 'admin' || role === 'pm' || role === 'architect';
  const canPublish = role === 'admin' || role === 'pm';

  function row(drawing: Drawing) {
    const acknowledgements = state.suite.acknowledgements.filter(item => item.drawingId === drawing.id);
    const acknowledged = acknowledgements.some(item => item.userId === actor.id);
    const latest = !drawings.some(item => item.sheetCode.toLowerCase() === drawing.sheetCode.toLowerCase()
      && item.revision > drawing.revision);
    return <tr key={drawing.id}>
      <th scope="row">{drawing.sheetCode} · {drawing.title}<small className="table-subtext">{drawing.discipline} · {drawing.category}</small></th>
      <td>Rev {drawing.revision}{drawing.issuedAt && <small className="table-subtext">Issued {displayDate(drawing.issuedAt)}</small>}</td>
      <td><Badge tone={drawing.status === 'current' ? 'green' : drawing.status === 'draft' ? 'amber' : 'red'}>{drawing.status}</Badge>
        {canIssue && drawing.status === 'current' && <small className="table-subtext">{drawing.published ? 'Published to client' : 'Internal issue'}</small>}</td>
      <td>{acknowledgements.length ? <details className="drawing-acknowledgements">
        <summary>{acknowledgements.length} acknowledged</summary>
        <ul>{acknowledgements.map(item => <li key={item.userId}>{item.userId === actor.id ? 'You' :
          canIssue ? item.name || 'Project team member' : 'Project team member'} · {displayDate(item.at)}</li>)}</ul>
      </details> : '—'}</td>
      <td><div className="row-actions">
        <a className="btn small" href={fileUrl(drawing.fileId)} target="_blank" rel="noopener noreferrer"><FileText size={14} />Open PDF</a>
        {drawing.status === 'draft' && canIssue && latest && <button className="btn small primary" disabled={saving}
          onClick={() => void command('drawing.issue', { drawingId: drawing.id }, 'Drawing issued. Previous current revision superseded.')}>Issue revision {drawing.revision}</button>}
        {drawing.status === 'current' && (acknowledged ? <Badge tone="green">Acknowledged by you</Badge>
          : <button className="btn small" disabled={saving} onClick={() => void command('drawing.acknowledge',
            { drawingId: drawing.id, revision: drawing.revision }, 'Drawing revision acknowledged.')}>Acknowledge revision {drawing.revision}</button>)}
        {drawing.status === 'current' && canPublish && <button className="btn small" disabled={saving} onClick={() => void command(
          'drawing.publish', { drawingId: drawing.id, published: !drawing.published },
          drawing.published ? 'Drawing removed from the client view.' : 'Drawing published to the client.')}>
          {drawing.published ? 'Unpublish drawing' : 'Publish to client'}
        </button>}
      </div></td>
    </tr>;
  }

  function table(label: string, records: Drawing[]) {
    return <div className="table-scroll"><table aria-label={label}>
      <thead><tr><th scope="col">Drawing</th><th scope="col">Revision</th><th scope="col">Status</th>
        <th scope="col">Acknowledgements</th><th scope="col">Actions</th></tr></thead>
      <tbody>{records.map(row)}</tbody>
    </table></div>;
  }

  return <section className="panel suite-panel drawing-register">
    <div className="panel-heading">
      <div><h2>Current construction drawings</h2><p>Open the issued revision before starting work.</p></div>
      {canIssue && <button className="btn primary" onClick={upload}><Upload size={15} />Upload document</button>}
    </div>
    {current.length ? table('Current construction drawings', current) : <p className="panel-copy">No construction drawings have been issued.</p>}
    {archive.length > 0 && canIssue && <details className="drawing-history" open={archive.some(drawing => drawing.status === 'draft') || undefined}>
      <summary>Drafts and revision history <span>{archive.length}</span></summary>
      {table('Drafts and revision history', archive)}
    </details>}
  </section>;
}
