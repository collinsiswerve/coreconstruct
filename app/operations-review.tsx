'use client';

import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { kes, paidFor } from '../lib/domain';
import { operationsSampleId } from '../lib/sample-operations';
import { supplierInvoiceMatch } from '../lib/procurement';
import type { SuiteState, SupplierInvoice } from '../lib/suite-types';
import { useWorkspaceRuntime } from './workspace-runtime';

export function SupplierInvoiceEvidence({ invoice, fileUrl }: {
  invoice: SupplierInvoice; fileUrl: (id: string) => string;
}) {
  const { href } = useWorkspaceRuntime();
  const url = invoice.evidenceFileId ? fileUrl(invoice.evidenceFileId)
    : invoice.id === (operationsSampleId + ':invoice') ? href('/samples/procurement-records.pdf') + '#page=2' : '';
  return url ? <a className="btn small" href={url} target="_blank" rel="noopener noreferrer">
    <FileText size={14} />{invoice.evidenceFileId ? 'Invoice file' : 'Sample invoice'}
  </a> : null;
}

export function SupplierInvoiceReview({ state, invoice, fileUrl }: {
  state: SuiteState; invoice: SupplierInvoice; fileUrl: (id: string) => string;
}) {
  const { href } = useWorkspaceRuntime();
  const match = supplierInvoiceMatch(state, invoice);
  const { order, line, deliveries, issues } = match;
  const unit = (line && state.suite.materials.find(m => m.id === line.materialId)?.unit) || '';
  const material = line && state.suite.materials.find(m => m.id === line.materialId)?.name;
  const boq = line && state.suite.boq.find(item => item.id === line.boqItemId);
  const quantity = (milli: number) => [String(milli / 1000), unit].filter(Boolean).join(' ');
  const paid = invoice.expenseId ? paidFor(state, 'expense', invoice.expenseId) : 0;
  return <div className="operations-review">
    {material && <p className="muted">{material}{boq && ' · BOQ ' + boq.code}</p>}
    <dl className="operations-review-grid">
      <div><dt>Purchase order {order?.number}</dt><dd>{line ? quantity(line.quantityMilli) + ' × ' + kes(line.rateCents) : 'Order line unavailable'}</dd></div>
      <div><dt>Approved goods received</dt><dd>{quantity(match.received)}</dd></div>
      <div><dt>On other approved invoices</dt><dd>{quantity(match.invoiced)}</dd></div>
      <div><dt>Available for this invoice</dt><dd>{quantity(match.available)}</dd></div>
      <div><dt>Supplier invoice {invoice.reference}</dt><dd>{quantity(invoice.quantityMilli)} × {kes(invoice.rateCents)}</dd></div>
      <div><dt>Invoice total</dt><dd>{kes(invoice.totalCents)}</dd></div>
      {invoice.status === 'approved' && <>
        <div><dt>Confirmed payments</dt><dd>{kes(paid)}</dd></div>
        <div><dt>Invoice balance due</dt><dd>{kes(invoice.totalCents - paid)}</dd></div>
      </>}
    </dl>
    {!!deliveries.length && <ul className="operations-evidence">
      {deliveries.map(delivery => {
        const url = delivery.noteFileId ? fileUrl(delivery.noteFileId)
          : delivery.id === (operationsSampleId + ':delivery') ? href('/samples/procurement-records.pdf') + '#page=1' : '';
        return <li key={delivery.id}>
          {url ? <a className="text-button" href={url} target="_blank" rel="noopener noreferrer">{delivery.noteReference}</a> : delivery.noteReference}
          <span>{quantity(delivery.quantityMilli)} received</span>
        </li>;
      })}
    </ul>}
    <div className="row-actions"><SupplierInvoiceEvidence invoice={invoice} fileUrl={fileUrl} /></div>
    {invoice.reason && <p className="muted">{invoice.reason}</p>}
    {invoice.status === 'submitted' && (issues.length
      ? <div className="notice error operations-match-message"><AlertTriangle size={17} /><ul>
        {issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul></div>
      : <div className="notice subtle operations-match-message"><CheckCircle2 size={17} />Quantities and rates match the approved records.</div>)}
  </div>;
}

export function OperationsTotals({ label, figures }: { label: string; figures: [string, number][] }) {
  return <dl className="operations-totals" aria-label={label}>
    {figures.map(([name, cents]) => <div key={name}><dt>{name}</dt><dd>{kes(cents)}</dd></div>)}
  </dl>;
}
