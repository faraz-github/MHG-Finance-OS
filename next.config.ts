import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must be server-external — it uses pako deep subpath
  // imports (pako/lib/zlib/*) that only exist in pako v1 and cannot be
  // bundled by Turbopack's client bundler.
  // PDF generation runs in the API route (/api/pdf), not in the browser.
  serverExternalPackages: [
    '@react-pdf/renderer',
    '@react-pdf/pdfkit',
    '@react-pdf/font',
    '@react-pdf/layout',
    '@react-pdf/svg',
    '@react-pdf/primitives',
    'pako',
    'fontkit',
    'linebreak',
  ],
  turbopack: {},
};

export default nextConfig;
