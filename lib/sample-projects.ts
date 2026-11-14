import { addDays, dateKey, monday, type Project } from './domain';
import { fundingCategories, linkFunding, saveFinanceReview, saveReceiptPlan, type FundingCategory } from './project-finance';
import type { ClientReceipt, SuiteState } from './suite-types';

type SampleCost = {
  category: FundingCategory;
  description: string;
  approved: number;
  paid: number;
  earmarked: number;
  linked: number;
};

type SampleProject = {
  number: string;
  name: string;
  county: string;
  stage: string;
  progress: number;
  summary: string;
  contract: number;
  budget: number;
  earned: number;
  staff: number;
  overhead: number;
  remaining: number;
  received: number;
  costs: SampleCost[];
};

// Values are whole Kenyan shillings. Ledger records store integer cents.
const comparisonSamples: SampleProject[] = [
  {
    number: '002', name: 'School extension', county: 'Machakos', stage: 'Roofing and services', progress: 42,
    summary: 'Classroom walls are complete and roof installation has started.',
    contract: 28_000_000, budget: 25_000_000, earned: 11_200_000, staff: 450_000, overhead: 350_000,
    remaining: 15_000_000, received: 9_000_000,
    costs: [
      { category: 'materials', description: 'Roof steel and sheets', approved: 5_100_000, paid: 4_500_000, earmarked: 5_200_000, linked: 4_500_000 },
      { category: 'subcontractors', description: 'Masonry and roofing works', approved: 3_400_000, paid: 3_000_000, earmarked: 2_600_000, linked: 2_600_000 },
      { category: 'site', description: 'Plant hire and site utilities', approved: 1_100_000, paid: 700_000, earmarked: 800_000, linked: 700_000 },
    ],
  },
  {
    number: '003', name: 'Apartment block', county: 'Kiambu', stage: 'Superstructure', progress: 46,
    summary: 'Concrete works have progressed, with reinforcement costs above the allowance.',
    contract: 85_000_000, budget: 78_000_000, earned: 37_000_000, staff: 1_200_000, overhead: 800_000,
    remaining: 52_000_000, received: 33_000_000,
    costs: [
      { category: 'materials', description: 'Concrete and reinforcement', approved: 23_000_000, paid: 19_000_000, earmarked: 20_000_000, linked: 19_000_000 },
      { category: 'subcontractors', description: 'Frame and formwork package', approved: 12_000_000, paid: 10_000_000, earmarked: 9_000_000, linked: 8_000_000 },
      { category: 'site', description: 'Crane and site logistics', approved: 3_000_000, paid: 2_000_000, earmarked: 1_000_000, linked: 1_000_000 },
    ],
  },
  {
    number: '004', name: 'Mixed-use development', county: 'Nairobi', stage: 'Structure and services', progress: 52,
    summary: 'The frame and first services packages are progressing. The latest certificate is partly paid.',
    contract: 200_000_000, budget: 175_000_000, earned: 105_000_000, staff: 2_500_000, overhead: 1_500_000,
    remaining: 85_000_000, received: 69_000_000,
    costs: [
      { category: 'materials', description: 'Structural steel and concrete', approved: 52_000_000, paid: 45_000_000, earmarked: 38_000_000, linked: 32_000_000 },
      { category: 'subcontractors', description: 'Mechanical and electrical packages', approved: 32_000_000, paid: 29_000_000, earmarked: 24_000_000, linked: 23_000_000 },
      { category: 'site', description: 'Site establishment and plant', approved: 7_000_000, paid: 5_000_000, earmarked: 5_000_000, linked: 4_000_000 },
    ],
  },
];

export const isFinanceSample = (project: Project) => project.demo && !project.sampleWalkthrough;
export const sampleProjectCount = comparisonSamples.length + 1;
const inCents = (shillings: number) => shillings * 100;

export function addSampleComparisonProjects(state: SuiteState, residenceId: string, actorId: string, at: string) {
  const date = dateKey(new Date(at));
  const weekStart = addDays(monday(date), -7);
  const existingIds = new Set(state.projects.map(project => project.id));
  for (const sample of comparisonSamples) {
    const projectId = residenceId + '-sample-' + sample.number;
    if (existingIds.has(projectId)) continue;

    const project = {
      id: projectId, name: sample.name, location: sample.county + ' County · fictional site',
      client: 'Sample client ' + sample.number, budgetCents: inCents(sample.budget), contractCents: inCents(sample.contract),
      mode: 'fixed' as const, stage: sample.stage, progress: sample.progress, demo: true, createdAt: at,
    };
    state.projects.push(project);
    state.reports.push({
      id: projectId + ':report', projectId, weekStart, stage: sample.stage, progress: sample.progress,
      summary: sample.summary, nextSteps: 'Review the next valuation and confirm upcoming procurement.', risks: '', updatedAt: at,
    });
    state.suite.publishedWeeks[projectId + ':' + weekStart] = at;

    const billId = projectId + ':certificate';
    state.suite.milestones.push({
      id: billId, projectId, title: 'Interim works valuation', reference: 'IPC-DEMO-' + sample.number,
      kind: 'payment-certificate', amountCents: inCents(sample.earned), dueDate: date, status: 'certified', certifiedAt: at,
    });
    const receipt: ClientReceipt = {
      id: projectId + ':receipt', projectId, number: 'RCP-DEMO-' + sample.number, title: 'Part payment of interim certificate',
      amountCents: inCents(sample.received), method: 'Bank transfer', reference: 'DEMO-CLIENT-' + sample.number,
      date: addDays(date, -14), issuedAt: at, issuedBy: actorId,
    };
    state.suite.receipts.push(receipt);
    state.suite.finance.plans[receipt.id] = saveReceiptPlan(state, receipt, {
      revision: 0,
      applications: [{ milestoneId: billId, amount: String(sample.received) }],
      allocations: sample.costs.map(cost => ({ category: cost.category, amount: String(cost.earmarked) })),
    });

    for (const cost of sample.costs) {
      const expenseId = projectId + ':expense:' + cost.category;
      const paymentId = projectId + ':payment:' + cost.category;
      const reference = sample.number + '-' + cost.category.toUpperCase();
      state.expenses.push({
        id: expenseId, projectId, date: addDays(date, -12), description: cost.description,
        category: fundingCategories[cost.category], amountCents: inCents(cost.approved),
        receiptRef: 'DEMO-INV-' + reference, receiptUrl: '', status: 'approved', approvedAt: at,
      });
      state.payments.push({
        id: paymentId, projectId, targetType: 'expense', targetId: expenseId, date: addDays(date, -9),
        amountCents: inCents(cost.paid), method: 'Bank transfer', reference: 'DEMO-PAY-' + reference,
      });
      state.suite.finance.fundingLinks.push({
        id: projectId + ':funding:' + cost.category, receiptId: receipt.id,
        ...linkFunding(state, receipt, { outflowId: 'payment:' + paymentId, category: cost.category, amount: String(cost.linked) }),
        linkedAt: at, linkedBy: actorId,
      });
    }

    state.suite.finance.reviews[projectId] = saveFinanceReview(state, project, {
      revision: 0, asOf: date, earnedRevenue: String(sample.earned), staffCost: String(sample.staff),
      overhead: String(sample.overhead), uncommitted: String(sample.remaining),
    }, at, actorId);
  }
}
