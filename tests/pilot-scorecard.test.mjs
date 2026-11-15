import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('pilot results compare the baseline, retain distinct weekly records and protect the principal’s data', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const api = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');
  const clientView = await load('app/api/client-view/route.ts');
  const { addDays, monday } = await load('lib/domain.ts');
  const { emptySuite, normalizeState } = await load('lib/suite.ts');
  const { makeCsv } = await load('lib/export.ts');
  const { pilotSummary, pilotExportRows } = await load('lib/pilot-scorecard.ts');

  const priorSuite = emptySuite();
  delete priorSuite.pilot;
  assert.deepEqual(normalizeState({ suite: priorSuite }).suite.pilot, { projects: {} });
  const { addScorecardSample } = await load('preview/scorecard-sample.ts');
  const sample = normalizeState({ suite: priorSuite });
  addScorecardSample(sample);
  const shown = pilotSummary(sample.suite.pilot.projects['m6-09']);
  assert.deepEqual([shown.cycles.length, shown.averageMinutes, shown.onTime, shown.scheduled, shown.exceptions, shown.support], [6, 102.5, 127, 145, 1, 156]);
  assert.equal(shown.reduction.toFixed(1), '31.7');
  assert.equal(shown.onTimePercent.toFixed(1), '87.6');

  const org = 'pilot-test-principal';
  const week = addDays(monday(), -14);
  const next = addDays(week, 7);
  const login = id => { fixture.user = { userId: id, displayName: id, email: id + '@example.invalid' }; };
  async function result(response, code = 200) {
    assert.equal(response.status, code, response.status === code ? '' : await response.clone().text());
    return response.json();
  }
  const read = (firm = org) => api.GET(request('/api/workspace', undefined, firm));
  const post = (type, values, code = 200) =>
    api.POST(request('/api/workspace', command(type, values), org)).then(response => result(response, code));
  const setup = { name: 'Fictional Scorecard Works', location: 'Example site', budget: '100000', contract: '150000' };

  login(org);
  const { state: initial } = await post('project.create', setup);
  const projectId = initial.projects[0].id;
  const { state: twoProjects } = await post('project.create', { ...setup, name: 'Other test project' });
  const otherProject = twoProjects.projects[1].id;
  await post('pilot.baseline.save', {
    projectId, revision: 0, weekStart: addDays(week, -7), wagebillMinutes: '60', reportMinutes: '90', evidence: 'Measured baseline',
  });
  const cycle = {
    projectId, revision: 0, weekStart: week, closedOn: addDays(week, 4), wagebillMinutes: '30', reportMinutes: '60',
    scheduled: '10', onTime: '8', wageDifference: '0', costDifference: '0', clientDifference: '750.50',
    supportMinutes: '15', evidence: 'INTERNAL-TEST-REF', notes: '=FORMULA()',
  };
  await post('pilot.week.save', { ...cycle, weekStart: addDays(week, 1) }, 400);
  await post('pilot.week.save', { ...cycle, onTime: '11' }, 400);
  await post('pilot.week.save', { ...cycle, supportMinutes: '' }, 400);
  await post('pilot.week.save', cycle);
  await post('pilot.week.save', { ...cycle, clientDifference: '0', evidence: 'Stale edit' }, 409);
  await post('pilot.week.save', { ...cycle, weekStart: next, closedOn: addDays(next, 4), wagebillMinutes: '48',
    scheduled: '20', onTime: '18', clientDifference: '0', supportMinutes: '25' });
  await post('pilot.renewal.save', { revision: 0, response: 'willing', checkedOn: next, monthlyPrice: '0' }, 400);
  await post('pilot.renewal.save', {
    revision: 0, response: 'willing', checkedOn: next, monthlyPrice: '12000', evidence: 'Fictional written response',
  });
  const { state: saved } = await result(await read());
  assert.equal(saved.suite.pilot.projects[otherProject], undefined);
  const data = saved.suite.pilot.projects[projectId];
  const summary = pilotSummary(data);
  assert.equal(summary.averageMinutes, 99);
  assert.ok(Math.abs(summary.reduction - 34) < 0.001);
  assert.equal(summary.onTimePercent.toFixed(1), '86.7');
  assert.deepEqual([summary.exceptions, summary.support], [1, 40]);
  const rows = pilotExportRows(saved.firm, setup.name, data, saved.suite.pilot.renewal);
  assert.deepEqual(rows.map(row => row[2]), ['Record type', 'Baseline', 'Weekly close', 'Weekly close', 'Firm renewal']);
  assert.match(makeCsv(rows), /"750.5".*"'=FORMULA\(\)"/);
  const { state: corrected } = await post('pilot.week.save', { ...cycle, revision: 1, clientDifference: '0' });
  assert.equal(pilotSummary(corrected.suite.pilot.projects[projectId]).exceptions, 0);
  assert.equal(corrected.audit.at(-1).before.clientDifferenceCents, 75050);

  for (const role of ['pm', 'finance', 'client']) {
    login(org);
    const user = 'pilot-test-' + role;
    const { inviteUrl } = await result(await team.POST(request('/api/team', {
      action: 'invite', email: user + '@example.invalid', projectRoles: { [projectId]: role },
    }, org)));
    login(user);
    await result(await invitations.POST(request('/api/invitations', { token: new URL(inviteUrl).pathname.split('/').at(-1) })));
    const { state: scoped } = await result(await read());
    assert.deepEqual(scoped.suite.pilot, { projects: {} });
    assert.ok(!scoped.audit.some(entry => entry.action.startsWith('pilot.')));
    await post('pilot.week.save', cycle, 403);
    if (role === 'client') {
      const portal = await result(await clientView.GET(request('/api/client-view?projectId=' + projectId, undefined, org)));
      assert.ok(!JSON.stringify(portal).includes('INTERNAL-TEST-REF'));
    }
  }
  login('different-firm-principal');
  await result(await read('different-firm-principal'));
  await result(await read(), 403);
});
