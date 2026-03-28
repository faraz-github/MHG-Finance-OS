// src/components/layout/exportPdf.ts
//
// Browser-only PDF export helpers.
// Dynamically imported inside event handlers only — never at module scope.
// jsPDF is aliased to its UMD browser build in next.config.ts to prevent
// the Node.js build (which uses fflate/worker_threads) from being bundled.
//
// Usage:
//   const { exportTablePdf } = await import('@/components/layout/exportPdf');

export interface PdfTableOptions {
  title: string;
  headers: string[];
  rows: string[][];
  filename: string;
}

/**
 * Generates a branded landscape A4 PDF with a table and downloads it.
 * Called from TopbarActions handleExportPdf — never during SSR.
 */
export async function exportTablePdf({
  title,
  headers,
  rows,
  filename,
}: PdfTableOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('MehmanGhar Stays', 10, 11);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Financial OS', 10, 16);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageW / 2, 11, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${dateStr}`, pageW - 10, 11, { align: 'right' });

  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    head:               [headers],
    body:               rows,
    startY:             22,
    styles:             { fontSize: 7, cellPadding: 2 },
    headStyles:         { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 243, 235] },
    margin:             { left: 10, right: 10 },
  });

  // Footer
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const y = doc.internal.pageSize.getHeight() - 6;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      'MehmanGhar Stays Services Pvt. Ltd.  ·  Andheri West, Mumbai 400061  ·  CIN: U55101MH2025PTC456442',
      pageW / 2, y, { align: 'center' },
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - 10, y, { align: 'right' });
  }

  doc.save(filename);
}

export interface PdfReportOptions {
  propName: string;
  period:   string;
  kpiRows:  Array<[string, string]>;
  expCats:  Record<string, number>;
  channels: Record<string, number>;
  filename: string;
}

/**
 * Generates a branded portrait A4 PDF for a single report snapshot.
 * Called from ReportsClient pdfDownload — never during SSR.
 */
export async function exportReportPdf({
  propName,
  period,
  kpiRows,
  expCats,
  channels,
  filename,
}: PdfReportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 0, pageW, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MehmanGhar Stays', 10, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Financial OS', 10, 17);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${propName} — ${period}`, pageW / 2, 10, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Report Snapshot', pageW / 2, 15, { align: 'center' });
  doc.text(`Generated: ${dateStr}`, pageW - 10, 12, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // KPI table
  autoTable(doc, {
    head:               [['Metric', 'Value']],
    body:               kpiRows,
    startY:             24,
    styles:             { fontSize: 9, cellPadding: 3 },
    headStyles:         { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' },
    columnStyles:       { 1: { halign: 'right', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [254, 243, 235] },
    margin:             { left: 14, right: 14 },
  });

  type DocWithTable = { lastAutoTable: { finalY: number } };

  // Expense breakdown
  const expEntries = Object.entries(expCats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (expEntries.length > 0) {
    const fIN = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prevY = (doc as unknown as DocWithTable).lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Expense Breakdown', 14, prevY);
    autoTable(doc, {
      head:         [['Category', 'Amount']],
      body:         expEntries.map(([k, v]) => [
        k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        fIN(v),
      ]),
      startY:       prevY + 4,
      styles:       { fontSize: 8, cellPadding: 2.5 },
      headStyles:   { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      margin:       { left: 14, right: 14 },
    });
  }

  // Channel breakdown
  const chanEntries = Object.entries(channels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (chanEntries.length > 0) {
    const totN = chanEntries.reduce((s, [, v]) => s + v, 0);
    const prevY = (doc as unknown as DocWithTable).lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Booking Channels', 14, prevY);
    autoTable(doc, {
      head:         [['Channel', 'Nights', 'Share']],
      body:         chanEntries.map(([k, v]) => [
        k, `${v} nights`, totN > 0 ? ((v / totN) * 100).toFixed(0) + '%' : '',
      ]),
      startY:       prevY + 4,
      styles:       { fontSize: 8, cellPadding: 2.5 },
      headStyles:   { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin:       { left: 14, right: 14 },
    });
  }

  // Footer
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const y = doc.internal.pageSize.getHeight() - 7;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      'MehmanGhar Stays Services Pvt. Ltd.  ·  Andheri West, Mumbai 400061  ·  CIN: U55101MH2025PTC456442',
      pageW / 2, y, { align: 'center' },
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - 10, y, { align: 'right' });
  }

  doc.save(filename);
}
