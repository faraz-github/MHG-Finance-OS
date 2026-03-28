'use client';
// src/app/(dashboard)/crm/CrmClient.tsx
//
// Client Component. Re-derives all CRM metrics from booking rows whenever
// the period filter changes.
//
// HTML source: rndCRM(), showGuestProfile()
//
// The page is read-only in v1 — guests are created automatically on booking save.
// Tags (VIP / Frequent / One-time / High Rating / Low Rating) are computed
// client-side from the booking-derived metrics, verbatim from rndCRM().
//
// Period filtering: matchesPeriod() on bookings.checkIn — same pattern
// as Daily Expenses and Bookings (client-side Zustand, URL-sync in v2).

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { downloadCsv } from '@/lib/csvDownload';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { matchesPeriod } from '@/lib/period';
import type { PeriodState } from '@/lib/period';
import { MetricCard, MetricCardGrid } from '@/components/ui/MetricCard';
import { DetailPanel } from '@/components/ui/DetailPanel';
import type { SerializableGuest, SerializableGuestBooking } from './page';

const CrmCharts = dynamic(
  () => import('./CrmCharts').then((m) => ({ default: m.CrmCharts })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI  = (n: number) => {
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
};

// ---------------------------------------------------------------------------
// Auto-tag logic — verbatim from rndCRM()
// ---------------------------------------------------------------------------

function computeTags(
  guest: SerializableGuest,
  periodMetrics: { stays: number; nights: number; spend: number; avgRating: number },
): string[] {
  const tags: string[] = [];
  // Auto-segment from all-time stats + period metrics
  const spend = guest.allTimeSpend;
  const stays = guest.allTimeStays;
  const avgRating = guest.avgRating ?? 0;

  if (spend >= 100000)   tags.push('VIP');
  if (stays >= 3)        tags.push('Frequent');
  else if (stays === 1)  tags.push('One-time');
  if (avgRating >= 4)    tags.push('High Rating');
  else if (avgRating > 0 && avgRating < 3) tags.push('Low Rating');

  return tags;
}

// Tag colour map — verbatim from rndCRM()
const TAG_CLR: Record<string, string> = {
  'VIP': '#F4521E', 'Frequent': '#16A34A', 'One-time': '#9CA3AF',
  'Low Rating': '#DC2626', 'High Rating': '#2563EB',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CrmClientProps {
  guests: SerializableGuest[];
  bookings: SerializableGuestBooking[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrmClient({ guests, bookings }: CrmClientProps) {
  // ── Local state ───────────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelGuest, setPanelGuest] = useState<SerializableGuest | null>(null);

  // ── Period store + per-page filters ───────────────────────────────────────
  const periodState = usePeriod();
  const filters = usePageFilters({ property: true, segment: true });

  // ── Filter option lists ───────────────────────────────────────────────────
  const propertyOptions: FilterOption[] = useMemo(() => {
    const s = new Set(bookings.map((b) => b.propertyName).filter(Boolean));
    return [...s].sort().map((n) => ({ value: n, label: n }));
  }, [bookings]);

  const segmentOptions: FilterOption[] = [
    { value: 'VIP',      label: 'VIP'      },
    { value: 'Frequent', label: 'Frequent' },
    { value: 'One-time', label: 'One-time' },
  ];

  // ── Period-filtered bookings ──────────────────────────────────────────────
  const periodBks = useMemo(
    () => bookings.filter((b) => matchesPeriod(b.checkIn, periodState as PeriodState)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  // ── Per-guest period metrics map ──────────────────────────────────────────
  const guestPeriodMap = useMemo(() => {
    const raw: Record<string, { stays: number; nights: number; spend: number; ratings: number[] }> = {};
    periodBks.forEach((b) => {
      if (!b.guestId) return;
      if (!raw[b.guestId]) raw[b.guestId] = { stays: 0, nights: 0, spend: 0, ratings: [] };
      raw[b.guestId].stays++;
      raw[b.guestId].nights += b.nights ?? 0;
      raw[b.guestId].spend  += b.revenue ?? 0;
      // Collect ratings from bookings (rating field now present on SerializableGuestBooking)
      if (b.rating && b.rating > 0) raw[b.guestId].ratings.push(b.rating);
    });
    // Derive avgRating from collected ratings
    const m: Record<string, { stays: number; nights: number; spend: number; avgRating: number }> = {};
    for (const [gid, v] of Object.entries(raw)) {
      m[gid] = {
        stays: v.stays,
        nights: v.nights,
        spend: v.spend,
        avgRating: v.ratings.length
          ? +(v.ratings.reduce((a, r) => a + r, 0) / v.ratings.length).toFixed(1)
          : 0,
      };
    }
    return m;
  }, [periodBks]);

  // ── Active guests (have bookings in period) ───────────────────────────────
  const activeGuestIds = useMemo(() => new Set(Object.keys(guestPeriodMap)), [guestPeriodMap]);
  const activeGuests = useMemo(
    () => guests.filter((g) => activeGuestIds.has(g.id)),
    [guests, activeGuestIds],
  );

  // ── KPI derivations — verbatim from rndCRM() ─────────────────────────────
  const tot         = activeGuests.length;
  const repeat      = activeGuests.filter((g) => (guestPeriodMap[g.id]?.stays ?? 0) > 1).length;
  const returnRate  = tot > 0 ? +((repeat / tot) * 100).toFixed(0) : 0;
  const totalSpend  = activeGuests.reduce((s, g) => s + (guestPeriodMap[g.id]?.spend ?? 0), 0);
  // avgCLV = average all-time spend per active guest (true lifetime value, not period spend)
  const avgCLV      = tot > 0 ? +(activeGuests.reduce((s, g) => s + g.allTimeSpend, 0) / tot).toFixed(2) : 0;
  const allRatings  = activeGuests
    .map((g) => g.avgRating)
    .filter((r): r is number => r !== null && r > 0);
  const avgRating   = allRatings.length > 0
    ? +( allRatings.reduce((s, r) => s + r, 0) / allRatings.length).toFixed(1)
    : 0;
  const totalNights = activeGuests.reduce((s, g) => s + (guestPeriodMap[g.id]?.nights ?? 0), 0);
  const totalStays  = activeGuests.reduce((s, g) => s + (guestPeriodMap[g.id]?.stays  ?? 0), 0);
  const avgStay     = totalStays > 0 ? +(totalNights / totalStays).toFixed(1) : 0;

  // ── Insights — verbatim from rndCRM() ────────────────────────────────────
  const insights = useMemo(() => {
    const ins: Array<{ c: string; t: string }> = [];
    if (tot > 5) {
      const top10  = Math.max(1, Math.round(tot * 0.1));
      const topG   = [...activeGuests].sort((a, b) => (guestPeriodMap[b.id]?.spend ?? 0) - (guestPeriodMap[a.id]?.spend ?? 0)).slice(0, top10);
      const topRev = topG.reduce((s, g) => s + (guestPeriodMap[g.id]?.spend ?? 0), 0);
      const topPct = totalSpend > 0 ? ((topRev / totalSpend) * 100).toFixed(0) : '0';
      if (+topPct >= 50) ins.push({ c: '#F4521E', t: `Top ${top10} guest${top10 > 1 ? 's' : ''} = <strong>${topPct}%</strong> of total revenue` });
    }
    if (returnRate < 20 && tot > 3)  ins.push({ c: '#DC2626', t: `Return rate <strong>${returnRate}%</strong> — consider loyalty programs` });
    else if (returnRate >= 40)       ins.push({ c: '#16A34A', t: `Strong loyalty — <strong>${returnRate}%</strong> return rate ✓` });
    if (avgRating > 0 && avgRating < 3.5) ins.push({ c: '#D97706', t: `Guest satisfaction <strong>${avgRating}</strong> — review service quality` });
    return ins;
  }, [tot, activeGuests, guestPeriodMap, totalSpend, returnRate, avgRating]);

  // ── Tags + filter ─────────────────────────────────────────────────────────
  const guestsWithTags = useMemo(
    () => activeGuests.map((g) => ({
      g,
      tags: computeTags(g, guestPeriodMap[g.id] ?? { stays: 0, nights: 0, spend: 0, avgRating: 0 }),
      periodSpend: guestPeriodMap[g.id]?.spend ?? 0,
    })),
    [activeGuests, guestPeriodMap],
  );

  const filteredGuests = useMemo(() => {
    let list = guestsWithTags;
    if (filters.segment !== 'all') list = list.filter(({ tags }) => tags.includes(filters.segment));
    if (filters.property !== 'all') {
      const guestIdsByProp = new Set(
        bookings.filter((b) => b.propertyName === filters.property).map((b) => b.guestId).filter(Boolean),
      );
      list = list.filter(({ g }) => guestIdsByProp.has(g.id));
    }
    return [...list].sort((a, b) => b.g.allTimeSpend - a.g.allTimeSpend);
  }, [guestsWithTags, filters.segment, filters.property, bookings]);

  // ── Top 5 for chart ───────────────────────────────────────────────────────
  const top5 = useMemo(
    () => [...guestsWithTags]
      .sort((a, b) => b.periodSpend - a.periodSpend)
      .slice(0, 5)
      .map(({ g, periodSpend }) => ({ name: g.name, spend: periodSpend })),
    [guestsWithTags],
  );

  // ── Detail panel ──────────────────────────────────────────────────────────
  function openPanel(guest: SerializableGuest) {
    setPanelGuest(guest);
    setPanelOpen(true);
  }

  const panelBookings = useMemo(
    () => panelGuest
      ? bookings.filter((b) => b.guestId === panelGuest.id).sort((a, b) => b.checkIn.localeCompare(a.checkIn))
      : [],
    [panelGuest, bookings],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-hdr">
        <div className="stl" style={{ marginBottom: 0 }}><div className="d" />Guest Intelligence</div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={() => {
            downloadCsv(
              ['Guest', 'Phone', 'Email', 'Tags', 'Stays (all-time)', 'Nights (all-time)', 'Period Spend', 'Lifetime CLV', 'Rating', 'Last Visit'],
              filteredGuests.map(({ g, tags, periodSpend }) => [
                g.name, g.phone || '', g.email || '', tags.join(', '),
                String(g.allTimeStays), String(g.allTimeNights),
                String(periodSpend), String(g.allTimeSpend),
                g.avgRating ? String(g.avgRating) : '', g.lastVisit || '',
              ]),
              `mg-guests-${new Date().toISOString().slice(0, 10)}.csv`,
            );
          }}>↓ CSV</button>
          <button className="btn btn-g btn-sm" onClick={async () => {
            const { exportTablePdf } = await import('@/components/layout/exportPdf');
            await exportTablePdf({
              title: 'Guest CRM',
              headers: ['Guest', 'Phone', 'Tags', 'Stays', 'Nights', 'Period Spend', 'Lifetime CLV', 'Rating', 'Last Visit'],
              rows: filteredGuests.map(({ g, tags, periodSpend }) => [
                g.name, g.phone || '—', tags.join(', ') || '—',
                String(g.allTimeStays), String(g.allTimeNights),
                'Rs. ' + periodSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                'Rs. ' + g.allTimeSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                g.avgRating ? String(g.avgRating) : '—', g.lastVisit || '—',
              ]),
              filename: `mg-guests-${new Date().toISOString().slice(0, 10)}.pdf`,
            });
          }}>↓ PDF</button>
        </div>
      </div>

      <PageFilterBar
        filters={filters}
        config={{ property: true, segment: true }}
        properties={propertyOptions}
        segments={segmentOptions}
      />

      {/* ── 5 KPI cards — verbatim crmKpis ──────────────────────────────── */}
      <MetricCardGrid>
        <MetricCard label="Total Guests" value={String(tot)}          sub="Active this period"          iconText="👤" iconVariant="b" />
        <MetricCard label="Return Rate"  value={returnRate + '%'}     sub={returnRate >= 30 ? '✓ Good loyalty' : '⚠ Below 30% target'} iconText="↩" iconVariant={returnRate >= 30 ? 'g' : 'go'} />
        <MetricCard label="Avg CLV"      value={fIN(avgCLV)}           sub="Customer lifetime value"    iconText="₹" iconVariant="o" />
        <MetricCard label="Avg Rating"   value={avgRating > 0 ? avgRating + ' ⭐' : 'N/A'} sub="Guest satisfaction" iconText="⭐" iconVariant="b" />
        <MetricCard label="Avg Stay"     value={avgStay + ' nights'}  sub="Nights per visit"           iconText="🌙" iconVariant="b" />
      </MetricCardGrid>

      {/* ── Insights ─────────────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          {insights.map((ins, i) => (
            <div key={i} style={{
              display: 'flex', gap: '7px', marginBottom: '5px', fontSize: '12px',
              background: 'var(--bg)', padding: '8px 12px', borderRadius: '8px',
              borderLeft: `3px solid ${ins.c}`,
            }}>
              <div dangerouslySetInnerHTML={{ __html: ins.t }} />
            </div>
          ))}
        </div>
      )}

      {/* ── .crow.re: Repeat/New doughnut + Top 5 bar ──────────────────── */}
      {tot > 0 && (
        <div className="crow re" style={{ marginBottom: '14px' }}>
          <CrmCharts repeatCount={repeat} newCount={tot - repeat} top5={top5} />
        </div>
      )}

      {/* ── Guest table ──────────────────────────────────────────────────── */}
      <div className="tw">
        <div className="th">
          <div className="ct">Guest Database</div>
        </div>

        {tot === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
            No guest activity for this period. Change the View By filter or add bookings.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Phone</th>
                  <th>Stays</th>
                  <th>Nights</th>
                  <th>Spend (CLV)</th>
                  <th>Rating</th>
                  <th>Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuests.map(({ g, tags, periodSpend }) => (
                  <tr
                    key={g.id}
                    style={{ cursor: 'pointer', transition: 'background .15s' }}
                    onClick={() => openPanel(g)}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseOut={(e)  => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--or)', fontSize: '10px' }}>▶</span>
                        <div>
                          {g.name}
                          <div style={{ marginTop: '2px' }}>
                            {tags.map((t) => (
                              <span key={t} style={{
                                display: 'inline-block', fontSize: '9px',
                                padding: '1px 6px', borderRadius: '10px', marginRight: '3px',
                                background: (TAG_CLR[t] ?? '#9CA3AF') + '20',
                                color: TAG_CLR[t] ?? '#6A6560',
                                fontWeight: 600,
                              }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{g.phone || '—'}</td>
                    <td>{g.allTimeStays || 0}</td>
                    <td>{g.allTimeNights || 0}</td>
                    <td style={{ fontWeight: 700, color: 'var(--gr)' }}>
                      {fIN(periodSpend)}
                      <div style={{ fontSize: '9px', color: 'var(--t3)' }}>
                        Lifetime: {fIN(g.allTimeSpend || 0)}
                      </div>
                    </td>
                    <td>{g.avgRating ? g.avgRating + ' ⭐' : '—'}</td>
                    <td style={{ fontSize: '11px' }}>{g.lastVisit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Guest detail panel — verbatim showGuestProfile() ─────────────── */}
      <DetailPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelGuest?.name ?? ''}
        sub={
          panelGuest
            ? `Guest Profile · ${panelGuest.allTimeStays} stays · ${fIN(panelGuest.allTimeSpend)} CLV`
            : ''
        }
      >
        {panelGuest && (
          <GuestProfile
            guest={panelGuest}
            bookings={panelBookings}
            tags={computeTags(panelGuest, guestPeriodMap[panelGuest.id] ?? { stays: 0, nights: 0, spend: 0, avgRating: 0 })}
          />
        )}
      </DetailPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// GuestProfile — verbatim port of showGuestProfile() panel body
// ---------------------------------------------------------------------------

function GuestProfile({
  guest,
  bookings,
  tags,
}: {
  guest: SerializableGuest;
  bookings: SerializableGuestBooking[];
  tags: string[];
}) {
  const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const avgStay = guest.allTimeStays > 0
    ? (guest.allTimeNights / guest.allTimeStays).toFixed(1)
    : '0';

  // Favourite property: the one with most bookings
  const propCount: Record<string, number> = {};
  bookings.forEach((b) => { if (b.propertyName) propCount[b.propertyName] = (propCount[b.propertyName] ?? 0) + 1; });
  const favProp = Object.entries(propCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return (
    <>
      {/* Contact + Metrics two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        {/* Contact card */}
        <div className="cc" style={{ padding: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t3)', marginBottom: '8px' }}>CONTACT</div>
          <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>{guest.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '2px' }}>📱 {guest.phone || 'No phone'}</div>
          <div style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '2px' }}>📧 {guest.email || 'No email'}</div>
          <div style={{ fontSize: '12px', color: 'var(--t2)' }}>📍 {guest.nationality || 'No city'}</div>
          <div style={{ marginTop: '6px' }}>
            {tags.map((t) => (
              <span key={t} style={{
                display: 'inline-block', fontSize: '9px', padding: '2px 7px', borderRadius: '10px',
                background: '#F4521E20', color: '#F4521E', fontWeight: 600, marginRight: '3px',
              }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Metrics card */}
        <div className="cc" style={{ padding: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t3)', marginBottom: '8px' }}>METRICS</div>
          <div className="dp-kpi">
            {[
              { l: 'CLV',      v: fIN(guest.allTimeSpend),  c: 'var(--gr)' },
              { l: 'Stays',    v: guest.allTimeStays,        c: 'var(--bl)' },
              { l: 'Nights',   v: guest.allTimeNights,       c: 'var(--or)' },
              { l: 'Avg Stay', v: avgStay + 'n',             c: 'var(--tx)' },
              { l: 'Rating',   v: guest.avgRating ? guest.avgRating + ' ⭐' : '—', c: 'var(--go)' },
              { l: 'Favorite', v: favProp.length > 15 ? favProp.slice(0, 13) + '…' : favProp, c: 'var(--bl)' },
            ].map((k) => (
              <div key={k.l} className="dp-k">
                <div className="dp-kl">{k.l}</div>
                <div className="dp-kv" style={{ color: k.c, fontSize: '14px' }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      {guest.notes && (
        <div style={{ background: 'var(--s2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--t2)', whiteSpace: 'pre-line' }}>
          {guest.notes}
        </div>
      )}

      {/* Booking history table */}
      {bookings.length > 0 && (
        <>
          <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '7px' }}>
            Booking History ({bookings.length})
          </div>
          <div style={{ overflow: 'auto', border: '1px solid var(--bdr)', borderRadius: '8px' }}>
            <table style={{ width: '100%', fontSize: '11px' }}>
              <thead>
                <tr>
                  <th>Check-in</th><th>Check-out</th><th>Property</th>
                  <th>Nights</th><th>Amount</th><th>Source</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.checkIn}</td>
                    <td>{b.checkOut}</td>
                    <td>{b.propertyName}</td>
                    <td>{b.nights}</td>
                    <td style={{ color: 'var(--gr)', fontWeight: 600 }}>{fIN(b.revenue)}</td>
                    <td><span className="pill b">{b.platform}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}