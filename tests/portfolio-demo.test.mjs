import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { moduleLoader } from './helpers.mjs';

const load = moduleLoader();
const { portfolioProjects, portfolioWorkspace, portfolioActor, portfolioFileAsset } = await load('preview/portfolio-state.ts');
const { totals, workerOnProject } = await load('lib/domain.ts');
const { authorize, clientView, filterState, roleFor } = await load('lib/security.ts');
const { reviewFigures, activeFunding, fundingTotals, receiptFundingPosition } = await load('lib/project-finance.ts');
const { assertDrawingAccess } = await load('lib/drawings.ts');
const { executeSuite, projectFinancials, stockBalance } = await load('lib/suite.ts');
const { supplierInvoiceMatch } = await load('lib/procurement.ts');

test('the five-year portfolio reconciles ten project ledgers and exposes only published client records', async () => {
  const state = portfolioWorkspace();
  assert.equal(state.projects.length, 10);
  const years = state.projects.map(item => item.createdAt.slice(0, 4));
  assert.deepEqual([...new Set(years)], ['2022', '2023', '2024', '2025', '2026']);
  for (const year of new Set(years)) assert.equal(years.filter(item => item === year).length, 2);
  assert.equal(state.projects.filter(project => project.progress === 100).length, 6);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 950000);

  const forecasts = Object.values(state.suite.finance.reviews).map(review => reviewFigures(review).forecastProfit);
  assert.ok(forecasts.some(amount => amount > 0) && forecasts.some(amount => amount < 0));

  for (const project of state.projects) {
    const sample = portfolioProjects.find(item => item.id === project.id);
    const rows = state.suite.boq.filter(row => row.projectId === project.id);
    assert.equal(rows.length, 16);
    assert.equal(rows.filter(row => row.code.startsWith('S-')).length, 6);
    assert.equal(rows.reduce((total, row) => total + row.clientRateCents * row.quantityMilli / 1000, 0), project.contractCents);
    assert.equal(rows.reduce((total, row) => total + row.allowanceCents, 0), project.budgetCents);
    for (const row of rows) assert.ok(row.completedMilli <= row.quantityMilli && row.clientRateCents > 0);

    const current = totals(state, project.id);
    assert.equal(current.cashPaid + current.outstanding, current.incurred + current.unallocatedAdvances);
    const financials = projectFinancials(state, project.id);
    assert.ok(financials.contract <= 20_000_000_000);
    assert.equal(state.workers.filter(worker => workerOnProject(worker, project)).length, 3);
    assert.ok(state.suite.deliveries.some(row => row.projectId === project.id && row.status === 'approved'));
    const invoice = state.suite.invoices.find(row => row.projectId === project.id);
    assert.deepEqual(supplierInvoiceMatch(state, invoice).issues, []);
    const materialId = state.suite.orders.find(row => row.projectId === project.id).lines[0].materialId;
    assert.ok(stockBalance(state, project.id, materialId) >= 0);
    assert.equal(project.progress === 100, financials.outstandingCommitment === 0);

    const actor = portfolioActor('client', project.id);
    const view = clientView(state, project.id);
    assert.equal(view.project.client, sample.client);
    assert.equal(view.project.progress, project.progress);
    assert.equal(view.reports.length, 4);
    assert.equal(view.drawings.length, 6);
    assert.ok(view.drawings.some(drawing => drawing.sheetCode === 'S-101'));
    assert.ok(view.drawings.some(drawing => drawing.sheetCode === 'QS-101'));
    assert.equal(view.media.length, 1);
    assert.equal(view.receipts.length, 2);
    assert.equal(view.milestones.reduce((total, item) => total + item.appliedCents, 0), financials.clientReceived);
    const split = receiptFundingPosition(financials.clientReceived, fundingTotals(state, project.id));
    assert.equal(split.spentCents + split.earmarkedCents + split.unallocatedCents, financials.clientReceived);
    assert.equal(activeFunding(state, project.id).length, 3);
    assert.ok(Object.values(split).every(amount => amount > 0));
    const clients = filterState(state, actor);
    assert.deepEqual(clients.projects.map(item => item.id), [project.id]);
    assert.equal(clients.workers.length + clients.expenses.length + clients.wagebills.length, 0);
    assert.deepEqual(clients.suite.finance.reviews, {});
    assert.equal(clients.projects[0].budgetCents, 0);
    assert.ok(!JSON.stringify(view).includes(invoice.reference));
    assert.throws(() => roleFor(actor, project.id === 'm6-01' ? 'm6-02' : 'm6-01'), { status: 403 });
    const drawings = state.suite.drawings.filter(row => row.projectId === project.id);
    assert.throws(() => assertDrawingAccess(drawings.find(row => row.status === 'superseded'), 'client'), { status: 404 });
    assert.throws(() => assertDrawingAccess(drawings.find(row => row.sheetCode === 'PR-101'), 'client'), { status: 404 });
    const supporting = state.suite.deliveries.find(row => row.projectId === project.id);
    const cost = state.expenses.find(row => row.projectId === project.id && row.receiptFileId);
    const fileIds = [view.media[0].fileId, ...drawings.map(row => row.fileId), invoice.evidenceFileId,
      supporting.offloadFileId, supporting.noteFileId, cost.receiptFileId];
    for (const id of fileIds) {
      const path = portfolioFileAsset(id);
      assert.ok(path);
      const bytes = await readFile(new URL('../preview/public/' + path, import.meta.url));
      if (path.endsWith('.pdf')) assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
      else assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
    }
  }
});

test('a sample client can decide the current variation and the forecast date follows its stated effect', () => {
  const initial = portfolioWorkspace();
  const pending = initial.suite.variations.find(row => row.projectId === 'm6-10');
  const client = portfolioActor('client', pending.projectId);
  const start = projectFinancials(initial, pending.projectId);
  const cmd = { id: 'portfolio-test-decision', type: 'variation.decide', payload: { variationId: pending.id, revision: pending.revision, decision: 'accept' } };
  authorize(initial, cmd, client);
  const saved = executeSuite(initial, cmd, client, '2026-11-14T08:00:00Z');
  assert.equal(clientView(saved, pending.projectId).variations[0].status, 'accepted');
  assert.equal(projectFinancials(saved, pending.projectId).contract, start.contract + pending.clientDeltaCents);
  assert.equal(projectFinancials(saved, pending.projectId).estimatedCompletion, start.estimatedCompletion);
  assert.throws(() => authorize(initial, cmd, portfolioActor('client', 'm6-01')), { status: 403 });
});
