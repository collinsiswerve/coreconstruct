import { DomainError, moneyToCents } from './domain';
import type { BoqItem } from './suite-types';

export const boqColumns = [
  { key: 'code', label: 'Cost code', required: true, aliases: ['item', 'itemcode', 'itemno', 'boqcode'] },
  { key: 'description', label: 'Description', required: true, aliases: ['itemdescription', 'workdescription'] },
  { key: 'stage', label: 'Stage', required: false, aliases: ['section', 'phase', 'workstage'] },
  { key: 'unit', label: 'Unit', required: true, aliases: ['units', 'uom', 'unitofmeasure'] },
  { key: 'quantity', label: 'Quantity', required: true, aliases: ['qty'] },
  { key: 'clientRate', label: 'Client unit rate (KES)', required: false, aliases: ['clientunitrate', 'clientratekes'] },
  { key: 'allowance', label: 'Internal allowance (KES)', required: false, aliases: ['internalallowance', 'costallowance', 'allowancekes', 'internalbudget'] },
  { key: 'labourAllowance', label: 'Labour allowance (KES)', required: false, aliases: ['laborallowance', 'labourallowancekes', 'laborallowancekes'] },
] as const;

export type BoqColumn = typeof boqColumns[number]['key'];
export type BoqMapping = Partial<Record<BoqColumn, number>>;
export type BoqInput = Record<BoqColumn, string>;
type BoqLine = Omit<BoqItem, 'id' | 'projectId'>;
type BoqTotals = { clientTotal: number; allowanceTotal: number; labourTotal: number };
export const maxBoqRows = 500;

export function parseQuantity(value: unknown) {
  const input = String(value ?? '').trim();
  if (!/^\d{1,8}(\.\d{1,3})?$/.test(input)) throw new DomainError('Quantity must be positive with at most three decimal places.');
  const [whole, fraction = ''] = input.split('.');
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (milli <= 0) throw new DomainError('Quantity must be greater than zero.');
  return milli;
}

function field(value: unknown, label: string, limit: number) {
  const input = String(value ?? '').trim();
  if (!input || input.length > limit) throw new DomainError(`${label} is required (maximum ${limit} characters).`);
  return input;
}

export function parseBoqLine(value: unknown, existing: Set<string>): BoqLine {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('Enter a valid BOQ item.');
  const row = value as Record<string, unknown>;
  const code = field(row.code, 'BOQ code', 40);
  const normalizedCode = code.toLowerCase();
  if (existing.has(normalizedCode)) throw new DomainError(`Duplicate BOQ code ${code}. Use a unique code for each item.`);
  const line = {
    code, description: field(row.description, 'Description', 500), stage: field(row.stage || 'General', 'Stage', 80),
    unit: field(row.unit, 'Unit', 30), quantityMilli: parseQuantity(row.quantity), completedMilli: 0,
    clientRateCents: moneyToCents(row.clientRate || '0'), allowanceCents: moneyToCents(row.allowance || '0'),
    labourAllowanceCents: moneyToCents(row.labourAllowance || '0'),
  };
  boqLineValue(line);
  existing.add(normalizedCode);
  return line;
}

export function boqLineValue(line: Pick<BoqItem, 'quantityMilli' | 'clientRateCents'>) {
  const total = (BigInt(line.quantityMilli) * BigInt(line.clientRateCents) + BigInt(500)) / BigInt(1000);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError('The BOQ item value exceeds the supported amount.');
  return Number(total);
}

export function boqTotals(lines: BoqLine[]): BoqTotals {
  const sums = lines.reduce((sum, line) => ({
    clientTotal: sum.clientTotal + boqLineValue(line),
    allowanceTotal: sum.allowanceTotal + line.allowanceCents,
    labourTotal: sum.labourTotal + line.labourAllowanceCents,
  }), { clientTotal: 0, allowanceTotal: 0, labourTotal: 0 });
  if (!Object.values(sums).every(Number.isSafeInteger)) throw new DomainError('The BOQ totals exceed the supported amount.');
  return sums;
}

export function guessBoqMapping(headings: string[]): BoqMapping {
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = headings.map(normalize);
  const mapping: BoqMapping = {};
  const used = new Set<number>();
  for (const column of boqColumns) {
    const aliases = [normalize(column.key), normalize(column.label), ...column.aliases];
    const matches = keys.flatMap((key, i) => !used.has(i) && aliases.includes(key) ? [i] : []);
    if (matches.length === 1) {
      mapping[column.key] = matches[0];
      used.add(matches[0]);
    }
  }
  return mapping;
}

export function previewBoqRows(grid: string[][], headerIndex: number, lastRow: number, mapping: BoqMapping, existingCodes: string[]) {
  const rows: BoqInput[] = [];
  const lines: BoqLine[] = [];
  const issues: string[] = [];
  const required = boqColumns.filter(column => column.required && mapping[column.key] === undefined);
  if (required.length) issues.push('Map the required columns: ' + required.map(column => column.label).join(', ') + '.');
  const mapped = Object.values(mapping).filter(index => index !== undefined);
  if (new Set(mapped).size !== mapped.length) issues.push('Choose a different source column for each field.');
  if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= grid.length) issues.push('Choose a heading row from the worksheet.');
  if (!Number.isInteger(lastRow) || lastRow <= headerIndex + 1 || lastRow > grid.length) issues.push('Choose a last item row below the headings.');
  const existing = new Set(existingCodes.map(code => code.toLowerCase()));
  if (!issues.length) {
    for (let i = headerIndex + 1; i < lastRow; i++) {
      const cells = grid[i];
      if (!cells.some(value => value.trim())) continue;
      const row = Object.fromEntries(boqColumns.map(({ key }) => [key, cells[mapping[key] ?? -1]?.trim() ?? ''])) as BoqInput;
      try {
        lines.push(parseBoqLine(row, existing));
        rows.push(row);
      } catch (error) {
        issues.push(`Row ${i + 1}: ${error instanceof DomainError ? error.message : 'Invalid BOQ item.'}`);
      }
    }
    if (rows.length > maxBoqRows) issues.push(`Import up to ${maxBoqRows} items at a time.`);
    if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 195_000) issues.push('Split these BOQ items into smaller batches.');
    if (!rows.length && !issues.length) issues.push('Add at least one item below the headings.');
  }
  let totals: BoqTotals | null = null;
  try { totals = boqTotals(lines); }
  catch (error) { issues.push(error instanceof DomainError ? error.message : 'Check the BOQ totals.'); }
  return { rows, lines, issues, totals };
}
