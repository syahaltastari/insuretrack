/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest workspace config — 1 file covers semua packages + apps.
 * Setup shared:
 *   - jsdom environment (browser-like)
 *   - React plugin (untuk *.tsx — tanpa ini JSX tidak di-parse)
 *   - tsconfig path resolution (apps pakai `@/` alias)
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/e2e/**",
      "**/playwright-report/**",
    ],
    css: false,
  },
});
