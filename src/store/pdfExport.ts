// src/store/pdfExport.ts
//
// Minimal Zustand store for export coordination.
//
// The Topbar ↓ PDF and ↓ CSV buttons call triggerPdf() / triggerCsv().
// Each page that supports export uses usePdfExport() / useCsvExport() to
// watch the counters and build its own clean export when triggered.

import { create } from 'zustand';

interface ExportStore {
  pdfTrigger: number;
  csvTrigger: number;
  triggerPdf: () => void;
  triggerCsv: () => void;
}

export const usePdfExportStore = create<ExportStore>((set) => ({
  pdfTrigger: 0,
  csvTrigger: 0,
  triggerPdf: () => set((s) => ({ pdfTrigger: s.pdfTrigger + 1 })),
  triggerCsv: () => set((s) => ({ csvTrigger: s.csvTrigger + 1 })),
}));
