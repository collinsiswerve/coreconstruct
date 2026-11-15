'use client';

import { useState } from 'react';
import { AlertCircle, CalendarDays, Clock3, Download, Plus, UsersRound } from 'lucide-react';
import { dateKey, displayDate, kes } from '../lib/domain';
import { hasDifference, pilotExportRows, pilotSummary, pilotTargets, preparationMinutes, renewalLabels,
  type PilotBaseline, type PilotCycle, type PilotRenewal, type ProjectPilotMeasurements } from '../lib/pilot-scorecard';
import { SuiteForm, type FormField, type SuiteFormSpec } from './suite-form';
import { Badge } from './ui';
import { useWorkspaceRuntime } from './workspace-runtime';

type Props = {
  firm: string;
  projectId: string;
  projectName: string;
  week: string;
  measurements?: ProjectPilotMeasurements;
  renewal?: PilotRenewal;
  saving: boolean;
  error: string;
  command: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>;
  exportCsv: (filename: string, rows: unknown[][]) => void;
};

const metricNumber = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 });
const dayLabel = (day: string) => displayDate(day) + ' ' + day.slice(0, 4);

function count(name: string, label: string, value?: number): FormField {
  return { name, label, type: 'number', value, min: '0', step: '1', max: '999999', required: true };
}
function money(name: string, label: string, cents?: number, required = true): FormField {
  return { name, label, type: 'number', value: cents === undefined ? undefined : cents / 100,
    min: '0', step: '0.01', required };
}
const evidenceField = (value = '', required = true): FormField => ({
  name: 'evidence', label: 'Evidence reference', value, required,
});
const dateField = (name: string, label: string, value: string, min?: string): FormField => ({
  name, label, type: 'date', value, min, max: dateKey(), required: true,
});
function preparation(record?: PilotBaseline | PilotCycle) {
  return [
    count('wagebillMinutes', 'Wagebill preparation (minutes)', record?.wagebillMinutes),
    count('reportMinutes', 'Weekly report preparation (minutes)', record?.reportMinutes),
  ];
}

export function PilotScorecard({ firm, projectId, projectName, week, measurements, renewal, saving, error, command, exportCsv }: Props) {
  const { demo } = useWorkspaceRuntime();
  const [form, setForm] = useState<SuiteFormSpec | null>(null);
  const scores = pilotSummary(measurements);
  const selected = measurements?.cycles[week];
  const percent = (value: number) => metricNumber.format(value) + '%';
  const minutes = (value: number) => metricNumber.format(value) + ' min';

  function editBaseline() {
    setForm({
      title: scores.baseline ? 'Edit existing-process baseline' : 'Record existing-process baseline', type: 'pilot.baseline.save',
      payload: { projectId, revision: scores.baseline?.revision ?? 0 },
      extra: 'Time the same wagebill and reporting tasks you plan to measure in CoreConstruct.',
      fields: [dateField('weekStart', 'Baseline week starting (Monday)', scores.baseline?.weekStart ?? week),
        ...preparation(scores.baseline), evidenceField(scores.baseline?.evidence)],
    });
  }

  function editCycle(cycle?: PilotCycle) {
    setForm({
      title: cycle ? 'Edit weekly pilot measurements' : 'Record weekly pilot measurements', type: 'pilot.week.save',
      payload: { projectId, weekStart: cycle?.weekStart ?? week, revision: cycle?.revision ?? 0 },
      extra: (cycle ? 'Week of ' + dayLabel(cycle.weekStart) + '. ' : '') + 'Use the same cutoff each week. Enter zero when evidence confirms zero.',
      fields: [
        ...(!cycle ? [dateField('weekStart', 'Week starting (Monday)', week)] : []),
        dateField('closedOn', 'Date closed', cycle?.closedOn ?? dateKey(), cycle?.weekStart),
        ...preparation(cycle),
        count('scheduled', 'Records and updates due by cutoff', cycle?.scheduled),
        count('onTime', 'Records and updates submitted on time', cycle?.onTime),
        money('wageDifference', 'Unexplained wage difference (KSh)', cycle?.wageDifferenceCents),
        money('costDifference', 'Unexplained costs and payments difference (KSh)', cycle?.costDifferenceCents),
        money('clientDifference', 'Unexplained client balance difference (KSh)', cycle?.clientDifferenceCents),
        count('supportMinutes', 'Support time (minutes)', cycle?.supportMinutes),
        evidenceField(cycle?.evidence),
        { name: 'notes', label: 'Notes or follow-up', type: 'textarea', value: cycle?.notes },
      ],
    });
  }

  function editRenewal() {
    setForm({
      title: 'Record firm renewal response', type: 'pilot.renewal.save',
      payload: { revision: renewal?.revision ?? 0 },
      extra: 'Use the price discussed with the firm. A willing response requires the quoted monthly price and an evidence reference.',
      fields: [
        { name: 'response', label: 'Renewal response', type: 'select', required: true, value: renewal?.response ?? 'pending',
          options: Object.entries(renewalLabels).map(([value, label]) => ({ value, label })) },
        dateField('checkedOn', 'Discussion or review date', renewal?.checkedOn ?? dateKey()),
        money('monthlyPrice', 'Quoted monthly price (KSh)', renewal?.monthlyPriceCents || undefined, false),
        evidenceField(renewal?.evidence, false),
      ],
    });
  }

  return <section className="panel pilot-scorecard" aria-labelledby="scorecard-heading">
    <div className="panel-heading">
      <div><h2 id="scorecard-heading">Pilot scorecard</h2><p>{projectName} · {scores.cycles.length} weekly {scores.cycles.length === 1 ? 'close' : 'closes'} recorded</p></div>
      <div className="row-actions">
        {demo?.scorecardHref && !demo.scorecard && <a className="btn" href={demo.scorecardHref}>Open scorecard rehearsal</a>}
        <button className="btn" type="button" disabled={!scores.baseline && !scores.cycles.length && !renewal}
          onClick={() => exportCsv('coreconstruct-pilot-measurements-' + dateKey() + '.csv', pilotExportRows(firm, projectName, measurements, renewal))}>
          <Download size={15} aria-hidden="true" /> Export CSV
        </button>
        <button className="btn primary" type="button" disabled={saving} onClick={() => editCycle(selected)}>
          {!selected && <Plus size={15} aria-hidden="true" />}{selected ? 'Edit selected week' : 'Record weekly close'}
        </button>
      </div>
    </div>
    <div className="pilot-scorecard-body">
      {demo?.scorecard && <div className="notice subtle pilot-scorecard-example">
        <span>Fictional measurements. Changes stay in this browser.</span>
        <button type="button" className="text-button" onClick={() => {
          if (window.confirm('Reset the fictional pilot measurements in this browser?')) void demo.reset();
        }}>Reset scorecard demo</button>
      </div>}
      <dl className="pilot-metrics">
        <div><dt><Clock3 size={15} aria-hidden="true" /> Average preparation</dt>
          <dd>{scores.averageMinutes === null ? '—' : minutes(scores.averageMinutes)}</dd>
          <span>{scores.reduction === null ? 'Record a baseline and weekly close to compare' :
            percent(Math.abs(scores.reduction)) + (scores.reduction >= 0 ? ' less time' : ' more time')} · Target {pilotTargets.reduction}% less</span></div>
        <div><dt><CalendarDays size={15} aria-hidden="true" /> Records on time</dt>
          <dd>{scores.onTimePercent === null ? '—' : percent(scores.onTimePercent)}</dd>
          <span>{scores.onTime} of {scores.scheduled} due · Target {pilotTargets.onTime}%</span></div>
        <div><dt><AlertCircle size={15} aria-hidden="true" /> Weeks with differences</dt>
          <dd>{scores.cycles.length ? scores.exceptions : '—'}</dd>
          <span>Target zero unexplained differences</span></div>
        <div><dt><UsersRound size={15} aria-hidden="true" /> Support time</dt>
          <dd>{scores.cycles.length ? minutes(scores.support) : '—'}</dd>
          <span>Total across recorded weekly closes</span></div>
      </dl>
      <div className="pilot-scorecard-context">
        <article>
          <div><h3>Existing-process baseline</h3>
            <p>{scores.baseline ? minutes(preparationMinutes(scores.baseline)) + ' · Week of ' + dayLabel(scores.baseline.weekStart) : 'Record the time spent on a comparable week.'}</p>
            {scores.baseline && <small>{scores.baseline.evidence}</small>}
          </div>
          <button className="btn small" type="button" onClick={editBaseline}>{scores.baseline ? 'Edit baseline' : 'Record baseline'}</button>
        </article>
        <article>
          <div><h3>Firm renewal response</h3>
            <p>{renewal ? renewalLabels[renewal.response] + (renewal.monthlyPriceCents ? ' · ' + kes(renewal.monthlyPriceCents) + ' / month' : '') : 'Awaiting the firm’s response.'}</p>
            {renewal && <small>{dayLabel(renewal.checkedOn)}{renewal.evidence && ' · ' + renewal.evidence}</small>}
          </div>
          <button className="btn small" type="button" onClick={editRenewal}>{renewal ? 'Edit renewal response' : 'Record renewal response'}</button>
        </article>
      </div>
      {scores.cycles.length > 0 && <div className="table-scroll pilot-cycle-table"><table>
        <caption>Weekly pilot measurements</caption>
        <thead><tr><th scope="col">Week starting</th><th scope="col">Preparation</th><th scope="col">On time</th>
          <th scope="col">Reconciliation</th><th scope="col">Support</th><th scope="col">Evidence</th><th scope="col">Action</th></tr></thead>
        <tbody>{scores.cycles.map(cycle => <tr key={cycle.weekStart}>
          <th scope="row">{dayLabel(cycle.weekStart)}<small className="table-subtext">Closed {displayDate(cycle.closedOn)}</small></th>
          <td>{minutes(preparationMinutes(cycle))}</td>
          <td>{cycle.onTime} / {cycle.scheduled}</td>
          <td>{hasDifference(cycle) ? <details className="pilot-difference">
            <summary>Review difference</summary><dl>
              <div><dt>Wages</dt><dd>{kes(cycle.wageDifferenceCents)}</dd></div>
              <div><dt>Costs and payments</dt><dd>{kes(cycle.costDifferenceCents)}</dd></div>
              <div><dt>Client balance</dt><dd>{kes(cycle.clientDifferenceCents)}</dd></div>
            </dl>
          </details> : <Badge tone="green">Clear</Badge>}</td>
          <td>{minutes(cycle.supportMinutes)}</td>
          <td><span className="pilot-evidence">{cycle.evidence}</span>{cycle.notes && <small className="table-subtext pilot-evidence">{cycle.notes}</small>}</td>
          <td><button className="btn small" type="button" aria-label={'Edit week of ' + dayLabel(cycle.weekStart)} onClick={() => editCycle(cycle)}>Edit</button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    {form && <SuiteForm spec={form} saving={saving} error={error} close={() => setForm(null)} submit={async (type, payload) => {
      const saved = await command(type, payload, 'Pilot measurements saved.');
      if (saved) setForm(null);
      return saved;
    }} />}
  </section>;
}
