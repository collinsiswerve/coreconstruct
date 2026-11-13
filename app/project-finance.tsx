'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, BarChart3, ChevronDown, Download, FileText, Link2, Plus, Wallet } from 'lucide-react';
import { dateKey, kes, totals, type Project } from '../lib/domain';
import {
  activeFunding, amountApplied, canManageReceipts, canViewProfit, canViewReceiptLedger,
  confirmedOutflows, forecastNeedsReview, fundingCategories, fundingTotals, openCommitments,
  receiptTotal, reviewFigures,
} from '../lib/project-finance';
import { projectFinancials } from '../lib/suite';
import type { ClientReceipt, Role, SuiteState } from '../lib/suite-types';
import { SuiteForm, type FormField, type SuiteFormSpec } from './suite-form';
import { Badge } from './ui';
import { useWorkspaceRuntime } from './workspace-runtime';

const categories = Object.entries(fundingCategories);
const text = (name: string, label: string): FormField => ({ name, label, required: true });
const date = (name: string, label: string, value = dateKey()): FormField => ({ name, label, type: 'date', value, required: true });
const money = (name: string, label: string, cents = 0): FormField => ({ name, label, type: 'number', min: '0', step: '0.01', value: cents / 100, required: true });
const choice = (name: string, label: string, options: FormField['options']): FormField => ({ name, label, type: 'select', options, required: true });

function Card({ title, amount, detail, icon, signed = false }: { title: string; amount: number | null; detail: string; icon: ReactNode; signed?: boolean }) {
  const tone = signed && amount !== null ? amount < 0 ? 'negative' : amount > 0 ? 'positive' : '' : '';
  return <article className="finance-card">
    <div><span>{title}</span><span className="metric-icon teal">{icon}</span></div>
    <strong className={tone}>{amount === null ? '—' : kes(amount)}</strong>
    <p>{detail}</p>
  </article>;
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="panel finance-panel">
    <div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

function Figures({ rows }: { rows: [string, number | null][] }) {
  return <dl className="finance-figures">{rows.map(([label, amount]) =>
    <div key={label}><dt>{label}</dt><dd>{amount === null ? '—' : kes(amount)}</dd></div>
  )}</dl>;
}

type Props = {
  state: SuiteState;
  project: Project;
  role: Role;
  organizationId: string;
  saving: boolean;
  error: string;
  command: (type: string, payload: Record<string, unknown>, message?: string) => Promise<boolean>;
};

export function ProjectFinance({ state, project, role, organizationId, saving, error, command }: Props) {
  const { href } = useWorkspaceRuntime();
  const [form, setForm] = useState<SuiteFormSpec | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});
  const { id: projectId } = project;
  const allowProfit = canViewProfit(role);
  const allowLedger = canViewReceiptLedger(role);
  const manageReceipts = canManageReceipts(role);
  const review = allowProfit ? state.suite.finance.reviews[projectId] : undefined;
  const figures = review ? reviewFigures(review) : null;
  const projectTotals = totals(state, projectId);
  const contract = allowProfit ? projectFinancials(state, projectId).contract : 0;
  const needsReview = review && forecastNeedsReview(state, project, review, contract);
  const received = allowLedger ? receiptTotal(state, projectId) : 0;
  const paid = projectTotals.cashPaid;
  const funding = state.projectFunding?.[projectId] ?? fundingTotals(state, projectId);
  const active = allowLedger ? activeFunding(state, projectId) : [];
  const receipts = state.suite.receipts.filter(receipt => receipt.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date));
  const bills = state.suite.milestones.filter(bill => bill.projectId === projectId && bill.status === 'certified');
  const outflows = allowLedger ? confirmedOutflows(state, projectId) : [];

  function open(spec: SuiteFormSpec) {
    setForm({ ...spec, payload: { projectId, ...spec.payload } });
  }

  function editReview() {
    open({
      title: 'Record finance review', type: 'finance.review.save', payload: { revision: review?.revision || 0 },
      fields: [
        { ...date('asOf', 'Profit to date cutoff', review?.asOf || dateKey()), max: dateKey() },
        money('earnedRevenue', 'Earned revenue through cutoff · KSh', review?.earnedRevenueCents),
        money('staffCost', 'Additional project staff cost · KSh', review?.staffCostCents),
        money('overhead', 'Allocated overhead through cutoff · KSh', review?.overheadCents),
        money('uncommitted', 'Remaining costs outside open orders · KSh', review?.uncommittedCents),
        ...(project.mode === 'open' ? [money('forecastRevenue', 'Expected reimbursable costs and fee revenue · KSh', review?.forecastRevenueCents ?? 0)] : []),
      ],
      extra: 'Use earned fees or an approved valuation for the cutoff. Enter staff costs and overhead outside the approved costs already recorded. Include future overhead in the remaining estimate.',
      button: 'Save finance review',
    });
  }

  function recordBill() {
    open({
      title: 'Record approved billing item', type: 'finance.bill.record',
      fields: [
        choice('kind', 'Billing type', [{ value: 'fee-invoice', label: 'Fee invoice' }, { value: 'payment-certificate', label: 'Payment certificate' }]),
        text('reference', 'Invoice or certificate reference'), text('title', 'Billing description'),
        money('amount', 'Amount due · KSh'), date('dueDate', 'Payment due date'),
      ],
      button: 'Record billing item',
    });
  }

  function issueReceipt() {
    open({
      title: 'Record client receipt', type: 'receipt.issue',
      fields: [
        text('title', 'Payment description'), money('amount', 'Amount received · KSh'),
        { ...date('date', 'Received on'), max: dateKey() },
        choice('method', 'Payment channel', ['Bank transfer', 'M-Pesa', 'Cheque', 'Cash'].map(value => ({ value, label: value }))),
        text('reference', 'Confirmed transaction reference'),
      ],
      extra: 'Record the confirmed bank, M-Pesa or cash reference. The receipt will be available to apply and allocate after saving.',
      button: 'Issue receipt',
    });
  }

  function editPlan(receipt: ClientReceipt) {
    const plan = state.suite.finance.plans[receipt.id];
    const applicable = bills.filter(bill => bill.amountCents > amountApplied(state, projectId, bill.id, receipt.id));
    open({
      title: 'Apply and allocate ' + receipt.number, type: 'finance.receipt.plan',
      payload: { receiptId: receipt.id, revision: plan?.revision || 0 },
      fields: [
        ...applicable.map(bill => money('bill:' + bill.id, 'Apply to ' + (bill.reference || bill.title) + ' · KSh', plan?.applications.find(row => row.milestoneId === bill.id)?.amountCents)),
        ...categories.map(([category, label]) => money('fund:' + category, 'Earmark for ' + label.toLowerCase() + ' · KSh', plan?.allocations.find(row => row.category === category)?.amountCents)),
      ],
      extra: kes(receipt.amountCents) + ' received. Billing applications settle invoices or certificates. Spending allocations earmark the same funds for project costs.',
      button: 'Save allocations',
    });
  }

  function recordLink(receipt: ClientReceipt) {
    const plan = state.suite.finance.plans[receipt.id];
    const choices = (plan?.allocations || []).map(row => ({
      value: row.category, remaining: row.amountCents - active
        .filter(link => link.receiptId === receipt.id && link.category === row.category)
        .reduce((sum, link) => sum + link.amountCents, 0),
    })).filter(row => row.remaining > 0);
    const eligible = outflows.map(outflow => ({
      ...outflow, remaining: outflow.amountCents - active.filter(link => link.outflowId === outflow.id).reduce((sum, link) => sum + link.amountCents, 0),
    })).filter(row => row.remaining > 0);
    open({
      title: 'Link confirmed spending', type: 'finance.funding.link', payload: { receiptId: receipt.id },
      fields: [
        choice('category', 'Funding category', choices.map(row => ({ value: row.value, label: fundingCategories[row.value] + ' · ' + kes(row.remaining) + ' available' }))),
        choice('outflowId', 'Confirmed outgoing payment', eligible.map(outflow => ({ value: outflow.id, label: outflow.label + ' · ' + outflow.reference + ' · ' + kes(outflow.remaining) + ' unlinked' }))),
        money('amount', 'Amount to link · KSh'),
      ],
      extra: choices.length && eligible.length ? 'Link all or part of an existing confirmed payment to this receipt.' : 'Add an allocation and record an outgoing payment or advance before linking.',
      button: 'Link payment',
    });
  }

  async function submit(type: string, payload: Record<string, unknown>) {
    if (type === 'finance.receipt.plan') {
      const entries = Object.entries(payload);
      payload.applications = entries.filter(([key]) => key.startsWith('bill:')).map(([key, amount]) => ({ milestoneId: key.slice(5), amount }));
      payload.allocations = entries.filter(([key]) => key.startsWith('fund:')).map(([key, amount]) => ({ category: key.slice(5), amount }));
      for (const [key] of entries) if (key.startsWith('bill:') || key.startsWith('fund:')) delete payload[key];
    }
    const saved = await command(type, payload, 'Finance record saved.');
    if (saved) setForm(null);
    return saved;
  }

  const forecastProfit = figures?.forecastProfit ?? null;
  const forecastDetail = forecastProfit === null
    ? review ? 'Enter the agreed contract value.' : 'Record the remaining cost to complete.'
    : forecastProfit < 0 ? 'Forecast loss' : forecastProfit > 0 ? 'Forecast profit' : 'Break-even forecast';
  const profitDetail = figures ? (figures.profitToDate < 0 ? 'Loss' : figures.profitToDate > 0 ? 'Profit' : 'Break-even') + ' through ' + review!.asOf : 'Awaiting finance review';

  return <div className="finance-page">
    <section className="finance-cards" aria-label="Project finance summary">
      {allowProfit ? <>
        <Card title="Profit / loss to date" amount={figures?.profitToDate ?? null} detail={profitDetail} signed icon={<BarChart3 size={16} />} />
        <Card title="Forecast at completion" amount={figures?.forecastProfit ?? null} detail={forecastDetail} signed icon={<ArrowUpRight size={16} />} />
      </> : role === 'pm' ? <>
        <Card title="Internal allowance" amount={projectFinancials(state, projectId).allowance} detail="Includes accepted cost variations" icon={<Wallet size={16} />} />
        <Card title="Approved costs" amount={projectTotals.incurred} detail="Approved wagebills and expenses" icon={<BarChart3 size={16} />} />
        <Card title="Open purchase commitments" amount={openCommitments(state, projectId)} detail="Approved orders awaiting invoices" icon={<ArrowUpRight size={16} />} />
      </> : <>
        <Card title="Client cash received" amount={received} detail="Active confirmed receipts" icon={<ArrowDownLeft size={16} />} />
        <Card title="Cash paid out" amount={paid} detail="Confirmed payments and advances" icon={<ArrowUpRight size={16} />} />
      </>}
      {allowLedger && <Card title="Tracked cash position" amount={received - paid} detail={kes(received) + ' received · ' + kes(paid) + ' paid out'} signed icon={<Wallet size={16} />} />}
    </section>

    {allowProfit && <Panel title="Profit and forecast review"
      description={review ? 'Profit cutoff ' + review.asOf + ' · forecast saved ' + dateKey(new Date(review.recordedAt)) : 'Record earned revenue, project costs and the remaining estimate.'}
      action={role === 'admin' && <button className="btn primary" onClick={editReview}><FileText size={15} />{review ? 'Update review' : 'Record finance review'}</button>}>
      {review && figures && <>
        {needsReview && <div className="finance-notice"><Badge tone="amber">Review needed</Badge> Costs, commitments or contract value have changed since this review.</div>}
        <div className="finance-review-grid">
          <div><h3>Through {review.asOf}</h3><Figures rows={[
            ['Earned revenue', review.earnedRevenueCents], ['Approved costs through cutoff', review.approvedCostsCents],
            ['Additional project staff cost', review.staffCostCents], ['Allocated overhead', review.overheadCents], ['Total cost to date', figures.costToDate],
          ]} /></div>
          <div><h3>At completion</h3><Figures rows={[
            ['Expected project revenue', review.forecastRevenueCents], ['Approved costs at review', review.forecastApprovedCostsCents],
            ['Additional staff cost and overhead', review.staffCostCents + review.overheadCents],
            ['Open purchase commitments', review.commitmentsCents], ['Remaining costs outside open orders', review.uncommittedCents],
            ['Forecast final cost', figures.forecastCost],
          ]} /></div>
        </div>
      </>}
      {!review && <p className="panel-copy">The principal can save the first review when the valuation and cost estimate are ready.</p>}
    </Panel>}

    <Panel title="Spending by category" description="Earmarked funds and linked confirmed spending">
      {funding.length ? <div className="table-scroll"><table><thead><tr><th>Category</th><th>Earmarked</th><th>Spent</th><th>Still earmarked</th></tr></thead>
        <tbody>{funding.map(row => <tr key={row.category}><td>{fundingCategories[row.category]}</td><td>{kes(row.amountCents)}</td><td>{kes(row.spentCents)}</td><td>{kes(row.amountCents - row.spentCents)}</td></tr>)}</tbody>
      </table></div> : <p className="panel-copy">Client funds will appear here when Accounts allocates a receipt.</p>}
    </Panel>

    {allowLedger && <>
      <Panel title="Client billing register" description="Approved fee invoices and payment certificates"
        action={manageReceipts && <button className="btn" onClick={recordBill}><Plus size={15} />Record billing item</button>}>
        {bills.length ? <div className="table-scroll"><table><thead><tr><th>Billing item</th><th>Due</th><th>Billed</th><th>Receipts applied</th><th>Balance</th></tr></thead>
          <tbody>{bills.map(bill => {
            const applied = amountApplied(state, projectId, bill.id);
            return <tr key={bill.id}><td>{bill.reference && <strong>{bill.reference} · </strong>}{bill.title}</td><td>{bill.dueDate}</td><td>{kes(bill.amountCents)}</td><td>{kes(applied)}</td><td>{kes(bill.amountCents - applied)}</td></tr>;
          })}</tbody></table></div> : <p className="panel-copy">No approved billing items recorded.</p>}
      </Panel>

      <Panel title="Client receipts" description="Open a receipt breakdown to see billing applications, allocations and spending"
        action={manageReceipts && <button className="btn primary" onClick={issueReceipt}><Plus size={15} />Record client receipt</button>}>
        {paid > 0 && <div className="finance-notice">{kes(paid - active.reduce((sum, link) => sum + link.amountCents, 0))} paid out without a receipt funding link.</div>}
        {receipts.map(receipt => {
          const plan = state.suite.finance.plans[receipt.id];
          const links = active.filter(link => link.receiptId === receipt.id);
          const allocated = plan?.allocations.reduce((sum, row) => sum + row.amountCents, 0) || 0;
          const applied = plan?.applications.reduce((sum, row) => sum + row.amountCents, 0) || 0;
          const spent = links.reduce((sum, link) => sum + link.amountCents, 0);
          const expanded = !!expandedReceipts[receipt.id];
          const breakdownId = 'receipt-breakdown-' + receipt.id;
          return <article className="finance-receipt" key={receipt.id}>
            <button type="button" className="finance-receipt-toggle"
              aria-expanded={expanded} aria-controls={breakdownId}
              onClick={() => setExpandedReceipts(current => ({ ...current, [receipt.id]: !current[receipt.id] }))}>
              <span><strong>{receipt.number}</strong> · {receipt.title}<small>{receipt.date} · {receipt.method} · {receipt.reference}</small></span>
              <span className="finance-receipt-summary">
                <strong>{kes(receipt.amountCents)}</strong>
                <Badge tone={receipt.voidedAt ? 'red' : allocated ? 'green' : 'amber'}>{receipt.voidedAt ? 'Void' : allocated === receipt.amountCents ? 'Allocated' : kes(receipt.amountCents - allocated) + ' unallocated'}</Badge>
                <span className="btn small finance-receipt-disclosure">{expanded ? 'Hide breakdown' : 'View breakdown'} <ChevronDown size={14} aria-hidden="true" /></span>
              </span>
            </button>
            <div id={breakdownId} className="finance-receipt-body" hidden={!expanded}>
              {receipt.voidedAt ? <p className="muted">{receipt.reason}</p> : <>
                <Figures rows={[
                  ['Applied to client billing', applied], ['Unapplied to client billing', receipt.amountCents - applied],
                  ['Earmarked for spending', allocated], ['Unallocated funds', receipt.amountCents - allocated],
                  ['Linked spending', spent], ['Earmarked funds remaining', allocated - spent],
                ]} />
                {!!plan?.applications.length && <ul className="finance-lines">{plan.applications.map(row => {
                  const bill = bills.find(item => item.id === row.milestoneId);
                  return <li key={row.milestoneId}><span>{bill?.reference || bill?.title || 'Billing item'}</span><strong>{kes(row.amountCents)} applied</strong></li>;
                })}</ul>}
                {!!plan?.allocations.length && <ul className="finance-lines">{plan.allocations.map(row => <li key={row.category}><span>{fundingCategories[row.category]}</span><strong>{kes(row.amountCents)} earmarked</strong></li>)}</ul>}
                {!!links.length && <ul className="finance-lines">{links.map(link => {
                  const outflow = outflows.find(row => row.id === link.outflowId);
                  return <li key={link.id}><span>{outflow?.label} · {outflow?.reference}<small>{fundingCategories[link.category]}</small></span><strong>{kes(link.amountCents)}</strong>
                    {manageReceipts && <button className="btn small" onClick={() => open({ title: 'Reverse funding link', type: 'finance.funding.reverse', payload: { linkId: link.id }, fields: [text('reason', 'Reason for reversal')], button: 'Reverse link' })}>Reverse link</button>}
                  </li>;
                })}</ul>}
              </>}
              <div className="row-actions">
                <a className="btn small" href={href('/api/receipts/' + receipt.id + '?org=' + encodeURIComponent(organizationId))} target="_blank" rel="noopener noreferrer"><Download size={13} />Receipt PDF</a>
                {manageReceipts && !receipt.voidedAt && <>
                  <button className="btn small" onClick={() => editPlan(receipt)}>Apply and allocate</button>
                  {!!allocated && <button className="btn small" onClick={() => recordLink(receipt)}><Link2 size={13} />Link spending</button>}
                  <button className="btn small" onClick={() => open({ title: 'Void client receipt', type: 'receipt.void', payload: { receiptId: receipt.id }, fields: [text('reason', 'Reason for voiding')], button: 'Void receipt' })}>Void receipt</button>
                </>}
              </div>
            </div>
          </article>;
        })}
        {!receipts.length && <p className="panel-copy">No client receipts recorded.</p>}
      </Panel>
    </>}

    {form && <SuiteForm key={form.title} spec={form} saving={saving} error={error} close={() => setForm(null)} submit={submit} />}
  </div>;
}
