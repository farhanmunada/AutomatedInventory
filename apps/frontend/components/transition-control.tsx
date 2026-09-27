'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { VALID_TRANSITIONS, type OrderStatus } from '@repo/shared-types';

import { ApiException } from '@/lib/api';
import { transitionOrder } from '@/lib/endpoints';
import { useToast } from './ui/toast';

/**
 * Status transition control. Renders nothing for terminal statuses so the UI
 * can never offer a transition the backend would reject (PRD §6.8).
 */
export function TransitionControl({
  orderId,
  status,
  onDone,
}: {
  orderId: string;
  status: OrderStatus;
  onDone?: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [next, setNext] = useState('');
  const options = VALID_TRANSITIONS[status];

  const mutation = useMutation({
    mutationFn: (target: string) => transitionOrder(orderId, target),
    onSuccess: (_data, target) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', `Status diubah ke ${target}.`);
      setNext('');
      onDone?.();
    },
    onError: (error) =>
      toast('error', error instanceof ApiException ? error.message : 'Gagal mengubah status.'),
  });

  if (options.length === 0) {
    return <span className="text-xs text-ink-muted">Status final</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input w-auto"
        aria-label="Status berikutnya"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      >
        <option value="">Ubah ke…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!next || mutation.isPending}
        onClick={() => next && mutation.mutate(next)}
      >
        {mutation.isPending ? 'Menyimpan…' : 'Terapkan'}
      </button>
    </div>
  );
}
