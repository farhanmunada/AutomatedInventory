'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import type { OrderChannel, OrderDto } from '@repo/shared-types';

import { Card, ErrorBanner } from '@/components/data-ui';
import { useToast } from '@/components/ui/toast';
import { ApiException } from '@/lib/api';
import { createOrder, listProducts, transitionOrder } from '@/lib/endpoints';
import { formatQty } from '@/lib/format';

interface Line {
  product_id: string;
  qty: string;
}

const BLANK: Line = { product_id: '', qty: '1' };

export default function NewOrderPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<OrderChannel>('WEB');
  const [lines, setLines] = useState<Line[]>([BLANK]);
  const [errors, setErrors] = useState<string[]>([]);

  const products = useQuery({
    queryKey: ['products', { lookup: true }],
    queryFn: () => listProducts({ page: 1, limit: 100, sort: 'name:asc' }),
    placeholderData: keepPreviousData,
    staleTime: 300_000,
  });

  const byId = useMemo(() => {
    const map = new Map((products.data?.data ?? []).map((product) => [product.id, product]));
    return map;
  }, [products.data]);

  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: async (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', `Pesanan ${order.order_number} disimpan sebagai DRAFT.`);
      router.replace(`/orders/${order.id}`);
    },
    onError: (error) =>
      toast('error', error instanceof ApiException ? error.message : 'Gagal membuat pesanan.'),
  });

  // If reserving fails (e.g. insufficient stock) the draft already exists in
  // the DB, so the draft is kept in a ref and the user is taken to it instead
  // of being stranded on a form whose order was silently created.
  const draftRef = useRef<OrderDto | null>(null);

  const reserveMutation = useMutation({
    mutationFn: async (items: { product_id: string; requested_qty: number }[]) => {
      const created = await createOrder({ channel, items });
      draftRef.current = created;
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      return transitionOrder(created.id, 'RESERVED');
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      toast('success', `Pesanan ${order.order_number} dibuat dan stoknya dicadangkan.`);
      router.replace(`/orders/${order.id}`);
    },
    onError: (error) => {
      const message =
        error instanceof ApiException ? error.message : 'Gagal mencadangkan stok.';
      const draft = draftRef.current;
      if (draft) {
        toast('error', `${message} Draft ${draft.order_number} tetap tersimpan.`);
        router.replace(`/orders/${draft.id}`);
      } else {
        toast('error', message);
      }
    },
  });

  function setLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function validate(): boolean {
    const issues: string[] = [];
    if (lines.length === 0) issues.push('Tambahkan minimal satu item.');
    if (lines.some((line) => !line.product_id)) issues.push('Semua item harus memilih produk.');
    if (lines.some((line) => !Number.isInteger(Number(line.qty)) || Number(line.qty) <= 0)) {
      issues.push('Semua jumlah harus bilangan bulat lebih dari 0.');
    }
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.product_id) continue;
      if (seen.has(line.product_id)) {
        issues.push('Satu produk tidak boleh muncul dua kali. Gabungkan jumlahnya.');
        break;
      }
      seen.add(line.product_id);
    }
    setErrors(issues);
    return issues.length === 0;
  }

  function submit(reserve: boolean) {
    if (!validate()) return;
    const items = lines.map((line) => ({
      product_id: line.product_id,
      requested_qty: Number(line.qty),
    }));
    if (reserve) reserveMutation.mutate(items);
    else createMutation.mutate({ channel, items });
  }

  const busy = createMutation.isPending || reserveMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Buat Pesanan</h1>
        <Link href="/orders" className="btn">
          Batal
        </Link>
      </div>

      <fieldset className="flex flex-wrap gap-4" disabled={busy}>
        <legend className="mb-1 text-sm font-medium">Kanal</legend>
        {(['WEB', 'POS'] as const).map((option) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="radio"
              name="channel"
              checked={channel === option}
              onChange={() => setChannel(option)}
            />
            <span>{option === 'WEB' ? 'Web Store' : 'POS (Gerai)'}</span>
          </label>
        ))}
      </fieldset>

      <Card title="Item Pesanan">
        {products.isError ? (
          <ErrorBanner error={products.error} onRetry={() => products.refetch()} />
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Produk</th>
                <th className="th w-24 text-right">Jumlah</th>
                <th className="th w-28 text-right">Stok</th>
                <th className="th w-16" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const product = byId.get(line.product_id);
                const requested = Number(line.qty);
                const short = product && requested > product.available_stock;
                return (
                  <tr key={index}>
                    <td className="td">
                      <select
                        className="input"
                        value={line.product_id}
                        onChange={(event) => setLine(index, { product_id: event.target.value })}
                      >
                        <option value="">Pilih produk…</option>
                        {(products.data?.data ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.sku} — {option.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td">
                      <input
                        className="input text-right tabular-nums"
                        type="number"
                        min={1}
                        step={1}
                        value={line.qty}
                        onChange={(event) => setLine(index, { qty: event.target.value })}
                      />
                    </td>
                    <td className="td text-right tabular-nums">
                      {product ? (
                        <span className={short ? 'text-[#dc2626]' : undefined}>
                          {formatQty(product.available_stock)}
                          {short ? ' (kurang)' : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="btn"
                        disabled={lines.length === 1}
                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#e2e8f0] px-3 py-2">
          <button type="button" className="btn" onClick={() => setLines([...lines, BLANK])}>
            Tambah Item
          </button>
        </div>
      </Card>

      {errors.length > 0 ? (
        <div
          role="alert"
          className="card border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[#b91c1c]"
        >
          <ul className="list-disc pl-4">
            {errors.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm text-[#475569]">
        Order akan disimpan sebagai DRAFT. Stok dikunci saat status diubah ke RESERVED, dan
        dilepas otomatis bila tidak diproses dalam 60 menit.
      </p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => submit(false)}
        >
          {createMutation.isPending ? 'Menyimpan…' : 'Simpan Draft'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => submit(true)}
        >
          {reserveMutation.isPending ? 'Mencadangkan…' : 'Simpan & Cadangkan Stok'}
        </button>
      </div>
    </div>
  );
}
