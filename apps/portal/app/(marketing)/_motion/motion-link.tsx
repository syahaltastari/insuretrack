"use client";

/**
 * MotionLink — anchor/Link dengan hover scale + tap micro-interaction.
 *
 * Pakai untuk CTA primary yang butuh feel interaktif premium. Tap
 * feedback (scale 0.98) kasih sensi "ditekan". Hover scale 1.03 → subtle
 * saja, tidak berlebihan.
 *
 * Pure Tailwind `transition-transform duration-300` di-handle oleh
 * className caller; framer-motion hanya orchestrate scale via spring.
 *
 * A11y: respect `useReducedMotion()` → no scale animation.
 */

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { type ReactNode } from "react";
import { SPRING } from "../_lib/animations";

type MotionLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
} & Omit<HTMLMotionProps<"a">, "href">;

export function MotionLink({ children, className, href, ...rest }: MotionLinkProps) {
  const reduced = useReducedMotion();

  return (
    <motion.a
      href={href}
      className={className}
      whileHover={reduced ? undefined : { scale: 1.03 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={SPRING}
      {...rest}
    >
      {children}
    </motion.a>
  );
}
