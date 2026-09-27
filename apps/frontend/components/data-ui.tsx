'use client';

import { ApiException } from '@/lib/api';

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiException ? error.message : 'Gagal memuat data. Periksa koneksi Anda.';
  return (
    <div
      role="alert"
      className="card mb-3 flex flex-wrap items-center justify-between gap-2 border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[#b91c1c]"
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
      <p className="text-[#475569]">{title}</p>
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
      <div className="flex items-center justify-between gap-2 border-b border-[#e2e8f0] px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

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
    <div className="card px-3 py-2">
      <p className="text-xs text-[#475569]">{label}</p>
      <p
        className="mt-1 text-xl font-semibold tabular-nums"
        style={{
          color:
            tone === 'warning' ? '#d97706' : tone === 'destructive' ? '#dc2626' : undefined,
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] px-3 py-2 text-sm">
      <span className="text-[#475569]">
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
        <span className="tabular-nums text-[#475569]">
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
