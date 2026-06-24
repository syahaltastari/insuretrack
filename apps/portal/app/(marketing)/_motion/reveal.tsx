"use client";

/**
 * Reveal — minimal Web Animations API trigger.
 *
 * Simplify total: langsung panggil `el.animate()` di useEffect tanpa
 * rAF, IO, atau reduced motion check. Tujuannya: verify apakah
 * `el.animate` benar-benar jalan di browser user.
 */

import { useEffect, useRef, type ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Delay dalam detik. Default 0. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      console.warn("[Reveal] no ref");
      return;
    }

    console.log("[Reveal] useEffect fired, calling el.animate directly");

    try {
      const anim = el.animate(
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
      console.log("[Reveal] animation started, playbackState:", anim.playState);
    } catch (err) {
      console.error("[Reveal] el.animate threw error:", err);
    }
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}