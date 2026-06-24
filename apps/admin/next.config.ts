import type { NextConfig } from "next";
import path from "node:path";

const BACKEND_ORIGIN =
  process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // output: "standalone" agar image Docker kecil dan hanya berisi file yang
  // dibutuhkan runtime. Aktif di build produksi.
  output: "standalone",
  // `outputFileTracingRoot` di-set eksplisit ke monorepo root. Lihat
  // apps/portal/next.config.ts untuk penjelasan lengkap.
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
  // Proxy `/api/*` ke backend Rust di port 8080 (dev mode only).
  // Lihat apps/portal/next.config.ts untuk penjelasan lengkap.
  rewrites: async () =>
    process.env.NODE_ENV === "production"
      ? []
      : [
          {
            source: "/api/:path*",
            destination: `${BACKEND_ORIGIN}/api/:path*`,
          },
        ],
  // Default API URL untuk build lokal. Default ke same-origin path
  // supaya rewrite Next.js dev server proxy ke backend.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  },
};

export default nextConfig;
