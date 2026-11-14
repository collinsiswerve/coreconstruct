import { addDays, totals } from './domain';
import { openCommitments, receiptTotal } from './project-finance';
import { enabled } from './suite';
import type { SuiteState } from './suite-types';

export function weeklyClose(state: SuiteState, projectId: string, week: string) {
  const end = addDays(week, 6);
  const inWeek = (day: string) => day >= week && day <= end;
  const hasLabour = enabled(state, projectId, 'wages');
  const hasMaterials = enabled(state, projectId, 'materials');
  const needsReport = enabled(state, projectId, 'portal');
  const bill = state.wagebills.find(row => row.projectId === projectId && row.weekStart === week);
  const hasAttendance = state.attendance.some(row => row.projectId === projectId && inWeek(row.date))
    || state.suite.piecework.some(row => row.projectId === projectId && row.weekStart === week);
  const pendingCosts = state.expenses.filter(row => row.projectId === projectId && row.status === 'submitted' && inWeek(row.date)).length;
  const pendingProcurement = hasMaterials ? [
    ...state.suite.orders, ...state.suite.deliveries, ...state.suite.invoices,
  ].filter(row => row.projectId === projectId && row.status === 'submitted').length : 0;
  const report = state.reports.find(row => row.projectId === projectId && row.weekStart === week);
  const reportPublished = !!report && state.suite.publishedWeeks[projectId + ':' + week] === report.updatedAt;
  const ledger = totals(state, projectId);
  return {
    end, hasLabour, hasMaterials, needsReport, hasAttendance, bill,
    pendingCosts, pendingProcurement, report, reportPublished, ledger,
    commitments: openCommitments(state, projectId),
    clientReceipts: receiptTotal(state, projectId) + (state.projects.find(row => row.id === projectId)?.opening?.clientReceivedCents ?? 0),
    balancesReconcile: ledger.incurred + ledger.unallocatedAdvances === ledger.cashPaid + ledger.outstanding,
  };
}
