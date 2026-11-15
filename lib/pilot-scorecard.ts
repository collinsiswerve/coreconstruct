import { dateKey, DomainError, monday, moneyToCents, validDate } from './domain';

type Revision = { revision: number; recordedAt: string; recordedBy: string };
type Preparation = { wagebillMinutes: number; reportMinutes: number };
export type PilotBaseline = Revision & Preparation & { weekStart: string; evidence: string };
export type PilotCycle = Revision & Preparation & {
  weekStart: string;
  closedOn: string;
  scheduled: number;
  onTime: number;
  wageDifferenceCents: number;
  costDifferenceCents: number;
  clientDifferenceCents: number;
  supportMinutes: number;
  evidence: string;
  notes: string;
};
export const renewalLabels = {
  pending: 'Pending discussion',
  considering: 'Considering',
  willing: 'Willing at quoted price',
  declined: 'Declined',
} as const;
export type PilotRenewal = Revision & {
  response: keyof typeof renewalLabels;
  checkedOn: string;
  monthlyPriceCents: number;
  evidence: string;
};
export type ProjectPilotMeasurements = { baseline?: PilotBaseline; cycles: Record<string, PilotCycle> };
export type PilotMeasurements = { projects: Record<string, ProjectPilotMeasurements>; renewal?: PilotRenewal };
export const emptyPilot = (): PilotMeasurements => ({ projects: {} });

type Input = Record<string, unknown>;

function whole(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,6}$/.test(text)) throw new DomainError(label + ' must be a whole number from 0 to 999,999.');
  return Number(text);
}
function preparation(input: Input): Preparation {
  return { wagebillMinutes: whole(input.wagebillMinutes, 'Wagebill minutes'), reportMinutes: whole(input.reportMinutes, 'Weekly report minutes') };
}
function valueText(value: unknown, label: string, max: number, required = false) {
  const text = String(value ?? '').trim();
  if ((required && !text) || text.length > max) throw new DomainError(label + ' must contain ' + (required ? '1–' : 'at most ') + max + ' characters.');
  return text;
}
export function measurementWeek(value: unknown, at: string) {
  const day = validDate(value);
  if (day !== monday(day) || day > dateKey(new Date(at))) throw new DomainError('Choose a reporting Monday on or before today.');
  return day;
}
function stamp(input: Input, previous: Revision | undefined, at: string, actorId: string): Revision {
  const revision = previous?.revision ?? 0;
  if (Number(input.revision) !== revision) throw new DomainError('This pilot measurement changed. Refresh and review the current values.', 409);
  return { revision: revision + 1, recordedAt: at, recordedBy: actorId };
}
export function savePilotBaseline(input: Input, previous: PilotBaseline | undefined, at: string, actorId: string): PilotBaseline {
  return {
    ...stamp(input, previous, at, actorId),
    weekStart: measurementWeek(input.weekStart, at),
    ...preparation(input),
    evidence: valueText(input.evidence, 'Baseline evidence or reference', 160, true),
  };
}
export function savePilotCycle(input: Input, previous: PilotCycle | undefined, at: string, actorId: string): PilotCycle {
  const weekStart = measurementWeek(input.weekStart, at);
  const closedOn = validDate(input.closedOn);
  if (closedOn < weekStart || closedOn > dateKey(new Date(at))) {
    throw new DomainError('The closing date must be between the start of the selected week and today.');
  }
  const scheduled = whole(input.scheduled, 'Records due by the cutoff');
  const onTime = whole(input.onTime, 'Records on time');
  if (onTime > scheduled) throw new DomainError('On-time records cannot exceed the records due.');
  return {
    ...stamp(input, previous, at, actorId), weekStart, closedOn, ...preparation(input), scheduled, onTime,
    wageDifferenceCents: moneyToCents(input.wageDifference),
    costDifferenceCents: moneyToCents(input.costDifference),
    clientDifferenceCents: moneyToCents(input.clientDifference),
    supportMinutes: whole(input.supportMinutes, 'Support minutes'),
    evidence: valueText(input.evidence, 'Evidence or reference', 160, true),
    notes: valueText(input.notes, 'Notes', 500),
  };
}
export function savePilotRenewal(input: Input, previous: PilotRenewal | undefined, at: string, actorId: string): PilotRenewal {
  const response = input.response;
  if (typeof response !== 'string' || !Object.hasOwn(renewalLabels, response)) throw new DomainError('Choose a renewal response.');
  const checkedOn = validDate(input.checkedOn);
  if (checkedOn > dateKey(new Date(at))) throw new DomainError('The renewal discussion date cannot be in the future.');
  const monthlyPriceCents = moneyToCents(input.monthlyPrice || '0');
  if (response === 'willing' && !monthlyPriceCents) throw new DomainError('Enter the quoted monthly price for this response.');
  return {
    ...stamp(input, previous, at, actorId), response: response as PilotRenewal['response'], checkedOn, monthlyPriceCents,
    evidence: valueText(input.evidence, 'Renewal evidence or reference', 160, response === 'willing'),
  };
}
export const preparationMinutes = (record: Preparation) => record.wagebillMinutes + record.reportMinutes;
export const hasDifference = (cycle: PilotCycle) =>
  cycle.wageDifferenceCents > 0 || cycle.costDifferenceCents > 0 || cycle.clientDifferenceCents > 0;
export const pilotTargets = { reduction: 30, onTime: 80 };

export function pilotSummary(measurements?: ProjectPilotMeasurements) {
  const baseline = measurements?.baseline;
  const cycles = Object.values(measurements?.cycles ?? {}).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const sum = cycles.reduce((totals, cycle) => ({
    minutes: totals.minutes + preparationMinutes(cycle),
    scheduled: totals.scheduled + cycle.scheduled,
    onTime: totals.onTime + cycle.onTime,
    support: totals.support + cycle.supportMinutes,
    exceptions: totals.exceptions + Number(hasDifference(cycle)),
  }), { minutes: 0, scheduled: 0, onTime: 0, support: 0, exceptions: 0 });
  const baselineMinutes = baseline ? preparationMinutes(baseline) : null;
  const averageMinutes = cycles.length ? sum.minutes / cycles.length : null;
  return {
    baseline, cycles, baselineMinutes, averageMinutes, ...sum,
    reduction: baselineMinutes && averageMinutes !== null ? (1 - averageMinutes / baselineMinutes) * 100 : null,
    onTimePercent: sum.scheduled ? 100 * sum.onTime / sum.scheduled : null,
  };
}

export function pilotExportRows(firm: string, project: string, measurements?: ProjectPilotMeasurements, renewal?: PilotRenewal) {
  const { baseline, cycles } = pilotSummary(measurements);
  const rows: unknown[][] = [[
    'Firm', 'Project', 'Record type', 'Week starting', 'Closed or checked on', 'Wagebill minutes', 'Report minutes',
    'Records due', 'Records on time', 'Wage difference KES', 'Costs and payments difference KES', 'Client balance difference KES',
    'Support minutes', 'Renewal response', 'Quoted monthly price KES', 'Evidence reference', 'Notes',
  ]];
  if (baseline) rows.push([
    firm, project, 'Baseline', baseline.weekStart, '', baseline.wagebillMinutes, baseline.reportMinutes,
    '', '', '', '', '', '', '', '', baseline.evidence, '',
  ]);
  for (const cycle of cycles.slice().reverse()) rows.push([
    firm, project, 'Weekly close', cycle.weekStart, cycle.closedOn, cycle.wagebillMinutes, cycle.reportMinutes, cycle.scheduled, cycle.onTime,
    cycle.wageDifferenceCents / 100, cycle.costDifferenceCents / 100, cycle.clientDifferenceCents / 100,
    cycle.supportMinutes, '', '', cycle.evidence, cycle.notes,
  ]);
  if (renewal) rows.push([
    firm, '', 'Firm renewal', '', renewal.checkedOn, '', '', '', '', '', '', '',
    '', renewalLabels[renewal.response], renewal.monthlyPriceCents ? renewal.monthlyPriceCents / 100 : '', renewal.evidence, '',
  ]);
  return rows;
}
