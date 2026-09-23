export const CURRENCY_CODE = 'GHS';
export const CURRENCY_PREFIX = 'GHS';

export function formatCurrency(value: number | string | null | undefined, fractionDigits = 2): string {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return `${CURRENCY_PREFIX} ${amount.toFixed(fractionDigits)}`;
}



