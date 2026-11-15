import { addDays, type Project, type ReportNote } from './domain';
import { enabled } from './suite';
import type { Role, SuiteState } from './suite-types';
import { weeklyClose } from './weekly-close';

export const defaultFirmName = 'My construction firm';
export type TeamAccess = {
  members: { project_roles: string; active: number }[];
  invites: { project_roles: string; claimed_at: string | null; revoked_at: string | null; expires_at: string }[];
};

type Assignment = 'assigned' | 'invited' | 'missing';
const staffRoles: readonly Role[] = ['pm', 'finance', 'accounts', 'architect', 'foreman'];

export function readAssignedRoles(value: string): Record<string, Role> {
  try {
    return JSON.parse(value) as Record<string, Role> || {};
  } catch {
    return {};
  }
}

export function onboardingAccess(access: TeamAccess, projectId: string, now = new Date().toISOString()) {
  const active = access.members.filter(member => member.active === 1).map(member => readAssignedRoles(member.project_roles)[projectId]);
  const invited = access.invites
    .filter(invite => !invite.claimed_at && !invite.revoked_at && invite.expires_at > now)
    .map(invite => readAssignedRoles(invite.project_roles)[projectId]);
  function assignment(roles: readonly Role[]): Assignment {
    if (active.some(role => roles.includes(role))) return 'assigned';
    return invited.some(role => roles.includes(role)) ? 'invited' : 'missing';
  }
  return { staff: assignment(staffRoles), client: assignment(['client']) };
}

export function onboardingProgress(state: SuiteState, project: Project | undefined, selectedWeek: string, access?: TeamAccess) {
  const namedFirm = state.firm.trim() !== '' && (
    state.firm !== defaultFirmName || state.audit.some(entry => entry.action === 'firm.update')
  );
  if (!project) return { namedFirm };

  const id = project.id;
  const reports = state.reports.filter(report => report.projectId === id);
  const firstPublished = reports.reduce<ReportNote | undefined>((first, report) => {
    const isPublished = state.suite.publishedWeeks[id + ':' + report.weekStart] === report.updatedAt;
    return isPublished && (!first || report.weekStart < first.weekStart) ? report : first;
  }, undefined);
  const week = firstPublished?.weekStart ?? selectedWeek;
  const close = weeklyClose(state, id, week);
  const hasCostActivity = state.expenses.some(cost => cost.projectId === id && !cost.opening && cost.status === 'approved'
    && cost.date >= week && cost.date <= close.end);
  const hasWeekActivity = close.hasAttendance || hasCostActivity || !!close.report;
  const reconciled = hasWeekActivity && close.balancesReconcile && !close.pendingCosts && !close.pendingProcurement
    && (!close.hasLabour || !close.hasAttendance || close.bill?.status === 'approved');
  const boqEnabled = enabled(state, id, 'boq');
  const portalEnabled = enabled(state, id, 'portal');
  const rows = state.suite.boq.filter(item => item.projectId === id);
  return {
    namedFirm,
    project: {
      week, end: addDays(week, 6), close, reconciled,
      team: access && onboardingAccess(access, id),
      boqEnabled, portalEnabled, boqCount: rows.length,
      boqAllowance: rows.reduce((amount, item) => amount + item.allowanceCents, 0),
      reportPublished: portalEnabled && close.reportPublished,
    },
  };
}
