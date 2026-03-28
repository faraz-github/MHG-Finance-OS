// src/components/layout/exportPdf.tsx
//
// Client-side PDF export helpers.
// POSTs options to /api/pdf which generates the PDF server-side using
// @react-pdf/renderer (kept out of the browser bundle entirely).
// Receives the PDF blob and triggers a browser download.

export interface PdfTableOptions {
  title:    string;
  headers:  string[];
  rows:     string[][];
  filename: string;
}

export interface PdfReportOptions {
  propName: string;
  period:   string;
  kpiRows:  Array<[string, string]>;
  expCats:  Record<string, number>;
  channels: Record<string, number>;
  filename: string;
}

async function downloadPdfFromServer(body: object, filename: string): Promise<void> {
  const res = await fetch('/api/pdf', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'PDF generation failed');
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportTablePdf(opts: PdfTableOptions): Promise<void> {
  await downloadPdfFromServer({ type: 'table', ...opts }, opts.filename);
}

export async function exportReportPdf(opts: PdfReportOptions): Promise<void> {
  await downloadPdfFromServer({ type: 'report', ...opts }, opts.filename);
}
