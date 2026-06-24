"use client";

/**
 * StaggerGroup — wraps children dengan CSS-based stagger reveal.
 *
 * Sama rationale dengan `reveal.tsx`: pakai CSS transitions, bukan
 * framer-motion. Parent observe viewport; setelah in-view, toggle
 * `reveal-in` di setiap child wrapper dengan `transitionDelay` per
 * index untuk efek stagger.
 *
 * Parent wrapper adalah plain `<div>` dengan `className` dari caller
 * (mis. `clay-grid cols-3`) — tidak dibungkus motion.div.
 */

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) => (
        <div
          className={`reveal ${visible ? "reveal-in" : ""}`}
          style={{ transitionDelay: `${baseDelay + i * step}s` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
