import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // output: "standalone" agar image Docker kecil dan hanya berisi file yang
  // dibutuhkan runtime. Aktif di build produksi.
  output: "standalone",
  // `outputFileTracingRoot` di-set eksplisit ke monorepo root (path relatif
  // terhadap file ini: `apps/portal/next.config.ts` → `../../`). Tanpa ini,
  // Next.js menebak workspace root via pnpm-workspace.yaml/turbo.json dan
  // menghasilkan struktur `.next/standalone/` yang BERBEDA antara host dan
  // Docker — path `apps/portal/server.js` hanya ada kalau project dir
  // berada di bawah traceRoot. Set eksplisit = struktur konsisten di mana
  // pun build berjalan.
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
  // Default API URL untuk build lokal. Saat run di Docker, env disuntik
  // saat build via docker-compose.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
  },
};

export default nextConfig;
