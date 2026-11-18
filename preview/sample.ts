import { addDays, dateKey, emptyState, monday } from '../lib/domain';
import { detailDefaults, executeSuite } from '../lib/suite';
import { addSampleFinance as seedSampleFinance } from '../lib/sample-finance';
import { addSampleComparisonProjects } from '../lib/sample-projects';
import type { Actor, SuiteState } from '../lib/suite-types';

export const principal: Actor = {
  id: 'demo-principal',
  name: 'Demo principal',
  email: 'principal@example.invalid',
  role: 'admin',
  organizationId: 'coreconstruct-pages-demo',
  projectRoles: {},
};

export function sampleWorkspace(): SuiteState {
  const at = new Date().toISOString();
  const week = monday();
  const lastWeek = addDays(week, -7);
  const state = executeSuite(
    { ...emptyState(), firm: 'Archi-Hub Studio · Demo' },
    { id: 'pages-demo-seed', type: 'demo.load', payload: {} },
    principal,
    at,
  );
  const project = state.projects[0];
  project.name = 'Sample residence';
  project.location = 'Kiambu County · fictional site';
  const projectId = project.id;
  state.suite.projectDetails[projectId] = {
    ...detailDefaults(),
    county: 'Kiambu',
    brief: 'Sample three-bedroom residence. Superstructure works are in progress.',
    startDate: addDays(week, -56),
    estimatedCompletion: addDays(week, 84),
    forecastRemainingCents: 140_000_000,
  };
  state.suite.boq = [
    { id: 'boq-wall', projectId, code: 'SS-01', description: 'Ground-floor masonry walling', stage: 'Superstructure', unit: 'm²', quantityMilli: 180_000, completedMilli: 112_000, clientRateCents: 235_000, allowanceCents: 33_500_000, labourAllowanceCents: 9_800_000 },
    { id: 'boq-concrete', projectId, code: 'SS-02', description: 'Reinforced concrete columns', stage: 'Superstructure', unit: 'm³', quantityMilli: 16_500, completedMilli: 10_000, clientRateCents: 1_950_000, allowanceCents: 26_000_000, labourAllowanceCents: 5_500_000 },
    { id: 'boq-roof', projectId, code: 'RF-01', description: 'Pitched roof structure and covering', stage: 'Roofing', unit: 'm²', quantityMilli: 145_000, completedMilli: 0, clientRateCents: 390_000, allowanceCents: 43_500_000, labourAllowanceCents: 11_200_000 },
  ];
  for (const row of state.attendance) row.boqItemId = 'boq-wall';
  state.suite.drawings = [
    { id: 'drawing-r1', projectId, title: 'Ground-floor plan', sheetCode: 'A-101', discipline: 'Architectural', category: 'Design drawings', revision: 1, status: 'current', fileId: 'floor-plan-r1', published: true, uploadedBy: principal.id, uploadedAt: lastWeek + 'T09:00:00Z', issuedBy: principal.id, issuedAt: lastWeek + 'T10:00:00Z' },
    { id: 'drawing-r2', projectId, title: 'Ground-floor plan · entry revision', sheetCode: 'A-101', discipline: 'Architectural', category: 'Design drawings', revision: 2, status: 'draft', fileId: 'floor-plan-r2', published: false, uploadedBy: principal.id, uploadedAt: at },
  ];
  state.suite.materials = [
    { id: 'material-cement', name: 'General-purpose cement', unit: 'bag', sku: 'MAT-01' },
    { id: 'material-steel', name: 'Y12 reinforcement bar', unit: 'length', sku: 'MAT-02' },
  ];
  state.suite.orders = [{
    id: 'order-sample', projectId, number: 'PO-DEMO-001', supplier: 'Sample building supplies',
    lines: [{ id: 'order-line-cement', materialId: 'material-cement', boqItemId: 'boq-wall', quantityMilli: 80_000, rateCents: 81_000 }],
    totalCents: 6_480_000, status: 'approved', submittedBy: 'demo-foreman', approvedBy: principal.id, createdAt: lastWeek + 'T11:00:00Z',
  }];
  state.suite.stock = [{
    id: 'stock-sample', projectId, materialId: 'material-cement', quantityMilli: 36_000,
    kind: 'adjustment', sourceId: '', boqItemId: 'boq-wall', reason: 'Fictional opening stock',
    at: lastWeek + 'T12:00:00Z', actorId: principal.id,
  }];
  state.suite.variations = [{
    id: 'variation-sample', projectId, number: 'VO-DEMO-001', title: 'Entrance canopy extension',
    description: 'Extend the sample entrance canopy by 600 mm to improve rain cover.',
    revision: 1, clientDeltaCents: 4_800_000, internalDeltaCents: 3_500_000, days: 2,
    affectsCompletion: false, programmeReason: 'Canopy fabrication can run alongside walling.',
    status: 'sent', submittedBy: principal.id, createdAt: at, sentAt: at,
  }];
  state.suite.receipts = [{
    id: 'receipt-sample', projectId, number: 'RCP-DEMO-001', title: 'Sample mobilisation payment',
    amountCents: 25_000_000, method: 'Bank transfer', reference: 'DEMO-CLIENT-001',
    date: addDays(week, -14), issuedAt: at, issuedBy: principal.id,
  }];
  state.suite.sequences = { orders: 1, variations: 1, receipts: 1 };
  state.reports = [
    { id: 'report-published', projectId, weekStart: lastWeek, progress: 26, stage: 'Superstructure',
      summary: 'Set out ground-floor walling and prepared reinforcement for columns.',
      nextSteps: 'Continue masonry and check the entrance drawing before issue.',
      risks: 'Confirm the canopy detail before ordering the steel.', updatedAt: lastWeek + 'T15:30:00Z' },
    { id: 'report-draft', projectId, weekStart: week, progress: 32, stage: 'Superstructure',
      summary: 'Continued walling and checked column positions against the current drawings.',
      nextSteps: 'Complete column formwork and review the updated entrance detail.',
      risks: 'The canopy variation is awaiting a decision.', updatedAt: at },
  ];
  state.suite.publishedWeeks[projectId + ':' + lastWeek] = state.reports[0].updatedAt;
  state.advances = [{
    id: 'advance-sample', projectId, workerId: state.workers[0].id, date: dateKey(),
    amountCents: 50_000, reference: 'DEMO-ADVANCE-001', allocations: [],
  }];
  addSampleFinance(state);
  addSampleComparisonProjects(state, projectId, principal.id, at);
  return state;
}

export function addSampleFinance(state: SuiteState) {
  const receipt = state.suite.receipts.find(item => item.id === 'receipt-sample' && !item.voidedAt);
  const project = state.projects.find(item => item.demo && item.id === receipt?.projectId);
  return project ? seedSampleFinance(state, project.id, principal.id, new Date().toISOString()) : state;
}
