import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('sign-in resumes internal workspace and invitation links and drops other destinations', async () => {
  const load = moduleLoader();
  const { workspaceReturnPath, chatGPTSignInPath, chatGPTSignOutPath, loginPagePath } = await load('lib/auth-navigation.ts');
  const invitation = '/join/' + 'a'.repeat(64);
  assert.equal(loginPagePath(invitation), '/login?next=' + encodeURIComponent(invitation));
  assert.equal(chatGPTSignInPath(invitation), '/signin-with-chatgpt?return_to=' + encodeURIComponent(invitation));
  assert.equal(chatGPTSignOutPath(), '/signout-with-chatgpt?return_to=%2Flogin');
  assert.equal(workspaceReturnPath('/?view=billing'), '/?view=billing');
  assert.equal(workspaceReturnPath('/?view=finance&project=m6-09&week=2026-11-09'), '/?view=finance&project=m6-09&week=2026-11-09');
  assert.equal(workspaceReturnPath('/receipts/sample%3A1?org=firm-owner'), '/receipts/sample%3A1?org=firm-owner');
  assert.equal(workspaceReturnPath('/client/assigned-project?org=firm-abc&extra=discard'), '/client/assigned-project?org=firm-abc');
  for (const path of ['https://example.invalid', '//example.invalid', '/api/workspace', '/callback', '/join/invalid']) {
    assert.equal(workspaceReturnPath(path), '/');
  }
});

test('only invited members or a configured principal can open a firm after authentication', async () => {
  const fixture = databaseFixture('approved-owner');
  const load = moduleLoader(fixture);
  const workspace = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');
  const { mayOpenWorkspace } = await load('lib/server.ts');
  const owner = 'approved-owner';
  const employee = 'invited-reviewer';
  function login(id, email = id + '@example.invalid') {
    fixture.user = { userId: id, displayName: id, email };
  }
  const workspaceGet = (org) => workspace.GET(request('/api/workspace', undefined, org));
  const post = (type, payload, org) => workspace.POST(request('/api/workspace', command(type, payload), org));
  const orgCount = () => fixture.db.prepare('SELECT count(*) AS total FROM organizations').get().total;
  const invites = (body) => team.POST(request('/api/team', body, owner));
  const accept = (token) => invitations.POST(request('/api/invitations', { token }));
  async function check(response, status) {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }

  await check(await workspaceGet(), 401);
  login('unknown-visitor');
  assert.equal(await mayOpenWorkspace(fixture.user), false);
  assert.equal((await check(await workspaceGet(), 403)).code, 'workspace_invitation_required');
  await check(await post('firm.update', { name: 'Unassigned workspace' }), 403);
  assert.equal(orgCount(), 0);

  login(owner);
  assert.equal(await mayOpenWorkspace(fixture.user), true);
  await check(await workspaceGet('other-firm'), 403);
  assert.equal(orgCount(), 0);
  const first = await check(await workspaceGet(owner), 200);
  assert.equal(first.actor.role, 'admin');
  assert.equal(first.actor.organizationId, owner);
  const ready = await check(await post('project.create', { name: 'Fictional prototype', location: 'Example site', budget: '1000', contract: '1500' }, owner), 200);
  const projectId = ready.state.projects[0].id;
  const { inviteUrl } = await check(await invites({ action: 'invite', email: employee + '@example.invalid', projectRoles: { [projectId]: 'finance' } }), 200);
  const token = new URL(inviteUrl).pathname.split('/').at(-1);

  login('different-account');
  await check(await accept(token), 403);
  login(employee);
  assert.equal(await mayOpenWorkspace(fixture.user), false);
  await check(await workspaceGet(), 403);
  await check(await accept(token), 200);
  assert.equal(await mayOpenWorkspace(fixture.user), true);
  const joined = await check(await workspaceGet(owner), 200);
  assert.equal(joined.actor.role, 'finance');
  assert.deepEqual(joined.actor.projectRoles, { [projectId]: 'finance' });
  assert.equal(orgCount(), 1);
  await check(await accept(token), 410);
  await check(await workspaceGet('other-firm'), 403);

  login(owner);
  await check(await invites({ action: 'update-member', userId: employee, projectRoles: { [projectId]: 'finance' }, active: false }), 200);
  fixture.env.CORECONSTRUCT_BOOTSTRAP_PRINCIPALS += ',' + employee;
  login(employee);
  assert.equal(await mayOpenWorkspace(fixture.user), false);
  await check(await workspaceGet(), 403);
  assert.equal(orgCount(), 1);
});
