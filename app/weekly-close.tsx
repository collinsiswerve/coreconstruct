import { ArrowRight, Sparkles } from 'lucide-react';
import { displayDate, kes } from '../lib/domain';
import { weeklyClose } from '../lib/weekly-close';
import type { SuiteState } from '../lib/suite-types';
import { Badge } from './ui';

type CloseView = 'wagebills' | 'expenses' | 'materials' | 'reports' | 'finance';
type Props = {
  state: SuiteState;
  projectId: string;
  week: string;
  saving: boolean;
  canOpenSample: boolean;
  openSample: () => void;
  navigate: (view: CloseView) => void;
};

export function WeeklyClose({ state, projectId, week, saving, canOpenSample, openSample, navigate }: Props) {
  const close = projectId ? weeklyClose(state, projectId, week) : null;
  return <section className="panel suite-panel weekly-close" aria-labelledby="weekly-close-heading">
    <div className="panel-heading">
      <div>
        <h2 id="weekly-close-heading">Weekly close</h2>
        <p>{close ? `${displayDate(week)} – ${displayDate(close.end)} ${close.end.slice(0, 4)}` : 'Select a project to review its weekly records.'}</p>
      </div>
      {canOpenSample && <button className="btn" disabled={saving} onClick={openSample}><Sparkles size={15} />Open sample weekly close</button>}
    </div>
    {close && <>
      <ul className="close-checks" aria-label="Weekly review checklist">
        {close.hasLabour && <li><span>Wagebill</span>
          <Badge tone={close.bill?.status === 'approved' ? 'green' : close.hasAttendance ? 'amber' : 'neutral'}>
            {close.bill?.status === 'approved' ? 'Approved' : close.bill?.status === 'submitted' ? 'Awaiting approval' : close.hasAttendance ? 'Ready to prepare' : 'No attendance this week'}
          </Badge>
          <button className="text-button" onClick={() => navigate('wagebills')}>Wagebills <ArrowRight size={14} /></button>
        </li>}
        <li><span>Submitted expenses</span>
          <Badge tone={close.pendingCosts ? 'amber' : 'green'}>{close.pendingCosts ? close.pendingCosts + ' awaiting review' : 'None awaiting review'}</Badge>
          <button className="text-button" onClick={() => navigate('expenses')}>Expenses <ArrowRight size={14} /></button>
        </li>
        {close.hasMaterials && <li><span>Open procurement submissions</span>
          <Badge tone={close.pendingProcurement ? 'amber' : 'green'}>{close.pendingProcurement ? close.pendingProcurement + ' awaiting review' : 'None awaiting review'}</Badge>
          <button className="text-button" onClick={() => navigate('materials')}>Materials &amp; store <ArrowRight size={14} /></button>
        </li>}
        {close.needsReport && <li><span>Weekly client update</span>
          <Badge tone={close.reportPublished ? 'green' : 'amber'}>{close.reportPublished ? 'Published' : close.report ? 'Draft' : 'To prepare'}</Badge>
          <button className="text-button" onClick={() => navigate('reports')}>Weekly report <ArrowRight size={14} /></button>
        </li>}
      </ul>
      <div className="settings-body close-balances">
        <div className="close-balances-heading">
          <h3>Current project balances</h3>
          <Badge tone={close.balancesReconcile ? 'green' : 'amber'}>{close.balancesReconcile ? 'Cost ledger reconciles' : 'Cost ledger needs review'}</Badge>
        </div>
        <div className="pilot-score-grid">
          {([
            ['Approved costs', close.ledger.incurred],
            ['Confirmed payments out', close.ledger.cashPaid],
            ['Approved costs due', close.ledger.outstanding],
            ['Open purchase commitments', close.commitments],
          ] as const).map(([label, cents]) => <div key={label}><span>{label}</span><strong>{kes(cents)}</strong></div>)}
        </div>
        {close.ledger.unallocatedAdvances > 0 && <p>{kes(close.ledger.unallocatedAdvances)} in advances awaiting wagebill allocation.</p>}
        <div className="close-balances-heading close-receipts">
          <span>Client receipts to date <strong>{kes(close.clientReceipts)}</strong></span>
          <button className="text-button" onClick={() => navigate('finance')}>Project finance <ArrowRight size={14} /></button>
        </div>
      </div>
    </>}
  </section>;
}
