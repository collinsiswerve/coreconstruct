'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, ClipboardList, ClipboardCheck, ExternalLink, FileText, HardHat, UsersRound } from 'lucide-react';
import { displayDate, kes, type Project } from '../lib/domain';
import { onboardingProgress, type TeamAccess } from '../lib/onboarding';
import type { SuiteState } from '../lib/suite-types';
import { Badge } from './ui';
import { useWorkspaceRuntime } from './workspace-runtime';

type SetupView = 'team' | 'boq' | 'attendance' | 'pilot' | 'reports' | 'site';
type Props = {
  state: SuiteState;
  project?: Project;
  week: string;
  organizationId: string;
  editFirm: () => void;
  editProject: () => void;
  navigate: (view: SetupView, week?: string) => void;
};
type SetupStep = {
  title: string;
  detail: string;
  complete: boolean;
  icon: typeof Building2;
  action?: { label: string; run: () => void };
};

const accessLabels = { assigned: 'assigned', invited: 'invitation pending', missing: 'unassigned' };

export function WorkspaceSetup({ state, project, week, organizationId, editFirm, editProject, navigate }: Props) {
  const { request, href, demo } = useWorkspaceRuntime();
  const [access, setAccess] = useState<TeamAccess>();
  const [accessError, setAccessError] = useState(false);
  const [reload, setReload] = useState(0);
  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setAccess(undefined);
    setAccessError(false);
    async function load() {
      try {
        const response = await request('/api/team', {
          headers: { 'x-organization-id': organizationId }, signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error('Team access is unavailable.');
        const value = await response.json() as TeamAccess;
        if (!controller.signal.aborted) setAccess(value);
      } catch {
        if (!controller.signal.aborted) setAccessError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [organizationId, projectId, reload, request]);

  const progress = onboardingProgress(state, project, week, access);
  const selected = progress.project;
  const team = selected?.team;
  const accessComplete = team?.staff === 'assigned' && team.client === 'assigned';
  const boqComplete = !!selected?.boqEnabled && !!selected.boqCount && !!project?.opening;
  const closeWeek = selected?.week ?? week;
  const reportComplete = !!selected?.reportPublished;
  const clientReady = reportComplete && team?.client === 'assigned';
  const steps: SetupStep[] = [
    {
      title: 'Firm details',
      detail: progress.namedFirm ? state.firm : 'Add the firm name used in the workspace and on client reports.',
      complete: progress.namedFirm, icon: Building2,
      action: { label: progress.namedFirm ? 'Edit firm name' : 'Set firm name', run: editFirm },
    },
    {
      title: 'First project',
      detail: project ? project.name + ' · ' + project.location : 'Enter your project, client, contract value and internal budget.',
      complete: !!project, icon: HardHat,
      action: { label: project ? 'Edit project' : 'Create first project', run: editProject },
    },
    {
      title: 'Team and client access',
      detail: !project ? 'Add a project to assign access.'
        : accessError ? 'Could not check project assignments.'
        : team ? 'Team ' + accessLabels[team.staff] + ' · Client ' + accessLabels[team.client]
        : 'Checking project assignments…',
      complete: accessComplete, icon: UsersRound,
      action: project ? accessError
        ? { label: 'Retry access check', run: () => setReload(value => value + 1) }
        : { label: 'Manage project access', run: () => navigate('team') } : undefined,
    },
    {
      title: 'BOQ and opening balances',
      detail: !selected ? 'Import the Excel BOQ and review budget, client and cost balances at the same cutoff.'
        : !selected.boqEnabled ? 'BOQ and allowances is disabled for this project.'
        : selected.boqCount && project?.opening ? selected.boqCount + ' BOQ items · Opening budget ' + kes(project.opening.budgetCents)
        : selected.boqCount ? selected.boqCount + ' BOQ items · ' + kes(selected.boqAllowance) + ' internal allowance. Record the opening balances next.'
        : 'Import the Excel BOQ. For a new project, use zero for any opening cash, billing or costs.',
      complete: boqComplete, icon: ClipboardList,
      action: selected ? { label: selected.boqEnabled ? 'Open BOQ and balances' : 'Review project modules',
        run: () => navigate(selected.boqEnabled ? 'boq' : 'site') } : undefined,
    },
    {
      title: 'First weekly close',
      detail: !selected ? 'Record the week’s activity, clear approvals and reconcile approved costs, cash and amounts due.'
        : selected.reconciled ? displayDate(closeWeek) + ' – ' + displayDate(selected.end) + ' · Balances reconcile'
        : selected.close.hasLabour && !selected.close.hasAttendance ? 'Record attendance if the project used site labour this week.'
        : 'Review wagebills, costs and purchase approvals for the reporting week.',
      complete: !!selected?.reconciled, icon: ClipboardCheck,
      action: selected ? { label: 'Review weekly close', run: () => navigate('pilot', closeWeek) } : undefined,
    },
    {
      title: 'First client report',
      detail: !selected ? 'Publish a weekly update to the assigned client’s project page.'
        : !selected.portalEnabled ? 'The client portal is disabled for this project.'
        : reportComplete ? 'Published for the week of ' + displayDate(closeWeek) + (clientReady ? ' · Client assigned' : ' · Client assignment pending')
        : 'Save and publish the reviewed weekly note from Weekly report.',
      complete: reportComplete, icon: FileText,
      action: selected ? { label: selected.portalEnabled ? 'Open weekly report' : 'Review project modules',
        run: () => navigate(selected.portalEnabled ? 'reports' : 'site', closeWeek) } : undefined,
    },
  ];
  const completed = steps.filter(step => step.complete).length;
  const next = steps.find(step => !step.complete);
  const clientUrl = projectId && href('/client/' + encodeURIComponent(projectId) + '?org=' + encodeURIComponent(organizationId));

  return <section className="onboarding" aria-label="Workspace setup checklist">
    {demo?.onboarding && <div className="notice subtle onboarding-demo">
      <span>Start an empty Ridgeway Works rehearsal with fictional details and <strong>@example.invalid</strong> invitations.</span>
      <button className="text-button" type="button" onClick={() => {
        if (window.confirm('Clear this Ridgeway rehearsal from this browser?')) void demo.reset();
      }}>Reset rehearsal</button>
    </div>}
    <div className="panel onboarding-progress">
      <div>
        <h2>{completed === steps.length ? 'First client report is ready' : 'Set up your project'}</h2>
        <p>{completed} of {steps.length} steps complete</p>
      </div>
      <progress aria-label="Setup progress" value={completed} max={steps.length} />
    </div>
    <ol className="onboarding-steps">
      {steps.map(step => <li key={step.title} className="panel onboarding-step" aria-current={step === next ? 'step' : undefined}>
        <span className={'item-icon ' + (step.complete ? 'green' : 'teal')}>
          {step.complete ? <CheckCircle2 size={20} aria-hidden="true" /> : <step.icon size={20} aria-hidden="true" />}
        </span>
        <div className="onboarding-step-copy">
          <h3>{step.title}</h3>
          <p>{step.detail}</p>
          {step.title === 'First weekly close' && selected?.close.hasLabour && !selected.close.hasAttendance && (
            <button className="text-button onboarding-attach" type="button" onClick={() => navigate('attendance', closeWeek)}>Open attendance <ArrowRight size={14} /></button>
          )}
        </div>
        <div className="onboarding-step-actions">
          <Badge tone={step.complete ? 'green' : step === next ? 'amber' : 'neutral'}>{step.complete ? 'Complete' : step === next ? 'Next' : 'Pending'}</Badge>
          {step.action && <button className={'btn' + (step === next ? ' primary' : '')} type="button" onClick={step.action.run}>
            {step.action.label} <ArrowRight size={15} aria-hidden="true" />
          </button>}
        </div>
      </li>)}
    </ol>
    {clientReady && clientUrl && (
      <a className="btn primary" href={clientUrl} target="_blank" rel="noopener noreferrer">Open client page <ExternalLink size={15} aria-hidden="true" /></a>
    )}
  </section>;
}
