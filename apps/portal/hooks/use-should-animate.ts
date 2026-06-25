"use client";

// useShouldAnimate — custom reduced-motion detection yang bypass motion's
// warning. motion's built-in `useReducedMotion()` emit warning setiap kali
// dipanggil kalau OS reduced motion ON — itu mengganggu dev experience
// (kami develop dengan reduced motion ON untuk testing a11y).
//
// Strategy:
//   - Development:  SELALU animate (return true). Animations harus
//     visible untuk dev — tidak bisa verify perubahan visual kalau
//     di-skip karena OS setting.
//   - Production:   Respect OS `prefers-reduced-motion: reduce`. a11y
//     compliance — user dengan vestibular disorder tidak terganggu.
//
// Implementation:
//   - Pakai `window.matchMedia("(prefers-reduced-motion: reduce)")` —
//     Web API standard, tidak lewat motion library. No warning emitted.
//   - Initial state: `isDev ? true : false`. SSR-friendly (no hydration
//     mismatch karena sama antara server & client first render).
//   - useEffect: prod updates state based on OS preference. Dev stays
//     true regardless.
//   - Listen untuk OS preference changes (user bisa toggle di OS settings).
//
// Tradeoff:
//   - In prod, user dengan reduced motion OS melihat state flip dari
//     `false` (SSR default) ke `false` (OS confirms) — no change, no flash.
//   - In prod, user tanpa reduced motion melihat flip dari `false` (SSR)
//     ke `true` (OS confirms) — slight delay sebelum animation starts.
//     Acceptable karena animation = loading experience.
//   - In dev, no flip — always true from start.
//
// Why not motion's useReducedMotion():
//   - Emits warning on every call when OS reduced motion is ON.
//   - Long-term maintenance: warning noise clutters dev console,
//     makes it harder to spot real issues.

import { useEffect, useState } from "react";

const DEV_FORCE_ANIMATE = process.env.NODE_ENV !== "production";

export function useShouldAnimate(): boolean {
  // SSR + first client render: dev = true, prod = false.
  // Tidak ada mismatch karena sama antara server & client first render.
  const [shouldAnimate, setShouldAnimate] = useState(DEV_FORCE_ANIMATE);

  useEffect(() => {
    // Dev: always animate. useEffect untuk re-affirm state tapi no actual
    // detection. Cepat, no DOM read.
    if (DEV_FORCE_ANIMATE) {
      setShouldAnimate(true);
      return;
    }

    // Prod: respect OS preference. Pakai matchMedia untuk detect.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setShouldAnimate(!mq.matches);
    update(); // initial sync setelah mount

    // Listen untuk OS preference changes (user bisa toggle di OS).
    // Modern API: addEventListener. Older fallback: addListener (deprecated).
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Fallback untuk Safari < 14
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return shouldAnimate;
}
