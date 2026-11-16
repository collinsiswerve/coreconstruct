import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, zipSync } from 'fflate';
import { readRecoveryArchive, restoreRecoveryArchive } from '../lib/recovery.mjs';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

const fixture = databaseFixture('release-owner', 'other-firm-owner');
const load = moduleLoader(fixture);
const workspace = await load('app/api/workspace/route.ts');
const files = await load('app/api/files/route.ts');
const download = await load('app/api/files/[id]/route.ts');
const clientView = await load('app/api/client-view/route.ts');
const team = await load('app/api/team/route.ts');
const recovery = await load('app/api/recovery/route.ts');
const offline = await load('lib/offline.ts');
const { weeklyClose } = await load('lib/weekly-close.ts');
const { dateKey, monday } = await load('lib/domain.ts');
const { operationsSampleId } = await load('lib/sample-operations.ts');
const { receiptFundingPosition } = await load('lib/project-finance.ts');
const org = 'release-owner';
const recoveryOwner = { id: 'recovery-owner', email: 'recovery@example.test', name: 'Recovery Owner' };
const siteUser = { id: 'release-foreman', organizationId: org };
const photo = await readFile(new URL('../public/samples/canopy-field-note.png', import.meta.url));
const origin = 'https://pilot.example';
const attachment = (field, bytes, name, category, type) => ({
  field, file: new Blob([bytes], { type }), name, category,
});

function login(store, id) {
  store.user = { userId: id, displayName: id, email: id + '@example.test' };
}
function member(store, organizationId, id, role, projectId) {
  store.db.prepare("INSERT INTO memberships (id,organization_id,user_id,email,display_name,role,project_roles,active) VALUES (?,?,?,?,?,?,?,1)")
    .run(organizationId + ':' + id, organizationId, id, id + '@example.test', id, role, JSON.stringify({ [projectId]: role }));
}
async function check(response, status = 200) {
  if (response.status !== status) assert.equal(response.status, status, (await response.clone().text()).slice(0, 500));
  return response;
}
async function post(type, payload, status = 200) {
  const response = await check(await workspace.POST(request('/api/workspace', command(type, payload), org)), status);
  return (await response.json()).state;
}
function draft(type, payload, attachments = []) {
  return {
    key: crypto.randomUUID(), userId: siteUser.id, organizationId: org,
    command: command(type, payload), attachments,
    queuedAt: new Date().toISOString(), status: 'pending',
  };
}
const viewRequest = (projectId, organizationId = org, extra = '') =>
  request('/api/client-view?projectId=' + projectId + extra, undefined, organizationId);
const fileRequest = (id, organizationId = org) =>
  [request('/api/files/' + id, undefined, organizationId), { params: Promise.resolve({ id }) }];

test('sample weekly close reconciles after a payment correction, then recovers the same project and evidence', async () => {
  login(fixture, org);
  let state = await post('demo.operations.load', {});
  const projectId = operationsSampleId;
  const week = state.attendance[0].date;
  const today = dateKey();
  const foreman = siteUser.id;
  const pm = 'release-pm';
  const client = 'release-client';
  member(fixture, org, foreman, 'foreman', projectId);
  member(fixture, org, pm, 'pm', projectId);
  member(fixture, org, client, 'client', projectId);
  assert.equal(weeklyClose(state, projectId, week).pendingProcurement, 2);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const noteBytes = await pdf.save();
  const order = state.suite.orders[0];

  const incoming = draft('delivery.submit', {
    projectId, orderId: order.id, lineId: order.lines[0].id,
    quantity: 2, noteReference: 'DN-RELEASE-001', location: { exceptionReason: 'Fictional field capture' },
  }, [
    attachment('offloadFileId', photo, 'offload.png', 'offload', 'image/png'),
    attachment('noteFileId', noteBytes, 'delivery.pdf', 'delivery-note', 'application/pdf'),
  ]);
  await offline.enqueue(incoming);
  let loseNoteResponse = true;
  let loseSaveResponse = true;
  const uploads = [];
  const fieldRequest = async (path, init) => {
    const req = new Request(origin + path, { ...init, headers: { ...init.headers, Origin: origin } });
    if (path === '/api/files') {
      const category = init.body.get('category');
      uploads.push(category);
      const response = await files.POST(req);
      if (category === 'delivery-note' && loseNoteResponse && response.ok) {
        loseNoteResponse = false;
        throw new TypeError('The phone lost the upload response');
      }
      return response;
    }
    const response = await workspace.POST(req);
    if (loseSaveResponse && response.ok) {
      loseSaveResponse = false;
      throw new TypeError('The phone lost the save response');
    }
    return response;
  };
  // Even an owner must use the account that prepared the queued operation.
  assert.match((await offline.syncPendingDrafts(fieldRequest, siteUser)).stopped, /prepared this save/);
  assert.equal(fixture.objects.size, 0);
  uploads.length = 0;
  login(fixture, foreman);
  assert.equal((await offline.syncPendingDrafts(fieldRequest, { ...siteUser, organizationId: 'other-firm' })).saved, 0);
  assert.match((await offline.syncPendingDrafts(fieldRequest, siteUser)).stopped, /connection stopped/);
  const [queued] = await offline.pending(foreman, org);
  assert.equal(queued.status, 'pending');
  assert.ok(queued.attachments[0].uploadedId);
  assert.equal(queued.attachments[1].uploadedId, undefined);
  assert.equal(fixture.objects.size, 2);
  assert.match((await offline.syncPendingDrafts(fieldRequest, siteUser)).stopped, /connection stopped/);
  assert.equal((await offline.pending(foreman, org)).length, 1);
  assert.equal((await offline.syncPendingDrafts(fieldRequest, siteUser)).saved, 1);
  assert.deepEqual(uploads, ['offload', 'delivery-note', 'delivery-note']);
  assert.equal(fixture.objects.size, 2);
  assert.equal((await offline.pending(foreman, org)).length, 0);
  state = (await (await check(await workspace.GET(request('/api/workspace', undefined, org)))).json()).state;
  assert.equal(state.suite.deliveries.filter(row => row.noteReference === 'DN-RELEASE-001').length, 1);
  const delivery = state.suite.deliveries.find(row => row.noteReference === 'DN-RELEASE-001');

  const shift = state.attendance[0];
  await offline.enqueue(draft('attendance.save', { ...shift, task: 'An older phone edit', expectedToken: '' }));
  const otherDraft = draft('attendance.save', {
    projectId, workerId: shift.workerId, date: today, units: 1, rate: '1000', task: 'Another site day', expectedToken: '',
  });
  otherDraft.queuedAt = new Date(Date.now() + 1000).toISOString();
  await offline.enqueue(otherDraft);
  fixture.conflict = true;
  const conflict = await offline.syncPendingDrafts(fieldRequest, siteUser);
  assert.equal(conflict.needsReview, 1);
  assert.match(conflict.stopped, /Another device saved/);
  assert.equal((await offline.syncPendingDrafts(fieldRequest, siteUser)).saved, 1);
  const [review] = await offline.pending(foreman, org);
  assert.equal(review.status, 'needs-review');
  assert.match(review.error, /Attendance changed/);
  assert.equal((await offline.pending(pm, org)).length, 0);
  state = await post('wagebill.submit', { projectId, weekStart: week });
  const bill = state.wagebills[0];
  assert.deepEqual([bill.grossCents, bill.advanceCents, bill.payableCents], [150000, 30000, 120000]);

  login(fixture, pm);
  await post('wagebill.approve', { billId: bill.id });
  await post('delivery.approve', { deliveryId: delivery.id });
  state = await post('delivery.approve', { deliveryId: projectId + ':delivery' });
  const invoice = state.suite.invoices[0];
  state = await post('invoice.approve', { invoiceId: invoice.id });
  const expense = state.expenses.find(row => row.supplierInvoiceId === invoice.id);
  await post('payment.record', { targetType: 'wagebill', targetId: bill.id, amount: '1200', date: today, method: 'M-Pesa', reference: 'WAGES-RELEASE-001' });
  state = await post('payment.record', { targetType: 'expense', targetId: expense.id, amount: '1000', date: today, method: 'Bank transfer', reference: 'BANK-RELEASE-WRONG' });
  const wrongPayment = state.payments.at(-1);
  login(fixture, org);
  state = await post('finance.bill.record', { projectId, kind: 'payment-certificate', reference: 'IPC-RELEASE-001', title: 'Sample valuation', amount: '10000', dueDate: today });
  const milestone = state.suite.milestones[0];
  state = await post('receipt.issue', { projectId, title: 'Sample client payment', amount: '6000', date: today, method: 'Bank transfer', reference: 'CLIENT-RELEASE-001' });
  const clientReceipt = state.suite.receipts[0];
  await post('finance.receipt.plan', {
    receiptId: clientReceipt.id, revision: 0, applications: [{ milestoneId: milestone.id, amount: '6000' }],
    allocations: [{ category: 'materials', amount: '4000' }],
  });
  const funding = { receiptId: clientReceipt.id, category: 'materials', outflowId: 'payment:' + wrongPayment.id, amount: '1000' };
  await post('finance.funding.link', funding);
  state = await post('payment.reverse', { paymentId: wrongPayment.id, reason: 'Wrong bank reference' });
  assert.equal(weeklyClose(state, projectId, week).ledger.outstanding, 280000);
  assert.equal(receiptFundingPosition(600000, state.projectFunding[projectId]).spentCents, 0);
  state = await post('payment.record', { targetType: 'expense', targetId: expense.id, amount: '1000', date: today, method: 'Bank transfer', reference: 'BANK-RELEASE-001' });
  await post('finance.funding.link', { ...funding, outflowId: 'payment:' + state.payments.at(-1).id });
  state = await post('report.save', {
    projectId, weekStart: week, summary: 'The team completed the sample wall set-out.',
    nextSteps: 'Review the next delivery.', risks: 'No new sample issues.',
  });
  login(fixture, client);
  const beforePublish = await (await check(await clientView.GET(viewRequest(projectId)))).json();
  assert.equal(beforePublish.portal.reports.length, 0);
  assert.equal((await recovery.GET(request('/api/recovery', undefined, org))).status, 403);
  login(fixture, pm);
  state = await post('report.publish', { projectId, weekStart: week, expectedUpdatedAt: state.reports[0].updatedAt });
  const close = weeklyClose(state, projectId, week);
  assert.equal(close.balancesReconcile, true);
  assert.equal(close.reportPublished, true);
  assert.equal(close.clientReceipts, 600000);
  assert.equal(close.pendingProcurement, 0);
  assert.equal(close.commitments, 420000);
  assert.deepEqual(close.ledger, { labour: 150000, expenses: 280000, incurred: 430000, outstanding: 180000, cashPaid: 250000, unallocatedAdvances: 0 });
  assert.deepEqual(state.suite.stock.map(row => row.quantityMilli).sort((a, b) => a - b), [2000, 6000]);

  login(fixture, client);
  const { portal } = await (await check(await clientView.GET(viewRequest(projectId)))).json();
  assert.equal(portal.reports[0].summary, close.report.summary);
  assert.equal(portal.milestones[0].appliedCents, 600000);
  assert.ok(!JSON.stringify(portal).includes('BANK-RELEASE'));
  await check(await clientView.GET(viewRequest(projectId, org, '&export=pdf&week=' + week)));
  await check(await clientView.GET(viewRequest(projectId, org, '&export=xlsx&week=' + week)));
  assert.equal((await download.GET(...fileRequest(delivery.noteFileId))).status, 404);
  login(fixture, 'other-firm-owner');
  await check(await workspace.GET(request()));
  assert.equal((await workspace.GET(request('/api/workspace', undefined, org))).status, 403);
  assert.equal((await clientView.GET(viewRequest(projectId))).status, 403);
  assert.equal((await download.GET(...fileRequest(delivery.noteFileId, 'other-firm-owner'))).status, 404);

  login(fixture, org);
  await check(await team.POST(request('/api/team', {
    action: 'update-member', userId: foreman, projectRoles: { [projectId]: 'foreman' }, active: false,
  }, org)));
  login(fixture, foreman);
  assert.equal((await workspace.GET(request('/api/workspace', undefined, org))).status, 403);
  assert.equal((await download.GET(...fileRequest(delivery.noteFileId))).status, 403);

  login(fixture, org);
  const response = await check(await recovery.GET(request('/api/recovery', undefined, org)));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const zip = new Uint8Array(await response.arrayBuffer());
  const archive = await readRecoveryArchive(zip);
  assert.deepEqual(receiptFundingPosition(600000, state.projectFunding[projectId]), { spentCents: 100000, earmarkedCents: 300000, unallocatedCents: 200000 });
  const changed = unzipSync(zip);
  changed['files/' + delivery.noteFileId][0] ^= 1;
  await assert.rejects(() => readRecoveryArchive(zipSync(changed, { level: 0 })), /attachment failed its archive checksum/);
  const unavailable = fixture.objects.get(org + '/' + delivery.noteFileId);
  fixture.objects.delete(org + '/' + delivery.noteFileId);
  await check(await recovery.GET(request('/api/recovery', undefined, org)), 409);
  fixture.objects.set(org + '/' + delivery.noteFileId, unavailable);

  const target = databaseFixture();
  const restored = await restoreRecoveryArchive(target.env.DB, target.env.BUCKET, recoveryOwner, archive);
  assert.deepEqual(restored, { version: archive.manifest.workspaceVersion, projects: 1, files: 2 });
  await assert.rejects(() => restoreRecoveryArchive(target.env.DB, target.env.BUCKET, recoveryOwner, archive), /fresh recovery database/);
  const loadTarget = moduleLoader(target);
  const restoredWorkspace = await loadTarget('app/api/workspace/route.ts');
  const restoredFiles = await loadTarget('app/api/files/[id]/route.ts');
  login(target, recoveryOwner.id);
  const { state: recovered } = await (await check(await restoredWorkspace.GET(request('/api/workspace', undefined, recoveryOwner.id)))).json();
  assert.deepEqual(weeklyClose(recovered, projectId, week), close);
  assert.deepEqual(receiptFundingPosition(600000, recovered.projectFunding[projectId]), { spentCents: 100000, earmarkedCents: 300000, unallocatedCents: 200000 });
  assert.ok(recovered.payments.some(payment => payment.id === wrongPayment.id && payment.reversedAt));
  for (const [id, expected] of [[delivery.offloadFileId, photo], [delivery.noteFileId, noteBytes]]) {
    const downloaded = await check(await restoredFiles.GET(...fileRequest(id, recoveryOwner.id)));
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(expected));
  }
  assert.equal(target.db.prepare('SELECT COUNT(*) AS count FROM memberships').get().count, 1);
  login(target, client);
  assert.equal((await restoredWorkspace.GET(request('/api/workspace', undefined, recoveryOwner.id))).status, 403);
  assert.equal(monday(week), week);
});
