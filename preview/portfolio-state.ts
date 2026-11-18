import { addDays, emptyState, monday } from '../lib/domain';
import { linkFunding, saveFinanceReview, saveReceiptPlan } from '../lib/project-finance';
import { detailDefaults, normalizeState } from '../lib/suite';
import type { Actor, BoqItem, SuiteState } from '../lib/suite-types';
import source from './portfolio-projects.json';

type Sample = Omit<typeof source[number], 'mode' | 'change'> & {
  mode: 'fixed' | 'open';
  change: [string, number, number, number, string];
};

export const portfolioProjects = source as Sample[];
export const portfolioAsOf = '2026-11-14';
export const portfolioOrganization = 'coreconstruct-m6-portfolio';
export const isPortfolioProject = (id: string) => portfolioProjects.some(project => project.id === id);
const openedAt = 'T08:00:00.000Z';
const cents = (value: number) => Math.round(value * 100);
const publishedAt = (date: string) => date + 'T12:00:00.000Z';

export function portfolioProject(id: string) {
  return portfolioProjects.find(project => project.id === id);
}

export function portfolioAsset(path: string) {
  return 'samples/portfolio/' + path;
}

export const portfolioSheetList = [
  { slug: 'A101-R1', code: 'A-101', revision: 1, title: 'Ground floor plan', discipline: 'Architectural', category: 'Design drawings' },
  { slug: 'A101-R2', code: 'A-101', revision: 2, title: 'Ground floor and accessibility plan', discipline: 'Architectural', category: 'Design drawings' },
  { slug: 'A202-R1', code: 'A-202', revision: 1, title: 'Principal elevation and building section', discipline: 'Architectural', category: 'Design drawings' },
  { slug: 'S101-R1', code: 'S-101', revision: 1, title: 'Foundation and structural grid', discipline: 'Structural', category: 'Design drawings' },
  { slug: 'S201-R1', code: 'S-201', revision: 1, title: 'Frame section and typical details', discipline: 'Structural', category: 'Design drawings' },
  { slug: 'M101-R1', code: 'M-101', revision: 1, title: 'Services coordination plan', discipline: 'MEP', category: 'Design drawings' },
  { slug: 'QS101-R1', code: 'QS-101', revision: 1, title: 'Priced bill of quantities', discipline: 'Quantity surveying', category: 'BOQ & contract' },
  { slug: 'PR101-R1', code: 'PR-101', revision: 1, title: 'Drawing, inspection and handover register', discipline: 'Project management', category: 'Site execution' },
] as const;

const proofTypes = ['offload.jpg', 'delivery.pdf', 'invoice.pdf', 'cost.pdf'] as const;

export function portfolioFileAsset(fileId: string) {
  const [projectId, file, ...extra] = fileId.split(':');
  if (extra.length || !isPortfolioProject(projectId)) return undefined;
  if (portfolioSheetList.some(sheet => sheet.slug === file)) return portfolioAsset(projectId + '/' + file + '.pdf');
  if (file === 'concept.jpg' || proofTypes.some(name => name === file)) return portfolioAsset(projectId + '/' + file);
}

export function portfolioBoq(project: Sample): BoqItem[] {
  const footprint = project.width * project.depth;
  const floors = project.storeys + project.levels;
  const area = footprint * floors;
  const specs: { code: string; description: string; stage: string; unit: string; quantity: number; weight: number; labour: number; structural?: boolean }[] = [
    { code: 'P-01', description: 'Site establishment and protection', stage: 'Preliminaries', unit: 'item', quantity: 1, weight: 6, labour: 0.22 },
    { code: 'P-02', description: 'Setting out and levelling', stage: 'Preliminaries', unit: 'm²', quantity: footprint, weight: 2, labour: 0.60 },
    { code: 'S-01', description: 'Reduced-level excavation and cart-away', stage: 'Substructure', unit: 'm³', quantity: Math.round(footprint * (project.levels ? 2.3 : 0.78)), weight: 5, labour: 0.42, structural: true },
    { code: 'S-02', description: 'Foundation concrete and pad bases', stage: 'Substructure', unit: 'm³', quantity: Math.round(footprint * (floors > 2 ? 0.21 : 0.14)), weight: 7, labour: 0.30, structural: true },
    { code: 'S-03', description: 'Reinforcement to bases and ground beams', stage: 'Substructure', unit: 'kg', quantity: Math.round(footprint * (floors > 2 ? 34 : 14)), weight: 8, labour: 0.20, structural: true },
    { code: 'S-04', description: 'Ground slab and moisture barrier', stage: 'Substructure', unit: 'm²', quantity: footprint, weight: 6, labour: 0.28, structural: true },
    { code: 'S-05', description: project.type === 'Industrial' ? 'Primary steel portal frame' : 'Columns, ring beams and frame concrete', stage: 'Superstructure', unit: project.type === 'Industrial' ? 'kg' : 'm³', quantity: Math.round(project.type === 'Industrial' ? footprint * 27 : area * 0.16), weight: 15, labour: 0.25, structural: true },
    { code: 'S-06', description: 'Structural slab and edge works', stage: 'Superstructure', unit: 'm²', quantity: Math.round(floors > 1 ? footprint * (floors - 1) : footprint * 0.24), weight: 8, labour: 0.35, structural: true },
    { code: 'A-01', description: 'External walls and internal partitions', stage: 'Envelope', unit: 'm²', quantity: Math.round((project.width + project.depth) * 2 * floors * 2.6), weight: 8, labour: 0.48 },
    { code: 'A-02', description: project.storeys > 2 ? 'Roof waterproofing, outlets and flashings' : 'Roof framing, covering and drainage', stage: 'Envelope', unit: 'm²', quantity: Math.round(footprint * 1.12), weight: 7, labour: 0.28 },
    { code: 'A-03', description: 'Doors, windows and glazed screens', stage: 'Finishes', unit: 'm²', quantity: Math.round(area * 0.23), weight: 7, labour: 0.18 },
    { code: 'A-04', description: 'Internal finishes and fitted joinery', stage: 'Finishes', unit: 'm²', quantity: area, weight: 8, labour: 0.44 },
    { code: 'M-01', description: 'Water supplies, drainage and sanitary fittings', stage: 'Services', unit: 'item', quantity: 1, weight: 4, labour: 0.34 },
    { code: 'M-02', description: 'Electrical distribution, lighting and testing', stage: 'Services', unit: 'item', quantity: 1, weight: 5, labour: 0.31 },
    { code: 'E-01', description: 'External paving and site drainage', stage: 'External works', unit: 'm²', quantity: Math.round(footprint * 0.73), weight: 3, labour: 0.39 },
    { code: 'H-01', description: 'Commissioning and handover documentation', stage: 'Handover', unit: 'item', quantity: 1, weight: 1, labour: 0.58 },
  ];
  const constructionStages = ['Preliminaries', 'Substructure', 'Superstructure', 'Envelope', 'Services', 'Finishes', 'External works', 'Handover'];
  const stageProgress: Record<string, number[]> = {
    'Substructure': [1, 0.56, 0, 0, 0.04, 0, 0.06, 0],
    'Frame and services': [1, 1, 0.65, 0.32, 0.36, 0.08, 0.12, 0],
    'Cladding and loading apron': [1, 1, 1, 0.76, 0.54, 0.53, 0.62, 0],
    'Finishes and commissioning': [1, 1, 1, 1, 0.94, 0.83, 0.91, 0.35],
  };
  const totalWeight = specs.reduce((sum, item) => sum + item.weight, 0);
  let contractRemaining = cents(project.contract);
  let allowanceRemaining = cents(project.budget);
  return specs.map((item, index) => {
    const allowance = index === specs.length - 1 ? allowanceRemaining : Math.round(cents(project.budget) * item.weight / totalWeight);
    const clientRate = index === specs.length - 1 ? contractRemaining : Math.round(cents(project.contract) * item.weight / totalWeight / item.quantity);
    contractRemaining -= clientRate * item.quantity;
    allowanceRemaining -= allowance;
    const measured = stageProgress[project.stage]?.[constructionStages.indexOf(item.stage)] ?? 1;
    return {
      id: project.id + ':boq:' + item.code, projectId: project.id, code: item.code,
      description: item.description, stage: item.stage, unit: item.unit, quantityMilli: item.quantity * 1000,
      completedMilli: Math.round(item.quantity * 1000 * measured), clientRateCents: clientRate,
      allowanceCents: allowance, labourAllowanceCents: Math.round(allowance * item.labour),
    };
  });
}

function sampleActor(id: string, role: Actor['role'], projectId?: string): Actor {
  const names: Record<string, string> = {
    admin: 'Archi-Hub principal', client: 'Sample client', pm: 'Sample project manager / QS',
    accounts: 'Sample accounts lead', finance: 'Sample finance reviewer', foreman: 'Sample foreman',
  };
  return {
    id: 'portfolio-' + role + (role === 'client' ? '-' + projectId : ''), role,
    name: role === 'client' && projectId ? portfolioProject(projectId)?.client ?? names.client : names[role] ?? names.admin,
    email: id + '@example.invalid', organizationId: portfolioOrganization,
    projectRoles: role !== 'admin' && projectId ? { [projectId]: role } : {},
  };
}

export function portfolioActor(role: Actor['role'], projectId?: string) {
  return sampleActor(projectId && role === 'client' ? projectId : role, role, projectId);
}

export function portfolioWorkspace(): SuiteState {
  const state = normalizeState({ ...emptyState(), firm: 'Archi-Hub Studio · Portfolio demo' });
  for (const [index, sample] of portfolioProjects.entries()) {
    const { id, code, stage, snapshot, progress } = sample;
    const admin = portfolioActor('admin').id;
    const foreman = portfolioActor('foreman').id;
    const pm = portfolioActor('pm').id;
    const client = portfolioActor('client', id);
    const week = monday(snapshot);
    const at = publishedAt(snapshot);
    const issued = addDays(sample.start, 28) + openedAt;
    const receiptDate = addDays(snapshot, -7);
    const handover = progress === 100;
    const changeIsAccepted = handover || index === 6 || index === 8;
    const [change, changeValue, changeAllowance, changeDays, programmeReason] = sample.change;
    const effectiveContract = sample.contract + (changeIsAccepted ? changeValue : 0);
    const built = {
      id, name: sample.name, location: sample.town + ', ' + sample.county + ' · fictional site',
      client: sample.client, budgetCents: cents(sample.budget), contractCents: cents(sample.contract),
      mode: sample.mode, stage, progress, demo: true, sampleWalkthrough: 'five-year-portfolio' as const, createdAt: sample.start + openedAt,
    };
    state.projects.push(built);
    const actualCost = handover
      ? Math.round(sample.forecastCost / 1.025)
      : Math.round(sample.contract * progress / 100 * sample.costFactor);
    const feeBps = sample.mode === 'open' ? 1000 : 0;
    state.suite.projectDetails[id] = {
      ...detailDefaults(), county: sample.county, lrNumber: 'FICTIONAL-' + code,
      clientEmail: client.email, brief: sample.brief + '\n\nStructural system: ' + sample.structure + '.',
      startDate: sample.start, estimatedCompletion: handover && changeDays ? addDays(sample.target, -changeDays) : sample.target,
      forecastRemainingCents: handover ? 0 : cents(Math.max(0, sample.forecastCost - actualCost)), managementFeeBps: feeBps,
    };
    const boq = portfolioBoq(sample);
    state.suite.boq.push(...boq);

    const billId = id + ':wagebill';
    const wageEntries = [
      { name: sample.type + ' team · mason', trade: 'Mason', days: 5, rate: 1700 + index * 80 },
      { name: sample.type + ' team · carpenter', trade: 'Carpenter', days: 4.5, rate: 2100 + index * 80 },
      { name: sample.type + ' team · assistant', trade: 'General assistant', days: 4, rate: 1000 + index * 50 },
    ].map((row, i) => {
      const workerId = id + ':worker:' + i;
      const advanceCents = i === 0 ? cents(500 + index * 100) : 0;
      state.workers.push({
        id: workerId, name: row.name, trade: row.trade, rateCents: cents(row.rate), active: true, demo: true, sampleProjectId: id,
      });
      for (let day = 0; day < Math.ceil(row.days); day++) {
        state.attendance.push({
          id: workerId + ':shift:' + day, projectId: id, workerId, date: addDays(week, day),
          units: Math.min(2, (row.days - day) * 2), rateCents: cents(row.rate), agreedRateCents: cents(row.rate),
          boqItemId: boq[5].id, task: i === 0 ? 'Coordinate measured work and site records' : 'Inspect the issued work package',
        });
      }
      if (advanceCents) state.advances.push({
        id: id + ':advance', projectId: id, workerId, date: week, amountCents: advanceCents,
        reference: 'ADV-' + code, allocations: [{ billId, amountCents: advanceCents }],
      });
      const grossCents = cents(row.days * row.rate);
      return { workerId, name: row.name, units: row.days * 2, grossCents, advanceCents, payableCents: grossCents - advanceCents };
    });
    const wages = wageEntries.reduce((sum, row) => sum + row.grossCents, 0);
    const wagePayable = wageEntries.reduce((sum, row) => sum + row.payableCents, 0);
    state.wagebills.push({
      id: billId, projectId: id, weekStart: week, weekEnd: addDays(week, 6), revision: 1, status: 'approved',
      entries: wageEntries, grossCents: wages, advanceCents: wages - wagePayable, payableCents: wagePayable,
      submittedAt: snapshot + 'T10:00:00.000Z', submittedById: foreman, approvedAt: at,
    });
    const confirmed = (name: string, targetId: string, amountCents: number, targetType: 'wagebill' | 'expense' = 'expense') => {
      const paymentId = id + ':payment:' + name;
      state.payments.push({ id: paymentId, projectId: id, targetId, targetType, amountCents, date: snapshot, method: 'Bank transfer', reference: 'OUT-' + code + '-' + name.toUpperCase() });
      return 'payment:' + paymentId;
    };
    const wageOut = confirmed('wages', billId, wagePayable, 'wagebill');

    const unitRate = 845 + index * 45;
    const ordered = 200 + index * 55;
    const delivered = handover ? ordered : Math.round(ordered * 0.8);
    const invoiced = handover ? delivered : Math.round(ordered * 0.66);
    const invoiceCost = cents(invoiced * unitRate);
    const materialId = id + ':material';
    const orderId = id + ':order';
    const orderLine = orderId + ':1';
    const deliveryId = id + ':delivery';
    const invoiceId = id + ':invoice';
    const materialsExpense = id + ':materials';
    const materialName = 'General purpose cement';
    const supplier = 'Sample supplier ' + code;
    const location = { status: 'missing' as const, exceptionReason: 'Fictional procurement evidence' };
    state.suite.materials.push({ id: materialId, name: materialName, unit: 'bag', sku: 'CEM-' + code });
    state.suite.orders.push({
      id: orderId, projectId: id, number: 'PO-' + code, supplier, status: 'approved', submittedBy: foreman,
      approvedBy: pm, createdAt: addDays(snapshot, -18) + openedAt, totalCents: cents(ordered * unitRate),
      lines: [{ id: orderLine, materialId, boqItemId: boq[3].id, quantityMilli: ordered * 1000, rateCents: cents(unitRate) }],
    });
    state.suite.deliveries.push({
      id: deliveryId, projectId: id, orderId, lineId: orderLine, quantityMilli: delivered * 1000, noteReference: 'DN-' + code,
      offloadFileId: id + ':offload.jpg', noteFileId: id + ':delivery.pdf', location,
      status: 'approved', submittedBy: foreman, approvedBy: pm, createdAt: addDays(snapshot, -10) + openedAt,
    });
    const issuedBags = handover ? delivered : Math.round(delivered * 0.65);
    state.suite.stock.push(
      { id: id + ':stock-in', projectId: id, materialId, quantityMilli: delivered * 1000, kind: 'receipt', sourceId: deliveryId, boqItemId: boq[3].id, reason: 'Accepted ' + 'DN-' + code, actorId: pm, at: addDays(snapshot, -10) + 'T12:00:00.000Z' },
      { id: id + ':stock-out', projectId: id, materialId, quantityMilli: -issuedBags * 1000, kind: 'issue', sourceId: '', boqItemId: boq[3].id, reason: 'Issued to the measured work package', actorId: foreman, at: snapshot + openedAt },
    );
    state.suite.invoices.push({
      id: invoiceId, projectId: id, orderId, lineId: orderLine, quantityMilli: invoiced * 1000, rateCents: cents(unitRate),
      totalCents: invoiceCost, reference: 'SUP-' + code, evidenceFileId: id + ':invoice.pdf', expenseId: materialsExpense,
      revision: 1, status: 'approved', submittedBy: foreman, createdAt: addDays(snapshot, -5) + openedAt,
    });
    state.expenses.push({
      id: materialsExpense, projectId: id, date: addDays(snapshot, -3), description: supplier + ' · cement invoice', category: 'Materials',
      amountCents: invoiceCost, receiptRef: 'SUP-' + code, receiptUrl: '', supplierInvoiceId: invoiceId, status: 'approved', approvedAt: addDays(snapshot, -3) + 'T12:00:00.000Z',
    });
    const supplierPaid = Math.round(invoiceCost * (handover ? 1 : 0.72));
    const supplierOut = confirmed('cement', materialsExpense, supplierPaid);
    const runningCost = cents(actualCost) - invoiceCost - wages;
    const structureCost = Math.round(runningCost * 0.64);
    const siteCost = Math.round(runningCost * 0.12);
    const costs = [
      { key: 'structure', amount: structureCost, title: 'Measured structural and envelope packages', category: 'Subcontractors', factor: handover ? 1 : 0.91 },
      { key: 'finishes', amount: runningCost - structureCost - siteCost, title: 'Building services and specialist works', category: 'Subcontractors', factor: handover ? 1 : 0.83 },
      { key: 'site', amount: siteCost, title: 'Plant, temporary works and site logistics', category: 'Site costs', factor: handover ? 1 : 0.88 },
    ];
    let siteOut = '';
    let paidSite = 0;
    for (const row of costs) {
      const expenseId = id + ':cost:' + row.key;
      state.expenses.push({
        id: expenseId, projectId: id, date: addDays(snapshot, -4), description: row.title, category: row.category,
        amountCents: row.amount, receiptRef: 'COST-' + code + '-' + row.key.toUpperCase(),
        receiptUrl: '', ...(row.key === 'site' ? { receiptFileId: id + ':cost.pdf' } : {}),
        status: 'approved', approvedAt: addDays(snapshot, -4) + 'T12:00:00.000Z',
      });
      const paid = Math.round(row.amount * row.factor);
      const outflow = confirmed(row.key, expenseId, paid);
      if (row.key === 'site') { siteOut = outflow; paidSite = paid; }
    }

    state.suite.variations.push({
      id: id + ':change', projectId: id, number: 'VO-' + code + '-01', title: change,
      description: change + '. The revised scope, price and programme assessment are recorded for this sample decision.',
      revision: 2, clientDeltaCents: cents(changeValue), internalDeltaCents: cents(changeAllowance), days: changeDays,
      affectsCompletion: changeDays > 0, programmeReason, status: changeIsAccepted ? 'accepted' : 'sent',
      submittedBy: pm, createdAt: addDays(snapshot, -32) + openedAt, sentAt: addDays(snapshot, -14) + openedAt,
      ...(changeIsAccepted ? { decisionAt: addDays(snapshot, -11) + openedAt, decisionBy: client.id, decisionEmail: client.email, approvedRevision: 2 } : {}),
    });

    const clientAmount = sample.mode === 'fixed' ? cents(effectiveContract) : Math.round(cents(actualCost) * (1 + feeBps / 10_000));
    const billed = Math.round(clientAmount * (handover ? 1 : Math.min(0.93, progress / 100 + 0.03)));
    const firstBill = Math.round(billed * (handover ? 0.36 : 0.43));
    const secondBill = billed - firstBill;
    const amounts = [firstBill, secondBill];
    for (const [i, amount] of amounts.entries()) {
      const milestoneId = id + ':bill:' + i;
      const receiptId = id + ':receipt:' + i;
      const amountCents = i === 0 ? amount : Math.round(amount * (handover ? (index === 5 ? 0.96 : 1) : 0.67));
      const date = i === 0 ? addDays(receiptDate, -30) : receiptDate;
      state.suite.milestones.push({
        id: milestoneId, projectId: id, title: i === 0 ? 'First certified works valuation' : handover ? 'Final works valuation' : 'Latest interim works valuation',
        amountCents: amount, status: 'certified', kind: 'payment-certificate', reference: 'IPC-' + code + '-0' + (i + 1),
        dueDate: addDays(date, 7), certifiedAt: addDays(date, -7) + openedAt,
      });
      const receipt = {
        id: receiptId, projectId: id, number: 'RCP-' + code + '-0' + (i + 1), title: 'Client payment for ' + (i ? 'latest certificate' : 'first certificate'),
        amountCents, method: 'Bank transfer', reference: 'IN-' + code + '-0' + (i + 1), date, issuedAt: publishedAt(date), issuedBy: admin,
      };
      state.suite.receipts.push(receipt);
      const plan = saveReceiptPlan(state, receipt, {
        revision: 0, applications: [{ milestoneId, amount: String(amountCents / 100) }],
        allocations: [
          { category: 'materials', amount: String(Math.floor(amountCents * 0.33) / 100) },
          { category: 'labour', amount: String(Math.floor(amountCents * 0.18) / 100) },
          { category: 'site', amount: String(Math.floor(amountCents * 0.20) / 100) },
        ],
      });
      state.suite.finance.plans[receiptId] = plan;
      if (i === 1) {
        const targets = [
          { category: 'materials', outflowId: supplierOut, amount: supplierPaid },
          { category: 'labour', outflowId: wageOut, amount: wagePayable },
          { category: 'site', outflowId: siteOut, amount: paidSite },
        ] as const;
        for (const row of targets) {
          const earmarked = plan.allocations.find(item => item.category === row.category)?.amountCents || 0;
          if (!earmarked || !row.amount) continue;
          const link = linkFunding(state, receipt, {
            category: row.category, outflowId: row.outflowId, amount: String(Math.min(earmarked, row.amount) / 100),
          });
          state.suite.finance.fundingLinks.push({ id: receiptId + ':' + row.category, receiptId, ...link, linkedAt: at, linkedBy: admin });
        }
      }
    }

    const overhead = Math.round(actualCost * 0.013);
    const staff = Math.round(actualCost * 0.012);
    const openOrderKes = handover ? 0 : (ordered - invoiced) * unitRate;
    state.suite.finance.reviews[id] = saveFinanceReview(state, built, {
      revision: 0, asOf: snapshot, earnedRevenue: String(billed / 100), staffCost: String(staff), overhead: String(overhead),
      forecastRevenue: String(Math.round(sample.contract + changeValue)), uncommitted: String(Math.max(0, sample.forecastCost - actualCost - staff - overhead - openOrderKes)),
    }, at, admin);

    for (const sheet of portfolioSheetList) state.suite.drawings.push({
      id: id + ':' + sheet.slug, projectId: id, fileId: id + ':' + sheet.slug, sheetCode: sheet.code,
      title: sheet.title, discipline: sheet.discipline, category: sheet.category,
      revision: sheet.revision, status: sheet.slug === 'A101-R1' ? 'superseded' : 'current',
      published: sheet.slug !== 'A101-R1' && sheet.slug !== 'PR101-R1',
      uploadedBy: pm, uploadedAt: issued, issuedBy: pm, issuedAt: issued,
    });
    state.suite.acknowledgements.push({ drawingId: id + ':A101-R2', userId: foreman, name: 'Sample foreman', at: publishedAt(addDays(sample.start, 29)) });
    if (handover) state.suite.designAcceptances.push({ drawingId: id + ':A101-R2', revision: 2, clientId: client.id, clientEmail: client.email, at: publishedAt(addDays(sample.start, 31)) });

    state.suite.media.push({
      id: id + ':render', projectId: id, fileId: id + ':concept.jpg', contentType: 'image/jpeg',
      caption: 'Concept render · ' + sample.render, stage, location: { status: 'missing', exceptionReason: 'Illustrative visualization' },
      submittedBy: pm, createdAt: at, published: true, publishedAt: at,
    });
    for (let offset = 3; offset >= 0; offset--) {
      const weekStart = addDays(week, -offset * 7);
      const updatedAt = publishedAt(addDays(snapshot, -offset * 7));
      state.reports.push({
        id: id + ':report:' + offset, projectId: id, weekStart, updatedAt,
        progress: Math.max(0, progress - offset * (handover ? 3 : 5)),
        stage: offset && handover ? 'Completion checks' : stage,
        summary: [sample.update, 'The team checked measured work and recorded the outcomes from the inspection for ' + sample.name + '.', 'The team verified the current issue and checked the next trade handover for ' + sample.name + '.', 'The programme and outstanding approvals were reviewed for ' + sample.name + '.'][offset],
        nextSteps: offset ? 'Follow up the actions in the project register.' : sample.next,
        risks: offset ? '' : sample.issue,
      });
      state.suite.publishedWeeks[id + ':' + weekStart] = updatedAt;
    }
    state.suite.actions.push({
      id: id + ':action', projectId: id, title: handover ? 'Confirm defects visit' : 'Confirm the next client review',
      kind: handover ? 'snag' : 'rfi', owner: 'Sample project lead', status: 'open', note: sample.issue,
      dueDate: addDays(snapshot, 14), createdAt: at,
    });
    state.audit.push({
      id: id + ':seed', at, actor: 'Sample project team', projectId: id,
      action: 'demo.portfolio.snapshot', description: 'Recorded work, client billing and weekly updates at the sample review date',
    });
  }
  return state;
}
