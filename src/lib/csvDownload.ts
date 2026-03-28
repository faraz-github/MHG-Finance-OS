// src/lib/csvDownload.ts
//
// Lightweight CSV builder and browser download trigger.
// No dependencies — safe to import at module scope in client components.

function escCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(
  headers: string[],
  rows: string[][],
  filename: string,
): void {
  const head = headers.map(escCsv).join(',');
  const body = rows.map((r) => r.map(escCsv).join(','));
  const csv  = [head, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
