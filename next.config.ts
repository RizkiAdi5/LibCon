import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // indikator "N" mode dev menutupi kontrol di pojok kiri bawah (checkbox tabel) dan membuat e2e gagal
  devIndicators: false,
  // akses dev dari HP/laptop lain di jaringan lokal; tanpa ini Next 16 memblokir HMR/chunk → halaman tidak hidrasi
  allowedDevOrigins: ["192.168.*.*"],
  // logo dibaca dari disk saat membuat PDF (src/lib/pdf/reportPdf.tsx) — pastikan ikut ke fungsi server di Vercel
  outputFileTracingIncludes: {
    "/**": [
      "./public/logo-disperpusip.png",
      "./public/logo-libcon.png",
      "./src/generated/prisma/**/*.node",
      "./src/generated/prisma/**/*.wasm",
    ],
  },
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
