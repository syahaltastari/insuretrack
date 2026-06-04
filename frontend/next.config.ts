import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" agar image Docker kecil dan hanya berisi file yang
  // dibutuhkan runtime (M0 placeholder; aktifkan kembali di M3 saat build
  // produksi pertama).
  output: "standalone",
  // Tolak request saat ada env backend tidak di-set saat build.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
  },
};

export default nextConfig;
