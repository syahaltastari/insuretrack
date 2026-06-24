"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis Framer Motion.
 *
 * Replaces `apps/portal/components/Reveal.tsx` lama (CSS-only + manual
 * IntersectionObserver). API publik identik: `delay`, `from`, `once`,
 * `className`.
 *
 * ## Hydration safety
 *
 * Pakai pattern `useInView` + `animate`, BUKAN `whileInView`. Alasan:
 * framer-motion v11's `whileInView` punya "optimized appear" feature
 * yang detect element in-viewport di first client render dan langsung
 * apply `visible` state. Akibatnya server render `hidden` (opacity: 0,
 * transform: translateY(28px)) tapi client first render `visible`
 * (style: {}) → React hydration mismatch.
 *
 * Dengan `useInView` + `animate`:
 *   - Server:        initial="hidden" → style opacity 0 + transform
 *   - Client mount:  initial="hidden" (SAMA) → no mismatch
 *   - Post-mount:    useInView hook fires → animate ke "visible"
 *   - User scroll:   useInView fires (below-fold) → animate ke "visible"
 *
 * A11y: respect `useReducedMotion()` → no animation.
 */

import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { FADE_UP, FADE_IN } from "../_lib/animations";

type Direction = "up" | "down" | "left" | "right" | "fade";

export function Reveal({
  children,
  delay = 0,
  from = "up",
  once = true,
  className,
}: {
  children: ReactNode;
  delay?: number;
  from?: Direction;
  once?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once, amount: 0.2, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const variants: Variants = from === "fade" ? FADE_IN : FADE_UP;

  // Reduced motion: render plain div, no motion, no intersection work.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
