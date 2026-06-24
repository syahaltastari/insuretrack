"use client";

/**
 * StaggerGroup — wraps children dengan motion stagger reveal.
 *
 * Pakai variants `container` + `item` untuk orchestrate stagger via
 * `staggerChildren` + `delayChildren`. motion v12 handle SSR untuk
 * variants propagation tanpa hydration mismatch.
 *
 * API publik: `step` (detik antar child), `baseDelay`, `className`.
 */

import { motion, useReducedMotion, type Variants } from "motion/react";
import { Children, type ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 28, mass: 0.8 };

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: SPRING },
};

export function StaggerGroup({
  children,
  className,
  step = 0.12,
  baseDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Detik antar child. Default 0.12s (120ms). */
  step?: number;
  /** Detik delay sebelum child pertama. Default 0s. */
  baseDelay?: number;
}) {
  const reduced = useReducedMotion();

  // Reduced motion: plain wrapper, no stagger overhead.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: step,
        delayChildren: baseDelay,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -8% 0px" }}
      variants={containerVariants}
      className={className}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}