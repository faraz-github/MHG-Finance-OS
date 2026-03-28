// src/app/api/pdf/route.ts
//
// Server-side PDF generation using @react-pdf/renderer.
// Runs entirely on the server — no browser bundling of pako/fontkit/pdfkit.
//
// POST body: { type: 'table' | 'report', ...options }
//
// For 'table': { title, headers, rows, filename }
// For 'report': { propName, period, kpiRows, expCats, channels, filename }

import { NextRequest, NextResponse } from 'next/server';
import React from 'react';

// ---------------------------------------------------------------------------
// Types (mirrored from exportPdf.tsx)
// ---------------------------------------------------------------------------

interface TableOptions {
  type: 'table';
  title: string;
  headers: string[];
  rows: string[][];
  filename: string;
}

interface ReportOptions {
  type: 'report';
  propName: string;
  period: string;
  kpiRows: Array<[string, string]>;
  expCats: Record<string, number>;
  channels: Record<string, number>;
  filename: string;
}

type PdfRequest = TableOptions | ReportOptions;

// ---------------------------------------------------------------------------
// Brand constants
// ---------------------------------------------------------------------------

const ORANGE   = '#F97316';
const ORANGE_L = '#FEF3EB';
const RED      = '#DC2626';
const GREEN    = '#16A34A';
const GREY     = '#6B7280';
const WHITE    = '#FFFFFF';
const BLACK    = '#111827';
const FOOTER   = 'MehmanGhar Stays Services Pvt. Ltd.  ·  Andheri West, Mumbai 400061  ·  CIN: U55101MH2025PTC456442';

function todayStr(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PdfRequest;
  try {
    body = await request.json() as PdfRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Import server-side only — kept out of the client bundle by serverExternalPackages
    const { Document, Page, Text, View, StyleSheet, pdf } =
      await import('@react-pdf/renderer');

    // Use "Rs." instead of "₹" — Helvetica has no rupee glyph, causing the
    // following digit to render as superscript due to font fallback.
    const fIN = (n: number) =>
      'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let doc: React.ReactElement;

    if (body.type === 'table') {
      const { title, headers, rows } = body;

      const styles = StyleSheet.create({
        page:       { fontFamily: 'Helvetica', fontSize: 7, padding: 0, backgroundColor: WHITE },
        header:     { backgroundColor: ORANGE, flexDirection: 'row', justifyContent: 'space-between',
                      alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
        headerLeft: { flexDirection: 'column' },
        hBrand:     { color: WHITE, fontSize: 11, fontFamily: 'Helvetica-Bold' },
        hSub:       { color: WHITE, fontSize: 7, opacity: 0.85 },
        hTitle:     { color: WHITE, fontSize: 10, fontFamily: 'Helvetica-Bold' },
        hDate:      { color: WHITE, fontSize: 7, opacity: 0.85 },
        body:       { padding: 10, flex: 1 },
        tableHead:  { flexDirection: 'row', backgroundColor: ORANGE, borderRadius: 2, marginBottom: 1 },
        tableRow:   { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
        tableRowAlt:{ flexDirection: 'row', backgroundColor: ORANGE_L,
                      borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
        thCell:     { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 6.5, padding: 4, flex: 1 },
        tdCell:     { color: BLACK, fontSize: 6.5, padding: 4, flex: 1 },
        footer:     { borderTopWidth: 0.5, borderTopColor: '#E5E7EB', flexDirection: 'row',
                      justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 5 },
        footerText: { color: GREY, fontSize: 6 },
      });

      const colFlex = (i: number) => (i === 0 ? 1.4 : i === 1 ? 1.2 : 1);

      doc = React.createElement(
        Document, {},
        React.createElement(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
          // Header
          React.createElement(View, { style: styles.header },
            React.createElement(View, { style: styles.headerLeft },
              React.createElement(Text, { style: styles.hBrand }, 'MehmanGhar Stays'),
              React.createElement(Text, { style: styles.hSub }, 'Financial OS'),
            ),
            React.createElement(Text, { style: styles.hTitle }, title),
            React.createElement(Text, { style: styles.hDate }, `Generated: ${todayStr()}`),
          ),
          // Table
          React.createElement(View, { style: styles.body },
            React.createElement(View, { style: styles.tableHead },
              ...headers.map((h, i) =>
                React.createElement(Text, { key: String(i), style: { ...styles.thCell, flex: colFlex(i) } }, h)
              ),
            ),
            ...rows.map((row, ri) =>
              React.createElement(View, { key: String(ri), style: ri % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
                ...row.map((cell, ci) =>
                  React.createElement(Text, { key: String(ci), style: { ...styles.tdCell, flex: colFlex(ci) } }, cell)
                ),
              )
            ),
          ),
          // Footer
          React.createElement(View, { style: styles.footer, fixed: true } as Record<string, unknown>,
            React.createElement(Text, { style: styles.footerText }, FOOTER),
            React.createElement(Text, { style: styles.footerText,
              render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
                `Page ${pageNumber} of ${totalPages}`,
            }),
          ),
        ),
      );
    } else {
      // Report snapshot
      const { propName, period, kpiRows, expCats, channels } = body;

      const styles = StyleSheet.create({
        page:       { fontFamily: 'Helvetica', fontSize: 8, padding: 0, backgroundColor: WHITE },
        header:     { backgroundColor: ORANGE, flexDirection: 'row', justifyContent: 'space-between',
                      alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
        headerLeft: { flexDirection: 'column' },
        hBrand:     { color: WHITE, fontSize: 12, fontFamily: 'Helvetica-Bold' },
        hSub:       { color: WHITE, fontSize: 7, opacity: 0.85 },
        hCenter:    { alignItems: 'center' },
        hTitle:     { color: WHITE, fontSize: 11, fontFamily: 'Helvetica-Bold' },
        hPeriod:    { color: WHITE, fontSize: 8, opacity: 0.9 },
        hDate:      { color: WHITE, fontSize: 7, opacity: 0.85 },
        body:       { padding: 16, flex: 1 },
        section:    { marginBottom: 14 },
        sHead:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: ORANGE, marginBottom: 5 },
        sHeadRed:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 5 },
        sHeadGreen: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREEN, marginBottom: 5 },
        kpiRow:     { flexDirection: 'row', justifyContent: 'space-between',
                      borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', paddingVertical: 4 },
        kpiRowAlt:  { flexDirection: 'row', justifyContent: 'space-between',
                      backgroundColor: ORANGE_L, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6',
                      paddingVertical: 4, paddingHorizontal: 4 },
        kpiLabel:   { color: GREY, fontSize: 8 },
        kpiValue:   { color: BLACK, fontSize: 8, fontFamily: 'Helvetica-Bold' },
        catRow:     { flexDirection: 'row', justifyContent: 'space-between',
                      borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', paddingVertical: 3 },
        catLabel:   { color: BLACK, fontSize: 7.5 },
        catValue:   { color: RED, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
        chanRow:    { flexDirection: 'row', justifyContent: 'space-between',
                      borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', paddingVertical: 3 },
        chanLabel:  { color: BLACK, fontSize: 7.5 },
        chanValue:  { color: GREEN, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
        footer:     { borderTopWidth: 0.5, borderTopColor: '#E5E7EB', flexDirection: 'row',
                      justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 5 },
        footerText: { color: GREY, fontSize: 6 },
      });

      const expEntries  = Object.entries(expCats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const chanEntries = Object.entries(channels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const totNights   = chanEntries.reduce((s, [, v]) => s + v, 0);

      doc = React.createElement(
        Document, {},
        React.createElement(Page, { size: 'A4', orientation: 'portrait', style: styles.page },
          // Header
          React.createElement(View, { style: styles.header },
            React.createElement(View, { style: styles.headerLeft },
              React.createElement(Text, { style: styles.hBrand }, 'MehmanGhar Stays'),
              React.createElement(Text, { style: styles.hSub }, 'Financial OS'),
            ),
            React.createElement(View, { style: styles.hCenter },
              React.createElement(Text, { style: styles.hTitle }, propName),
              React.createElement(Text, { style: styles.hPeriod }, `${period} — Report Snapshot`),
            ),
            React.createElement(Text, { style: styles.hDate }, `Generated: ${todayStr()}`),
          ),
          // Body
          React.createElement(View, { style: styles.body },
            // KPIs
            React.createElement(View, { style: styles.section },
              React.createElement(Text, { style: styles.sHead }, 'KEY METRICS'),
              ...kpiRows.map(([label, value], i) =>
                React.createElement(View, { key: label, style: i % 2 === 0 ? styles.kpiRow : styles.kpiRowAlt },
                  React.createElement(Text, { style: styles.kpiLabel }, label),
                  React.createElement(Text, { style: styles.kpiValue }, value),
                )
              ),
            ),
            // Expenses
            ...(expEntries.length > 0 ? [
              React.createElement(View, { key: 'exp', style: styles.section },
                React.createElement(Text, { style: styles.sHeadRed }, 'EXPENSE BREAKDOWN'),
                ...expEntries.map(([k, v]) =>
                  React.createElement(View, { key: k, style: styles.catRow },
                    React.createElement(Text, { style: styles.catLabel },
                      k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                    ),
                    React.createElement(Text, { style: styles.catValue }, fIN(v)),
                  )
                ),
              ),
            ] : []),
            // Channels
            ...(chanEntries.length > 0 ? [
              React.createElement(View, { key: 'chan', style: styles.section },
                React.createElement(Text, { style: styles.sHeadGreen }, 'BOOKING CHANNELS'),
                ...chanEntries.map(([k, v]) =>
                  React.createElement(View, { key: k, style: styles.chanRow },
                    React.createElement(Text, { style: styles.chanLabel }, k),
                    React.createElement(Text, { style: styles.chanValue },
                      `${v} nights${totNights > 0 ? ` (${((v / totNights) * 100).toFixed(0)}%)` : ''}`
                    ),
                  )
                ),
              ),
            ] : []),
          ),
          // Footer
          React.createElement(View, { style: styles.footer, fixed: true } as Record<string, unknown>,
            React.createElement(Text, { style: styles.footerText }, FOOTER),
            React.createElement(Text, { style: styles.footerText,
              render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
                `Page ${pageNumber} of ${totalPages}`,
            }),
          ),
        ),
      );
    }

    const buffer = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
    const filename = 'filename' in body ? body.filename : 'export.pdf';

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[POST /api/pdf]', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
