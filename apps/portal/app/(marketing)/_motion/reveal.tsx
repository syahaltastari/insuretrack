"use client";

/**
 * Reveal — scroll-reveal wrapper berbasis CSS transitions + direct DOM.
 *
 * ## Critical: requestAnimationFrame untuk trigger transition
 *
 * Naive approach (`useState` + className toggle) sering GAGAL trigger
 * CSS transition karena React batches state update dengan initial
 * render. Browser tidak sempat compute initial style (opacity:0)
 * sebelum class di-toggle ke reveal-in (opacity:1), sehingga tidak
 * ada property change yang perlu di-animate.
 *
 * Fix: gunakan `requestAnimationFrame` setelah mount untuk ensure
 * browser sudah render initial state, BARU tambah class `reveal-in`.
 * Dengan cara ini, browser melihat perubahan opacity:0 → opacity:1
 * sebagai distinct frames, dan transition fire.
 *
 * Plus: untuk above-the-fold content, langsung trigger animation
 * (cek via getBoundingClientRect) — tidak perlu tunggu IO callback
 * yang asynchronous.
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
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("reveal-in");
      return;
    }

    // Untuk above-the-fold content, trigger langsung setelah frame paint.
    // Untuk below-the-fold, tunggu IO callback.
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      // requestAnimationFrame ensure browser sudah paint initial state
      // (opacity:0, transform:translateY(28px)) SEBELUM kita add reveal-in.
      // Tanpa ini, transition tidak fire karena browser skip intermediate frame.
      requestAnimationFrame(() => {
        el.classList.add("reveal-in");
      });
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => {
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