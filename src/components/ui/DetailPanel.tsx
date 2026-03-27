'use client';
// src/components/ui/DetailPanel.tsx
//
// Slide-in right panel. Pixel-matches .detail-panel / .dp-head / .dp-body.
// Transition: right:-640px → right:0 over .3s ease — verbatim from the HTML.
// Overlay: .panel-overlay dims the background (z-index 190, panel is 200).

import styles from './ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Orange header title — uses .dp-title (Playfair Display serif) */
  title: string;
  /** Optional subtitle below the title — uses .dp-sub */
  sub?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DetailPanel({
  isOpen,
  onClose,
  title,
  sub,
  children,
}: DetailPanelProps) {
  const panelClass = [styles['detail-panel'], isOpen ? styles.open : '']
    .filter(Boolean)
    .join(' ');

  const overlayClass = [styles['panel-overlay'], isOpen ? styles.open : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Dim overlay — click closes the panel */}
      <div className={overlayClass} onClick={onClose} />

      {/* Panel */}
      <div className={panelClass}>
        {/* Orange header */}
        <div className={styles['dp-head']}>
          <div>
            <div className={styles['dp-title']}>{title}</div>
            {sub && <div className={styles['dp-sub']}>{sub}</div>}
          </div>
          <button
            type="button"
            className={styles['dp-close']}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className={styles['dp-body']}>{children}</div>
      </div>
    </>
  );
}