const JAKARTA = 'Asia/Jakarta';

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('id-ID');

/**
 * All timestamps are rendered client-side with an explicit timezone so the
 * server HTML and the client hydration agree (PRD risk: hydration mismatch).
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateFormatter.format(new Date(iso));
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(Number(value));
}

/** Compact form for dashboard tiles: 2_300_000 -> "Rp 2,3 jt". */
export function formatCurrencyShort(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (n >= 1_000_000_000) return `Rp ${trim(n / 1_000_000_000)} M`;
  if (n >= 1_000_000) return `Rp ${trim(n / 1_000_000)} jt`;
  if (n >= 1_000) return `Rp ${trim(n / 1_000)} rb`;
  return `Rp ${numberFormatter.format(n)}`;
}

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

/** Value entered as "50000.00" -> "50.000" for read-only display. */
export function formatUnitPrice(value: string | number): string {
  return `${numberFormatter.format(Number(value))} / unit`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, ',0').replace('.', ',');
}

/** Converts an ISO timestamp into the value a datetime-local input expects. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + d.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function initialsFrom(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
