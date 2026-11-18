import { dateKey, DomainError, moneyToCents } from './domain';

export type OpeningBalances = {
  revision: number;
  asOf: string;
  reference: string;
  recordedAt: string;
  recordedBy: string;
  budgetCents: number;
  clientBilledCents: number;
  clientReceivedCents: number;
  costsIncurredCents: number;
  costsPaidCents: number;
};

export function parseOpeningBalances(input: Record<string, unknown>, at: string, actorId: string, revision: number): OpeningBalances {
  const asOf = String(input.asOf ?? '');
  const day = new Date(asOf + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(day.getTime())
    || day.toISOString().slice(0, 10) !== asOf || asOf > dateKey(new Date(at))) {
    throw new DomainError('Choose a valid opening date up to today.');
  }
  const reference = String(input.reference ?? '').trim();
  if (!reference || reference.length > 120) throw new DomainError('Enter a source or budget version reference (up to 120 characters).');
  const budgetCents = moneyToCents(input.budget);
  const clientBilledCents = moneyToCents(input.clientBilled);
  const clientReceivedCents = moneyToCents(input.clientReceived);
  const costsIncurredCents = moneyToCents(input.costsIncurred);
  const costsPaidCents = moneyToCents(input.costsPaid);
  if (!budgetCents) throw new DomainError('The opening budget must be greater than zero.');
  if (costsPaidCents > costsIncurredCents) throw new DomainError('Opening payments cannot exceed opening incurred costs.');
  return { revision, asOf, reference, recordedAt: at, recordedBy: actorId, budgetCents, clientBilledCents,
    clientReceivedCents, costsIncurredCents, costsPaidCents };
}

export function openingBalanceFigures(opening: OpeningBalances) {
  return {
    clientBalance: opening.clientBilledCents - opening.clientReceivedCents,
    unpaidCosts: opening.costsIncurredCents - opening.costsPaidCents,
    cash: opening.clientReceivedCents - opening.costsPaidCents,
  };
}
