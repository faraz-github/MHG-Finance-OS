// src/components/layout/Sidebar.tsx

import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getRolePermissions } from '@/lib/permissions';
import type { TabKey } from '@/lib/permissions';
import { NavItem } from './NavItem';
import { LogoutButton } from './LogoutButton';
import { SidebarShell } from './SidebarShell';
import styles from './Sidebar.module.css';

interface NavItemDef {
  label: string;
  href: string;
  permKey: TabKey;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  items: NavItemDef[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        permKey: 'dashboard',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      {
        label: 'Properties',
        href: '/properties',
        permKey: 'properties',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
        ),
      },
      {
        label: 'Investors',
        href: '/investors',
        permKey: 'investors',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Cash Flow',
        href: '/cashflow',
        permKey: 'cashflow',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        ),
      },
      {
        label: 'Payout Ledger',
        href: '/payouts',
        permKey: 'payouts',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Analytics',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        permKey: 'reports',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        ),
      },
      {
        label: 'Smart Insights',
        href: '/insights',
        permKey: 'insights',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
        ),
      },
      {
        label: 'Expense Intel',
        href: '/expenses',
        permKey: 'expenses',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        label: 'Guest CRM',
        href: '/crm',
        permKey: 'crm',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Daily Operations',
    items: [
      {
        label: 'Daily Expenses',
        href: '/dailyexp',
        permKey: 'dailyexp',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
          </svg>
        ),
      },
      {
        label: 'Bookings',
        href: '/bookings',
        permKey: 'bookings',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        // Monthly Entry has its own 'monthlyentry' permission key.
        // Fixes the triple permission mismatch documented in the sidebar audit
        // (previously piggybacked on 'reports').
        label: 'Monthly Entry',
        href: '/monthlyentry',
        permKey: 'monthlyentry',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        label: 'Rent & Utilities',
        href: '/utils',
        permKey: 'utils',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
            <path d="M13 2v7h7" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'User Management',
        href: '/users',
        permKey: 'users',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
    ],
  },
];

export async function Sidebar() {
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;

  if (!session) return null;

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions ?? {};

  return (
    <SidebarShell>
      <div className={styles['sb-logo']}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="MehmanGhar Stays"
          width={42}
          height={42}
          className={styles['sb-logo-img']}
        />
        <div className={styles['sb-txt']}>
          <strong>MehmanGhar Stays</strong>
          <span>Financial OS</span>
        </div>
      </div>

      <nav className={styles['sb-nav']}>
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) => tabPerms[item.permKey] === true,
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label} className={styles['sb-sec']}>
              <div className={styles['sb-lbl']}>{section.label}</div>

              {visibleItems.map((item) => (
                <NavItem key={item.href} href={item.href}>
                  {item.icon}
                  {item.label}
                </NavItem>
              ))}
            </div>
          );
        })}
      </nav>

      <LogoutButton />

      <div className={styles['sb-foot']}>
        MehmanGhar Stays Services Pvt. Ltd.<br />
        CIN: U55101MH2025PTC456442<br />
        Andheri West, Mumbai 400061<br />
        <a href="tel:+919839143040">+91 98391 43040</a>
      </div>
    </SidebarShell>
  );
}