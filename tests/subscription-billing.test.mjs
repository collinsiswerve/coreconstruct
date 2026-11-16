import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, databaseFixture, moduleLoader, request } from './helpers.mjs';

test('test billing preserves the monthly anchor and opens an invoice only for a new billing period', async () => {
  const load = moduleLoader();
  const { advanceTestCycle, emptySubscriptionBilling, recordTestPayment, startTestSubscription, subscriptionStatus } =
    await load('lib/subscription-billing.ts');
  const { normalizeState, emptySuite } = await load('lib/suite.ts');
  const prior = emptySuite();
  delete prior.subscriptionBilling;
  assert.deepEqual(normalizeState({ suite: prior }).suite.subscriptionBilling, emptySubscriptionBilling());
  const billing = emptySubscriptionBilling();
  startTestSubscription(billing, '2028-01-30T22:00:00.000Z');
  const first = billing.invoices[0];
  assert.deepEqual([first.start, first.nextCycle], ['2028-01-31', '2028-02-29']);
  assert.throws(() => advanceTestCycle(billing, first.reference), { status: 409 });
  recordTestPayment(billing, { invoice: first.reference, outcome: 'paid', expectedAttempts: 0 });
  advanceTestCycle(billing, first.reference);
  assert.deepEqual([billing.invoices[1].start, billing.invoices[1].nextCycle], ['2028-02-29', '2028-03-31']);
  assert.throws(() => advanceTestCycle(billing, first.reference), { status: 409 });
  assert.equal(subscriptionStatus(billing), 'Awaiting payment');
});

test('the principal can rehearse and review billing across renewals with firm-scoped access', async () => {
  const fixture = databaseFixture();
  const load = moduleLoader(fixture);
  const api = await load('app/api/workspace/route.ts');
  const team = await load('app/api/team/route.ts');
  const invitations = await load('app/api/invitations/route.ts');
  const portal = await load('app/api/client-view/route.ts');
  const { subscriptionStatus, testMonthlyPriceCents } = await load('lib/subscription-billing.ts');
  const org = 'subscription-owner';
  function login(id) { fixture.user = { userId: id, displayName: id, email: id + '@example.invalid' }; }
  async function check(response, code = 200) {
    assert.equal(response.status, code, response.status === code ? '' : await response.clone().text());
    return response.json();
  }
  const read = (firm = org) => api.GET(request('/api/workspace', undefined, firm));
  const post = (operation, code = 200) => api.POST(request('/api/workspace', operation, org)).then(response => check(response, code));
  const bill = (type, payload, code) => post(command('subscription.' + type, payload), code);

  login(org);
  const initial = await bill('start', {});
  const first = initial.state.suite.subscriptionBilling.invoices[0];
  assert.equal(first.reference, 'TEST-INV-001');
  assert.equal(first.amountCents, testMonthlyPriceCents);
  assert.equal(subscriptionStatus(initial.state.suite.subscriptionBilling), 'Awaiting payment');
  await bill('start', {}, 409);
  await bill('payment', { invoice: first.reference, outcome: 'pending', expectedAttempts: 0 }, 400);
  const decline = command('subscription.payment', { invoice: first.reference, outcome: 'failed', expectedAttempts: 0 });
  const failed = await post(decline);
  assert.equal(subscriptionStatus(failed.state.suite.subscriptionBilling), 'Payment failed');
  const replay = await post(decline);
  assert.equal(replay.version, failed.version);
  assert.equal(replay.state.suite.subscriptionBilling.invoices[0].payments.length, 1);
  await bill('payment', { invoice: first.reference, outcome: 'paid', expectedAttempts: 0 }, 409);
  fixture.conflict = true;
  await bill('payment', { invoice: first.reference, outcome: 'paid', expectedAttempts: 1 }, 409);
  const recovered = await bill('payment', { invoice: first.reference, outcome: 'paid', expectedAttempts: 1 });
  assert.equal(subscriptionStatus(recovered.state.suite.subscriptionBilling), 'Active');
  await bill('payment', { invoice: first.reference, outcome: 'paid', expectedAttempts: 2 }, 409);

  await bill('cancel', { invoice: first.reference, cancel: true });
  await bill('cancel', { invoice: first.reference, cancel: false });
  const renewed = await bill('advance', { invoice: first.reference });
  const second = renewed.state.suite.subscriptionBilling.invoices[1];
  assert.equal(second.start, first.nextCycle);
  await bill('advance', { invoice: first.reference }, 409);
  await bill('payment', { invoice: second.reference, outcome: 'paid', expectedAttempts: 0 });
  const ending = await bill('cancel', { invoice: second.reference, cancel: true });
  assert.equal(subscriptionStatus(ending.state.suite.subscriptionBilling), 'Ending this period');
  assert.equal(ending.state.suite.subscriptionBilling.testDate, second.start);
  const ended = await bill('advance', { invoice: second.reference });
  assert.equal(subscriptionStatus(ended.state.suite.subscriptionBilling), 'Ended');
  assert.equal(ended.state.suite.subscriptionBilling.invoices.length, 2);
  assert.equal(ended.state.suite.subscriptionBilling.testDate, second.nextCycle);
  const restarted = await bill('start', {});
  assert.equal(restarted.state.suite.subscriptionBilling.invoices.at(-1).reference, 'TEST-INV-003');

  const setup = await post(command('project.create', { name: 'Fictional project', location: 'Example site', budget: '100', contract: '150' }));
  const projectId = setup.state.projects[0].id;
  for (const role of ['pm', 'finance', 'accounts', 'foreman', 'client']) {
    login(org);
    const member = 'subscription-' + role;
    const { inviteUrl } = await check(await team.POST(request('/api/team', {
      action: 'invite', email: member + '@example.invalid', projectRoles: { [projectId]: role },
    }, org)));
    login(member);
    await check(await invitations.POST(request('/api/invitations', { token: new URL(inviteUrl).pathname.split('/').at(-1) })));
    const { state } = await check(await read());
    assert.deepEqual(state.suite.subscriptionBilling.invoices, []);
    assert.ok(!state.audit.some(record => record.action.startsWith('subscription.')));
    await bill('start', { projectId }, 403);
    if (role === 'client') {
      const view = await check(await portal.GET(request('/api/client-view?projectId=' + projectId, undefined, org)));
      assert.ok(!JSON.stringify(view).includes('TEST-INV'));
    }
  }
  login('unrelated-firm');
  const { state: unrelated } = await check(await read('unrelated-firm'));
  assert.deepEqual(unrelated.suite.subscriptionBilling.invoices, []);
  await check(await read(), 403);
  login(org);
  const { state: saved } = await check(await read());
  assert.deepEqual(saved.suite.subscriptionBilling.invoices[0].payments.map(item => item.outcome), ['failed', 'paid']);
});
