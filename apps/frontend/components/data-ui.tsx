'use client';

import { ApiException } from '@/lib/api';

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiException ? error.message : 'Gagal memuat data. Periksa koneksi Anda.';
  return (
    <div
      role="alert"
      className="card mb-3 flex flex-wrap items-center justify-between gap-2 border-flag-critical bg-surface px-3 py-2 text-flag-critical"
    >
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-8">
      <p className="text-ink-muted">{title}</p>
      {action}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="page-title">{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

/**
 * Ledger-strip metric cell: no individual card frame — the parent row supplies
 * vertical rules between cells (docs/DESIGN.md §4: avoid monotonous card kits).
 */
export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'destructive';
}) {
  return (
    <div className="flex flex-col justify-center gap-1 border-b border-line px-4 py-3 lg:border-b-0 lg:border-l lg:first:border-l-0">
      <p className="field-label mb-0">{label}</p>
      <p
        className="data text-2xl font-semibold"
        style={{
          color:
            tone === 'warning'
              ? 'var(--color-flag-warn)'
              : tone === 'destructive'
                ? 'var(--color-flag-critical)'
                : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function PaginationBar({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm">
      <span className="text-ink-muted">
        Menampilkan {from}-{to} dari {total}
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Sebelumnya
        </button>
        <span className="data text-ink-muted">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Berikutnya
        </button>
      </span>
    </div>
  );
}
