'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getToken } from '@/lib/api';

/**
 * Client-side session gate. The JWT lives in localStorage, so only the browser
 * can check it.
 *
 * Children are rendered immediately rather than behind a "waiting for the
 * check" spinner: that spinner made the server HTML useless for anything
 * outside the shell, and it is what `fetch()` reads during SSR smoke tests.
 * The redirect effect below runs before any protected request is issued, so an
 * unauthenticated visitor still never sees data — they just get bounced.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  return <>{children}</>;
}
