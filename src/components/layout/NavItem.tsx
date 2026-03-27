'use client';
// src/components/layout/NavItem.tsx
//
// Thin Client Component. Only exists because usePathname() requires a client
// context. Sidebar.tsx is a Server Component — this file handles the one piece
// of client state it needs: the active tab highlight.
//
// Server Component renders SVG icons + labels as children. They cross the RSC
// boundary as server-rendered content, not as serialized React elements.
//
// All nav items are now links. The ModalItem interface and modalId prop have
// been removed — Monthly Entry is a full page at /monthlyentry.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { useSidebarStore } from '@/store/sidebar';
import styles from './Sidebar.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItemProps {
  /** Absolute pathname, e.g. '/dashboard' */
  href: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavItem({ href, children }: NavItemProps) {
  const pathname = usePathname();
  const closeSidebar = useSidebarStore((s) => s.close);

  // A link item is active when the current pathname starts with its href.
  // Exact match first to handle root-level pages correctly.
  const isActive = pathname === href || pathname.startsWith(href + '/');

  const className = [styles.ni, isActive ? styles.active : '']
    .filter(Boolean)
    .join(' ');

  // Close sidebar on nav click (mobile only — desktop sidebar is always
  // visible via CSS so the close is harmless there).
  const handleClick = useCallback(() => {
    closeSidebar();
  }, [closeSidebar]);

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
