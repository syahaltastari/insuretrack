"use client";

// StaggerGroup — parent wrapper untuk orchestrated child reveal.
//
// SSR-safe: pre-hydration, render plain div dengan children visible
// (mounted gate). Post-hydration, swap ke motion.div dengan variants
// (STAGGER_PARENT orchestrates child timing, FADE_UP drives each
// child's animation). Trade-off: brief micro-flash di first paint
// (~16ms) saat swap, tapi no hydration mismatch.
//
// Pakai variants existing dari `../_lib/animations` (STAGGER_PARENT,
// FADE_UP, VIEWPORT_ONCE) — single source of truth.

import { motion } from "motion/react";
import { Children, useEffect, useState, type ReactNode } from "react";
import { FADE_UP, STAGGER_PARENT, VIEWPORT_ONCE } from "../_lib/animations";
import { useShouldAnimate } from "@/hooks/use-should-animate";

type StaggerGroupProps = {
  children: ReactNode;
  className?: string;
  /** Detik antar child. Default 0.08s (80ms) — snappier dari hero 120ms. */
  step?: number;
  /** Detik delay sebelum child pertama. Default 0.1s. */
  baseDelay?: number;
};

export function StaggerGroup({
  children,
  className,
  step = 0.08,
  baseDelay = 0.1,
}: StaggerGroupProps) {
  const [mounted, setMounted] = useState(false);
  // Custom hook (bukan motion's useReducedMotion) — no warning.
  const shouldAnimate = useShouldAnimate();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reduced motion atau pre-hydration: render plain, no animation.
  if (!shouldAnimate || !mounted) {
    return <div className={className}>{children}</div>;
  }

  // Override STAGGER_PARENT timing dengan props custom.
  const parentVariants = {
    ...STAGGER_PARENT,
    visible: {
      transition: { staggerChildren: step, delayChildren: baseDelay },
    },
  };

  return (
    <motion.div
      className={className}
      variants={parentVariants}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={FADE_UP}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
