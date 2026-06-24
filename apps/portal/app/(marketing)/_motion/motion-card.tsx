"use client";

/**
 * MotionCard — wrapper card dengan hover lift (y: -4px) pakai motion.dev.
 *
 * Pakai `motion.div` dengan `whileHover` dan `whileTap`. Entrance
 * animation di-handle parent (StaggerGroup/Reveal) via CSS — di sini
 * fokus pada interaksi hover/tap. Tidak ada `initial`/`animate`, jadi
 * tidak ada SSR/hydration issue.
 */

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 240, damping: 24, mass: 0.6 };

export function MotionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      whileHover={{ y: -4 }}
      whileTap={{ y: -2, scale: 0.99 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}