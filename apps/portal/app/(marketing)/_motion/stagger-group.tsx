"use client";

/**
 * StaggerGroup — wraps children dengan framer-motion stagger reveal.
 *
 * ## Hydration safety
 *
 * Sama dengan `reveal.tsx`: `initial={false}` untuk disable optimized
 * appear. Tiap child motion.div pakai `animate=HIDDEN` di first render
 * (server + client match), lalu animate=VISIBLE setelah IO fires.
 *
 * Parent wrapper adalah plain `<div>` (bukan motion.div) supaya
 * className `clay-grid cols-3` tidak kena SSR framer-motion quirks.
 *
 * A11y: respect `useReducedMotion()` → render plain wrapper.
 */

import { motion, useReducedMotion } from "framer-motion";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 28, mass: 0.8 };
const HIDDEN = { opacity: 0, y: 28 };
const VISIBLE = { opacity: 1, y: 0 };

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
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldAnimate(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduced]);

  // Reduced motion: plain wrapper, no stagger overhead.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) => (
        <motion.div
          key={i}
          // `initial={false}` disables optimized appear. Tiap child
          // render dengan animate=HIDDEN di first render (server +
          // client match). Setelah IO fires di parent, animate
          // berubah ke VISIBLE dengan per-child delay = i*step.
          initial={false}
          animate={shouldAnimate ? VISIBLE : HIDDEN}
          transition={{ ...SPRING, delay: baseDelay + i * step }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
