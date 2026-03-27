'use client';
// src/components/layout/TopbarTitle.tsx
//
// Thin Client Component. Only exists because usePathname() requires a client
// context. Topbar.tsx is a Server Component — this file handles the one
// dynamic piece it needs: mapping the current pathname to a page title.
//
// Also renders the hamburger menu button on mobile. The button reads the
// sidebar Zustand store and toggles it. On desktop the button is hidden
// via CSS (see Topbar.module.css).

import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/store/sidebar';
import styles from './Topbar.module.css';

// ---------------------------------------------------------------------------
// Pathname → title map
// Covers all 12 dashboard tabs + admin route.
// ---------------------------------------------------------------------------

const PATH_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/cashflow':     'Cash Flow',
  '/properties':   'Properties',
  '/investors':    'Investors',
  '/reports':      'Reports',
  '/insights':     'Smart Insights',
  '/expenses':     'Expense Intel',
  '/payouts':      'Payout Ledger',
  '/dailyexp':     'Daily Expenses',
  '/bookings':     'Bookings',
  '/crm':          'Guest CRM',
  '/utils':        'Rent & Utilities',
  '/users':        'User Management',
  '/monthlyentry': 'Monthly Entry',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopbarTitle() {
  const pathname = usePathname();
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  // Exact match first; fallback strips trailing segments for nested routes.
  const title =
    PATH_TITLES[pathname] ??
    PATH_TITLES[`/${pathname.split('/')[1]}`] ??
    'MehmanGhar';

  return (
    <>
      {/* Hamburger — visible on mobile only (hidden ≥ 1024px via CSS) */}
      <button
        type="button"
        className={styles['tb-hamburger']}
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className={styles['tb-title']}>{title}</span>
    </>
  );
}
