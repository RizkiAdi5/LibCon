import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // indikator "N" mode dev menutupi kontrol di pojok kiri bawah (checkbox tabel) dan membuat e2e gagal
  devIndicators: false,
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
