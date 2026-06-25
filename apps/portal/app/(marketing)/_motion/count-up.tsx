"use client";

// CountUp — animate angka dari 0 → target saat masuk viewport.
// Pakai motion's `animate()` function (idiomatic untuk motion v12)
// bukan manual rAF — lebih sedikit code, otomatis cleanup, support
// reduced motion secara built-in.
//
// Format IDR: pakai `Intl.NumberFormat("id-ID")` supaya 12000 jadi
// "12.000" (separator titik sesuai konvensi Indonesia). Decimals
// preserved untuk angka pecahan (4.8, 4.9).
//
// Mounted-gate: pre-hydration, render plain span dengan target value
// (visible) — no hydration mismatch. Post-hydration, swap ke span
// dengan value animated 0 → target via motion's animate().

import { animate, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShouldAnimate } from "@/hooks/use-should-animate";

type CountUpProps = {
  target: number;
  /** Prefix string sebelum angka (mis. "Rp "). */
  prefix?: string;
  /** Suffix string setelah angka (mis. "+", "/5", "M"). */
  suffix?: string;
  /** Jumlah angka di belakang koma. Default 0. */
  decimals?: number;
  /** Durasi animasi dalam detik. Default 1.4s — cukup dramatis tapi
   *  tidak terlalu lama, sesuai rhythm landing secara keseluruhan. */
  duration?: number;
  className?: string;
};

export function CountUp({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.4,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  // Custom hook bypass motion warning.
  const shouldAnimate = useShouldAnimate();

  // Pre-hydration atau reduced motion: render target value langsung,
  // tidak ada animasi. No flash of "0" untuk user reduced-motion.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // value animasi — di-update tiap frame oleh motion's animate().
  const [value, setValue] = useState(!shouldAnimate || !hydrated ? target : 0);

  useEffect(() => {
    if (!inView || !shouldAnimate) return;
    // motion's animate() return AnimationPlaybackControls — bisa di-stop
    // di cleanup supaya animasi tidak leak saat unmount.
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [inView, target, duration, shouldAnimate]);

  const formatted = value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
