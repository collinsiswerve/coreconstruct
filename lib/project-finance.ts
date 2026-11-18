import { dateKey, DomainError, moneyToCents, totals, type Project } from './domain';
import type { ClientReceipt, Role, SuiteState } from './suite-types';

export const fundingCategories = {
  materials: 'Materials',
  labour: 'Labour',
  subcontractors: 'Subcontractors',
  consultants: 'Professional fees',
  site: 'Site costs',
  other: 'Other costs',
} as const;

export type FundingCategory = keyof typeof fundingCategories;
export type BillingApplication = { milestoneId: string; amountCents: number };
export type CashAllocation = { category: FundingCategory; amountCents: number };
export type ReceiptPlan = {
  revision: number;
  applications: BillingApplication[];
  allocations: CashAllocation[];
};
export type FundingLink = {
  id: string;
  receiptId: string;
  outflowId: string;
  category: FundingCategory;
  amountCents: number;
  linkedAt: string;
  linkedBy: string;
  reversedAt?: string;
  reason?: string;
};
export type FinanceReview = {
  asOf: string;
  revision: number;
  recordedAt: string;
  recordedBy: string;
  earnedRevenueCents: number;
  approvedCostsCents: number;
  staffCostCents: number;
  overheadCents: number;
  forecastRevenueCents: number | null;
  forecastApprovedCostsCents: number;
  commitmentsCents: number;
  uncommittedCents: number;
};

export type FinanceData = {
  reviews: Record<string, FinanceReview>;
  plans: Record<string, ReceiptPlan>;
  fundingLinks: FundingLink[];
};

export type FundingTotal = CashAllocation & { spentCents: number };

export const emptyFinance = (): FinanceData => ({ reviews: {}, plans: {}, fundingLinks: [] });
export const canViewProfit = (role: Role) => role === 'admin' || role === 'finance';
export const canManageReceipts = (role: Role) => role === 'admin' || role === 'accounts';
export const canViewReceiptLedger = (role: Role) => canViewProfit(role) || canManageReceipts(role);
export const canViewProjectFinance = (role: Role) => canViewReceiptLedger(role) || role === 'pm';

export function openCommitments(s: SuiteState, projectId: string) {
  const invoiced = new Map<string, number>();
  for (const invoice of s.suite.invoices) {
    if (invoice.projectId !== projectId || invoice.status !== 'approved') continue;
    invoiced.set(invoice.lineId, (invoiced.get(invoice.lineId) || 0) + invoice.totalCents);
  }
  return s.suite.orders
    .filter(order => order.projectId === projectId && order.status === 'approved')
    .flatMap(order => order.lines)
    .reduce((total, line) => total + Math.max(0, Math.round(line.quantityMilli * line.rateCents / 1000) - (invoiced.get(line.id) || 0)), 0);
}

export function reviewFigures(review: FinanceReview) {
  const costToDate = review.approvedCostsCents + review.staffCostCents + review.overheadCents;
  const forecastCost = review.forecastApprovedCostsCents + review.staffCostCents + review.overheadCents + review.commitmentsCents + review.uncommittedCents;
  return {
    costToDate,
    forecastCost,
    profitToDate: review.earnedRevenueCents - costToDate,
    forecastProfit: review.forecastRevenueCents === null ? null : review.forecastRevenueCents - forecastCost,
  };
}

export function approvedCostThrough(s: SuiteState, projectId: string, asOf: string) {
  const payroll = s.wagebills.filter(bill => bill.projectId === projectId && bill.status === 'approved' && (bill.weekEnd <= asOf || !!bill.approvedAt && dateKey(new Date(bill.approvedAt)) <= asOf));
  const expenses = s.expenses.filter(expense => expense.projectId === projectId && expense.status === 'approved' && !expense.opening && expense.date <= asOf);
  const opening = s.projects.find(project => project.id === projectId)?.opening;
  const openingCost = opening && opening.asOf <= asOf ? opening.costsIncurredCents : 0;
  return payroll.reduce((sum, bill) => sum + bill.grossCents, 0)
    + expenses.reduce((sum, expense) => sum + expense.amountCents, 0) + openingCost;
}

export function receiptTotal(s: SuiteState, projectId: string) {
  return s.suite.receipts.filter(receipt => receipt.projectId === projectId && !receipt.voidedAt)
    .reduce((sum, receipt) => sum + receipt.amountCents, 0);
}

export function confirmedOutflows(s: SuiteState, projectId: string) {
  const bills = new Map(s.wagebills.filter(bill => bill.projectId === projectId).map(bill => [bill.id, bill.weekStart]));
  const expenses = new Map(s.expenses.filter(expense => expense.projectId === projectId).map(expense => [expense.id, expense.description]));
  const workers = new Map(s.workers.map(worker => [worker.id, worker.name]));
  const payments = s.payments.filter(payment => payment.projectId === projectId && !payment.reversedAt)
    .map(payment => ({
      id: 'payment:' + payment.id,
      date: payment.date,
      reference: payment.reference,
      amountCents: payment.amountCents,
      label: payment.targetType === 'expense' ? expenses.get(payment.targetId) || 'Expense' : 'Wagebill · ' + (bills.get(payment.targetId) || 'approved wages'),
    }));
  const advances = s.advances.filter(advance => advance.projectId === projectId && !advance.reversedAt)
    .map(advance => ({
      id: 'advance:' + advance.id,
      date: advance.date,
      reference: advance.reference,
      amountCents: advance.amountCents,
      label: 'Worker advance' + (workers.has(advance.workerId) ? ' · ' + workers.get(advance.workerId) : ''),
    }));
  return [...payments, ...advances].sort((a, b) => b.date.localeCompare(a.date));
}

export function activeFunding(s: SuiteState, projectId: string) {
  const receiptIds = new Set(s.suite.receipts.filter(receipt => receipt.projectId === projectId && !receipt.voidedAt).map(receipt => receipt.id));
  const outflowIds = new Set(confirmedOutflows(s, projectId).map(outflow => outflow.id));
  return s.suite.finance.fundingLinks.filter(link => !link.reversedAt && receiptIds.has(link.receiptId) && outflowIds.has(link.outflowId));
}

export function fundingTotals(s: SuiteState, projectId: string): FundingTotal[] {
  const receipts = s.suite.receipts.filter(receipt => receipt.projectId === projectId && !receipt.voidedAt);
  const allocations = receipts.flatMap(receipt => s.suite.finance.plans[receipt.id]?.allocations || []);
  const links = activeFunding(s, projectId);
  return (Object.keys(fundingCategories) as FundingCategory[]).map(category => ({
    category,
    amountCents: allocations.filter(row => row.category === category).reduce((sum, row) => sum + row.amountCents, 0),
    spentCents: links.filter(link => link.category === category).reduce((sum, link) => sum + link.amountCents, 0),
  })).filter(row => row.amountCents > 0);
}

export function receiptFundingPosition(receivedCents: number, funding: readonly FundingTotal[]) {
  const allocatedCents = funding.reduce((sum, row) => sum + row.amountCents, 0);
  const spentCents = funding.reduce((sum, row) => sum + row.spentCents, 0);
  return {
    spentCents,
    earmarkedCents: allocatedCents - spentCents,
    unallocatedCents: receivedCents - allocatedCents,
  };
}

export function amountApplied(s: SuiteState, projectId: string, milestoneId: string, exceptReceiptId?: string) {
  return s.suite.receipts.filter(receipt => receipt.projectId === projectId && !receipt.voidedAt && receipt.id !== exceptReceiptId)
    .flatMap(receipt => s.suite.finance.plans[receipt.id]?.applications || [])
    .filter(row => row.milestoneId === milestoneId).reduce((sum, row) => sum + row.amountCents, 0);
}

function financeError(message: string, status = 400): never {
  throw new DomainError(message, status);
}

function amountRows(value: unknown, key: string) {
  if (!Array.isArray(value) || value.length > 100) financeError('Enter up to 100 payment allocation lines.');
  const used = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) financeError('Enter a valid payment allocation line.');
    const id = String(row[key] ?? '');
    if (!id || used.has(id)) financeError('Use each billing item or funding category once per receipt.');
    used.add(id);
    return { id, amountCents: moneyToCents(row.amount) };
  }).filter(row => row.amountCents > 0);
}

function categoryFor(value: string): FundingCategory {
  if (!Object.hasOwn(fundingCategories, value)) financeError('Choose a funding category.');
  return value as FundingCategory;
}

export function saveReceiptPlan(s: SuiteState, receipt: ClientReceipt, input: Record<string, unknown>): ReceiptPlan {
  if (receipt.voidedAt) financeError('A void receipt cannot be allocated.');
  const previous = s.suite.finance.plans[receipt.id];
  const revision = previous?.revision || 0;
  if (input.revision !== revision) financeError('This receipt changed. Refresh before editing the allocation.', 409);
  const applications = amountRows(input.applications, 'milestoneId').map(row => {
    const bill = s.suite.milestones.find(item => item.id === row.id && item.projectId === receipt.projectId && item.status === 'certified');
    if (!bill) financeError('Choose a certified billing item on this project.');
    if (amountApplied(s, receipt.projectId, bill.id, receipt.id) + row.amountCents > bill.amountCents) financeError('The amount exceeds the open balance on ' + bill.title + '.');
    return { milestoneId: row.id, amountCents: row.amountCents };
  });
  const allocations = amountRows(input.allocations, 'category').map(row => ({
    category: categoryFor(row.id),
    amountCents: row.amountCents,
  }));
  if ([applications, allocations].some(rows => rows.reduce((sum, row) => sum + row.amountCents, 0) > receipt.amountCents)) {
    financeError('Billing applications and spending allocations must each stay within the receipt amount.');
  }
  const links = activeFunding(s, receipt.projectId).filter(link => link.receiptId === receipt.id);
  for (const category of new Set(links.map(link => link.category))) {
    const spent = links.filter(link => link.category === category).reduce((sum, link) => sum + link.amountCents, 0);
    if ((allocations.find(row => row.category === category)?.amountCents || 0) < spent) financeError('The allocation for ' + fundingCategories[category] + ' must cover its linked payments.');
  }
  return { revision: revision + 1, applications, allocations };
}

export function linkFunding(s: SuiteState, receipt: ClientReceipt, input: Record<string, unknown>) {
  if (receipt.voidedAt) financeError('A void receipt cannot fund a payment.');
  const category = categoryFor(String(input.category));
  const amountCents = moneyToCents(input.amount);
  const outflow = confirmedOutflows(s, receipt.projectId).find(item => item.id === input.outflowId);
  if (!outflow) financeError('Choose a confirmed outgoing payment on this project.');
  if (amountCents <= 0) financeError('Enter an amount greater than zero.');
  const active = activeFunding(s, receipt.projectId);
  const spent = active.filter(link => link.receiptId === receipt.id && link.category === category).reduce((sum, link) => sum + link.amountCents, 0);
  const earmarked = s.suite.finance.plans[receipt.id]?.allocations.find(row => row.category === category)?.amountCents || 0;
  if (spent + amountCents > earmarked) financeError('This payment exceeds the funds still earmarked for ' + fundingCategories[category] + '.');
  const funded = active.filter(link => link.outflowId === outflow.id).reduce((sum, link) => sum + link.amountCents, 0);
  if (funded + amountCents > outflow.amountCents) financeError('Funding links cannot exceed the confirmed outgoing payment.');
  return { outflowId: outflow.id, category, amountCents };
}

export function saveFinanceReview(s: SuiteState, project: Project, input: Record<string, unknown>, at: string, actorId: string): FinanceReview {
  const revision = s.suite.finance.reviews[project.id]?.revision || 0;
  if (input.revision !== revision) financeError('The finance review changed. Refresh before saving.', 409);
  const asOf = String(input.asOf || '');
  const asOfDate = new Date(asOf + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(asOfDate.getTime()) || asOfDate.toISOString().slice(0, 10) !== asOf || asOf > dateKey(new Date(at))) {
    financeError('Choose a valid review date up to today.');
  }
  const acceptedValue = project.contractCents + s.suite.variations
    .filter(variation => variation.projectId === project.id && variation.status === 'accepted')
    .reduce((sum, variation) => sum + variation.clientDeltaCents, 0);
  const forecastRevenueCents = project.mode === 'open' ? moneyToCents(input.forecastRevenue) : acceptedValue || null;
  const approvedCostsCents = approvedCostThrough(s, project.id, asOf);
  const review: FinanceReview = {
    asOf, revision: revision + 1, recordedAt: at, recordedBy: actorId,
    earnedRevenueCents: moneyToCents(input.earnedRevenue),
    approvedCostsCents,
    staffCostCents: moneyToCents(input.staffCost),
    overheadCents: moneyToCents(input.overhead),
    forecastRevenueCents,
    forecastApprovedCostsCents: totals(s, project.id).incurred,
    commitmentsCents: openCommitments(s, project.id),
    uncommittedCents: moneyToCents(input.uncommitted),
  };
  if (Object.values(reviewFigures(review)).some(value => value !== null && !Number.isSafeInteger(value))) financeError('Project totals exceed the supported amount.');
  return review;
}

export function forecastNeedsReview(s: SuiteState, project: Project, review: FinanceReview, contractCents: number) {
  return totals(s, project.id).incurred !== review.forecastApprovedCostsCents
    || approvedCostThrough(s, project.id, review.asOf) !== review.approvedCostsCents
    || openCommitments(s, project.id) !== review.commitmentsCents
    || (project.mode === 'fixed' && (contractCents || null) !== review.forecastRevenueCents);
}
