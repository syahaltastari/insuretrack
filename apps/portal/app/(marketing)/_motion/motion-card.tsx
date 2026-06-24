"use client";

/**
 * MotionCard — wrapper card dengan hover lift (y: -4px).
 *
 * Pakai motion.div dengan `whileHover` dan `whileTap` untuk interaksi
 * premium. Entrance animation di-handle parent (Reveal/StaggerGroup).
 */

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 28, mass: 0.8 };

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
      whileTap={{ y: -2 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}