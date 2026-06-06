"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  /** Direction of entrance motion */
  from?: "up" | "down" | "left" | "right" | "fade";
  /** Stagger children inside (set on parent) */
  stagger?: number;
  className?: string;
  /** Threshold for IntersectionObserver (0–1) */
  threshold?: number;
  /** Re-trigger when re-entering viewport */
  once?: boolean;
}

/**
 * Reveal: animates children into view when they enter the viewport.
 * Uses IntersectionObserver + CSS transform. Disabled when
 * `prefers-reduced-motion` is set — content shows immediately.
 */
export function Reveal({
  children,
  delay = 0,
  from = "up",
  threshold = 0.15,
  once = true,
  className = "",
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect reduced-motion preference
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  const initial =
    from === "up"
      ? "translate3d(0, 28px, 0)"
      : from === "down"
        ? "translate3d(0, -28px, 0)"
        : from === "left"
          ? "translate3d(-28px, 0, 0)"
          : from === "right"
            ? "translate3d(28px, 0, 0)"
            : "translate3d(0, 0, 0)";

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "reveal-in" : ""} ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate3d(0, 0, 0)" : initial,
        transition: `opacity 700ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 700ms cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/** Convenience: stagger children reveal. Wrap children in <Reveal> and they'll appear one after another. */
export function StaggerGroup({
  children,
  className = "",
  baseDelay = 0,
  step = 100,
}: {
  children: ReactNode;
  className?: string;
  baseDelay?: number;
  step?: number;
}) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <Reveal key={i} delay={baseDelay + i * step} from="up">
              {child}
            </Reveal>
          ))
        : <Reveal from="up">{children}</Reveal>}
    </div>
  );
}
