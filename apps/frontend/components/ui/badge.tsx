'use client';

import type { OrderStatus } from '@repo/shared-types';

import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'primary' | 'warning' | 'success' | 'destructive';

const TONE_STYLE: Record<Tone, string> = {
  neutral: 'bg-paper text-ink-muted border-line',
  primary: 'bg-surface text-ink border-ink',
  warning: 'bg-surface text-flag-warn border-flag-warn',
  success: 'bg-surface text-flag-ok border-flag-ok',
  destructive: 'bg-surface text-flag-critical border-flag-critical',
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
        'data inline-block rounded-none border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
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
