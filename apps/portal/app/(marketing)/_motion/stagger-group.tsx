"use client";

/**
 * StaggerGroup — wraps children dengan inline-style stagger reveal.
 *
 * Sama dengan Reveal: inline styles untuk bypass CSS pipeline issues.
 * Parent observe viewport; setelah in-view, toggle visible state di
 * setiap child wrapper dengan `transitionDelay` per index.
 */

import {
  Children,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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
    const parent = ref.current;
    if (!parent) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    const rect = parent.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => setVisible(true));
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(parent);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) => {
        const delay = baseDelay + i * step;
        const style: CSSProperties = {
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(28px)",
          transition: `opacity 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}s, transform 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}s`,
          willChange: "opacity, transform",
        };
        return (
          <div style={style}>
            {child}
          </div>
        );
      })}
    </div>
  );
}