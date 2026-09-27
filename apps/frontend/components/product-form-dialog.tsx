'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ApiException } from '@/lib/api';
import { createProduct, updateProduct } from '@/lib/endpoints';
import type { ProductDto } from '@repo/shared-types';

interface FormState {
  sku: string;
  name: string;
  min_buffer_stock: string;
}

const EMPTY: FormState = { sku: '', name: '', min_buffer_stock: '0' };

export function ProductFormDialog({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductDto | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      product
        ? {
            sku: product.sku,
            name: product.name,
            min_buffer_stock: String(product.min_buffer_stock),
          }
        : EMPTY,
    );
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: (values: FormState) => {
      const body = {
        sku: values.sku.trim(),
        name: values.name.trim(),
        min_buffer_stock: Number(values.min_buffer_stock),
      };
      return product ? updateProduct(product.id, body) : createProduct(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', product ? 'Produk diperbarui.' : 'Produk ditambahkan.');
      onClose();
    },
    onError: (error) =>
      toast('error', error instanceof ApiException ? error.message : 'Gagal menyimpan produk.'),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const buffer = Number(form.min_buffer_stock);
    const next: typeof errors = {};
    if (!form.sku.trim()) next.sku = 'SKU wajib diisi.';
    if (!form.name.trim()) next.name = 'Nama wajib diisi.';
    if (!Number.isInteger(buffer) || buffer < 0) next.min_buffer_stock = 'Harus bilangan bulat ≥ 0.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onClose={onClose} title={product ? 'Edit Produk' : 'Tambah Produk'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">SKU</span>
          <input
            className="input"
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
            maxLength={50}
            aria-invalid={Boolean(errors.sku)}
          />
          {errors.sku ? <span className="field-error">{errors.sku}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nama Produk</span>
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            maxLength={255}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Stok Buffer Minimum</span>
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            value={form.min_buffer_stock}
            onChange={(event) => setForm({ ...form, min_buffer_stock: event.target.value })}
            aria-invalid={Boolean(errors.min_buffer_stock)}
          />
          <span className="text-xs text-[#475569]">
            Peringatan stok rendah muncul saat stok ≤ nilai ini.
          </span>
          {errors.min_buffer_stock ? (
            <span className="field-error">{errors.min_buffer_stock}</span>
          ) : null}
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
