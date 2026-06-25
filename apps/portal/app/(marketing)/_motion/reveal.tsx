"use client";

// Reveal — entrance animation: fade + translateY + scale, fire on mount
// atau on viewport entry.
//
// SSR + React 19 hydration strategy:
//   - Pre-mount (SSR + first client render): render plain <div> visible.
//     Tidak ada inline style, jadi user lihat konten langsung.
//   - Post-mount (via useLayoutEffect — sync sebelum browser paint):
//     swap ke <motion.div> dengan `initial` = hidden state. Karena
//     useLayoutEffect jalan SEBELUM paint, swap terjadi "di balik layar"
//     — user tidak melihat snap visible→hidden. Yang mereka lihat:
//     blank sesaat (initial=hidden) → animation runs → visible.
//   - Smooth, no glitch, no flash.
//
// Kenapa `animate` bukan `whileInView` di aboveFold mode:
//   - Above-fold elements (Hero) harus animate begitu mount, tidak
//     menunggu scroll. `whileInView` ada race condition dengan IO setup
//     yang kadang delay fire 1-2 frame di initial load. `animate` dijamin
//     jalan saat mount — more reliable.
//   - Below-fold (default): `whileInView` lebih tepat — element stay
//     hidden sampai user scroll ke sana, baru animate in.
//
// Reduced motion handling:
//   - Pakai `useReducedMotion()` — baca dari MotionConfig context.
//   - MotionProvider di layout set `reducedMotion="never"` di dev,
//     `"user"` di prod. Single source of truth — components ini cukup
//     baca hook, tidak perlu tau env. Lihat components/motion-provider.tsx.
//
// Easing & magnitude:
//   - cubic-bezier(0.16, 1, 0.3, 1) = "easeOutExpo"-like, slightly snappier
//     dari easeOutQuint. Memberi feel "lempar masuk" — dramatic tapi
//     tidak bouncy.
//   - y: 60px + scale 0.96 → 1. Multi-dimensional motion yang JELAS
//     terasa di mata, bukan subtle drift.
//   - 1.0s duration — long enough untuk terasa deliberate, tidak lambat.

import { motion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { VIEWPORT_ONCE } from "../_lib/animations";
import { useShouldAnimate } from "@/hooks/use-should-animate";

// SSR-safe useLayoutEffect. Di server, useLayoutEffect emit warning
// (no-op). Pakai useEffect di server, useLayoutEffect di browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type RevealProps = {
  children: ReactNode;
  /** Delay dalam detik. Default 0. */
  delay?: number;
  className?: string;
  /** Pakai `animate` (immediate on mount) bukan `whileInView` (scroll).
      Set true untuk above-fold elements (Hero) yang harus entrance
      begitu page load. Default: false. */
  aboveFold?: boolean;
};

const HIDDEN = { opacity: 0, y: 60, scale: 0.96 };
const VISIBLE = { opacity: 1, y: 0, scale: 1 };
const TRANSITION_BASE = {
  duration: 1.0,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export function Reveal({
  children,
  delay = 0,
  className,
  aboveFold = false,
}: RevealProps) {
  // Mounted flag: true setelah first layout effect (i.e., browser ready
  // to render motion.div). Pre-mount kita render plain div supaya SSR
  // + first client render identik (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  // Pakai custom hook (bukan motion's useReducedMotion) untuk bypass
  // warning di dev. Lihat hooks/use-should-animate.ts untuk rationale.
  const shouldAnimate = useShouldAnimate();

  useIsomorphicLayoutEffect(() => {
    setMounted(true);
  }, []);

  // Honor reduced motion preference: render plain, no animation.
  // Pre-mount: plain visible div (no animation config applied yet).
  // Keduanya return div — pertama untuk a11y, kedua untuk hydration safety.
  if (!shouldAnimate || !mounted) {
    return <div className={className}>{children}</div>;
  }

  const transition = { ...TRANSITION_BASE, delay };

  if (aboveFold) {
    // Above-fold: animate immediately on mount. No viewport check.
    return (
      <motion.div
        className={className}
        initial={HIDDEN}
        animate={VISIBLE}
        transition={transition}
      >
        {children}
      </motion.div>
    );
  }

  // Below-fold: animate when scrolled into view. Element stays hidden
  // until IntersectionObserver fires.
  return (
    <motion.div
      className={className}
      initial={HIDDEN}
      whileInView={VISIBLE}
      viewport={VIEWPORT_ONCE}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
