"use client";

// MotionProvider — defense-in-depth MotionConfig wrapper.
//
// Components di project ini pakai CUSTOM hook `useShouldAnimate` (lihat
// hooks/use-should-animate.ts) untuk detect reduced motion — BUKAN
// motion's built-in `useReducedMotion()`. Custom hook pakai
// window.matchMedia langsung, jadi TIDAK emit warning apapun.
//
// MotionProvider di sini adalah safety net:
//   - Kalau di masa depan ada code baru yang pakai motion's useReducedMotion
//     atau langsung motion.div tanpa melewati custom hook, MotionConfig
//     global tetap override behavior-nya.
//   - Dev: `reducedMotion="never"` — force animate regardless of OS.
//   - Prod: `reducedMotion="user"` — respect OS preference.
//
// `process.env.NODE_ENV` di-substitute oleh Next.js saat build (hardcode
// di bundle). Aman untuk long-term maintenance — values inlined.
//
// Untuk long-term: kalau baru pakai useReducedMotion() di component,
// import dari custom hook instead (`@/hooks/use-should-animate`).

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion =
    process.env.NODE_ENV === "production" ? "user" : "never";

  return (
    <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
  );
}
