import assert from 'node:assert/strict';
import { test } from 'node:test';
import readSheet from 'read-excel-file/node';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('Excel BOQ preview, project access and opening balances reconcile through the workspace and client APIs', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const api = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');
  const clientView = await load('app/api/client-view/route.ts');
  const { guessBoqMapping, previewBoqRows } = await load('lib/boq-import.ts');
  const { approvedCostThrough, reviewFigures } = await load('lib/project-finance.ts');
  const { projectFinancials } = await load('lib/suite.ts');
  const { addDays, dateKey } = await load('lib/domain.ts');
  const sheet = await readSheet(new URL('../public/templates/boq-import.xlsx', import.meta.url).pathname, {
    sheet: 'BOQ', parseNumber: value => value,
  });
  const grid = sheet.map(row => row.map(cell => cell == null ? '' : String(cell)));
  const mapping = guessBoqMapping(grid[0]);
  const preview = previewBoqRows(grid, 0, grid.length, mapping, []);
  assert.deepEqual(preview.issues, []);
  assert.deepEqual(preview.totals, { clientTotal: 92963750, allowanceTotal: 72000000, labourTotal: 15400000 });
  assert.match(previewBoqRows(grid, 0, grid.length, mapping, ['sub-01']).issues[0], /Row 2.*duplicate/i);
  assert.deepEqual(previewBoqRows(grid, 0, grid.length, { ...mapping, stage: undefined, labourAllowance: undefined }, []).issues, []);
  assert.equal(guessBoqMapping(['Rate']).clientRate, undefined);

  const login = userId => { fixture.user = { userId, displayName: userId, email: userId + '@example.test' }; };
  async function post(operation, status = 200) {
    const response = await api.POST(request('/api/workspace', operation, 'owner'));
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const run = (type, payload, status) => post(command(type, payload), status);
  async function read() {
    const response = await api.GET(request('/api/workspace', undefined, 'owner'));
    assert.equal(response.status, 200);
    return (await response.json()).state;
  }
  async function invite(user, role, projectId) {
    login('owner');
    const response = await team.POST(request('/api/team', {
      action: 'invite', email: user + '@example.test', projectRoles: { [projectId]: role },
    }, 'owner'));
    assert.equal(response.status, 200, await response.clone().text());
    const { inviteUrl } = await response.json();
    login(user);
    const joined = await invitations.POST(request('/api/invitations', { token: new URL(inviteUrl).pathname.split('/').at(-1) }));
    assert.equal(joined.status, 200, await joined.text());
  }

  login('owner');
  const setup = { name: 'Fictional take-on', location: 'Nairobi', budget: '100000', contract: '1500000' };
  const { state: initial } = await run('project.create', setup);
  const projectId = initial.projects[0].id;
  const { state: second } = await run('project.create', { ...setup, name: 'Another project' });
  const otherId = second.projects[1].id;
  await invite('qs', 'pm', projectId);
  assert.deepEqual((await read()).projects.map(p => p.id), [projectId]);
  const importData = { projectId, rows: preview.rows, source: 'boq-import.xlsx · BOQ' };
  await run('boq.import', { ...importData, projectId: otherId }, 403);
  const firstImport = command('boq.import', importData);
  const imported = await post(firstImport);
  const retried = await post(firstImport);
  assert.equal(imported.version, retried.version);
  assert.equal(retried.state.suite.boq.length, 4);
  assert.equal(retried.state.projects[0].budgetCents, 10000000);
  assert.match((await run('boq.import', importData, 400)).error, /duplicate/i);

  const today = dateKey();
  const asOf = addDays(today, -7);
  const intake = { projectId, asOf, reference: 'Fictional ledger revision A', revision: 0, budget: '720000',
    clientBilled: '500000', clientReceived: '300000', costsIncurred: '250000', costsPaid: '175000' };
  await run('opening.record', intake, 403);
  login('owner');
  await run('opening.record', { ...intake, costsPaid: '250001' }, 400);
  await run('receipt.issue', { projectId: otherId, title: 'Prior fixture receipt', date: asOf,
    amount: '100', reference: 'PRIOR-FIXTURE', method: 'Bank transfer' });
  assert.match((await run('opening.record', { ...intake, projectId: otherId }, 400)).error, /overlap/i);
  const { state: opened } = await run('opening.record', intake);
  const initialFigures = projectFinancials(opened, projectId);
  assert.equal(initialFigures.allowance, 72000000);
  assert.equal(initialFigures.incurred, 25000000);
  assert.equal(initialFigures.outstanding, 7500000);
  assert.equal(initialFigures.clientReceived - initialFigures.cashPaid, 12500000);
  assert.equal(opened.suite.milestones.find(bill => bill.opening).amountCents, 20000000);
  assert.equal(approvedCostThrough(opened, projectId, addDays(asOf, -1)), 0);
  const expenseId = opened.expenses.find(expense => expense.opening).id;
  const billId = opened.suite.milestones.find(bill => bill.opening).id;
  const payout = { targetType: 'expense', targetId: expenseId, amount: '25000', date: today, method: 'Bank transfer', reference: 'OUT-OPENING' };
  await run('payment.record', { ...payout, date: asOf }, 400);
  await run('payment.record', payout);
  const { error: expenseError } = await run('expense.create', { projectId, date: asOf, description: 'Historical item', category: 'Materials', amount: '100' }, 400);
  assert.match(expenseError, /opening cutoff/);

  await invite('accounts', 'accounts', projectId);
  const accountsView = await read();
  assert.equal(accountsView.projects[0].budgetCents, 0);
  assert.equal(accountsView.projects[0].opening, undefined);
  assert.deepEqual(accountsView.projects[0].openingCash, { clientReceivedCents: 30000000, costsPaidCents: 17500000 });
  assert.equal(accountsView.expenses[0].receiptRef, '');
  assert.equal(accountsView.expenses[0].amountCents, 2500000);
  const receipt = { projectId, title: 'Later client payment', date: today, amount: '40000', reference: 'IN-OPENING', method: 'Bank transfer' };
  await run('receipt.issue', { ...receipt, date: asOf }, 400);
  const { state: receipted } = await run('receipt.issue', receipt);
  await run('finance.receipt.plan', { receiptId: receipted.suite.receipts[0].id, revision: 0,
    applications: [{ milestoneId: billId, amount: '40000' }], allocations: [] });

  login('owner');
  const correctedInput = { ...intake, revision: 1, reason: 'Reconciled the ledger', clientBilled: '510000', costsIncurred: '260000' };
  assert.match((await run('opening.record', { ...correctedInput, costsIncurred: '190000' }, 400)).error, /below payments/);
  assert.match((await run('opening.record', { ...correctedInput, clientBilled: '330000' }, 400)).error, /below receipts/);
  assert.match((await run('opening.record', { ...correctedInput, revision: 0 }, 409)).error, /changed/);
  const { state: corrected } = await run('opening.record', correctedInput);
  const updated = projectFinancials(corrected, projectId);
  assert.equal(updated.incurred, 26000000);
  assert.equal(updated.outstanding, 6000000);
  assert.equal(updated.cashPaid, 20000000);
  assert.equal(updated.clientReceived, 34000000);
  assert.equal(corrected.audit.at(-1).before.opening.costsIncurredCents, 25000000);
  const { state: reviewed } = await run('finance.review.save', {
    projectId, asOf: today, earnedRevenue: '300000', staffCost: '0', overhead: '0', uncommitted: '0', revision: 0,
  });
  assert.equal(reviewFigures(reviewed.suite.finance.reviews[projectId]).profitToDate, 4000000);

  await invite('foreman', 'foreman', projectId);
  const foreman = await read();
  assert.ok(!JSON.stringify(foreman).includes(intake.reference));
  assert.equal(foreman.expenses.length, 0);
  await invite('client', 'client', projectId);
  const portal = await clientView.GET(request('/api/client-view?projectId=' + projectId + '&org=owner'));
  assert.equal(portal.status, 200, await portal.clone().text());
  const { portal: data } = await portal.json();
  assert.equal(data.figures.receivedCents, 34000000);
  const openingBill = data.milestones.find(bill => bill.id === billId);
  assert.equal(openingBill.amountCents - openingBill.appliedCents, 17000000);
  assert.ok(!JSON.stringify(data).includes(intake.reference));
  assert.ok(!JSON.stringify(data).includes('26000000'));
});
