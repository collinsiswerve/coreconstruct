import assert from 'node:assert/strict';
import { test } from 'node:test';
import readSheet from 'read-excel-file/node';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('a new fictional firm completes setup, closes its first week and publishes to an assigned client', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const workspace = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');
  const clientView = await load('app/api/client-view/route.ts');
  const { onboardingProgress } = await load('lib/onboarding.ts');
  const { addDays, monday } = await load('lib/domain.ts');
  const { guessBoqMapping, previewBoqRows } = await load('lib/boq-import.ts');
  const org = 'ridgeway-principal';
  const week = addDays(monday(), -7);
  const day = addDays(week, 1);
  const login = id => { fixture.user = { userId: id, displayName: id, email: id + '@example.invalid' }; };
  async function body(response, expected = 200) {
    assert.equal(response.status, expected, response.status !== expected ? await response.clone().text() : '');
    return response.json();
  }
  const getState = async () => (await body(await workspace.GET(request('/api/workspace', undefined, org)))).state;
  const getTeam = async () => body(await team.GET(request('/api/team', undefined, org)));
  const run = async (type, payload, expected) =>
    body(await workspace.POST(request('/api/workspace', command(type, payload), org)), expected);
  const portal = (projectId, extra = '') => clientView.GET(request('/api/client-view?projectId=' + projectId + extra, undefined, org));

  login(org);
  const empty = await getState();
  assert.equal(empty.projects.length, 0);
  assert.deepEqual(onboardingProgress(empty, undefined, week), { namedFirm: false });
  await run('firm.update', { name: 'Ridgeway Works' });
  const { state: created } = await run('project.create', {
    name: 'Mwangaza Court Workshop', location: 'Juja, Kiambu · fictional site',
    client: 'Mwangaza Facilities', budget: '720000', contract: '929637.50', mode: 'fixed',
  });
  const projectId = created.projects[0].id;
  const progress = (state, access, selected = week) => onboardingProgress(state, state.projects[0], selected, access);
  assert.equal(progress(created).namedFirm, true);
  assert.equal(progress(created).project.reconciled, false);
  assert.equal(progress(created).project.reportPublished, false);

  async function invite(id, role) {
    login(org);
    const { inviteUrl } = await body(await team.POST(request('/api/team', {
      action: 'invite', email: id + '@example.invalid', projectRoles: { [projectId]: role },
    }, org)));
    return new URL(inviteUrl).pathname.split('/').at(-1);
  }
  async function join(id, token) {
    login(id);
    return body(await invitations.POST(request('/api/invitations', { token })));
  }
  const foreman = 'ridgeway-foreman', pm = 'ridgeway-pm', client = 'mwangaza-client';
  const fieldInvite = await invite(foreman, 'foreman');
  const clientInvite = await invite(client, 'client');
  assert.deepEqual(progress(created, await getTeam()).project.team, { staff: 'invited', client: 'invited' });
  await join(foreman, fieldInvite);
  await join(client, clientInvite);
  await join(pm, await invite(pm, 'pm'));
  login(org);
  assert.deepEqual(progress(created, await getTeam()).project.team, { staff: 'assigned', client: 'assigned' });

  const sheet = await readSheet(new URL('../public/templates/boq-import.xlsx', import.meta.url).pathname, {
    sheet: 'BOQ', parseNumber: value => value,
  });
  const rows = sheet.map(row => row.map(value => value == null ? '' : String(value)));
  const imported = previewBoqRows(rows, 0, rows.length, guessBoqMapping(rows[0]), []);
  assert.deepEqual(imported.issues, []);
  await run('boq.import', { projectId, rows: imported.rows, source: 'boq-import.xlsx · BOQ' });
  const { state: opened } = await run('opening.record', {
    projectId, asOf: addDays(week, -1), reference: 'Ridgeway BOQ and opening ledger', revision: 0,
    budget: '720000', clientBilled: '0', clientReceived: '0', costsIncurred: '0', costsPaid: '0',
  });
  assert.equal(progress(opened).project.boqCount, 4);
  assert.equal(progress(opened).project.boqAllowance, opened.projects[0].opening.budgetCents);
  assert.equal(progress(opened).project.reconciled, false);

  login(foreman);
  const { state: staffed } = await run('worker.register', { projectId, name: 'Ridgeway Carpenter', trade: 'Carpenter', rate: '1200' });
  const workerId = staffed.workers[0].id;
  const { state: attended } = await run('attendance.save', {
    projectId, workerId, date: day, units: 2, task: 'Set out workshop door openings', expectedToken: '',
  });
  assert.equal(progress(attended).project.reconciled, false);
  const { state: submitted } = await run('wagebill.submit', { projectId, weekStart: week });
  const bill = submitted.wagebills[0];
  assert.equal(bill.payableCents, 120000);
  await run('wagebill.approve', { billId: bill.id }, 403);

  login(pm);
  await run('wagebill.approve', { billId: bill.id, revision: bill.revision });
  await run('payment.record', {
    targetId: bill.id, targetType: 'wagebill', amount: '1200', method: 'M-Pesa', date: addDays(week, 5),
    reference: 'RHW-DEMO-WAGES-01',
  });
  const summary = 'Ridgeway completed its first weekly workshop inspection.';
  const { state: draft } = await run('report.save', { projectId, weekStart: week, summary, nextSteps: 'Confirm the door sizes.' });
  assert.equal(progress(draft).project.reconciled, true);
  assert.equal(progress(draft).project.reportPublished, false);
  login(client);
  assert.equal((await body(await portal(projectId))).portal.reports.length, 0);
  login(pm);
  await run('report.publish', { projectId, weekStart: week, expectedUpdatedAt: draft.reports[0].updatedAt });

  login(org);
  const final = progress(await getState(), await getTeam(), addDays(week, 7)).project;
  assert.deepEqual([final.week, final.reconciled, final.reportPublished], [week, true, true]);
  assert.deepEqual([final.close.ledger.incurred, final.close.ledger.cashPaid, final.close.ledger.outstanding], [120000, 120000, 0]);

  login(client);
  const { portal: published } = await body(await portal(projectId));
  assert.equal(published.firm, 'Ridgeway Works');
  assert.equal(published.reports[0].summary, summary);
  assert.equal(published.figures.contractCents, 92963750);
  assert.ok(!JSON.stringify(published).includes('RHW-DEMO-WAGES-01'));
  const pdf = await portal(projectId, '&export=pdf&week=' + week);
  assert.equal(pdf.status, 200);
  assert.ok((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() > 0);
  const xlsx = await portal(projectId, '&export=xlsx&week=' + week);
  assert.equal(xlsx.status, 200);
  assert.match(Buffer.from(unzipSync(new Uint8Array(await xlsx.arrayBuffer()))['xl/worksheets/sheet1.xml']).toString(), /first weekly workshop inspection/);

  login('unassigned-fictional-client');
  assert.equal((await portal(projectId)).status, 403);
});
