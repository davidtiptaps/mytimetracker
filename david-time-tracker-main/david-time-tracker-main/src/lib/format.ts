export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'MXN', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'ZAR',
];

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: string): string {
  let fmt = moneyFormats.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    } catch {
      // An unknown code still shows a sensible number.
      fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    moneyFormats.set(currency, fmt);
  }
  return fmt.format(amount);
}

export function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
    return /^[A-Z]{3}$/.test(code);
  } catch {
    return false;
  }
}

export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(hours < 10 ? 2 : 1).replace(/\.?0+$/, '') || '0'} h`;
}

/** 1:05:09 style, for a running timer. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** First emoji/character only, so the field can't hold a sentence. */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return seg.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? '';
}
