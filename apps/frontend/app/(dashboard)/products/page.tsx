'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import type { ProductDto } from '@repo/shared-types';

import { Card, ErrorBanner, PaginationBar } from '@/components/data-ui';
import { ProductFormDialog } from '@/components/product-form-dialog';
import { Badge, StockBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiException } from '@/lib/api';
import { cn } from '@/lib/cn';
import { deleteProduct, listProducts } from '@/lib/endpoints';
import { formatQty } from '@/lib/format';

const SORTS = [
  { value: 'sku:asc', label: 'SKU (A-Z)' },
  { value: 'sku:desc', label: 'SKU (Z-A)' },
  { value: 'name:asc', label: 'Nama (A-Z)' },
  { value: 'created_at:desc', label: 'Terbaru' },
] as const;

export default function ProductsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<string>(SORTS[3].value);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductDto | null>(null);

  const query = useQuery({
    queryKey: ['products', { page, search, sort }],
    queryFn: () => listProducts({ page, limit: 20, search: search || undefined, sort }),
    placeholderData: keepPreviousData,
  });

  const removeMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', 'Produk dihapus.');
      setPendingDelete(null);
    },
    onError: (error) =>
      toast('error', error instanceof ApiException ? error.message : 'Gagal menghapus produk.'),
  });

  const rows = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Produk</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Tambah Produk
        </button>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <label className="flex min-w-56 flex-1 flex-col">
          <span className="mb-1 text-sm font-medium">Cari</span>
          <input
            className="input"
            placeholder="SKU atau nama produk"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-sm font-medium">Urutkan</span>
          <select
            className="input"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Cari
        </button>
        {search ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setPage(1);
            }}
          >
            Reset: {search}
          </button>
        ) : null}
      </form>

      {query.isError ? <ErrorBanner error={query.error} onRetry={() => query.refetch()} /> : null}

      <Card title={`Daftar Produk${query.data ? ` (${query.data.meta.total})` : ''}`}>
        {query.isPending ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <p className="px-3 py-8 text-ink-muted">
            {search
              ? `Tidak ada produk yang cocok dengan "${search}".`
              : 'Belum ada produk. Tambahkan produk pertama Anda.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">SKU</th>
                  <th className="th">Nama</th>
                  <th className="th text-right">Stok</th>
                  <th className="th text-right">Buffer</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className={query.isFetching ? 'opacity-60' : undefined}>
                {rows.map((product) => {
                  const critical = product.available_stock <= 0;
                  const warn = !critical && product.available_stock <= product.min_buffer_stock;
                  return (
                  <tr
                    key={product.id}
                    className={cn('row', critical && 'row-critical', warn && 'row-warn')}
                  >
                    <td className="td">
                      <Link
                        href={`/products/${product.id}`}
                        className="data text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink"
                      >
                        {product.sku}
                      </Link>
                    </td>
                    <td className="td">{product.name}</td>
                    <td className="td td-figure text-right data">
                      {formatQty(product.available_stock)}
                    </td>
                    <td className="td text-right data text-ink-muted">
                      {formatQty(product.min_buffer_stock)}
                    </td>
                    <td className="td">
                      <StockBadge
                        available={product.available_stock}
                        buffer={product.min_buffer_stock}
                      />
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link href={`/products/${product.id}`} className="btn">
                          Detail
                        </Link>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setEditing(product);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setPendingDelete(product)}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {query.data ? (
          <PaginationBar
            page={page}
            limit={20}
            total={query.data.meta.total}
            onPage={setPage}
          />
        ) : null}
      </Card>

      <ProductFormDialog open={formOpen} product={editing} onClose={() => setFormOpen(false)} />

      <Dialog
        open={Boolean(pendingDelete)}
        title="Hapus Produk"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
              Batal
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={removeMutation.isPending}
              onClick={() => pendingDelete && removeMutation.mutate(pendingDelete.id)}
            >
              {removeMutation.isPending ? 'Menghapus…' : 'Hapus'}
            </button>
          </>
        }
      >
        <p>
          Hapus <strong>{pendingDelete?.sku}</strong>? Tindakan ini tidak bisa dibatalkan.
        </p>
        <p className="text-ink-muted">
          Produk hanya bisa dihapus jika stoknya nol dan tidak pernah dipakai pada lot atau pesanan.
        </p>
        <Badge tone="destructive">Penghapusan permanen</Badge>
      </Dialog>
    </div>
  );
}
