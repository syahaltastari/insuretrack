"use client";

/**
 * MotionCard — wrapper card dengan hover lift (y: -4px).
 *
 * ## CSS-based (sebelumnya framer-motion)
 *
 * Hover-only animation tidak punya hydration issue (tidak ada
 * entrance animation, tidak ada initial/animate prop). Tapi untuk
 * konsistensi dengan Reveal/StaggerGroup dan zero JS overhead,
 * pakai CSS class `.hover-lift` saja.
 *
 * Entrance animation di-handle parent (StaggerGroup atau Reveal)
 * — komponen ini fokus pada HOVER state.
 */

import { type ReactNode } from "react";

export function MotionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`hover-lift ${className ?? ""}`}>{children}</div>;
}
