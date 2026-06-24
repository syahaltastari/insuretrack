// Shared framer-motion variants & transitions untuk landing page InsureTrack.
//
// Aturan desain motion:
//   - Spring "premium": stiffness cukup responsif, damping TINGGI untuk no-bounce.
//   - Durasi entrance ~600-800ms (tidak terlalu cepat, tidak lambat).
//   - Easing fallback `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo) untuk fade.
//   - Viewport trigger 20% masuk viewport, sekali saja, dengan bottom margin
//     -8% supaya animasi start SEBELUM elemen fully in view (smooth feel).
//
// Dipakai oleh semua component di `_motion/*` dan section di `_sections/*`.

import type { Variants, Transition } from "framer-motion";

/** Spring "premium" — gerakan lambat, settle tenang, no bounce. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 28,
  mass: 0.8,
};

/** Fallback easing untuk motion yang tidak butuh spring (mis. fade-only). */
export const EASE_OUT_EXPO: Transition = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
};

/** Fade-up entrance: y dari 28px → 0, opacity 0 → 1. */
export const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: SPRING },
};

/** Pure fade (no Y translation). Untuk badge, eyebrow, atau elemen kecil. */
export const FADE_IN: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: EASE_OUT_EXPO },
};

/** Parent variant untuk stagger. Child variant `FADE_UP` akan auto-stagger. */
export const STAGGER_PARENT: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

/** Default viewport trigger — 20% elemen masuk viewport, sekali saja. */
export const VIEWPORT_ONCE = {
  once: true,
  amount: 0.2,
  margin: "0px 0px -8% 0px",
} as const;
