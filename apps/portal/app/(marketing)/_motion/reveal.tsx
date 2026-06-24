"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis motion (motion.dev).
 *
 * Pakai `motion.div` dengan `whileInView` — motion v12 punya internal
 * hydration handling yang TIDAK trigger mismatch seperti framer-motion
 * v11. Package `motion` adalah rewrite dari Matt Perry (author
 * framer-motion) yang fix fundamental SSR issue di v11.
 *
 * API publik: `delay` (detik), `from` (direction), `className`.
 */

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "fade";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 28, mass: 0.8 };

function hiddenFor(from: Direction) {
  if (from === "fade") return { opacity: 0 };
  if (from === "down") return { opacity: 0, y: -28 };
  if (from === "left") return { opacity: 0, x: -28 };
  if (from === "right") return { opacity: 0, x: 28 };
  return { opacity: 0, y: 28 }; // "up" default
}

function visibleFor(from: Direction) {
  if (from === "fade") return { opacity: 1 };
  if (from === "down" || from === "up") return { opacity: 1, y: 0 };
  return { opacity: 1, x: 0 }; // "left" | "right"
}

export function Reveal({
  children,
  delay = 0,
  from = "up",
  className,
}: {
  children: ReactNode;
  /** Delay dalam detik. Default 0. Pakai 0.08, 0.18, 0.28 untuk sequence. */
  delay?: number;
  from?: Direction;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Reduced motion: render plain div, no animation overhead.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={hiddenFor(from)}
      whileInView={visibleFor(from)}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -8% 0px" }}
      transition={{ ...SPRING, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}