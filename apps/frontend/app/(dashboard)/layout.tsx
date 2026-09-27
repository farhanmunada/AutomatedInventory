'use client';

import { AuthGuard } from '@/components/auth-guard';
import { DashboardNav } from '@/components/dashboard-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardNav />
      <main className="mx-auto w-full max-w-7xl px-4 py-5">{children}</main>
    </AuthGuard>
  );
}
