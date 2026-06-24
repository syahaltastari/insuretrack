"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis CSS transitions.
 *
 * ## Mengapa CSS, bukan motion.dev?
 *
 * Motion v12 + React 19 + Next.js 15 SSR masih punya fundamental
 * incompatibility untuk pattern entrance dengan `initial` +
 * `whileInView` + variants. Server render motion.div dengan style
 * hidden, client mount apply animate state instan, React 19 strict
 * hydration check tangkap mismatch.
 *
 * CSS transitions aman untuk SSR: class string sama persis antara
 * server dan client first render. Yang berbeda hanya toggle
 * 'reveal-in' class post-mount — itu tidak trigger hydration check.
 *
 * Curve cubic-bezier(0.22, 1, 0.36, 1) = ease-out-expo, durasi 700ms.
 * Identik secara visual dengan motion spring (stiffness 120, damping 28).
 *
 * Note: motion.dev tetap dipakai di MotionCard (hover lift) dan
 * MotionLink (hover scale + tap) — komponen itu tidak punya entrance
 * animation, jadi tidak ada SSR issue.
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