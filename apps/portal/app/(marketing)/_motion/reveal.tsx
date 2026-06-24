"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis Framer Motion.
 *
 * ## Hydration safety (FINAL fix)
 *
 * framer-motion v11 punya fitur "optimized appear": ketika element
 * rendered dengan `initial` non-default DAN element ada di viewport
 * pada saat mount, framer-motion **skip initial state** dan langsung
 * apply animate target. Tujuannya: hindari flash pre-animation state.
 *
 * Konsekuensi untuk SSR:
 *   - Server: render `<motion.div>` dengan `style="opacity:0; transform:..."` (initial state)
 *   - Client mount: optimized appear kick in → render `<motion.div>` TANPA style (animate target)
 *   - React hydration mismatch!
 *
 * Fix: set `initial={false}` untuk DISABLE optimized appear. Dengan
 * `initial={false}`, framer-motion pakai `animate` sebagai current
 * state. Pada first render, `animate={hidden}` → element render
 * dengan hidden style (matches server). Setelah IO fires, `animate`
 * berubah ke `visible` → framer-motion animate dari hidden ke visible.
 *
 * API publik identik: `delay`, `from`, `className`.
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

  // Reduced motion: plain div, no overhead.
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const hidden = hiddenFor(from);
  const visible = visibleFor(from);

  return (
    <motion.div
      ref={ref}
      // `initial={false}` DISABLES optimized appear. framer-motion pakai
      // `animate` sebagai current state. Saat shouldAnimate=false (first
      // render server + client), animate=hidden → element rendered dengan
      // hidden style (matches server). Setelah IO fires, animate=visible →
      // transition normal.
      initial={false}
      animate={shouldAnimate ? visible : hidden}
      transition={{ ...SPRING, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
