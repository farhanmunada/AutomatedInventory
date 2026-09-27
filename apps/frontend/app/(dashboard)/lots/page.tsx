'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Card, ErrorBanner, PaginationBar } from '@/components/data-ui';
import { LotFormDialog } from '@/components/lot-form-dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { listLots, listProducts } from '@/lib/endpoints';
import { formatCurrency, formatDateTime, formatQty } from '@/lib/format';

export default function LotsPage() {
  const [page, setPage] = useState(1);
  const [productFilter, setProductFilter] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const products = useQuery({
    queryKey: ['products', { lookup: true }],
    queryFn: () => listProducts({ page: 1, limit: 100, sort: 'name:asc' }),
    staleTime: 300_000,
  });

  const productNames = useMemo(
    () => new Map((products.data?.data ?? []).map((product) => [product.id, product])),
    [products.data],
  );

  const query = useQuery({
    queryKey: ['lots', { page, productFilter, onlyInStock }],
    queryFn: () =>
      listLots({
        page,
        limit: 20,
        product_id: productFilter || undefined,
        in_stock: onlyInStock ? 'true' : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Inventory Lots</h1>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
          Terima Lot Baru
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col">
          <span className="mb-1 text-sm font-medium">Produk</span>
          <select
            className="input"
            value={productFilter}
            onChange={(event) => {
              setProductFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua produk</option>
            {(products.data?.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} — {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(event) => {
              setOnlyInStock(event.target.checked);
              setPage(1);
            }}
          />
          <span className="text-sm">Hanya lot masih ada stok</span>
        </label>
        {productFilter || onlyInStock ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setProductFilter('');
              setOnlyInStock(false);
              setPage(1);
            }}
          >
            Reset filter
          </button>
        ) : null}
      </div>

      {query.isError ? <ErrorBanner error={query.error} onRetry={() => query.refetch()} /> : null}

      <Card title={`Daftar Lot${query.data ? ` (${query.data.meta.total})` : ''}`}>
        {query.isPending ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <div className="px-3 py-8">
            <p className="text-[#475569]">
              Belum ada lot. Terima stok pertama agar produk punya angka untuk dijual.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-3"
              onClick={() => setFormOpen(true)}
            >
              Terima Lot Baru
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Produk</th>
                  <th className="th">Diterima</th>
                  <th className="th text-right">Harga Beli</th>
                  <th className="th text-right">Qty Awal</th>
                  <th className="th text-right">Tersedia</th>
                  <th className="th text-right">Terpakai</th>
                </tr>
              </thead>
              <tbody className={query.isFetching ? 'opacity-60' : undefined}>
                {rows.map((lot) => {
                  const product = productNames.get(lot.product_id);
                  return (
                    <tr key={lot.id} className="row-alt">
                      <td className="td">
                        {product ? (
                          <Link
                            href={`/products/${product.id}`}
                            className="text-[#1e40af] hover:underline"
                          >
                            {product.sku}
                          </Link>
                        ) : (
                          <span className="text-[#475569]">{lot.product_id.slice(0, 8)}</span>
                        )}
                        {product ? (
                          <span className="block text-xs text-[#475569]">{product.name}</span>
                        ) : null}
                      </td>
                      <td className="td whitespace-nowrap">{formatDateTime(lot.received_at)}</td>
                      <td className="td text-right tabular-nums">
                        {formatCurrency(lot.purchase_price)}
                      </td>
                      <td className="td text-right tabular-nums">{formatQty(lot.initial_qty)}</td>
                      <td className="td text-right tabular-nums">
                        <span className={lot.available_qty === 0 ? 'text-[#dc2626]' : 'font-semibold'}>
                          {formatQty(lot.available_qty)}
                        </span>
                      </td>
                      <td className="td text-right tabular-nums">
                        {formatQty(lot.initial_qty - lot.available_qty)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {query.data ? (
          <PaginationBar page={page} limit={20} total={query.data.meta.total} onPage={setPage} />
        ) : null}
      </Card>

      <LotFormDialog
        open={formOpen}
        defaultProductId={productFilter}
        products={products.data?.data ?? []}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
