"use client";

/**
 * StaggerGroup — wraps children dengan framer-motion stagger reveal.
 *
 * Setiap direct child diberi wrapper `<motion.div>` dengan variant
 * `FADE_UP`, lalu parent orchestrate stagger via `staggerChildren`.
 * Default: 120ms antar child, 100ms delay sebelum child pertama muncul.
 *
 * ## Hydration safety
 *
 * Sama dengan Reveal: pakai `useInView` + `animate`, BUKAN
 * `whileInView`. State `hidden` konsisten antara SSR dan client first
 * render; animasi trigger post-mount via `useInView` hook. Lihat
 * comment di `reveal.tsx` untuk penjelasan detail.
 *
 * A11y: respect `useReducedMotion()` → render semua child instan.
 */

import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { Children, useRef, type ReactNode } from "react";
import { FADE_UP, STAGGER_PARENT } from "../_lib/animations";

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
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.2, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const parentVariants: Variants = {
    ...STAGGER_PARENT,
    visible: {
      transition: { staggerChildren: step, delayChildren: baseDelay },
    },
  };

  // Reduced motion: render plain wrapper, no variants, no stagger.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={parentVariants}
      className={className}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={FADE_UP}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
