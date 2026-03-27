'use client';
// src/components/ui/Toast.tsx
//
// Singleton toast system. Matches the HTML's toast(msg, 'ok'|'er'|'in') API.
//
// Usage:
//   1. Wrap the app in <ToastProvider> in layout.tsx.
//   2. Call the hook anywhere in a Client Component:
//        const { toast } = useToast();
//        toast('✓ Saved', 'ok');
//        toast('Error saving', 'er');
//        toast('Info message', 'in');
//        toast('Neutral message');     // no type — dark background
//
// Dismiss behaviour (verbatim from HTML):
//   - Toast shows for 3200ms.
//   - Fade-out transition: opacity:0 + translateX(16px) over 280ms.
//   - Removed after 280ms of fade-out (total: 3480ms).

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import styles from './ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'ok' | 'er' | 'in' | '';

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  dismissing: boolean;
}

interface ToastContextValue {
  /** Exact signature from the HTML: toast(msg, type?) */
  toast: (msg: string, type?: ToastType) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((msg: string, type: ToastType = '') => {
    const id = ++counterRef.current;

    setItems((prev) => [...prev, { id, msg, type, dismissing: false }]);

    // After 3200ms begin dismiss (matches HTML setTimeout 3200)
    setTimeout(() => {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
      );
      // After 280ms remove (matches HTML setTimeout 280 inside the first)
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 280);
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Fixed toast stack — .twrap */}
      <div className={styles.twrap}>
        {items.map((item) => {
          const cls = [
            styles.toast,
            item.type === 'ok' ? styles.ok   : '',
            item.type === 'er' ? styles.er   : '',
            item.type === 'in' ? styles.in   : '',
            item.dismissing    ? styles.dismissing : '',
          ].filter(Boolean).join(' ');

          return (
            <div key={item.id} className={cls}>
              {item.msg}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}