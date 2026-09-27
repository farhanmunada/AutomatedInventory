'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ApiException } from '@/lib/api';
import { createLot } from '@/lib/endpoints';
import { toLocalInputValue } from '@/lib/format';

const lotSchema = z.object({
  product_id: z.string().min(1, 'Pilih produk.'),
  purchase_price: z
    .string()
    .min(1, 'Harga beli wajib diisi.')
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Angka, maksimal 2 desimal.'),
  initial_qty: z
    .string()
    .min(1, 'Jumlah wajib diisi.')
    .refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, 'Bilangan bulat > 0.'),
  received_at: z.string().min(1, 'Tanggal penerimaan wajib diisi.'),
});

type LotForm = z.infer<typeof lotSchema>;

function blankForm(productId: string): LotForm {
  return {
    product_id: productId,
    purchase_price: '',
    initial_qty: '',
    received_at: toLocalInputValue(new Date().toISOString()),
  };
}

export function LotFormDialog({
  open,
  defaultProductId,
  products,
  onClose,
}: {
  open: boolean;
  defaultProductId: string;
  products: Array<{ id: string; sku: string; name: string }>;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LotForm>(() => blankForm(defaultProductId));
  const [errors, setErrors] = useState<Partial<Record<keyof LotForm, string>>>({});

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(blankForm(defaultProductId));
    }
  }, [open, defaultProductId]);

  const mutation = useMutation({
    mutationFn: (values: LotForm) =>
      createLot({
        product_id: values.product_id,
        purchase_price: values.purchase_price,
        initial_qty: Number(values.initial_qty),
        received_at: new Date(values.received_at).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', 'Lot diterima. Stok bertambah.');
      onClose();
    },
    onError: (error) =>
      toast('error', error instanceof ApiException ? error.message : 'Gagal menyimpan lot.'),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = lotSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof LotForm, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof LotForm;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} title="Terima Lot Baru" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Produk</span>
          <select
            className="input"
            value={form.product_id}
            onChange={(event) => setForm({ ...form, product_id: event.target.value })}
            aria-invalid={Boolean(errors.product_id)}
          >
            <option value="">Pilih produk…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} — {product.name}
              </option>
            ))}
          </select>
          {errors.product_id ? <span className="field-error">{errors.product_id}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Harga Beli per Unit (Rp)</span>
          <input
            className="input"
            inputMode="decimal"
            value={form.purchase_price}
            onChange={(event) => setForm({ ...form, purchase_price: event.target.value })}
            placeholder="50000"
            aria-invalid={Boolean(errors.purchase_price)}
          />
          {errors.purchase_price ? (
            <span className="field-error">{errors.purchase_price}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Jumlah Diterima (unit)</span>
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            value={form.initial_qty}
            onChange={(event) => setForm({ ...form, initial_qty: event.target.value })}
            aria-invalid={Boolean(errors.initial_qty)}
          />
          {errors.initial_qty ? <span className="field-error">{errors.initial_qty}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tanggal Diterima</span>
          <input
            className="input"
            type="datetime-local"
            value={form.received_at}
            onChange={(event) => setForm({ ...form, received_at: event.target.value })}
            aria-invalid={Boolean(errors.received_at)}
          />
          {errors.received_at ? <span className="field-error">{errors.received_at}</span> : null}
          <span className="text-xs text-ink-muted">
            Tanggal ini menentukan urutan FIFO — lot tertua keluar lebih dulu.
          </span>
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Menyimpan…' : 'Simpan Lot'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
