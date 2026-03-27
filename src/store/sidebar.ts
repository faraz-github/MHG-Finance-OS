// src/store/sidebar.ts
//
// Zustand store for mobile sidebar open/close state.
// Same pattern as src/store/period.ts.
//
// ABSOLUTE RULE: Do NOT add persistence (localStorage, sessionStorage,
// IndexedDB, or any middleware that writes to storage). State is in-memory
// only per the v3 plan.

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface SidebarStore {
  /** Whether the mobile sidebar is currently visible */
  isOpen: boolean;
  /** Open the sidebar (mobile only — desktop ignores this via CSS) */
  open: () => void;
  /** Close the sidebar */
  close: () => void;
  /** Toggle open/closed */
  toggle: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,

  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
