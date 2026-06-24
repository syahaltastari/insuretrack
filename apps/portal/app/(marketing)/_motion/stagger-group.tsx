"use client";

/**
 * StaggerGroup — wraps children dengan framer-motion stagger reveal.
 *
 * Setiap direct child diberi wrapper `<motion.div>` dengan variant
 * `FADE_UP`, lalu parent orchestrate stagger via `staggerChildren`.
 * Default: 120ms antar child, 100ms delay sebelum child pertama muncul.
 *
 * A11y: respect `useReducedMotion()` → render semua child instan.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Children, type ReactNode } from "react";
import { FADE_UP, STAGGER_PARENT, VIEWPORT_ONCE } from "../_lib/animations";

export function StaggerGroup({
  children,
  className,
  step = 0.12,
  baseDelay = 0.1,
}: {
  children: ReactNode;
  className?: string;
  /** Detik antar child. Default 0.12s (120ms). */
  step?: number;
  /** Detik delay sebelum child pertama. Default 0.1s. */
  baseDelay?: number;
}) {
  const reduced = useReducedMotion();
  const parentVariants: Variants = {
    ...STAGGER_PARENT,
    visible: {
      transition: { staggerChildren: step, delayChildren: baseDelay },
    },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={reduced ? undefined : parentVariants}
      className={className}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={reduced ? undefined : FADE_UP}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
