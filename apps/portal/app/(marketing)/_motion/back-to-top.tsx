"use client";

// BackToTop — floating button kanan bawah, muncul setelah user scroll
// 500px dari top. Click → smooth scroll ke top.
//
// Pattern SSR-safe mounted-gate: pre-hydration render plain button
// hidden (no mismatch), post-hydration swap ke motion.button dengan
// whileHover/whileTap. Pakai motion's `useScroll` + `useMotionValue`
// untuk trigger visibility based on scrollY.
//
// A11y: aria-label jelas ("Kembali ke atas"), focus-visible ring.
// Reduced motion: scroll pakai instant jump (smooth scroll di-handle
// oleh CSS scroll-behavior: smooth di html, tapi respects reduced-motion).

import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { useShouldAnimate } from "@/hooks/use-should-animate";

const VISIBILITY_THRESHOLD = 500; // px

export function BackToTop() {
  // Custom hook bypass motion warning.
  const shouldAnimate = useShouldAnimate();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // useScroll untuk track scrollY progress (0..1 across page).
  // Pakai spring untuk smooth-out value supaya visibility toggle tidak
  // terlalu abrupt di threshold.
  const { scrollY } = useScroll();
  const smoothScrollY = useSpring(scrollY, { stiffness: 200, damping: 30 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsub = smoothScrollY.on("change", (v) => {
      setVisible(v > VISIBILITY_THRESHOLD);
    });
    return unsub;
  }, [smoothScrollY]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: shouldAnimate ? "smooth" : "auto",
    });
  };

  // Pre-hydration: render plain hidden button. Aman secara SSR karena
  // hidden + no event listener (event listener di useEffect).
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Kembali ke atas"
        className="back-to-top"
        style={{ opacity: 0, pointerEvents: "none" }}
        onClick={scrollToTop}
      >
        <ArrowUpIcon />
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      aria-label="Kembali ke atas"
      onClick={scrollToTop}
      className="back-to-top"
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        scale: visible ? 1 : 0.8,
        y: visible ? 0 : 20,
      }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: visible ? "auto" : "none" }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
    >
      <ArrowUpIcon />
    </motion.button>
  );
}

// Inline arrow icon — tidak depend ke Icon component (yang bundle besar)
// untuk fitur kecil ini. Simple SVG dengan Lucide-style.
function ArrowUpIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
