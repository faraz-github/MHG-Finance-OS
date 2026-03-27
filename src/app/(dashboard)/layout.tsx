// src/app/(dashboard)/layout.tsx
//
// Dashboard layout — Server Component.
//
// Renders for every route under (dashboard):
//   /dashboard, /cashflow, /properties, /investors, /reports,
//   /insights, /expenses, /payouts, /bookings, /crm, /dailyexp, /utils
//
// Structure (mirrors mg-finance-os.html exactly):
//
//   <aside class="sb">        ← Sidebar (position:fixed, outside .main)
//   <div class="main">
//     <header class="topbar"> ← Topbar (sticky)
//     <div class="cnt">
//       <div class="pbar">    ← PeriodBar
//       {children}            ← Page content

import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { PeriodBar } from '@/components/layout/PeriodBar';
import { ToastProvider } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── 1. Verify session ─────────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  // ── 2. Render ─────────────────────────────────────────────────────────────
  // PeriodBar no longer needs cities/properties — entity filters are now
  // per-page URL params rendered by each page's own PageFilterBar.
  return (
    <ToastProvider>
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="cnt">
          {/* PeriodBar: period type + date controls only. No entity filters. */}
          <PeriodBar />
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}

// ---------------------------------------------------------------------------
// Layout
