"use client";

/**
 * StaggerGroup — wraps children dengan CSS-based stagger reveal.
 *
 * Sama dengan Reveal: gunakan direct DOM manipulation +
 * requestAnimationFrame untuk ensure CSS transition fire dengan benar.
 *
 * Parent wrapper adalah plain `<div>` dengan className dari caller
 * (mis. `clay-grid cols-3`). Tiap child dibungkus plain `<div>` dengan
 * `transitionDelay` per index untuk stagger effect.
 */

import { Children, useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const parent = ref.current;
    if (!parent) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Tambah reveal-in ke semua child wrappers langsung
      parent.querySelectorAll(".reveal").forEach((el) => el.classList.add("reveal-in"));
      return;
    }

    const rect = parent.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      requestAnimationFrame(() => {
        parent.querySelectorAll(".reveal").forEach((el) => el.classList.add("reveal-in"));
      });
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => {
            parent.querySelectorAll(".reveal").forEach((el) => el.classList.add("reveal-in"));
          });
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
      {Children.map(children, (child, i) => (
        <div
          className="reveal"
          style={{ transitionDelay: `${baseDelay + i * step}s` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}