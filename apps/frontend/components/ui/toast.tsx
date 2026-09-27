'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastKind = 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type PushToast = (kind: ToastKind, message: string) => void;

const ToastContext = createContext<PushToast>(() => {});

export function useToast(): PushToast {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<PushToast>((kind, message) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <p
            key={toast.id}
            className="card px-3 py-2 text-sm shadow-sm"
            style={{
              borderLeftWidth: 4,
              borderLeftStyle: 'solid',
              borderLeftColor:
                toast.kind === 'success' ? 'var(--color-flag-ok)' : 'var(--color-flag-critical)',
            }}
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
