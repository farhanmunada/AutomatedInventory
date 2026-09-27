'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Card, ErrorBanner, StatTile } from '@/components/data-ui';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyShort, formatQty } from '@/lib/format';
import {
  getLowStock,
  getOrderStats,
  getStockSummary,
  getValuation,
} from '@/lib/endpoints';

const DASHBOARD_POLL_MS = 30_000;

export default function DashboardPage() {
  const summary = useQuery({
    queryKey: ['dashboard', 'stock-summary'],
    queryFn: getStockSummary,
    refetchInterval: DASHBOARD_POLL_MS,
  });
  const valuation = useQuery({
    queryKey: ['dashboard', 'valuation'],
    queryFn: getValuation,
    refetchInterval: DASHBOARD_POLL_MS,
  });
  const lowStock = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: getLowStock,
    refetchInterval: DASHBOARD_POLL_MS,
  });
  const stats = useQuery({
    queryKey: ['dashboard', 'order-stats'],
    queryFn: getOrderStats,
    refetchInterval: DASHBOARD_POLL_MS,
  });

  const totalUnits = (summary.data ?? []).reduce((sum, row) => sum + row.total_qty, 0);
  const totalValue = (valuation.data ?? []).reduce((sum, row) => sum + Number(row.total_value), 0);
  const activeOrders = stats.data
    ? (stats.data.by_status.DRAFT ?? 0) +
      (stats.data.by_status.RESERVED ?? 0) +
      (stats.data.by_status.PACKED ?? 0)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title">Dashboard</h1>

      <div className="card grid grid-cols-2 lg:grid-cols-4">
        {summary.isPending ? (
          <div className="skeleton h-20" />
        ) : (
          <StatTile label="Total Stok" value={`${formatQty(totalUnits)} unit`} />
        )}
        {valuation.isPending ? (
          <div className="skeleton h-20" />
        ) : (
          <StatTile label="Valuasi FIFO" value={formatCurrencyShort(totalValue)} />
        )}
        {stats.isPending ? (
          <div className="skeleton h-20" />
        ) : (
          <StatTile label="Order Aktif" value={formatQty(activeOrders)} />
        )}
        {lowStock.isPending ? (
          <div className="skeleton h-20" />
        ) : (
          <StatTile
            label="Stok Rendah"
            value={formatQty(lowStock.data?.length ?? 0)}
            tone={(lowStock.data?.length ?? 0) > 0 ? 'warning' : undefined}
          />
        )}
      </div>

      {(valuation.isError || lowStock.isError || stats.isError || summary.isError) && (
        <ErrorBanner
          error={valuation.error ?? lowStock.error ?? stats.error ?? summary.error}
          onRetry={() => {
            summary.refetch();
            valuation.refetch();
            lowStock.refetch();
            stats.refetch();
          }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Valuasi Stok per Produk"
          action={
            <Link href="/products" className="text-sm text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink">
              Lihat semua produk
            </Link>
          }
        >
          {valuation.isPending ? (
            <TableSkeleton rows={5} cols={3} />
          ) : (valuation.data?.length ?? 0) === 0 ? (
            <p className="px-3 py-6 text-ink-muted">
              Belum ada stok. Tambahkan lot lewat halaman Lots.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Produk</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {valuation.data!.slice(0, 10).map((row) => (
                  <tr key={row.product_id} className="row">
                    <td className="td">
                      <Link
                        href={`/products/${row.product_id}`}
                        className="data text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink"
                      >
                        {row.sku}
                      </Link>
                      <span className="block text-xs text-ink-muted">{row.name}</span>
                    </td>
                    <td className="td data text-right">{formatQty(row.total_qty)}</td>
                    <td className="td data text-right">
                      {formatCurrencyShort(row.total_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Peringatan Stok Rendah"
          action={
            (lowStock.data?.length ?? 0) > 0 ? (
              <Badge tone="warning">{lowStock.data!.length} produk</Badge>
            ) : null
          }
        >
          {lowStock.isPending ? (
            <TableSkeleton rows={4} cols={2} />
          ) : (lowStock.data?.length ?? 0) === 0 ? (
            <p className="px-3 py-6 text-ink-muted">
              Semua produk di atas batas buffer. Tidak ada tindakan yang diperlukan.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {lowStock.data!.map((row) => (
                <li key={row.product_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <Link
                    href={`/products/${row.product_id}`}
                    className="data text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink"
                  >
                    {row.sku}
                    <span className="ml-2 text-xs text-ink-muted">{row.name}</span>
                  </Link>
                  <span className="data text-sm">
                    <span className="font-semibold text-flag-warn">
                      {formatQty(row.total_qty)}
                    </span>
                    <span className="text-ink-muted"> / min {formatQty(row.min_buffer_stock)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Statistik Pesanan">
        {stats.isPending ? (
          <TableSkeleton rows={2} cols={5} />
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            {Object.entries(stats.data!.by_status).map(([status, count]) => (
              <Badge key={status} tone="neutral">
                {status}: {formatQty(count)}
              </Badge>
            ))}
            <span className="ml-2 flex gap-2 text-sm">
              {Object.entries(stats.data!.by_channel).map(([channel, count]) => (
                <Badge key={channel} tone="neutral">
                  {channel}: {formatQty(count)}
                </Badge>
              ))}
              <Badge tone="neutral">Total: {formatQty(stats.data!.total)}</Badge>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
