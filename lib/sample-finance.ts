import { addDays, dateKey, monday } from './domain';
import { linkFunding, openCommitments, saveFinanceReview, saveReceiptPlan } from './project-finance';
import type { ClientReceipt, SuiteState } from './suite-types';

export function addSampleFinance(state: SuiteState, projectId: string, actorId: string, at: string) {
  const project = state.projects.find(item => item.id === projectId && item.demo);
  if (!project || state.suite.finance.reviews[projectId]) return state;

  const date = dateKey(new Date(at));
  const receiptId = projectId + ':sample-receipt';
  const receipt: ClientReceipt = state.suite.receipts.find(item => item.projectId === projectId && item.id === 'receipt-sample')
    ?? {
      id: receiptId, projectId, number: 'RCP-DEMO-001', title: 'Sample mobilisation payment',
      amountCents: 25_000_000, method: 'Bank transfer', reference: 'DEMO-CLIENT-001',
      date: addDays(monday(date), -14), issuedAt: at, issuedBy: actorId,
    };
  if (receipt.voidedAt) return state;
  const billId = projectId + ':sample-certificate';
  state.suite.finance.reviews[projectId] = saveFinanceReview(state, project, {
    revision: 0, asOf: date, earnedRevenue: '375000', staffCost: '18000', overhead: '30000',
    uncommitted: String(Math.max(0, (state.suite.projectDetails[projectId]?.forecastRemainingCents ?? 140_000_000) - openCommitments(state, projectId)) / 100),
  }, at, actorId);
  if (receipt.id === receiptId) state.suite.receipts.push(receipt);
  state.suite.milestones.push({
    id: billId, projectId, title: 'Mobilisation and early works', reference: 'IPC-DEMO-001',
    kind: 'payment-certificate', amountCents: 37_500_000, dueDate: date, status: 'certified', certifiedAt: at,
  });
  state.suite.finance.plans[receipt.id] = saveReceiptPlan(state, receipt, {
    revision: 0,
    applications: [{ milestoneId: billId, amount: '250000' }],
    allocations: [
      { category: 'materials', amount: '150000' },
      { category: 'labour', amount: '60000' },
      { category: 'site', amount: '20000' },
    ],
  });
  const payment = state.payments.find(item => item.projectId === projectId && !item.reversedAt
    && item.reference === 'DEMO-BANK-01' && item.amountCents <= 15_000_000);
  if (payment) state.suite.finance.fundingLinks.push({
    id: projectId + ':sample-funding', receiptId: receipt.id,
    ...linkFunding(state, receipt, { outflowId: 'payment:' + payment.id, category: 'materials', amount: String(payment.amountCents / 100) }),
    linkedAt: at, linkedBy: actorId,
  });
  return state;
}
