// src/app/layout.tsx
//
// Root layout. Loads Sora (body text) and Playfair Display (headings) via
// next/font/google — the same fonts used in mg-finance-os.html.
// CSS variables are injected on the <html> element so all components can
// reference them without importing a stylesheet.

import type { Metadata } from 'next';
import { Sora, Playfair_Display } from 'next/font/google';
import './globals.css';

// ── Sora — body text, buttons, labels ────────────────────────────────────

const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

// ── Playfair Display — page titles, modal titles, detail panel headers ────

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-playfair',
  display: 'swap',
});

// ── Metadata ──────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'MehmanGhar Financial OS',
  description: 'Property financial management — MehmanGhar Stays',
};

// ── Root layout ───────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${playfair.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}