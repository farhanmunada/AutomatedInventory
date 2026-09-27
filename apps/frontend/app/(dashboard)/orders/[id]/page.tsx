'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import type { OrderStatus } from '@repo/shared-types';

import { Card, ErrorBanner } from '@/components/data-ui';
import { StatusBadge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { TransitionControl } from '@/components/transition-control';
import { getOrder } from '@/lib/endpoints';
import { formatDateTime, formatQty } from '@/lib/format';

const STEPS = ['DRAFT', 'RESERVED', 'PACKED', 'SHIPPED'] as const;

const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  DRAFT: 'Dibuat',
  RESERVED: 'Direservasi',
  PACKED: 'Dipacking',
  SHIPPED: 'Dikirim',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const query = useQuery({
    queryKey: ['orders', id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id),
  });

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
        <Link href="/orders" className="btn w-max">
          Kembali ke daftar pesanan
        </Link>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-8 w-64" />
        <TableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  const order = query.data!;
  const status = order.status as OrderStatus;
  const cancelled = status === 'CANCELLED';
  const reachedIndex = cancelled ? -1 : STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-[#475569]">
          <Link href="/orders" className="text-[#1e40af] hover:underline">
            Pesanan
          </Link>{' '}
          / {order.order_number}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{order.order_number}</h1>
          <StatusBadge status={status} />
          <span className="text-sm text-[#475569]">Kanal {order.channel}</span>
          <div className="ml-auto">
            <TransitionControl orderId={order.id} status={status} />
          </div>
        </div>
      </div>

      <Card title="Timeline Status">
        <ol className="flex flex-wrap gap-x-8 gap-y-3 px-3 py-3">
          {STEPS.map((step, index) => {
            const done = !cancelled && index <= reachedIndex;
            return (
              <li key={step} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: done ? '#16a34a' : '#cbd5e1' }}
                />
                <span className={done ? undefined : 'text-[#475569]'}>{STEP_LABELS[step]}</span>
                <span className="text-xs text-[#475569]">
                  {done
                    ? index === 0
                      ? formatDateTime(order.created_at)
                      : formatDateTime(order.updated_at)
                    : '—'}
                </span>
              </li>
            );
          })}
          {cancelled ? (
            <li className="flex items-center gap-2 text-sm text-[#b91c1c]">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
              Dibatalkan
              <span className="text-xs text-[#475569]">{formatDateTime(order.updated_at)}</span>
            </li>
          ) : null}
        </ol>
        {cancelled ? (
          <p className="border-t border-[#e2e8f0] px-3 py-2 text-sm text-[#475569]">
            Stok pesanan ini sudah dikembalikan ke lot asalnya.
          </p>
        ) : null}
      </Card>

      <Card title={`Item & Alokasi (${order.items.length})`}>
        {order.items.length === 0 ? (
          <p className="px-3 py-8 text-[#475569]">Pesanan ini tidak memiliki item.</p>
        ) : (
          <ul className="divide-y divide-[#e2e8f0]">
            {order.items.map((item) => (
              <li key={item.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/products/${item.product_id}`}
                    className="font-medium text-[#1e40af] hover:underline"
                  >
                    {item.sku}
                  </Link>
                  <span>{item.name}</span>
                  <span className="tabular-nums text-[#475569]">× {formatQty(item.requested_qty)}</span>
                </div>
                {item.allocations.length === 0 ? (
                  <p className="mt-1 text-sm text-[#475569]">Stok belum dialokasikan (status DRAFT).</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {item.allocations.map((allocation) => (
                      <li key={`${allocation.lot_id}`} className="text-[#475569]">
                        Lot diterima {formatDateTime(allocation.lot_received_at)} —{' '}
                        <span className="tabular-nums">
                          {formatQty(allocation.allocated_qty)} unit
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
