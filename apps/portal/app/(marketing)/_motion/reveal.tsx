"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis Framer Motion.
 *
 * Replaces `apps/portal/components/Reveal.tsx` lama (CSS-only + manual
 * IntersectionObserver). API publik sengaja identik: `delay`, `from`,
 * `once`, `className`. Migrasi dari Reveal lama ke komponen ini TIDAK
 * butuh perubahan call-site kecuali `threshold` & `stagger` (tidak
 * di-support di sini — pakai `<StaggerGroup>` sebagai gantinya).
 *
 * A11y: respect `useReducedMotion()` → render konten instan tanpa motion.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { type ReactNode } from "react";
import { FADE_UP, FADE_IN, VIEWPORT_ONCE } from "../_lib/animations";

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
  const reduced = useReducedMotion();
  const variants: Variants = from === "fade" ? FADE_IN : FADE_UP;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ ...VIEWPORT_ONCE, once }}
      variants={reduced ? undefined : variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
