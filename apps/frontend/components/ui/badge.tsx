'use client';

import type { OrderStatus } from '@repo/shared-types';

import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'primary' | 'warning' | 'success' | 'destructive';

const TONE_STYLE: Record<Tone, string> = {
  neutral: 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]',
  primary: 'bg-[#eef2ff] text-[#1e40af] border-[#c7d2fe]',
  warning: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',
  success: 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]',
  destructive: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
};

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  DRAFT: 'neutral',
  RESERVED: 'warning',
  PACKED: 'primary',
  SHIPPED: 'success',
  CANCELLED: 'destructive',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_STYLE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function StockBadge({ available, buffer }: { available: number; buffer: number }) {
  if (available <= 0) return <Badge tone="destructive">Habis</Badge>;
  if (available <= buffer) return <Badge tone="warning">Rendah</Badge>;
  return <Badge tone="success">Sehat</Badge>;
}
