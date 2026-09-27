'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Card, ErrorBanner } from '@/components/data-ui';
import { StockBadge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { getProduct } from '@/lib/endpoints';
import { formatCurrency, formatDate, formatQty } from '@/lib/format';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const query = useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
        <Link href="/products" className="btn w-max">
          Kembali ke daftar produk
        </Link>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-8 w-64" />
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  const product = query.data!;
  const lots = product.lots;
  const consumed = lots.reduce(
    (sum, lot) => sum + (lot.initial_qty - lot.available_qty),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-ink-muted">
            <Link href="/products" className="text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink">
              Produk
            </Link>{' '}
            / {product.sku}
          </p>
          <h1 className="text-xl font-semibold">{product.name}</h1>
          <p className="data text-ink-muted">{product.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <StockBadge
            available={product.available_stock}
            buffer={product.min_buffer_stock}
          />
          <Link href="/lots" className="btn btn-primary">
            Terima Lot Baru
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card title="Stok Tersedia">
          <p className="px-3 py-2 text-xl font-semibold data">
            {formatQty(product.available_stock)}
          </p>
        </Card>
        <Card title="Buffer Minimum">
          <p className="px-3 py-2 text-xl font-semibold data">
            {formatQty(product.min_buffer_stock)}
          </p>
        </Card>
        <Card title="Total Diterima">
          <p className="px-3 py-2 text-xl font-semibold data">
            {formatQty(lots.reduce((sum, lot) => sum + lot.initial_qty, 0))}
          </p>
        </Card>
        <Card title="Total Keluar">
          <p className="px-3 py-2 text-xl font-semibold data">{formatQty(consumed)}</p>
        </Card>
      </div>

      <Card title={`Lot Aktif (${lots.length})`}>
        {lots.length === 0 ? (
          <p className="px-3 py-8 text-ink-muted">
            Belum ada lot untuk produk ini. Terima stok pertama lewat halaman Lots.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Diterima</th>
                  <th className="th text-right">Harga Beli</th>
                  <th className="th text-right">Qty Awal</th>
                  <th className="th text-right">Qty Tersedia</th>
                  <th className="th text-right">Sisa Nilai</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} className="row">
                    <td className="td">{formatDate(lot.received_at)}</td>
                    <td className="td data text-right">
                      {formatCurrency(lot.purchase_price)}
                    </td>
                    <td className="td data text-right">{formatQty(lot.initial_qty)}</td>
                    <td className="td data text-right">
                      {formatQty(lot.available_qty)}
                      {lot.available_qty === 0 ? (
                        <span className="ml-2 text-xs text-ink-muted">habis</span>
                      ) : null}
                    </td>
                    <td className="td data text-right">
                      {formatCurrency(Number(lot.purchase_price) * lot.available_qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-3 py-2 text-xs text-ink-muted">
          Lot diurutkan FIFO — pesanan selalu mengambil lot tertua lebih dulu.
        </p>
      </Card>
    </div>
  );
}
