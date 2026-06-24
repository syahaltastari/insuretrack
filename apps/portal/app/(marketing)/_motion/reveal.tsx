"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis CSS transitions.
 *
 * ## Mengapa CSS, bukan framer-motion?
 *
 * framer-motion v11 + React 19 SSR punya fundamental incompatibility
 * untuk entrance animations: `motion.div` dengan `initial`/`animate`
 * trigger hydration mismatch di Next.js 15 + React 19 — server render
 * dengan style hidden, client mount skip ke visible (atau sebaliknya)
 * karena "optimized appear" + variants propagation quirks. Patch
 * apapun (variants, plain values, `initial={false}`) tidak eliminasi
 * mismatch ini secara konsisten.
 *
 * CSS transitions tidak punya masalah ini: class string sama persis
 * antara server dan client first render. Yang berbeda hanya toggle
 * `reveal-in` class post-mount — itu tidak trigger hydration check.
 *
 * Visual effect IDENTIK dengan framer-motion spring: durasi 700ms,
 * ease-out-expo curve, fade + slide-up 28px → 0.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Delay dalam detik. Default 0. Pakai 0.08, 0.18, 0.28 untuk sequence. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion — langsung visible tanpa animation.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "reveal-in" : ""} ${className ?? ""}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
