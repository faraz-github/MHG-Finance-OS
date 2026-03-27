'use client';
// src/components/layout/PageFilterBar.tsx
//
// Per-page filter bar. Each page mounts this with exactly the filters it
// needs. Filter state is held in URL query params via usePageFilters.
//
// Usage:
//   <PageFilterBar
//     filters={filters}                    // from usePageFilters()
//     config={{ city: true, property: true }}
//     cities={cities}
//     properties={properties}
//   />
//
// Props:
//   filters    — the PageFilters object from usePageFilters()
//   config     — which filter pills to show (only declared keys are rendered)
//   cities     — for the city select (required if config.city)
//   properties — for the property select (required if config.property)
//   commOptions — custom commission options (defaults to 20/25/30)
//   platforms   — for the platform/source select
//   investors   — for the investor select
//   categories  — for the category select
//   statuses    — for the status select
//   segments    — for the segment select
//
// If no filters are active (activeCount === 0), no "Clear" button is shown.
// When any filter is active, a "Clear all" link appears on the right.

import type { PageFilters, FilterConfig } from '@/hooks/usePageFilters';

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PageFilterBarProps {
  filters:     PageFilters;
  config:      FilterConfig;
  cities?:     FilterOption[];
  properties?: FilterOption[];
  commOptions?: FilterOption[];
  platforms?:  FilterOption[];
  investors?:  FilterOption[];
  categories?: FilterOption[];
  statuses?:   FilterOption[];
  segments?:   FilterOption[];
}

// ---------------------------------------------------------------------------
// Default commission options
// ---------------------------------------------------------------------------

const DEFAULT_COMM: FilterOption[] = [
  { value: '20', label: '20%' },
  { value: '25', label: '25%' },
  { value: '30', label: '30%' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageFilterBar({
  filters,
  config,
  cities      = [],
  properties  = [],
  commOptions = DEFAULT_COMM,
  platforms   = [],
  investors   = [],
  categories  = [],
  statuses    = [],
  segments    = [],
}: PageFilterBarProps) {
  // Nothing to render if no filters declared
  const hasAny = Object.keys(config).length > 0;
  if (!hasAny) return null;

  const sel = (label: string) => ({
    className: 'fsel',
    style: { fontSize: '12px' } as React.CSSProperties,
    'aria-label': label,
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '8px 0 4px',
        marginBottom: '4px',
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
        Filter by:
      </span>

      {/* City */}
      {config.city && cities.length > 0 && (
        <select
          {...sel('City filter')}
          value={filters.city}
          onChange={(e) => filters.set('city', e.target.value)}
        >
          <option value="all">All Cities</option>
          {cities.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}

      {/* Property */}
      {config.property && properties.length > 0 && (
        <select
          {...sel('Property filter')}
          value={filters.property}
          onChange={(e) => filters.set('property', e.target.value)}
        >
          <option value="all">All Properties</option>
          {properties.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      )}

      {/* Commission */}
      {config.comm && (
        <select
          {...sel('Commission filter')}
          value={filters.comm}
          onChange={(e) => filters.set('comm', e.target.value)}
        >
          <option value="all">All Commission</option>
          {commOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {/* Platform / Source */}
      {config.platform && platforms.length > 0 && (
        <select
          {...sel('Platform filter')}
          value={filters.platform}
          onChange={(e) => filters.set('platform', e.target.value)}
        >
          <option value="all">All Sources</option>
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      )}

      {/* Investor */}
      {config.investor && investors.length > 0 && (
        <select
          {...sel('Investor filter')}
          value={filters.investor}
          onChange={(e) => filters.set('investor', e.target.value)}
        >
          <option value="all">All Investors</option>
          {investors.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>
      )}

      {/* Category */}
      {config.category && categories.length > 0 && (
        <select
          {...sel('Category filter')}
          value={filters.category}
          onChange={(e) => filters.set('category', e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}

      {/* Status */}
      {config.status && statuses.length > 0 && (
        <select
          {...sel('Status filter')}
          value={filters.status}
          onChange={(e) => filters.set('status', e.target.value)}
        >
          <option value="all">All Status</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}

      {/* Segment */}
      {config.segment && segments.length > 0 && (
        <select
          {...sel('Segment filter')}
          value={filters.segment}
          onChange={(e) => filters.set('segment', e.target.value)}
        >
          <option value="all">All Segments</option>
          {segments.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}

      {/* Clear all — only shown when at least one filter is active */}
      {filters.activeCount > 0 && (
        <button
          className="btn btn-g btn-sm"
          style={{ fontSize: '10.5px', padding: '2px 9px', marginLeft: '4px' }}
          onClick={filters.reset}
          title="Clear all filters"
        >
          ✕ Clear {filters.activeCount > 1 ? `(${filters.activeCount})` : ''}
        </button>
      )}
    </div>
  );
}
