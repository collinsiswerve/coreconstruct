import { dateKey, DomainError } from './domain';

export const testMonthlyPriceCents = 1_000_000;

type PaymentOutcome = 'failed' | 'paid';
export type TestPayment = { reference: string; outcome: PaymentOutcome; on: string };
export type TestInvoice = {
  reference: string;
  start: string;
  nextCycle: string;
  amountCents: number;
  payments: TestPayment[];
};
export type SubscriptionBilling = {
  testDate?: string;
  billingDay?: number;
  cancelAtPeriodEnd: boolean;
  invoices: TestInvoice[];
};

export const emptySubscriptionBilling = (): SubscriptionBilling => ({ cancelAtPeriodEnd: false, invoices: [] });

export function invoiceStatus(invoice: TestInvoice): 'Due' | 'Payment failed' | 'Paid' {
  const latest = invoice.payments.at(-1);
  return latest?.outcome === 'paid' ? 'Paid' : latest?.outcome === 'failed' ? 'Payment failed' : 'Due';
}

export function subscriptionStatus(billing: SubscriptionBilling) {
  const invoice = billing.invoices.at(-1);
  if (!invoice) return 'Not started';
  if (billing.cancelAtPeriodEnd) return billing.testDate! >= invoice.nextCycle ? 'Ended' : 'Ending this period';
  const status = invoiceStatus(invoice);
  return status === 'Paid' ? 'Active' : status === 'Due' ? 'Awaiting payment' : status;
}

function issueTestInvoice(billing: SubscriptionBilling, start: string, billingDay: number) {
  const monthEnd = new Date(start + 'T12:00:00Z');
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 2, 0);
  monthEnd.setUTCDate(Math.min(billingDay, monthEnd.getUTCDate()));
  billing.invoices.push({
    reference: 'TEST-INV-' + String(billing.invoices.length + 1).padStart(3, '0'),
    start, nextCycle: monthEnd.toISOString().slice(0, 10), amountCents: testMonthlyPriceCents, payments: [],
  });
  billing.testDate = start;
}

export function startTestSubscription(billing: SubscriptionBilling, at: string) {
  const status = subscriptionStatus(billing);
  if (status !== 'Not started' && status !== 'Ended') throw new DomainError('A test subscription is already open.', 409);
  const today = billing.testDate ?? dateKey(new Date(at));
  billing.billingDay = Number(today.slice(-2));
  billing.cancelAtPeriodEnd = false;
  issueTestInvoice(billing, today, billing.billingDay);
}

function currentInvoice(billing: SubscriptionBilling, reference: unknown) {
  const invoice = billing.invoices.at(-1);
  if (!invoice || invoice.reference !== reference || subscriptionStatus(billing) === 'Ended') {
    throw new DomainError('The test cycle has changed. Refresh to see the latest invoice.', 409);
  }
  return invoice;
}

export function recordTestPayment(billing: SubscriptionBilling, payload: Record<string, unknown>) {
  const invoice = currentInvoice(billing, payload.invoice);
  const { outcome } = payload;
  if (outcome !== 'paid' && outcome !== 'failed') throw new DomainError('Choose a test payment outcome.');
  if (invoiceStatus(invoice) === 'Paid') throw new DomainError('This test invoice is already paid.', 409);
  if (payload.expectedAttempts !== invoice.payments.length) {
    throw new DomainError('The payment history has changed. Refresh to review the recorded attempts.', 409);
  }
  const payment: TestPayment = {
    reference: `${invoice.reference.replace('INV', 'PAY')}-${invoice.payments.length + 1}`,
    outcome, on: billing.testDate!,
  };
  invoice.payments.push(payment);
  return payment;
}

export function advanceTestCycle(billing: SubscriptionBilling, reference: unknown) {
  const invoice = currentInvoice(billing, reference);
  if (invoiceStatus(invoice) !== 'Paid') throw new DomainError('Record a successful test payment before opening the next cycle.', 409);
  if (billing.cancelAtPeriodEnd) billing.testDate = invoice.nextCycle;
  else issueTestInvoice(billing, invoice.nextCycle, billing.billingDay!);
}

export function setTestCancellation(billing: SubscriptionBilling, payload: Record<string, unknown>) {
  const invoice = currentInvoice(billing, payload.invoice);
  if (typeof payload.cancel !== 'boolean') throw new DomainError('Choose whether to renew at the end of this test cycle.');
  if (invoiceStatus(invoice) !== 'Paid') throw new DomainError('Set the test cancellation after the current invoice is paid.', 409);
  if (billing.cancelAtPeriodEnd === payload.cancel) throw new DomainError('This test renewal setting is already recorded.', 409);
  billing.cancelAtPeriodEnd = payload.cancel;
}
