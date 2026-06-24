"use client";

/**
 * Reveal — scroll-reveal wrapper dengan CSS transitions + debug logging.
 */

import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      console.warn("[Reveal] ref.current is null");
      return;
    }

    console.log("[Reveal] mounted", { classList: el.className });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      console.log("[Reveal] reduced motion — adding reveal-in immediately");
      el.classList.add("reveal-in");
      return;
    }

    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    console.log("[Reveal] viewport check", { inViewport, rect });

    if (inViewport) {
      requestAnimationFrame(() => {
        console.log("[Reveal] adding reveal-in (above-fold)", el.className);
        el.classList.add("reveal-in");
      });
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        console.log("[Reveal] IO callback", { isIntersecting: entry.isIntersecting });
        if (entry.isIntersecting) {
          requestAnimationFrame(() => {
            console.log("[Reveal] adding reveal-in (scrolled)", el.className);
            el.classList.add("reveal-in");
          });
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
      className={`reveal ${className ?? ""}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}