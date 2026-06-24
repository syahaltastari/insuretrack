"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis Framer Motion.
 *
 * Replaces `apps/portal/components/Reveal.tsx` lama (CSS-only + manual
 * IntersectionObserver).
 *
 * ## Hydration safety
 *
 * Pakai **custom `useState` + `IntersectionObserver`** (bukan framer-motion's
 * `useInView`) dan **plain `{opacity, y}` animate values** (bukan variants).
 * Alasan:
 *
 *   1. framer-motion v11 `useInView` + `variants` punya behavior yang tidak
 *      deterministik antara SSR dan client first render di React 19 —
 *      motion.div di server render dengan `style="opacity:0; transform:..."`
 *      tapi di client first render bisa render tanpa style (visible state)
 *      karena "optimized appear" + variants propagation. Hasil: hydration
 *      mismatch.
 *
 *   2. Dengan pattern di bawah:
 *      - `initial` dan `animate` (saat `shouldAnimate=false`) **IDENTIK**
 *        → server HTML match client first render
 *      - Hanya setelah `useEffect` + IO fires, `setShouldAnimate(true)`
 *        → animate target berubah → framer-motion transition normal
 *
 *   3. `useReducedMotion()` early-return plain `<div>` — no animation overhead.
 *
 * API publik identik dengan Reveal lama: `delay`, `from`, `className`.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
  delay?: number;
  from?: Direction;
  className?: string;
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

  // Reduced motion: render plain div, no animation.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const hidden = hiddenFor(from);
  const visible = visibleFor(from);

  return (
    <motion.div
      ref={ref}
      initial={hidden}
      // Saat `shouldAnimate=false`: animate = hidden (SAMA dengan initial) → no mismatch.
      // Setelah IO fires: animate = visible → framer-motion transition normal.
      animate={shouldAnimate ? visible : hidden}
      transition={{ ...SPRING, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
