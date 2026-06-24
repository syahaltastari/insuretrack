"use client";

/**
 * Reveal — scroll-reveal wrapper dengan INLINE STYLES (no CSS class dep).
 *
 * ## Kenapa inline styles, bukan CSS class?
 *
 * Pendekatan CSS class (`.reveal` + `.reveal-in`) punya banyak potential
 * failure point di Next.js + Tailwind pipeline:
 *   1. CSS file mungkin tidak ter-bundle
 *   2. Tailwind content scan bisa purge class non-utility
 *   3. CSS specificity issue dari rule lain
 *   4. Browser cache serving versi lama
 *
 * Inline styles dijamin apply karena React set `style` attribute
 * langsung ke element DOM. Tidak ada CSS pipeline yang bisa interfere.
 *
 * Curve cubic-bezier(0.22, 1, 0.36, 1) = ease-out-expo, durasi 700ms.
 * Identik dengan motion spring (stiffness 120, damping 28) feel.
 *
 * Pakai `useState` + class toggle sederhana, plus `requestAnimationFrame`
 * untuk ensure browser paint initial state sebelum transition.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    // Untuk above-the-fold content, trigger langsung setelah frame paint.
    // Untuk below-the-fold, tunggu IO callback.
    const rect = el.getBoundingClientRect();
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
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Inline styles — dijamin apply, tidak depend CSS file/Tailwind purge.
  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(28px)",
    transition: `opacity 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}s, transform 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}s`,
    willChange: "opacity, transform",
  };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}