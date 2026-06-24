"use client";

/**
 * StaggerGroup — wraps children dengan Web Animations API stagger.
 *
 * Sama rationale dengan Reveal: pure JS animation, zero CSS dependency.
 * Parent observe viewport; setelah in-view, trigger animation di tiap
 * child wrapper dengan per-child delay untuk stagger effect.
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
    if (!parent) {
      console.warn("[StaggerGroup] ref.current is null");
      return;
    }

    console.log("[StaggerGroup] mounted, will animate", parent.children.length, "children");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const childWrappers = Array.from(parent.children) as HTMLElement[];

    if (reduced) {
      childWrappers.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
      return;
    }

    const trigger = () => {
      console.log("[StaggerGroup] animating children");
      childWrappers.forEach((el, i) => {
        el.animate(
          [
            { opacity: 0, transform: "translateY(28px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: 700,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            delay: (baseDelay + i * step) * 1000,
            fill: "both",
          },
        );
      });
    };

    const rect = parent.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      requestAnimationFrame(trigger);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(trigger);
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
      {Children.map(children, (child) => (
        <div>{child}</div>
      ))}
    </div>
  );
}