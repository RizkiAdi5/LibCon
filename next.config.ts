import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // indikator "N" mode dev menutupi kontrol di pojok kiri bawah (checkbox tabel) dan membuat e2e gagal
  devIndicators: false,
  // logo dibaca dari disk saat membuat PDF (src/lib/pdf/reportPdf.tsx) — pastikan ikut ke fungsi server di Vercel
  outputFileTracingIncludes: { "/**": ["./public/logo-disperpusip.png"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
