import { addDays, dateKey, DomainError, monday } from './domain';
import type { SuiteState } from './suite-types';

export const operationsSampleId = 'sample-labour-and-procurement';

export function addSampleOperations(state: SuiteState, at: string) {
  const projectId = operationsSampleId;
  if (state.projects.some(project => project.id === projectId)) throw new DomainError('The sample walkthrough is already available.');
  const week = addDays(monday(dateKey(new Date(at))), -7);
  const first = projectId + ':worker-full-day';
  const second = projectId + ':worker-half-day';
  const materialId = projectId + ':cement';
  const boqItemId = projectId + ':masonry';
  const orderId = projectId + ':order';
  const lineId = orderId + ':line';
  const submitter = 'sample-site-team';
  state.projects.push({
    id: projectId, name: 'Labour and procurement walkthrough', location: 'Kiambu · fictional site',
    client: 'Sample client', budgetCents: 7_000_000, contractCents: 10_000_000, mode: 'fixed',
    stage: 'Superstructure', progress: 18, demo: true, sampleWalkthrough: 'labour-procurement', createdAt: at,
  });
  state.workers.push(
    { id: first, name: 'Sample worker A', trade: 'Mason', rateCents: 100000, active: true, demo: true, sampleProjectId: projectId },
    { id: second, name: 'Sample worker B', trade: 'Site assistant', rateCents: 100000, active: true, demo: true, sampleProjectId: projectId },
  );
  state.suite.boq.push({ id: boqItemId, projectId, code: 'M3-01', description: 'Masonry works',
    stage: 'Superstructure', unit: 'm²', quantityMilli: 10_000, completedMilli: 0,
    clientRateCents: 1_000_000, allowanceCents: 7_000_000, labourAllowanceCents: 2_000_000 });
  state.attendance.push(
    { id: first + ':shift', projectId, workerId: first, date: week, units: 2, rateCents: 100000, task: 'Set out the sample wall', boqItemId },
    { id: second + ':shift', projectId, workerId: second, date: week, units: 1, rateCents: 100000, task: 'Prepare the sample mortar', boqItemId },
  );
  state.advances.push({ id: projectId + ':advance', projectId, workerId: first, date: week, amountCents: 30000,
    reference: 'DEMO-M3-ADV-001', allocations: [] });
  state.suite.materials.push({ id: materialId, name: 'Sample cement', unit: 'bag', sku: 'DEMO-M3-CEMENT' });
  state.suite.orders.push({
    id: orderId, projectId, number: 'PO-DEMO-M3-001', supplier: 'Sample building supplier', status: 'approved',
    submittedBy: submitter, approvedBy: 'sample-qs', createdAt: at, totalCents: 700000,
    lines: [{ id: lineId, materialId, boqItemId, quantityMilli: 10000, rateCents: 70000 }],
  });
  state.suite.deliveries.push({
    id: projectId + ':delivery', projectId, orderId, lineId, quantityMilli: 6000, noteReference: 'DN-DEMO-M3-001',
    offloadFileId: '', noteFileId: '', location: { status: 'missing', exceptionReason: 'Fictional delivery evidence' },
    status: 'submitted', submittedBy: submitter, createdAt: at,
  });
  state.suite.invoices.push({
    id: projectId + ':invoice', projectId, orderId, lineId, reference: 'INV-DEMO-M3-001', quantityMilli: 4000,
    rateCents: 70000, totalCents: 280000, evidenceFileId: '', status: 'submitted', submittedBy: submitter, createdAt: at,
  });
}
