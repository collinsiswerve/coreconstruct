'use client';

import { useState } from 'react';
import { ArrowRight, Building2, CalendarDays, LayoutGrid, List, MapPin } from 'lucide-react';
import { kes } from '../lib/domain';
import { canViewProfit, reviewFigures } from '../lib/project-finance';
import { projectFinancials } from '../lib/suite';
import type { Actor, SuiteState } from '../lib/suite-types';
import { Badge } from './ui';

export function PortfolioPanel({ state, actor, href, onOpen }: {
  state: SuiteState;
  actor: Actor;
  href: (path: string) => string;
  onOpen: (id: string, view: 'overview' | 'finance') => void;
}) {
  const [year, setYear] = useState('all');
  const [phase, setPhase] = useState('all');
  const [layout, setLayout] = useState<'cards' | 'table'>('cards');
  const projects = state.projects.filter(project => project.sampleWalkthrough === 'five-year-portfolio').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const years = [...new Set(projects.map(project => project.createdAt.slice(0, 4)))];
  const displayed = projects.filter(project =>
    (year === 'all' || project.createdAt.startsWith(year))
    && (phase === 'all' || (project.progress === 100 ? phase === 'handed-over' : phase === 'active')));
  const readableFinance = actor.role === 'admin' || projects.some(project => canViewProfit(actor.projectRoles[project.id]));
  const viewContract = (id: string) => ['admin', 'pm', 'finance'].includes(actor.role === 'admin' ? 'admin' : actor.projectRoles[id]);
  const forecast = (id: string) => {
    const review = state.suite.finance.reviews[id];
    return review ? reviewFigures(review).forecastProfit : null;
  };
  const contract = (id: string) => viewContract(id) ? kes(projectFinancials(state, id).contract) : '—';
  const completed = projects.filter(project => project.progress === 100).length;
  const moneyFormat = (value: number) => value < 0 ? '−' + kes(Math.abs(value)) : kes(value);
  const valueLabel = (mode: 'fixed' | 'open') => mode === 'fixed' ? 'Contract incl. variations' : 'Open-book estimate';

  return <section className="portfolio-section" aria-label="Fictional firm portfolio">
    <div className="portfolio-summary" aria-label="Portfolio totals">
      <div><Building2 size={18} /><span>Projects</span><strong>{projects.length}</strong></div>
      <div><CalendarDays size={18} /><span>Start years</span><strong>{years.length > 1 ? years[0] + '–' + years.at(-1) : years[0]}</strong></div>
      <div><span>Handed over</span><strong>{completed}</strong></div>
      <div><span>Active at review</span><strong>{projects.length - completed}</strong></div>
    </div>
    <div className="portfolio-toolbar">
      <div className="portfolio-filters">
        <label>Start year<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{years.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Project status<select value={phase} onChange={event => setPhase(event.target.value)}><option value="all">All projects</option><option value="active">Active</option><option value="handed-over">Handed over</option></select></label>
      </div>
      <div className="portfolio-layout" aria-label="Portfolio layout">
        <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}><LayoutGrid size={16} /> Cards</button>
        <button type="button" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><List size={17} /> Compare</button>
      </div>
    </div>
    {displayed.length === 0 ? <div className="panel panel-copy">No sample projects match these filters.</div>
      : layout === 'table' ? <div className="panel table-scroll"><table aria-label="Project portfolio comparison">
        <thead><tr><th scope="col">Project</th><th scope="col">Started</th><th scope="col">Progress</th>
          <th scope="col">Contract or estimate</th>{readableFinance && <th scope="col">Forecast profit or loss</th>}
          <th scope="col">Client page</th></tr></thead>
        <tbody>{displayed.map(project => {
          const profit = readableFinance ? forecast(project.id) : null;
          return <tr key={project.id}>
            <th scope="row"><button type="button" className="text-button" onClick={() => onOpen(project.id, 'overview')}>{project.name}</button>
              <small className="table-subtext">{project.location}</small></th>
            <td>{project.createdAt.slice(0, 4)}</td>
            <td>{project.progress}% · {project.stage}</td>
            <td>{contract(project.id)}<small className="table-subtext">{valueLabel(project.mode)}</small></td>
            {readableFinance && <td><button type="button" className="text-button" onClick={() => onOpen(project.id, 'finance')}><span className={profit !== null && profit < 0 ? 'portfolio-loss' : undefined}>{profit === null ? 'Review pending' : moneyFormat(profit)}</span></button></td>}
            <td><a className="btn small" href={href('/client/' + project.id)}>Client page <ArrowRight size={13} /></a></td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="portfolio-grid">
        {displayed.map(project => {
          const render = state.suite.media.find(item => item.projectId === project.id && item.fileId === project.id + ':concept.jpg');
          const detail = state.suite.projectDetails[project.id];
          const profit = readableFinance ? forecast(project.id) : null;
          return <article className="panel portfolio-card" key={project.id}>
            {render && <img src={href('/api/files/' + encodeURIComponent(render.fileId))} alt={render.caption} loading="lazy" width="900" height="476" />}
            <div className="portfolio-card-body">
              <div className="portfolio-card-top"><span>{detail?.lrNumber.replace(/^FICTIONAL-/, '') || project.createdAt.slice(0, 4)}</span>
                <Badge tone={project.progress === 100 ? 'green' : 'neutral'}>{project.stage}</Badge></div>
              <h2>{project.name}</h2>
              <p className="portfolio-location"><MapPin size={13} />{project.location.replace(' · fictional site', '')}</p>
              <dl className="portfolio-card-values">
                <div><dt>{valueLabel(project.mode)}</dt><dd>{contract(project.id)}</dd></div>
                {profit !== null && <div><dt>Forecast profit or loss</dt><dd className={profit < 0 ? 'portfolio-loss' : undefined}>{moneyFormat(profit)}</dd></div>}
              </dl>
              <div className="portfolio-progress"><progress value={project.progress} max="100" aria-label={'Reported progress for ' + project.name} /><span>{project.progress}%</span></div>
              <div className="portfolio-card-actions"><button type="button" className="btn small primary" onClick={() => onOpen(project.id, 'overview')}>Open project</button>
                <a className="btn small" href={href('/client/' + project.id)}>Client page <ArrowRight size={13} /></a></div>
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
