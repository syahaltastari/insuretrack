"use client";

/**
 * StaggerGroup — wraps children dengan framer-motion stagger reveal.
 *
 * Setiap direct child diberi wrapper `<motion.div>` dengan plain animate
 * values `{opacity, y}`. Parent orchestrate timing via per-child `delay`
 * (index × step) — BUKAN via `staggerChildren` variant, supaya lebih
 * predictable dan SSR-safe.
 *
 * ## Hydration safety
 *
 * Sama dengan `reveal.tsx`: custom `useState` + `IntersectionObserver`
 * (bukan framer-motion's `useInView`), plain animate values (bukan
 * variants). `initial` === `animate` saat `shouldAnimate=false` →
 * identical tree server vs client first render.
 *
 * A11y: respect `useReducedMotion()` → render plain wrapper, no stagger.
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
  /** Detik delay sebelum child pertama. Default 0s (handled by Hero sequencing). */
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

  // Reduced motion: render plain wrapper, no stagger.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) => (
        <motion.div
          key={i}
          initial={HIDDEN}
          animate={shouldAnimate ? VISIBLE : HIDDEN}
          transition={{ ...SPRING, delay: baseDelay + i * step }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
