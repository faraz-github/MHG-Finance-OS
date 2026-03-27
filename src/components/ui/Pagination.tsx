'use client';
// src/components/ui/Pagination.tsx
//
// Pagination bar. Pixel-matches .pgn / .pgn-info / .pgn-btns / .pgn-btn.
// Renders: info text ("Showing X–Y of Z"), Prev button, up to 5 page
// number buttons, Next button.
//
// The HTML uses per-page state (propPage, repPage) managed globally.
// Here the component is fully controlled: parent owns page state.

import styles from './ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaginationProps {
  /** Total number of items */
  total: number;
  /** Current page (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Called when the user selects a page */
  onChange: (page: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Pagination({ total, page, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp current page
  const current = Math.max(1, Math.min(page, totalPages));

  // Info text: "Showing 1–10 of 42"
  const from = (current - 1) * pageSize + 1;
  const to   = Math.min(current * pageSize, total);
  const infoText = total === 0
    ? 'No results'
    : `Showing ${from}–${to} of ${total}`;

  // Page buttons: show up to 5 pages centred on current
  function getPageNumbers(): number[] {
    const pages: number[] = [];
    const delta = 2; // pages on each side of current
    let start = Math.max(1, current - delta);
    let end   = Math.min(totalPages, current + delta);
    // Keep the window 5 wide if possible
    if (end - start < 4) {
      if (start === 1) end   = Math.min(totalPages, start + 4);
      else             start = Math.max(1, end - 4);
    }
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  }

  const pageNumbers = getPageNumbers();

  return (
    <div className={styles.pgn}>
      <span className={styles['pgn-info']}>{infoText}</span>

      <div className={styles['pgn-btns']}>
        {/* Prev */}
        <button
          type="button"
          className={styles['pgn-btn']}
          onClick={() => onChange(current - 1)}
          disabled={current <= 1}
        >
          ‹
        </button>

        {/* Page numbers */}
        {pageNumbers.map((p) => {
          const cls = [
            styles['pgn-btn'],
            p === current ? styles.active : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={p}
              type="button"
              className={cls}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          );
        })}

        {/* Next */}
        <button
          type="button"
          className={styles['pgn-btn']}
          onClick={() => onChange(current + 1)}
          disabled={current >= totalPages}
        >
          ›
        </button>
      </div>
    </div>
  );
}