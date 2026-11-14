import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import readSheet from 'read-excel-file/node';
import { unzipSync, strFromU8 } from 'fflate';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('current drawings, exact variation decisions and published exports use the assigned project', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const workspace = await load('app/api/workspace/route.ts');
  const portal = await load('app/api/client-view/route.ts');
  const links = await load('app/api/portal/route.ts');
  const files = await load('app/api/files/[id]/route.ts');
  const { clientUpdatesSampleId: projectId } = await load('lib/sample-client-updates.ts');
  const { projectFinancials } = await load('lib/suite.ts');

  function signIn(userId) {
    fixture.user = { userId, displayName: userId, email: userId + '@example.test' };
  }
  async function send(type, payload, status = 200) {
    const req = request('/api/workspace', command(type, payload), 'owner');
    const response = await workspace.POST(req);
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result.state;
  }
  function member(id, role, assignments = { [projectId]: role }) {
    fixture.db.prepare('INSERT INTO memberships (id, organization_id, user_id, email, display_name, role, project_roles, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      .run('owner:' + id, 'owner', id, id + '@example.test', id, role, JSON.stringify(assignments));
  }
  function download(format, week, pid = projectId) {
    return portal.GET(request('/api/client-view?' + new URLSearchParams({ org: 'owner', projectId: pid, week, export: format })));
  }
  function drawingPdf(fileId) {
    return files.GET(request('/api/files/' + encodeURIComponent(fileId) + '?org=owner'), { params: Promise.resolve({ id: fileId }) });
  }

  signIn('owner');
  const seeded = await send('demo.client-updates.load', {});
  await send('demo.client-updates.load', {}, 400);
  const week = seeded.reports[0].weekStart;
  const drawing1 = seeded.suite.drawings[0];
  const drawing2 = seeded.suite.drawings[1];
  const variation = seeded.suite.variations[0];
  const media = seeded.suite.media[0];
  const originalCompletion = projectFinancials(seeded, projectId).estimatedCompletion;
  member('site', 'foreman');
  member('client', 'client');
  member('other', 'client', { 'another-project': 'client' });

  assert.equal((await download('xlsx', week)).status, 404);
  signIn('site');
  const site = await workspace.GET(request('/api/workspace?org=owner')).then(response => response.json());
  assert.deepEqual(site.state.suite.drawings.map(d => d.revision), [1]);
  assert.equal((await drawingPdf(drawing2.fileId)).status, 410);
  await send('drawing.issue', { drawingId: drawing2.id }, 403);
  signIn('owner');
  let state = await send('drawing.issue', { drawingId: drawing2.id });
  assert.deepEqual(state.suite.drawings.map(d => [d.status, d.published]), [['superseded', false], ['current', false]]);
  const archived = await drawingPdf(drawing1.fileId);
  assert.equal(archived.status, 200);
  assert.equal((await PDFDocument.load(await archived.arrayBuffer())).getPageCount(), 1);
  signIn('site');
  assert.equal((await drawingPdf(drawing1.fileId)).status, 410);
  assert.equal((await drawingPdf(drawing2.fileId)).status, 200);
  await send('drawing.acknowledge', { drawingId: drawing1.id, revision: 1 }, 409);
  state = await send('drawing.acknowledge', { drawingId: drawing2.id, revision: 2 });
  assert.deepEqual(state.suite.acknowledgements.map(a => [a.drawingId, a.name]), [[drawing2.id, 'site']]);
  signIn('client');
  assert.equal((await drawingPdf(drawing2.fileId)).status, 404);

  signIn('owner');
  await send('drawing.publish', { drawingId: drawing2.id, published: true });
  await send('media.publish', { mediaId: media.id, published: true });
  state = await send('report.save', { projectId, weekStart: week, summary: '=2+2\nCanopy setting-out checked & reviewed.', nextSteps: 'Coordinate formwork.', risks: 'Confirm variation.' });
  const updatedAt = state.reports[0].updatedAt;
  await send('report.publish', { projectId, weekStart: week, expectedUpdatedAt: '2026-01-01T08:00:00Z' }, 409);
  await send('report.publish', { projectId, weekStart: week, expectedUpdatedAt: updatedAt });
  const link = await links.POST(request('/api/portal', { action: 'create', projectId }, 'owner')).then(response => response.json());
  const token = new URL(link.url).pathname.split('/').at(-1);

  await send('variation.revise', { projectId, variationId: variation.id, expectedRevision: 1, title: variation.title,
    description: variation.description, clientDelta: '48000', internalDelta: '35000', days: 2, affectsCompletion: false });
  await send('variation.send', { variationId: variation.id, revision: 1 }, 409);
  await send('variation.send', { variationId: variation.id, revision: 2 });
  signIn('client');
  assert.equal((await drawingPdf(drawing2.fileId)).status, 200);
  assert.equal((await drawingPdf(drawing1.fileId)).status, 404);
  await send('variation.decide', { variationId: variation.id, revision: 1, decision: 'accept' }, 409);
  await send('variation.decide', { variationId: variation.id, revision: 2, decision: 'accept' });
  const data = await portal.GET(request('/api/client-view?org=owner&projectId=' + projectId)).then(response => response.json());
  assert.equal(data.portal.variations[0].approvedRevision, 2);
  assert.equal(data.portal.figures.contractCents, 229800000);
  assert.equal(data.portal.project.estimatedCompletion, originalCompletion);
  assert.equal(data.portal.media[0].id, media.id);
  assert.equal(data.portal.drawings[0].revision, 2);

  const workbook = await download('xlsx', week);
  assert.equal(workbook.status, 200);
  assert.match(workbook.headers.get('content-disposition'), /weekly-update-.+\.xlsx/);
  const bytes = Buffer.from(await workbook.arrayBuffer());
  const rows = await readSheet(bytes);
  assert.deepEqual(rows.find(([key]) => key === 'Reported progress (%)'), ['Reported progress (%)', 32]);
  assert.deepEqual(rows.find(([key]) => key === 'Work this week'), ['Work this week', '=2+2\nCanopy setting-out checked & reviewed.']);
  assert.match(rows.find(([key]) => key === 'Published evidence')[1], /fictional inspection sketch/);
  const cells = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  assert.ok(!cells.includes('<f>'));
  assert.ok(!cells.includes('35000') && !cells.includes('1800000'));
  const pdf = await links.GET(request('/api/portal?' + new URLSearchParams({ token, week, export: 'pdf' })));
  assert.equal(pdf.status, 200);
  assert.equal((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount(), 1);
  signIn('other');
  assert.equal((await download('pdf', week)).status, 403);
  signIn('owner');
  await links.POST(request('/api/portal', { action: 'revoke', linkId: link.id }, 'owner'));
  await send('report.save', { projectId, weekStart: week, summary: 'Edited weekly note awaiting publication.' });
  signIn('client');
  assert.equal((await download('xlsx', week)).status, 404);
  assert.equal((await links.GET(request('/api/portal?' + new URLSearchParams({ token, week, export: 'xlsx' })))).status, 410);
});
