import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

const fixture = databaseFixture();
const load = moduleLoader(fixture);
const api = await load('app/api/workspace/route.ts');
const portal = await load('app/api/client-view/route.ts');
const { dateKey, totals } = await load('lib/domain.ts');
const { receiptFundingPosition, receiptTotal, reviewFigures } = await load('lib/project-finance.ts');
const today = dateKey();
const org = 'director';

function login(userId, role, projectId) {
  fixture.user = { userId, displayName: userId, email: userId + '@example.test' };
  if (role) {
    fixture.db.prepare('INSERT OR REPLACE INTO memberships (id,organization_id,user_id,email,display_name,role,project_roles,active) VALUES (?,?,?,?,?,?,?,1)')
      .run(org + ':' + userId, org, userId, fixture.user.email, userId, role, JSON.stringify({ [projectId]: role }));
  }
}

async function post(type, payload, status = 200, id) {
  const response = await api.POST(request('/api/workspace', command(type, payload, id), org));
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return status === 200 ? body.state : body;
}

async function workspace() {
  const response = await api.GET(request('/api/workspace', undefined, org));
  assert.equal(response.status, 200);
  return (await response.json()).state;
}

test('client receipts reconcile to billing and confirmed spending with project-level finance permissions', async () => {
  login(org);
  let state = await post('project.create', { name: 'Finance fixture', location: 'Kiambu', budget: '500000', contract: '450000' });
  const projectId = state.projects[0].id;
  state = await post('project.create', { name: 'Other project', location: 'Kiambu', budget: '200000', contract: '275000' });
  const otherProjectId = state.projects.at(-1).id;
  state = await post('receipt.issue', { projectId: otherProjectId, title: 'Other deposit', amount: '10000', date: today, method: 'Cash', reference: 'OTHER-FIXTURE' });
  const otherReceiptId = state.suite.receipts.at(-1).id;

  state = await post('expense.create', { projectId, date: today, amount: '140000', category: 'Materials', description: 'Supplier fixture', receiptRef: 'SUPPLIER-FIXTURE' });
  const expenseId = state.expenses[0].id;
  await post('expense.approve', { expenseId, overrideReason: 'Verified fixture invoice' });
  state = await post('payment.record', { targetType: 'expense', targetId: expenseId, amount: '80000', date: today, method: 'Bank transfer', reference: 'SUPPLIER-PAID-FIXTURE' });
  const paymentId = state.payments[0].id;
  const review = { projectId, revision: 0, asOf: today, earnedRevenue: '130000', staffCost: '20000', overhead: '15000', uncommitted: '300000' };
  state = await post('finance.review.save', review);
  const figures = reviewFigures(state.suite.finance.reviews[projectId]);
  assert.equal(figures.profitToDate, -4_500_000);
  assert.equal(figures.forecastProfit, -2_500_000);

  login('accounts-user', 'accounts', projectId);
  await post('finance.review.save', review, 403);
  assert.deepEqual((await workspace()).suite.finance.reviews, {});
  state = await post('finance.bill.record', { projectId, kind: 'payment-certificate', reference: 'IPC-FIXTURE', title: 'Certified works', amount: '300000', dueDate: today });
  const milestoneId = state.suite.milestones[0].id;
  state = await post('receipt.issue', { projectId, title: 'Mobilisation', amount: '250000', date: today, method: 'M-Pesa', reference: 'CLIENT-RECEIPT-FIXTURE' });
  const receiptId = state.suite.receipts[0].id;
  const plan = {
    projectId, receiptId, revision: 0,
    applications: [{ milestoneId, amount: '250000' }],
    allocations: [{ category: 'materials', amount: '150000' }, { category: 'labour', amount: '60000' }, { category: 'site', amount: '20000' }],
  };
  await post('finance.receipt.plan', { ...plan, receiptId: otherReceiptId }, 403);
  await post('finance.receipt.plan', { ...plan, allocations: [{ category: 'materials', amount: '250001' }] }, 400);
  await post('finance.receipt.plan', plan);
  await post('finance.receipt.plan', plan, 409);

  const funding = { receiptId, category: 'materials', outflowId: 'payment:' + paymentId, amount: '80000' };
  const operationId = 'finance-funding-retry';
  state = await post('finance.funding.link', funding, 200, operationId);
  state = await post('finance.funding.link', funding, 200, operationId);
  assert.equal(state.suite.finance.fundingLinks.length, 1);
  assert.equal(state.projectFunding[projectId].find(row => row.category === 'materials').spentCents, 8_000_000);
  assert.equal(receiptTotal(state, projectId) - totals(state, projectId).cashPaid, 17_000_000);
  assert.deepEqual(receiptFundingPosition(receiptTotal(state, projectId), state.projectFunding[projectId]), {
    spentCents: 8_000_000, earmarkedCents: 15_000_000, unallocatedCents: 2_000_000,
  });
  await post('finance.funding.link', { ...funding, amount: '1' }, 400);
  await post('finance.receipt.plan', { ...plan, revision: 1, allocations: [{ category: 'materials', amount: '79999' }] }, 400);
  await post('receipt.void', { receiptId, reason: 'Correction' }, 400);

  login('reviewer', 'finance', projectId);
  assert.equal(reviewFigures((await workspace()).suite.finance.reviews[projectId]).forecastProfit, -2_500_000);
  await post('finance.funding.link', funding, 403);
  login('pm-user', 'pm', projectId);
  state = await workspace();
  assert.deepEqual(state.suite.finance, { reviews: {}, plans: {}, fundingLinks: [] });
  assert.equal(state.projectFunding[projectId].find(row => row.category === 'materials').amountCents, 15_000_000);
  assert.equal(state.suite.finance.reviews[projectId], undefined);
  await post('receipt.issue', { projectId, title: 'Denied', amount: '1', date: today, method: 'Cash', reference: 'DENIED' }, 403);

  login('client-user', 'client', projectId);
  state = await workspace();
  assert.deepEqual(state.suite.finance, { reviews: {}, plans: {}, fundingLinks: [] });
  assert.deepEqual(state.projectFunding, {});
  const view = await portal.GET(request('/api/client-view?projectId=' + projectId + '&org=' + org));
  assert.equal(view.status, 200);
  const { portal: published } = await view.json();
  assert.equal(published.milestones[0].appliedCents, 25_000_000);
  assert.ok(!JSON.stringify(published).includes('SUPPLIER-PAID-FIXTURE'));
  assert.equal(published.figures.receivedCents, 25_000_000);

  login(org);
  state = await post('payment.reverse', { paymentId, reason: 'Reconciled reversal' });
  assert.equal(state.projectFunding[projectId].find(row => row.category === 'materials').spentCents, 0);
  assert.deepEqual(receiptFundingPosition(receiptTotal(state, projectId), state.projectFunding[projectId]), {
    spentCents: 0, earmarkedCents: 23_000_000, unallocatedCents: 2_000_000,
  });
  await post('receipt.void', { receiptId, reason: 'Corrected receipt' });
  assert.deepEqual((await workspace()).projectFunding[projectId], []);
});

test('older workspaces load with an empty finance ledger', async () => {
  const { emptyState } = await load('lib/domain.ts');
  const { emptySuite, normalizeState } = await load('lib/suite.ts');
  const { finance, ...oldSuite } = emptySuite();
  assert.deepEqual(normalizeState({ ...emptyState(), suite: oldSuite }).suite.finance, finance);
});
