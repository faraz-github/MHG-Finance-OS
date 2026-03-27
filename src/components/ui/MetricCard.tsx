'use client';
// src/components/ui/MetricCard.tsx
//
// Metric card pixel-matched to .mc / .mc-ico / .mc-l / .mc-v / .mc-s.
// Also exports MetricCardGrid — a wrapper for the .mcg grid layout.

import styles from './ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Icon colour variant — maps directly to .mc-ico.{variant} CSS class */
export type IconVariant = 'g' | 'r' | 'b' | 'o' | 'go' | 'w';

export interface MetricCardProps {
  /** Upper label (uppercase small text) */
  label: string;
  /** Main value — pass a pre-formatted string, e.g. '₹12.4L' */
  value: string;
  /** Sub-label below the value */
  sub?: string;
  /** Text/emoji inside the icon badge, e.g. '₹' or '◉' */
  iconText: string;
  /** Icon colour variant */
  iconVariant: IconVariant;
  /** When true applies .mc.acc — orange accent background */
  accent?: boolean;
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

export function MetricCard({
  label,
  value,
  sub,
  iconText,
  iconVariant,
  accent = false,
}: MetricCardProps) {
  const cardClass = [styles.mc, accent ? styles.acc : '']
    .filter(Boolean)
    .join(' ');

  const icoClass = [styles['mc-ico'], styles[iconVariant]]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass}>
      <div className={icoClass}>{iconText}</div>
      <div className={styles['mc-l']}>{label}</div>
      <div className={styles['mc-v']}>{value}</div>
      {sub && <div className={styles['mc-s']}>{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCardGrid — .mcg wrapper
// ---------------------------------------------------------------------------

export function MetricCardGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.mcg}>{children}</div>;
}