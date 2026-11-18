import { displayDate, kes } from './domain';

const compactNumber = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });

export function compactKes(cents: number) {
  const amount = Math.abs(cents) / 100;
  if (amount < 1_000_000) return kes(cents);
  const units = amount >= 1_000_000_000 ? [1_000_000_000, 'bn'] as const : [1_000_000, 'm'] as const;
  return (cents < 0 ? '−' : '') + 'KSh ' + compactNumber.format(amount / units[0]) + units[1];
}

export function fullDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? displayDate(value) + ' ' + value.slice(0, 4) : '—';
}

export function brandForeground(color: string) {
  const channels = /^#[a-f0-9]{6}$/i.test(color) ? color.slice(1).match(/../g)! : ['21', '64', '47'];
  const luminance = channels
    .map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, channel) => sum + value * [0.2126, 0.7152, 0.0722][channel], 0);
  return luminance >= 0.179 ? '#000000' : '#ffffff';
}
