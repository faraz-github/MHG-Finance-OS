'use client';
// src/components/layout/LogoutButton.tsx
//
// Client Component — logout button rendered inside the Sidebar.
//
// Sidebar.tsx is a Server Component and cannot attach onClick handlers.
// This is the minimal client boundary required for the logout action.
//
// Behaviour: POST /api/auth/logout → clears the session cookie → push /login.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './Sidebar.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  return (
    <button
      type="button"
      className={styles['logout-btn']}
      onClick={handleLogout}
      disabled={loading}
    >
      <svg
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        width={13}
        height={13}
      >
        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      {loading ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
