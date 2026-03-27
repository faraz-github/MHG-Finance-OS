'use client';
// src/components/ui/Modal.tsx
//
// Overlay + modal shell. Pixel-matches .ov / .modal from the HTML.
// Closes on overlay click or × button click.
// Animation: mIn .2s ease — verbatim from the HTML @keyframes.

import styles from './ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModalSize = 'default' | 'wide' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'default',
  children,
}: ModalProps) {
  // Build the combined modal class string (.modal, optionally .wide / .xl)
  const modalClass = [
    styles.modal,
    size === 'wide' ? styles.wide : '',
    size === 'xl'   ? styles.xl   : '',
  ].filter(Boolean).join(' ');

  // Overlay class toggled by isOpen
  const ovClass = [styles.ov, isOpen ? styles.open : ''].filter(Boolean).join(' ');

  // Stop propagation so clicking the modal itself doesn't close it
  function handleModalClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (!isOpen) return null;

  return (
    <div className={ovClass} onClick={onClose}>
      <div className={modalClass} onClick={handleModalClick}>
        {/* × close button */}
        <button
          type="button"
          className={styles['mc-x']}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Title */}
        <div className={styles.mt}>{title}</div>

        {/* Subtitle */}
        {subtitle && <div className={styles.ms}>{subtitle}</div>}

        {/* Content */}
        {children}
      </div>
    </div>
  );
}