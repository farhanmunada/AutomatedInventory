'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearSession, getStoredUser, type StoredUser } from '@/lib/api';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Produk' },
  { href: '/lots', label: 'Lots' },
  { href: '/orders', label: 'Pesanan' },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => setUser(getStoredUser()), []);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <header className="border-b border-[#e2e8f0]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-base font-semibold">
          Automated Inventory
        </Link>
        <nav aria-label="Navigasi utama" className="flex flex-1 flex-wrap gap-1">
          {NAV.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-sm px-2.5 py-1 text-sm',
                  active
                    ? 'bg-[#eef2ff] font-semibold text-[#1e40af]'
                    : 'text-[#475569] hover:bg-[#f1f5f9]',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#475569]">{user ? `Staf: ${user.username}` : ''}</span>
          <button type="button" className="btn" onClick={logout}>
            Keluar
          </button>
        </div>
      </div>
    </header>
  );
}
