'use client';
// src/components/layout/SidebarShell.tsx
//
// Thin Client Component. Exists because Sidebar.tsx is a Server Component
// (it reads cookies and queries Prisma) and cannot hold client-side state.
//
// This wrapper reads the sidebar Zustand store and:
//   - Applies the .sb-open class to show the sidebar on mobile
//   - Renders a backdrop overlay behind the sidebar on mobile
//   - Closes the sidebar on Escape key
//
// On desktop (≥ 1024px) the sidebar is always visible regardless of isOpen —
// the CSS media query overrides the mobile transform.

import { useEffect } from 'react';
import { useSidebarStore } from '@/store/sidebar';
import styles from './Sidebar.module.css';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarShellProps {
  children: React.ReactNode;
}

export function SidebarShell({ children }: SidebarShellProps) {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const close  = useSidebarStore((s) => s.close);

  // Close sidebar on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  const asideClass = [styles.sb, isOpen ? styles['sb-open'] : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Semi-transparent backdrop — visible on mobile when sidebar is open */}
      {isOpen && (
        <div
          className={styles['sb-backdrop']}
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside className={asideClass}>
        {children}
      </aside>
    </>
  );
}
