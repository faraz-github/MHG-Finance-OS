// src/hooks/usePageFilters.ts
//
// ═══ PER-PAGE FILTER STATE — URL QUERY PARAMS ═══
//
// Each page declares which filters it needs. This hook reads and writes those
// filter values as URL query params (?city=Mumbai&property=abc123&comm=25).
//
// Benefits over the previous global Zustand filter state:
//   - No cross-page contamination: changing city on Dashboard doesn't change
//     city on Bookings or Investors.
//   - URL persistence: filters survive page refresh; back/forward works.
//   - Shareable: copy the URL and the recipient sees the same filtered view.
//   - Composable: any combination of filters works without explicit logic for
//     each permutation.
//
// Usage:
//   const filters = usePageFilters({ city: true, property: true });
//   // filters.city   → 'all' | 'Mumbai' | ...
//   // filters.property → 'all' | '<pid>' | ...
//   // filters.setCity(v), filters.setProperty(v), filters.reset()
//
// URL param names:
//   city     → ?city=Mumbai        (string, 'all' = not set)
//   property → ?property=<id>      (string, 'all' = not set)
//   comm     → ?comm=25            (string, 'all' = not set)
//   platform → ?platform=Airbnb   (string, 'all' = not set)
//   investor → ?investor=<id>      (string, 'all' = not set)
//   category → ?category=cleaning  (string, 'all' = not set)
//   status   → ?status=pending     (string, 'all' = not set)
//   segment  → ?segment=VIP        (string, 'all' = not set)
//
// The hook returns only the fields declared in the config.
// Fields not declared are not read, not written, not shown.

'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Filter key registry — all possible per-page filter fields
// ---------------------------------------------------------------------------

export type FilterKey =
  | 'city'
  | 'property'
  | 'comm'
  | 'platform'
  | 'investor'
  | 'category'
  | 'status'
  | 'segment';

// Config: which filters this page uses
export type FilterConfig = Partial<Record<FilterKey, true>>;

// URL param names (same as FilterKey for simplicity)
const PARAM: Record<FilterKey, string> = {
  city:      'city',
  property:  'property',
  comm:      'comm',
  platform:  'platform',
  investor:  'investor',
  category:  'category',
  status:    'status',
  segment:   'segment',
};

// ---------------------------------------------------------------------------
// Return type — only includes setters for declared keys
// ---------------------------------------------------------------------------

export interface PageFilters {
  // Current values ('all' if not set)
  city:      string;
  property:  string;
  comm:      string;
  platform:  string;
  investor:  string;
  category:  string;
  status:    string;
  segment:   string;

  // Setters — work for any key, just write URL param
  set: (key: FilterKey, value: string) => void;

  // Reset all declared filters back to 'all'
  reset: () => void;

  // Active filter count (for badge display)
  activeCount: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePageFilters(config: FilterConfig): PageFilters {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const declaredKeys = Object.keys(config) as FilterKey[];

  // Read current value for a filter key from URL params
  const get = useCallback(
    (key: FilterKey): string => searchParams.get(PARAM[key]) ?? 'all',
    [searchParams],
  );

  // Write a filter value to URL params (replaces current entry — no push)
  const set = useCallback(
    (key: FilterKey, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'all' || value === '') {
        params.delete(PARAM[key]);
      } else {
        params.set(PARAM[key], value);
      }
      // Use replace so filter changes don't pollute browser history
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Reset all declared filters
  const reset = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    declaredKeys.forEach((k) => params.delete(PARAM[k]));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname, searchParams]);

  // Count active (non-'all') declared filters
  const activeCount = useMemo(
    () => declaredKeys.filter((k) => get(k) !== 'all').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [declaredKeys, searchParams],
  );

  return {
    city:     get('city'),
    property: get('property'),
    comm:     get('comm'),
    platform: get('platform'),
    investor: get('investor'),
    category: get('category'),
    status:   get('status'),
    segment:  get('segment'),
    set,
    reset,
    activeCount,
  };
}
