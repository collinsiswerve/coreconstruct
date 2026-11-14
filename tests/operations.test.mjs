import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('weekly wages and matched supplier costs reconcile through approval, payment and correction', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const { addDays, dateKey, monday, wagebillPreview, wagebillPreviewKey } = await load('lib/domain.ts');
  const { operationsSampleId } = await load('lib/sample-operations.ts');
  const { supplierInvoiceMatch } = await load('lib/procurement.ts');
  const { projectFinancials, stockBalance } = await load('lib/suite.ts');
  const api = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');

  const login = userId => { fixture.user = { userId, displayName: userId, email: userId + '@example.test' }; };
  async function send(operation, status = 200) {
    const response = await api.POST(request('/api/workspace', operation, 'owner'));
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }
  async function run(type, payload, status) {
    return (await send(command(type, payload), status)).state;
  }
  async function invite(userId, role, projectId) {
    login('owner');
    const response = await team.POST(request('/api/team', {
      action: 'invite', email: userId + '@example.test', projectRoles: { [projectId]: role },
    }, 'owner'));
    assert.equal(response.status, 200);
    const { inviteUrl } = await response.json();
    login(userId);
    const claimed = await invitations.POST(request('/api/invitations', { token: new URL(inviteUrl).pathname.split('/').at(-1) }));
    assert.equal(claimed.status, 200);
  }

  login('owner');
  const loaded = await run('demo.operations.load', {});
  const projectId = operationsSampleId;
  assert.equal(await run('demo.operations.load', {}, 400), undefined);
  const withPortfolio = await run('demo.portfolio.load', {});
  assert.equal(withPortfolio.projects.length, 5);
  assert.equal(withPortfolio.projects.find(project => project.id === projectId).sampleWalkthrough, 'labour-procurement');

  const weekStart = addDays(monday(), -7);
  const today = dateKey();
  const before = wagebillPreview(withPortfolio, projectId, weekStart);
  assert.deepEqual([before.grossCents, before.advanceCents, before.payableCents], [150000, 30000, 120000]);
  assert.deepEqual(loaded.advances[0].allocations, []);
  const workerId = loaded.advances[0].workerId;
  const advance = await run('advance.create', { projectId, workerId, amount: '50', date: weekStart, reference: 'TEST-CHANGE' });
  const stale = await send(command('wagebill.submit', { projectId, weekStart, previewKey: wagebillPreviewKey(before) }), 409);
  assert.match(stale.error, /changed/);
  const reset = await run('advance.reverse', { advanceId: advance.advances.at(-1).id, reason: 'Fixture change' });
  assert.equal(wagebillPreviewKey(wagebillPreview(reset, projectId, weekStart)), wagebillPreviewKey(before));

  await invite('pm', 'pm', projectId);
  let state = await run('wagebill.submit', { projectId, weekStart, previewKey: wagebillPreviewKey(before) });
  const wagebill = state.wagebills.find(bill => bill.projectId === projectId);
  assert.equal(wagebill.payableCents, 120000);
  assert.equal(projectFinancials(state, projectId).incurred, 0);
  assert.equal(projectFinancials(state, projectId).cashPaid, 30000);
  await run('wagebill.approve', { billId: wagebill.id, revision: wagebill.revision }, 403);
  login('owner');
  await run('wagebill.approve', { billId: wagebill.id, revision: wagebill.revision + 1 }, 409);
  state = await run('wagebill.approve', { billId: wagebill.id, revision: wagebill.revision });
  assert.equal(projectFinancials(state, projectId).incurred, 150000);
  assert.equal(projectFinancials(state, projectId).outstanding, 120000);

  const invoice = state.suite.invoices[0];
  const delivery = state.suite.deliveries[0];
  const order = state.suite.orders.find(item => item.id === invoice.orderId);
  assert.equal(order.totalCents, 700000);
  assert.equal(stockBalance(state, projectId, order.lines[0].materialId), 0);
  assert.match(supplierInvoiceMatch(state, invoice).issues[0], /exceeds approved goods/);
  await run('invoice.approve', { invoiceId: invoice.id }, 400);
  const returnedOrder = await send(command('order.return', { orderId: order.id, reason: 'Still pending' }), 400);
  assert.match(returnedOrder.error, /submitted or approved/);
  state = await run('delivery.approve', { deliveryId: delivery.id });
  assert.equal(stockBalance(state, projectId, order.lines[0].materialId), 6000);
  assert.deepEqual(supplierInvoiceMatch(state, invoice).issues, []);
  assert.equal(supplierInvoiceMatch(state, { ...invoice, rateCents: 69000 }).issues.length, 1);
  const match = command('invoice.approve', { invoiceId: invoice.id, revision: 1 });
  const approved = await send(match);
  const replay = await send(match);
  assert.equal(replay.version, approved.version);
  assert.equal(replay.state.expenses.filter(item => item.projectId === projectId).length, 1);
  const cost = approved.state.expenses.find(item => item.supplierInvoiceId === invoice.id);
  assert.equal(cost.amountCents, 280000);
  assert.equal(projectFinancials(approved.state, projectId).outstandingCommitment, 420000);
  assert.equal(projectFinancials(approved.state, projectId).incurred, 430000);

  const payment = { date: today, method: 'Bank transfer' };
  await run('payment.record', { ...payment, targetType: 'wagebill', targetId: wagebill.id, amount: '1200', reference: 'DEMO-PAY-WAGES' });
  state = await run('payment.record', { ...payment, targetType: 'expense', targetId: cost.id, amount: '1000', reference: 'DEMO-PAY-SUPPLIER' });
  const figures = projectFinancials(state, projectId);
  assert.deepEqual([figures.incurred, figures.cashPaid, figures.outstanding, figures.outstandingCommitment], [430000, 250000, 180000, 420000]);
  await run('invoice.reverse', { invoiceId: invoice.id, reason: 'Fixture correction' }, 400);

  await invite('site', 'foreman', projectId);
  const response = await api.GET(request('/api/workspace', undefined, 'owner'));
  const { state: site } = await response.json();
  assert.equal(site.expenses.length, 0);
  assert.equal(site.suite.invoices.length, 0);
  await run('payment.record', { ...payment, targetType: 'expense', targetId: cost.id, amount: '50', reference: 'TEST-SITE' }, 403);

  login('owner');
  await run('payment.reverse', { paymentId: state.payments.find(item => item.reference === 'DEMO-PAY-SUPPLIER').id, reason: 'Fixture correction' });
  const reversed = await run('invoice.reverse', { invoiceId: invoice.id, reason: 'Fixture correction' });
  assert.equal(projectFinancials(reversed, projectId).outstandingCommitment, 700000);
  for (let i = 0; i < 2; i++) {
    await run('invoice.revise', { invoiceId: invoice.id, lineId: invoice.lineId, quantity: 4, rate: 700 });
    await run('invoice.approve', { invoiceId: invoice.id, revision: i + 1 }, 409);
    state = await run('invoice.approve', { invoiceId: invoice.id, revision: i + 2, overrideReason: 'Checked fictional source records' });
    assert.equal(state.expenses.filter(item => item.projectId === projectId && item.status === 'approved').length, 1);
    if (i === 0) await run('invoice.reverse', { invoiceId: invoice.id, reason: 'Fixture correction' });
  }
  const detached = await send(command('expense.revise', { projectId, expenseId: cost.id }), 400);
  assert.match(detached.error, /supplier invoice/);
});
