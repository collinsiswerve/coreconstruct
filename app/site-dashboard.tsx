'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, Clock3, HardHat, Wallet } from 'lucide-react';
import { addDays, dateKey, displayDate, kes, totals, type Project, type State } from '../lib/domain';
import { compactKes, fullDate } from '../lib/display';
import { canViewProfit, forecastNeedsReview, reviewFigures } from '../lib/project-finance';
import type { ActionItem, Role, SuiteState } from '../lib/suite-types';

export function ProjectPosition({ state, project, role, openFinance }: {
  state: SuiteState; project: Project; role: Role; openFinance: () => void;
}) {
  const amounts = totals(state, project.id);
  const review = canViewProfit(role) ? state.suite.finance.reviews[project.id] : undefined;
  const figures = review ? reviewFigures(review) : null;
  const stale = review ? forecastNeedsReview(state, project, review,
    project.contractCents + state.suite.variations.filter(v => v.projectId === project.id && v.status === 'accepted')
      .reduce((total, v) => total + v.clientDeltaCents, 0)) : false;
  const latest = state.reports.filter(note => note.projectId === project.id)
    .slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  return <section className="ultra-position" aria-labelledby="position-heading">
    <div className="ultra-section-heading"><h2 id="position-heading">Project position</h2><span>Latest project totals</span></div>
    <div className={'ultra-kpis' + (canViewProfit(role) ? ' has-forecast' : '')}>
      {canViewProfit(role) && <button className="metric ultra-kpi ultra-kpi-hero" onClick={openFinance}>
        <span className="ultra-kpi-label">Forecast at Completion <ChevronRight size={18} aria-hidden="true" /></span>
        <strong aria-label={figures ? kes(figures.forecastCost) : undefined}>{figures ? compactKes(figures.forecastCost) : 'Estimate needed'}</strong>
        <span className="ultra-kpi-note">{review ? `${stale ? 'Review needed' : 'Reviewed final cost'} · ${fullDate(review.asOf)}` : 'Add a dated finance review'}</span>
      </button>}
      {[
        ['Approved Costs', amounts.incurred, 'Project to date'],
        ['Confirmed Payments Out', amounts.cashPaid, 'Payments and worker advances'],
        ['Balance to Pay', amounts.outstanding, 'On approved items'],
      ].map(([label, value, note]) => <button className="metric ultra-kpi" key={label} onClick={openFinance}>
        <span className="ultra-kpi-label">{label}<ChevronRight size={18} aria-hidden="true" /></span>
        <strong aria-label={kes(Number(value))}>{compactKes(Number(value))}</strong>
        <span className="ultra-kpi-note">{note}</span>
      </button>)}
      <ProgressCard project={project} reported={latest?.weekStart} />
    </div>
  </section>;
}

export function ProgressCard({ project, reported }: { project: Project; reported?: string }) {
  const progress = Math.max(0, Math.min(100, project.progress));
  return <article className="metric ultra-kpi ultra-progress" data-complete={progress === 100}>
    <span className="ultra-kpi-label">Site Progress <HardHat size={20} aria-hidden="true" /></span>
    <strong>{progress}%</strong>
    <div className="ultra-progress-track" role="progressbar" aria-label="Reported site progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: progress + '%' }} />
    </div>
    <span className="ultra-kpi-note">{progress === 100 && <CheckCircle2 size={16} aria-hidden="true" />}{project.stage || 'Awaiting site update'}</span>
    {reported && <span className="ultra-kpi-date">Reported {fullDate(reported)}</span>}
  </article>;
}

export function FieldWork({ actions, kind, full = false, openItem, viewAll, add }: {
  actions: ActionItem[]; kind: 'rfi' | 'task'; full?: boolean;
  openItem: (item: ActionItem) => void; viewAll?: () => void; add?: () => void;
}) {
  const [filter, setFilter] = useState('open');
  const today = dateKey();
  const records = actions.filter(item => kind === 'rfi' ? item.kind === 'rfi' : item.kind !== 'rfi');
  const open = records.filter(item => item.status === 'open');
  const overdue = open.filter(item => item.dueDate < today);
  const filtered = records.filter(item => filter === 'all' || (filter === 'overdue'
    ? item.status === 'open' && item.dueDate < today : item.status === filter));
  const sorted = filtered.slice().sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed')
    || a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const shown = full ? sorted : sorted.slice(0, 3);
  return <section className={'panel ultra-work-panel' + (full ? ' ultra-work-full' : '')} aria-label={kind === 'rfi' ? 'RFI tracker' : 'Priority tasks'}>
    <div className="panel-heading"><div><h2>{kind === 'rfi' ? 'RFIs' : 'Priority tasks'}</h2>
      <p>{overdue.length > 0 && <span className="ultra-overdue"><AlertCircle size={16} aria-hidden="true" />{overdue.length} overdue</span>}
        {overdue.length > 0 && ' · '}{open.length} open</p></div>
      {viewAll && <button className="text-button" onClick={viewAll}>View all <ArrowRight size={16} aria-hidden="true" /></button>}
      {full && add && <button className="btn primary" onClick={add}>Add {kind === 'rfi' ? 'RFI' : 'task'}</button>}
    </div>
    {full && <div className="ultra-filters" role="group" aria-label="Filter records">{[
      ['open', 'Open'], ['overdue', 'Overdue'], ['closed', 'Completed'], ['all', 'All records'],
    ].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}
    <div className="ultra-work-list">{shown.map(item => <button key={item.id} className="ultra-work-row" onClick={() => openItem(item)}>
      <span className={'ultra-work-symbol ' + (item.status === 'closed' ? 'is-complete' : item.dueDate < today ? 'is-overdue' : '')}>
        {item.status === 'closed' ? <CheckCircle2 size={21} aria-hidden="true" /> : item.dueDate < today ? <AlertCircle size={21} aria-hidden="true" /> : <Clock3 size={21} aria-hidden="true" />}
      </span>
      <span><strong>{item.title}</strong><small>{item.owner} · Due {fullDate(item.dueDate)}</small>
        <span className="ultra-row-status">{item.status === 'closed' ? 'Completed' : item.dueDate < today ? 'Overdue' : 'Open'} · {item.kind === 'rfi' ? 'RFI' : item.kind === 'snag' ? 'Snag' : item.kind === 'instruction' ? 'Instruction' : 'Task'}</span>
      </span><ChevronRight size={19} aria-hidden="true" />
    </button>)}</div>
    {!shown.length && <div className="ultra-list-empty"><CheckCircle2 size={24} aria-hidden="true" /><p>{filter === 'overdue' ? 'No overdue records' : filter === 'closed' ? 'No completed records yet' : 'No open ' + (kind === 'rfi' ? 'RFIs' : 'tasks')}</p>
      {add && <button className="text-button" onClick={add}>Add {kind === 'rfi' ? 'RFI' : 'task'}</button>}</div>}
  </section>;
}

export function CostOverview({ state, projectId, week }: { state: State; projectId: string; week: string }) {
  const [selected, setSelected] = useState(5);
  const [showData, setShowData] = useState(false);
  const points = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(week, (index - 5) * 7);
    const end = addDays(start, 6);
    const expenses = state.expenses.filter(item => item.projectId === projectId && item.status === 'approved'
      && !item.opening && item.date >= start && item.date <= end).reduce((sum, item) => sum + item.amountCents, 0);
    const wages = state.wagebills.filter(item => item.projectId === projectId && item.status === 'approved'
      && item.weekStart === start).reduce((sum, item) => sum + item.grossCents, 0);
    return { start, value: expenses + wages };
  });
  const largest = Math.max(1, ...points.map(point => point.value));
  const total = points.reduce((amount, point) => amount + point.value, 0);
  return <section className="panel ultra-cost-panel" aria-label="Cost overview">
    <div className="panel-heading"><div><h2>Cost overview</h2><p>Approved costs by work week</p></div>
      <button className="text-button" aria-expanded={showData} onClick={() => setShowData(!showData)}>{showData ? 'Hide data' : 'View data'}</button></div>
    <div className="ultra-chart-scale"><span>KSh</span><span>{compactKes(largest)}</span></div>
    <div className="ultra-cost-bars" role="group" aria-label="Select a week to inspect its approved costs">
      {points.map((point, index) => <button key={point.start} className="ultra-cost-column" aria-pressed={selected === index}
        aria-label={`Week of ${fullDate(point.start)}, ${kes(point.value)}`} onClick={() => setSelected(index)}>
        <span className="ultra-bar-track"><span className="ultra-bar" style={{ height: Math.max(point.value ? 3 : 0, point.value / largest * 100) + '%' }} /></span>
        <span className="ultra-bar-date">{displayDate(point.start)}</span>
      </button>)}
    </div>
    <div className="ultra-chart-detail" role="status"><span>Week of {fullDate(points[selected].start)}</span><strong>{kes(points[selected].value)}</strong></div>
    <div className="ultra-chart-total"><Wallet size={17} aria-hidden="true" /><span>Six-week total</span><strong>{kes(total)}</strong></div>
    {showData && <div className="table-scroll"><table><caption className="sr-only">Approved weekly costs</caption><thead><tr><th scope="col">Week starting</th><th scope="col" className="numeric">Approved costs</th></tr></thead>
      <tbody>{points.map(point => <tr key={point.start}><td>{fullDate(point.start)}</td><td className="numeric">{kes(point.value)}</td></tr>)}</tbody></table></div>}
  </section>;
}
