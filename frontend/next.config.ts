import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" agar image Docker kecil dan hanya berisi file yang
  // dibutuhkan runtime (M0 placeholder; aktifkan kembali di M3 saat build
  // produksi pertama).
  output: "standalone",
  // Workspace packages di-monorepo ini dipublish sebagai TypeScript source
  // (`"main": "./src/index.ts"`), bukan build output. Tanpa daftar ini
  // Next.js tidak akan men-transpile `.ts` di dalamnya, dan import
  // `@insuretrack/*` akan gagal saat build/runtime dengan error
  // "Cannot find module" atau "Unexpected token".
  transpilePackages: [
    "@insuretrack/api-client",
    "@insuretrack/forms",
    "@insuretrack/ui",
  ],
  // Tolak request saat ada env backend tidak di-set saat build.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
  },
};

export default nextConfig;
