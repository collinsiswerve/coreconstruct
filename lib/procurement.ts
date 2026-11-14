import type { Expense } from './domain';
import type { SuiteState, SupplierInvoice } from './suite-types';

export function supplierInvoiceMatch(state: SuiteState, invoice: SupplierInvoice) {
  const order = state.suite.orders.find(row => row.id === invoice.orderId && row.projectId === invoice.projectId);
  const line = order?.lines.find(row => row.id === invoice.lineId);
  const deliveries = state.suite.deliveries.filter(row => row.projectId === invoice.projectId
    && row.orderId === invoice.orderId && row.lineId === invoice.lineId && row.status === 'approved');
  const received = deliveries.reduce((sum, row) => sum + row.quantityMilli, 0);
  const invoiced = state.suite.invoices.filter(row => row.projectId === invoice.projectId
    && row.orderId === invoice.orderId && row.lineId === invoice.lineId && row.id !== invoice.id && row.status === 'approved')
    .reduce((sum, row) => sum + row.quantityMilli, 0);
  const available = Math.max(0, received - invoiced);
  const issues: string[] = [];
  if (!order || !line) issues.push('The original purchase order line is unavailable.');
  else if (order.status !== 'approved') issues.push('The order is no longer approved.');
  else {
    if (invoice.quantityMilli > available) issues.push('Three-way match failed: invoiced quantity exceeds approved goods received.');
    if (invoice.rateCents !== line.rateCents) issues.push('Three-way match failed: invoice rate differs from the approved order.');
  }
  return { order, line, deliveries, received, invoiced, available, issues };
}

export function isSupplierInvoiceCost(state: SuiteState, expense: Expense) {
  return !!expense.supplierInvoiceId || state.suite.invoices.some(invoice => invoice.expenseId === expense.id);
}
