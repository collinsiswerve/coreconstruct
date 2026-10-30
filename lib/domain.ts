export type Project = { id: string; name: string; location: string; client: string; budgetCents: number; contractCents: number; mode: 'fixed' | 'open'; stage: string; progress: number; demo: boolean; createdAt: string; summary?: string; nextSteps?: string; risks?: string; reportUpdatedAt?: string };
export type Worker = { id: string; name: string; trade: string; rateCents: number; active: boolean; demo: boolean };
export type Attendance = { id: string; projectId: string; workerId: string; date: string; units: number; rateCents: number; agreedRateCents?: number; boqItemId?:string; task: string };
export type Advance = { id: string; projectId: string; workerId: string; date: string; amountCents: number; reference: string; allocations: { billId: string; amountCents: number }[]; reversedAt?: string; reason?: string };
export type WageEntry = { workerId: string; name: string; units: number; grossCents: number; advanceCents: number; payableCents: number };
export type Wagebill = { id: string; projectId: string; weekStart: string; weekEnd: string; revision: number; status: 'submitted' | 'approved' | 'returned'; entries: WageEntry[]; grossCents: number; advanceCents: number; payableCents: number; submittedAt: string; approvedAt?: string; reason?: string };
export type Expense = { id: string; projectId: string; date: string; description: string; category: string; amountCents: number; receiptRef: string; receiptUrl: string; receiptFileId?:string; status: 'submitted' | 'approved' | 'returned'; reason?: string; approvedAt?: string };
export type Payment = { id: string; projectId: string; targetType: 'wagebill' | 'expense'; targetId: string; amountCents: number; date: string; method: string; reference: string; reversedAt?: string; reason?: string };
export type ReportNote = { id: string; projectId: string; weekStart: string; summary: string; nextSteps: string; risks: string; progress: number; stage: string; updatedAt: string };
export type AuditEvent = { id: string; at: string; actor: string; action: string; projectId?: string; description: string; before?: unknown };
export type State = { schemaVersion: 1; firm: string; projects: Project[]; workers: Worker[]; attendance: Attendance[]; advances: Advance[]; wagebills: Wagebill[]; expenses: Expense[]; payments: Payment[]; reports: ReportNote[]; audit: AuditEvent[]; commandIds: string[] };
export type Command = { id: string; type: string; payload: Record<string, unknown> };
export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const emptyState = (): State => ({ schemaVersion: 1, firm: 'Geeks Signature Limited', projects: [], workers: [], attendance: [], advances: [], wagebills: [], expenses: [], payments: [], reports: [], audit: [], commandIds: [] });
export function moneyToCents(value: unknown): number {
  const s = String(value ?? '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) throw new DomainError('Enter a valid KES amount with at most two decimal places.');
  const [whole, fraction = ''] = s.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function kes(cents: number): string { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); }
export function dateKey(date = new Date()): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
export function addDays(value: string, days: number): string { const d = new Date(value + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function monday(value = dateKey()): string { const d = new Date(value + 'T12:00:00Z'); return addDays(value, -((d.getUTCDay() + 6) % 7)); }
export function displayDate(value: string): string { return new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
const text = (v: unknown, label: string, max = 240) => { const s = String(v ?? '').trim(); if (!s || s.length > max) throw new DomainError(`${label} is required (maximum ${max} characters).`); return s; };
const optional = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
function validDate(v: unknown): string { const s = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(new Date(s + 'T12:00:00Z').getTime()) || new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s) throw new DomainError('Choose a valid date.'); return s; }
function amount(v: unknown, allowZero = false) { const n = moneyToCents(v); if (!allowZero && n <= 0) throw new DomainError('The amount must be greater than zero.'); return n; }
const find = <T extends { id: string }>(items: T[], id: unknown, name: string): T => { const x = items.find(v => v.id === id); if (!x) throw new DomainError(`${name} was not found.`, 404); return x; };
export function paidFor(s: State, type: string, id: string): number { return s.payments.filter(p => p.targetType === type && p.targetId === id && !p.reversedAt).reduce((n, p) => n + p.amountCents, 0); }
export function totals(s: State, projectId: string) {
  const bills = s.wagebills.filter(w => w.projectId === projectId && w.status === 'approved');
  const costs = s.expenses.filter(e => e.projectId === projectId && e.status === 'approved');
  const advances = s.advances.filter(a => a.projectId === projectId && !a.reversedAt);
  const labour = bills.reduce((n, b) => n + b.grossCents, 0);
  const expenses = costs.reduce((n, e) => n + e.amountCents, 0);
  const outstanding = bills.reduce((n, b) => n + b.payableCents - paidFor(s, 'wagebill', b.id), 0) + costs.reduce((n, e) => n + e.amountCents - paidFor(s, 'expense', e.id), 0);
  const cashPaid = s.payments.filter(p => p.projectId === projectId && !p.reversedAt).reduce((n, p) => n + p.amountCents, 0) + advances.reduce((n, a) => n + a.amountCents, 0);
  const unallocatedAdvances = advances.reduce((n, a) => n + a.amountCents - a.allocations.filter(x => bills.some(b => b.id === x.billId)).reduce((k, x) => k + x.amountCents, 0), 0);
  return { labour, expenses, incurred: labour + expenses, outstanding, cashPaid, unallocatedAdvances };
}
export function buildWageEntries(s: State, projectId: string, weekStart: string): WageEntry[] {
  const end = addDays(weekStart, 6);
  const rows = s.attendance.filter(a => a.projectId === projectId && a.date >= weekStart && a.date <= end);
  const piecework = ((s as State & { suite?: { piecework?: { projectId: string; weekStart: string; workerId: string; amountCents: number }[] } }).suite?.piecework || []).filter(p => p.projectId === projectId && p.weekStart === weekStart);
  return [...new Set([...rows.map(a => a.workerId), ...piecework.map(p => p.workerId)])].map(workerId => {
    const mine = rows.filter(a => a.workerId === workerId);
    const grossCents = mine.reduce((n, a) => n + Math.round(a.rateCents * a.units / 2), 0) + piecework.filter(p => p.workerId === workerId).reduce((n, p) => n + p.amountCents, 0);
    return { workerId, name: find(s.workers, workerId, 'Worker').name, units: mine.reduce((n, a) => n + a.units, 0), grossCents, advanceCents: 0, payableCents: grossCents };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export function applyCommand(original: State, command: Command, actor: string, at = new Date().toISOString(), makeId = () => crypto.randomUUID()): State {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(command.id)) throw new DomainError('Invalid request identifier.');
  if (original.commandIds.includes(command.id)) return original;
  const s = structuredClone(original), p = command.payload;
  let description = '', projectId: string | undefined, before: unknown;
  const project = () => { const x = find(s.projects, p.projectId, 'Project'); projectId = x.id; return x; };
  switch (command.type) {
    case 'firm.update': s.firm = text(p.name, 'Firm name', 100); description = 'Updated firm details'; break;
    case 'project.create': {
      const x: Project = { id: makeId(), name: text(p.name, 'Project name', 100), location: text(p.location, 'Location', 120), client: optional(p.client, 100), budgetCents: amount(p.budget), contractCents: amount(p.contract || '0', true), mode: p.mode === 'open' ? 'open' : 'fixed', stage: 'Site setup', progress: 0, demo: false, createdAt: at };
      s.projects.push(x); projectId = x.id; description = `Created ${x.name}`; break;
    }
    case 'project.update': {
      const x = project(); before = { ...x };
      const progress = Number(p.progress); if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new DomainError('Progress must be a whole number from 0 to 100.');
      x.name = text(p.name, 'Project name', 100); x.location = text(p.location, 'Location', 120); x.client = optional(p.client, 100); x.budgetCents = amount(p.budget); x.contractCents = amount(p.contract || '0', true); x.mode = p.mode === 'open' ? 'open' : 'fixed'; x.stage = text(p.stage, 'Stage', 80); x.progress = progress; description = `Updated ${x.name}`; break;
    }
    case 'report.save': {
      const x = project(), weekStart = validDate(p.weekStart);
      if (monday(weekStart) !== weekStart) throw new DomainError('A reporting week starts on Monday.');
      const old = s.reports.find(r => r.projectId === x.id && r.weekStart === weekStart); before = old ? { ...old } : undefined;
      const note: ReportNote = { id: old?.id || makeId(), projectId: x.id, weekStart, summary: text(p.summary, 'Weekly summary', 2000), nextSteps: optional(p.nextSteps, 2000), risks: optional(p.risks, 2000), progress: x.progress, stage: x.stage, updatedAt: at };
      if (old) Object.assign(old, note); else s.reports.push(note);
      description = `Saved the reporting note for ${weekStart}`; break;
    }
    case 'worker.create': {
      const name = text(p.name, 'Worker name', 100);
      if (s.workers.some(w => w.active && w.demo === (p.demo === true) && w.name.toLowerCase() === name.toLowerCase())) throw new DomainError('An active worker already has this name. Add a distinguishing name if they are different people.');
      s.workers.push({ id: makeId(), name, trade: text(p.trade, 'Trade', 60), rateCents: amount(p.rate), active: true, demo: p.demo === true }); description = `Added ${name} to the team`; break;
    }
    case 'worker.update': {
      const x = find(s.workers, p.workerId, 'Worker'); before = { ...x }; x.name = text(p.name, 'Worker name', 100); x.trade = text(p.trade, 'Trade', 60); x.rateCents = amount(p.rate); x.active = p.active !== false; description = `Updated ${x.name}; historical attendance rates retained`; break;
    }
    case 'attendance.save': {
      const x = project(), worker = find(s.workers, p.workerId, 'Worker'), date = validDate(p.date), units = Number(p.units);
      if (!worker.active) throw new DomainError('This worker is inactive.');
      if (worker.demo !== x.demo) throw new DomainError('Sample workers are reserved for the sample project. Add your own workers for live projects.');
      if (![1, 2].includes(units)) throw new DomainError('Choose a half-day or full day.');
      if (s.wagebills.some(b => b.projectId === x.id && b.status !== 'returned' && date >= b.weekStart && date <= b.weekEnd)) throw new DomainError('Attendance is locked by a submitted wagebill. Return the wagebill before correcting attendance.');
      if (date > dateKey(new Date(at))) throw new DomainError('Attendance cannot be recorded for a future date.');
      const old = s.attendance.find(a => a.projectId === x.id && a.workerId === worker.id && a.date === date);
      const otherUnits = s.attendance.filter(a => a.id !== old?.id && a.workerId === worker.id && a.date === date).reduce((n, a) => n + a.units, 0);
      if (otherUnits + units > 2) throw new DomainError('This worker would exceed one full day across projects on this date.');
      const row: Attendance = { id: old?.id || makeId(), projectId: x.id, workerId: worker.id, date, units, rateCents: p.rate ? amount(p.rate) : (old?.rateCents || worker.rateCents), agreedRateCents: old?.agreedRateCents || worker.rateCents, boqItemId: typeof p.boqItemId==='string'?p.boqItemId:old?.boqItemId, task: text(p.task, 'Task', 160) };
      before = old ? { ...old } : undefined; if (old) Object.assign(old, row); else s.attendance.push(row); description = `Recorded ${worker.name}: ${units / 2} day on ${date}`; break;
    }
    case 'attendance.remove': {
      const row = find(s.attendance, p.attendanceId, 'Attendance'); projectId = row.projectId;
      if (s.wagebills.some(b => b.projectId === row.projectId && b.status !== 'returned' && row.date >= b.weekStart && row.date <= b.weekEnd)) throw new DomainError('Return the wagebill before correcting this attendance.');
      before = row; s.attendance = s.attendance.filter(a => a.id !== row.id); description = 'Removed an unapproved attendance entry'; break;
    }
    case 'advance.create': {
      const x = project(), worker = find(s.workers, p.workerId, 'Worker');
      if (worker.demo !== x.demo) throw new DomainError('Choose a worker for this project.');
      const date = validDate(p.date); if (date > dateKey(new Date(at))) throw new DomainError('A confirmed advance cannot have a future date.');
      const reference = text(p.reference, 'Payment reference', 100);
      if ([...s.advances.filter(a => !a.reversedAt), ...s.payments.filter(a => !a.reversedAt)].some(a => a.reference.toUpperCase() === reference.toUpperCase())) throw new DomainError('This payment reference is already recorded.');
      s.advances.push({ id: makeId(), projectId: x.id, workerId: worker.id, date, amountCents: amount(p.amount), reference, allocations: [] }); description = `Recorded a confirmed advance for ${worker.name}`; break;
    }
    case 'advance.reverse': {
      const x = find(s.advances, p.advanceId, 'Advance'); projectId = x.projectId;
      if (x.reversedAt) throw new DomainError('This advance has already been reversed.');
      if (x.allocations.length) throw new DomainError('Return its unpaid wagebill and remove the allocation before reversing an advance.');
      before = { ...x }; x.reversedAt = at; x.reason = text(p.reason, 'Reason', 240); description = 'Reversed an unallocated advance'; break;
    }
    case 'wagebill.submit': {
      const x = project(), start = validDate(p.weekStart); if (monday(start) !== start) throw new DomainError('A wagebill week starts on Monday.');
      let bill = s.wagebills.find(b => b.projectId === x.id && b.weekStart === start);
      if (bill && bill.status !== 'returned') throw new DomainError('A wagebill has already been submitted for this week.');
      before = bill ? structuredClone(bill) : undefined;
      const id = bill?.id || makeId(), end = addDays(start, 6);
      if (end > dateKey(new Date(at)) && p.confirmCurrentWeek !== true) throw new DomainError('Confirm that attendance for this current week is complete before submitting.');
      for (const a of s.advances) a.allocations = a.allocations.filter(v => v.billId !== id);
      const entries = buildWageEntries(s, x.id, start); if (!entries.length) throw new DomainError('Record attendance for this week first.');
      for (const e of entries) {
        let remaining = e.grossCents;
        for (const a of s.advances.filter(a => a.projectId === x.id && a.workerId === e.workerId && !a.reversedAt && a.date <= end).sort((a, b) => a.date.localeCompare(b.date))) {
          const available = a.amountCents - a.allocations.reduce((n, v) => n + v.amountCents, 0), use = Math.min(available, remaining);
          if (use > 0) { a.allocations.push({ billId: id, amountCents: use }); e.advanceCents += use; remaining -= use; }
        }
        e.payableCents = remaining;
      }
      const next: Wagebill = { id, projectId: x.id, weekStart: start, weekEnd: end, revision: (bill?.revision || 0) + 1, status: 'submitted', entries, grossCents: entries.reduce((n, e) => n + e.grossCents, 0), advanceCents: entries.reduce((n, e) => n + e.advanceCents, 0), payableCents: entries.reduce((n, e) => n + e.payableCents, 0), submittedAt: at };
      if (bill) Object.assign(bill, next, { approvedAt: undefined, reason: undefined }); else s.wagebills.push(next); description = `Submitted wagebill for ${start}, revision ${next.revision}`; break;
    }
    case 'wagebill.approve': {
      const x = find(s.wagebills, p.billId, 'Wagebill'); projectId = x.projectId; if (x.status !== 'submitted') throw new DomainError('Only a submitted wagebill can be approved.'); before = { ...x }; x.status = 'approved'; x.approvedAt = at; description = `Approved wagebill for ${x.weekStart}`; break;
    }
    case 'wagebill.return': {
      const x = find(s.wagebills, p.billId, 'Wagebill'); projectId = x.projectId; if (x.status === 'returned') throw new DomainError('This wagebill is already returned.');
      if (paidFor(s, 'wagebill', x.id) > 0) throw new DomainError('Reverse or reconcile its payments before returning this wagebill.');
      before = structuredClone(x); x.status = 'returned'; x.reason = text(p.reason, 'Reason', 240);
      for (const a of s.advances) a.allocations = a.allocations.filter(v => v.billId !== x.id);
      description = `Returned wagebill for ${x.weekStart}: ${x.reason}`; break;
    }
    case 'expense.create': case 'expense.revise': {
      const x = project(), url = optional(p.receiptUrl, 1000); if (url && (!URL.canParse(url) || new URL(url).protocol !== 'https:')) throw new DomainError('Receipt links must use https://.');
      const value: Expense = { id: makeId(), projectId: x.id, date: validDate(p.date), description: text(p.description, 'Description', 160), category: text(p.category, 'Category', 60), amountCents: amount(p.amount), receiptRef: optional(p.receiptRef, 100), receiptUrl: url, receiptFileId: typeof p.receiptFileId==='string'?p.receiptFileId:undefined, status: 'submitted' };
      if (command.type === 'expense.revise') { const old = find(s.expenses, p.expenseId, 'Expense'); if (old.projectId !== x.id || old.status !== 'returned') throw new DomainError('Only a returned expense can be revised.'); before = { ...old }; Object.assign(old, value, { id: old.id, reason: undefined, approvedAt: undefined }); }
      else s.expenses.push(value);
      description = `${command.type === 'expense.revise' ? 'Resubmitted' : 'Submitted'} expense: ${value.description}`; break;
    }
    case 'expense.approve': {
      const x = find(s.expenses, p.expenseId, 'Expense'); projectId = x.projectId; if (x.status !== 'submitted') throw new DomainError('Only a submitted expense can be approved.'); before = { ...x }; x.status = 'approved'; x.approvedAt = at; description = `Approved expense: ${x.description}`; break;
    }
    case 'expense.return': {
      const x = find(s.expenses, p.expenseId, 'Expense'); projectId = x.projectId; if (x.status === 'returned') throw new DomainError('This expense is already returned.'); if (paidFor(s, 'expense', x.id) > 0) throw new DomainError('Reverse or reconcile its payments before returning this expense.'); before = { ...x }; x.status = 'returned'; x.reason = text(p.reason, 'Reason', 240); description = `Returned expense: ${x.description}`; break;
    }
    case 'payment.record': {
      const targetType = p.targetType === 'wagebill' ? 'wagebill' : p.targetType === 'expense' ? 'expense' : null; if (!targetType) throw new DomainError('Choose a valid payment target.');
      const target = targetType === 'wagebill' ? find(s.wagebills, p.targetId, 'Wagebill') : find(s.expenses, p.targetId, 'Expense');
      projectId = target.projectId; if (target.status !== 'approved') throw new DomainError('Approve this record before recording payment.');
      const total = targetType === 'wagebill' ? (target as Wagebill).payableCents : (target as Expense).amountCents, value = amount(p.amount);
      if (value > total - paidFor(s, targetType, target.id)) throw new DomainError('The payment exceeds the remaining balance.');
      const reference = text(p.reference, 'Payment reference', 100), date = validDate(p.date), method = text(p.method, 'Payment method', 30);
      if (!['M-Pesa', 'Bank transfer', 'Cash'].includes(method)) throw new DomainError('Choose a supported payment method.');
      if (date > dateKey(new Date(at))) throw new DomainError('A confirmed payment cannot have a future date.');
      if ([...s.payments.filter(v => !v.reversedAt), ...s.advances.filter(v => !v.reversedAt)].some(v => v.reference.toUpperCase() === reference.toUpperCase())) throw new DomainError('This payment reference is already recorded.');
      s.payments.push({ id: makeId(), projectId, targetType, targetId: target.id, amountCents: value, date, reference, method }); description = `Recorded ${kes(value)} payment (${reference})`; break;
    }
    case 'payment.reverse': {
      const x = find(s.payments, p.paymentId, 'Payment'); projectId = x.projectId; if (x.reversedAt) throw new DomainError('This payment has already been reversed.'); before = { ...x }; x.reversedAt = at; x.reason = text(p.reason, 'Reason', 240); description = `Reversed payment ${x.reference}: ${x.reason}`; break;
    }
    case 'demo.load': {
      if (s.projects.some(x => x.demo)) throw new DomainError('The sample project is already available in the project selector.');
      const pid = makeId(), start = monday(dateKey(new Date(at))), last = addDays(start, -7);
      s.projects.push({ id: pid, name: 'Sample residence', location: 'Nairobi · example project', client: 'Sample client', budgetCents: 180000000, contractCents: 225000000, mode: 'fixed', stage: 'Superstructure', progress: 32, demo: true, createdAt: at });
      const names = [['James Mwangi', 'Mason', 150000], ['Mary Achieng', 'Site assistant', 85000], ['Peter Otieno', 'Carpenter', 160000], ['Anne Wanjiku', 'Mason', 150000], ['David Kamau', 'Casual labour', 80000], ['Grace Njeri', 'Steel fixer', 160000]] as const;
      const workers = names.map(([name, trade, rateCents]) => ({ id: makeId(), name, trade, rateCents, active: true, demo: true })); s.workers.push(...workers);
      for (let d = 0; d < 5; d++) for (const w of workers) s.attendance.push({ id: makeId(), projectId: pid, workerId: w.id, date: addDays(last, d), units: 2, rateCents: w.rateCents, task: 'Ground-floor walling and columns' });
      const entries = buildWageEntries(s, pid, last), gross = entries.reduce((n, e) => n + e.grossCents, 0), bid = makeId();
      s.wagebills.push({ id: bid, projectId: pid, weekStart: last, weekEnd: addDays(last, 6), revision: 1, status: 'approved', entries, grossCents: gross, advanceCents: 0, payableCents: gross, submittedAt: at, approvedAt: at });
      s.payments.push({ id: makeId(), projectId: pid, targetType: 'wagebill', targetId: bid, date: addDays(last, 5), amountCents: gross, method: 'M-Pesa', reference: 'DEMO-WAGES-01' });
      const examples = [['Cement · 80 bags', 'Materials', 6480000, 'approved', -12], ['Reinforcement steel delivery', 'Materials', 12600000, 'approved', -8], ['Site water delivery', 'Transport & utilities', 1200000, 'approved', -5], ['Concrete mixer hire', 'Equipment', 1850000, 'submitted', -1], ['Binding wire and nails', 'Materials', 780000, 'submitted', 0]] as const;
      examples.forEach(([description, category, amountCents, status, offset], i) => { const id = makeId(); s.expenses.push({ id, projectId: pid, date: addDays(start, offset), description, category, amountCents, status, receiptRef: 'DEMO-INV-0' + (i + 1), receiptUrl: '', approvedAt: status === 'approved' ? at : undefined }); if (i === 0) s.payments.push({ id: makeId(), projectId: pid, targetType: 'expense', targetId: id, amountCents: 4000000, date: addDays(start, -10), method: 'Bank transfer', reference: 'DEMO-BANK-01' }); });
      for (let d = 0; d < Math.min(4, (new Date(dateKey(new Date(at)) + 'T12:00Z').getUTCDay() + 6) % 7 + 1); d++) for (const w of workers.slice(0, 5)) s.attendance.push({ id: makeId(), projectId: pid, workerId: w.id, date: addDays(start, d), units: 2, rateCents: w.rateCents, task: 'Columns and first-floor formwork' });
      projectId = pid; description = 'Loaded a fictional sample project'; break;
    }
    default: throw new DomainError('Unknown operation.');
  }
  s.commandIds.push(command.id); s.audit.push({ id: makeId(), at, actor, action: command.type, projectId, description, ...(before ? { before } : {}) });
  if (JSON.stringify(s).length > 950000) throw new DomainError('This pilot workspace has reached its record limit. Export a backup and contact the owner before adding more records.', 413);
  return s;
}
