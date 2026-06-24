"use client";

/**
 * MotionCard — card wrapper dengan hover lift (y: -4px).
 *
 * Entrance animation di-handle parent (`StaggerGroup` atau `Reveal`).
 * Komponen ini fokus pada HOVER state: angkat card 4px saat hover,
 * spring settle kembali saat mouse leave. Tambahan micro-interaction
 * via Tailwind `transition-shadow` di className caller.
 *
 * Bukan untuk card statis (mis. section label card) — hanya untuk
 * card interaktif yang clickable.
 *
 * A11y: respect `useReducedMotion()` → no lift animation.
 */

import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";
import { SPRING } from "../_lib/animations";

export function MotionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : { y: -4 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}
