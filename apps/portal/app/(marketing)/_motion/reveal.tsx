"use client";

/**
 * Reveal — scroll-reveal wrapper dengan WEB ANIMATIONS API.
 *
 * ## Pure JS animation, zero CSS/React state dependency
 *
 * Setelah berkali-kali pendekatan (motion, framer-motion, CSS class,
 * inline styles) gagal karena berbagai pipeline issues, kita pakai
 * Web Animations API langsung: `element.animate([from, to], options)`.
 *
 * Kenapa paling reliable:
 *   1. Tidak depend CSS file loading — animation dibuat via JS
 *   2. Tidak depend React state — animation langsung via DOM API
 *   3. Tidak kena Tailwind purge — animation bukan CSS class
 *   4. Browser-native — support semua modern browser
 *   5. `fill: 'both'` keep final state tanpa depend CSS
 *
 * Curve: cubic-bezier(0.22, 1, 0.36, 1) = ease-out-expo.
 * Identik secara visual dengan motion spring (stiffness 120, damping 28).
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

    console.log("[Reveal] mounted, triggering animation");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Langsung set visible state tanpa animation
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      return;
    }

    const trigger = () => {
      console.log("[Reveal] el.animate() fired, delay:", delay);
      el.animate(
        [
          { opacity: 0, transform: "translateY(28px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 700,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          delay: delay * 1000,
          fill: "both",
        },
      );
    };

    // Above-the-fold: langsung trigger setelah rAF
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      requestAnimationFrame(trigger);
      return;
    }

    // Below-the-fold: tunggu IO callback
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(trigger);
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
      {children}
    </div>
  );
}