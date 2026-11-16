'use client';

import { CalendarDays, CreditCard, ShieldCheck } from 'lucide-react';
import { addDays, displayDate, kes } from '../lib/domain';
import { invoiceStatus, subscriptionStatus, testMonthlyPriceCents, type SubscriptionBilling } from '../lib/subscription-billing';
import { Badge } from './ui';

type Props = {
  billing: SubscriptionBilling;
  saving: boolean;
  command: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>;
  reset?: () => void;
};

const day = (date: string) => displayDate(date) + ' ' + date.slice(0, 4);
const tone = (status: string) => {
  if (status === 'Paid' || status === 'Active') return 'green';
  if (status === 'Payment failed') return 'red';
  if (status === 'Awaiting payment' || status === 'Ending this period' || status === 'Due') return 'amber';
  return 'neutral';
};

export function SubscriptionBillingPanel({ billing, saving, command, reset }: Props) {
  const invoice = billing.invoices.at(-1);
  const status = subscriptionStatus(billing);
  const canStart = status === 'Not started' || status === 'Ended';
  const paid = invoice && invoiceStatus(invoice) === 'Paid';
  const latestCovered = billing.invoices.findLast(item => invoiceStatus(item) === 'Paid');

  return <div className="suite-content subscription-billing">
    <div className="demo-banner subscription-banner">
      <ShieldCheck size={17} />
      <span><strong>Test billing.</strong> All invoices and payment outcomes are simulated.</span>
      {reset && <button onClick={reset}>Reset billing demo</button>}
    </div>
    <div className="suite-two">
      <section className="panel suite-panel">
        <div className="panel-heading"><div><h2>Monthly firm plan</h2><p>CoreConstruct workspace subscription</p></div><CreditCard size={19} /></div>
        <div className="subscription-body">
          <div className="subscription-rate"><strong>{kes(testMonthlyPriceCents)}</strong><span> / month · rehearsal price</span></div>
          <p>Firm subscription with access for project staff and clients.</p>
          {canStart && <div className="row-actions"><button className="btn primary" disabled={saving} onClick={() => void command('subscription.start', {}, 'Test invoice issued.')}>
            {invoice ? 'Start another test subscription' : 'Start test subscription'}
          </button></div>}
        </div>
      </section>
      <section className="panel suite-panel">
        <div className="panel-heading"><div><h2>Billing cycle</h2><p>{billing.testDate ? 'Test date · ' + day(billing.testDate) : 'The test clock starts with your first invoice.'}</p></div><CalendarDays size={19} /></div>
        <div className="subscription-body">
          <div role="status"><Badge tone={tone(status)}>{status}</Badge></div>
          {invoice && !canStart && <p>{invoice.reference} · {day(invoice.start)} to {day(addDays(invoice.nextCycle, -1))}</p>}
          {latestCovered && <p>Paid through {day(addDays(latestCovered.nextCycle, -1))}{billing.cancelAtPeriodEnd ? '. Ends ' + day(latestCovered.nextCycle) + '.' : '.'}</p>}
          {invoice && !canStart && (paid ? <div className="row-actions">
            <button className="btn primary" disabled={saving} onClick={() => void command('subscription.advance', { invoice: invoice.reference }, billing.cancelAtPeriodEnd ? 'Test subscription ended.' : 'Renewal invoice issued.')}>
              {billing.cancelAtPeriodEnd ? 'Advance to end date' : 'Simulate next month'}
            </button>
            <button className="btn" disabled={saving} onClick={() => void command('subscription.cancel', { invoice: invoice.reference, cancel: !billing.cancelAtPeriodEnd }, billing.cancelAtPeriodEnd ? 'Test renewal resumed.' : 'Test cancellation scheduled.')}>
              {billing.cancelAtPeriodEnd ? 'Resume renewal' : 'Cancel at period end'}
            </button>
          </div> : <div className="row-actions">
            <button className="btn primary" disabled={saving} onClick={() => void command('subscription.payment', { invoice: invoice.reference, outcome: 'paid', expectedAttempts: invoice.payments.length }, 'Successful test payment recorded.')}>Record successful payment</button>
            <button className="btn" disabled={saving} onClick={() => void command('subscription.payment', { invoice: invoice.reference, outcome: 'failed', expectedAttempts: invoice.payments.length }, 'Failed test payment recorded.')}>Record failed payment</button>
          </div>)}
        </div>
      </section>
    </div>
    <section className="panel suite-panel" aria-labelledby="subscription-invoices">
      <div className="panel-heading"><div><h2 id="subscription-invoices">Test invoices</h2><p>Open payment attempts to see the date, reference and outcome.</p></div></div>
      {billing.invoices.length ? <div className="table-scroll"><table>
        <thead><tr><th scope="col">Invoice</th><th scope="col">Billing period</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Payment activity</th></tr></thead>
        <tbody>{billing.invoices.slice().reverse().map(item => {
          const paymentStatus = invoiceStatus(item);
          return <tr key={item.reference}>
            <td className="strong">{item.reference}</td>
            <td>{day(item.start)} – {day(addDays(item.nextCycle, -1))}</td>
            <td>{kes(item.amountCents)}</td>
            <td><Badge tone={tone(paymentStatus)}>{paymentStatus}</Badge></td>
            <td>{item.payments.length ? <details>
              <summary>{item.payments.length} {item.payments.length === 1 ? 'attempt' : 'attempts'}</summary>
              <ul>{item.payments.map(attempt => <li key={attempt.reference}>
                <strong>{attempt.outcome === 'paid' ? 'Successful' : 'Failed'}</strong> · {attempt.reference}<br />{day(attempt.on)}
              </li>)}</ul>
            </details> : <span className="muted">No attempts</span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="subscription-body muted">Start a test subscription to issue the first invoice.</p>}
    </section>
  </div>;
}
