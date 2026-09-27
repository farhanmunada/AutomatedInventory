'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { ORDER_STATUS, VALID_TRANSITIONS, type OrderStatus } from '@repo/shared-types';

import { Card, ErrorBanner, PaginationBar } from '@/components/data-ui';
import { StatusBadge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { listOrders } from '@/lib/endpoints';
import { formatDateTime } from '@/lib/format';

const STATUSES = Object.values(ORDER_STATUS);

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');

  const query = useQuery({
    queryKey: ['orders', { page, status, channel }],
    queryFn: () =>
      listOrders({
        page,
        limit: 20,
        status: status || undefined,
        channel: channel || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.data ?? [];
  const hasFilter = Boolean(status || channel);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Pesanan</h1>
        <Link href="/orders/new" className="btn btn-primary">
          Buat Pesanan
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="mb-1 text-sm font-medium">Status</span>
          <select
            className="input w-auto"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-sm font-medium">Kanal</span>
          <select
            className="input w-auto"
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua kanal</option>
            <option value="WEB">WEB</option>
            <option value="POS">POS</option>
          </select>
        </label>
        {hasFilter ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setStatus('');
              setChannel('');
              setPage(1);
            }}
          >
            Reset {status ? `${status} ` : ''}
            {channel}
          </button>
        ) : null}
      </div>

      {query.isError ? <ErrorBanner error={query.error} onRetry={() => query.refetch()} /> : null}

      <Card title={`Daftar Pesanan${query.data ? ` (${query.data.meta.total})` : ''}`}>
        {query.isPending ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <div className="px-3 py-8">
            <p className="text-[#475569]">
              {hasFilter
                ? 'Tidak ada pesanan yang cocok dengan filter ini.'
                : 'Belum ada pesanan. Buat pesanan pertama Anda.'}
            </p>
            {!hasFilter ? (
              <Link href="/orders/new" className="btn btn-primary mt-3">
                Buat Pesanan
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">No. Pesanan</th>
                  <th className="th">Kanal</th>
                  <th className="th">Status</th>
                  <th className="th">Transisi Berikutnya</th>
                  <th className="th">Dibuat</th>
                </tr>
              </thead>
              <tbody className={query.isFetching ? 'opacity-60' : undefined}>
                {rows.map((order) => {
                  const next = VALID_TRANSITIONS[order.status as OrderStatus];
                  return (
                    <tr key={order.id} className="row-alt">
                      <td className="td">
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-[#1e40af] hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="td">{order.channel}</td>
                      <td className="td">
                        <StatusBadge status={order.status as OrderStatus} />
                      </td>
                      <td className="td text-xs text-[#475569]">
                        {next.length > 0 ? next.join(', ') : '— final'}
                      </td>
                      <td className="td whitespace-nowrap">{formatDateTime(order.created_at)}</td>
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
    </div>
  );
}
