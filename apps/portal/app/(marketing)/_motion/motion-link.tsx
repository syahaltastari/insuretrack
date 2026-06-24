"use client";

/**
 * MotionLink — anchor dengan hover scale + tap micro-interaction.
 *
 * Pakai motion.a dengan `whileHover` (scale 1.03) dan `whileTap`
 * (scale 0.98). Spring physics untuk feel premium.
 */

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { type ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 28, mass: 0.8 };

type MotionLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
} & Omit<HTMLMotionProps<"a">, "href">;

export function MotionLink({ children, className, href, ...rest }: MotionLinkProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <motion.a
      href={href}
      className={className}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING}
      {...rest}
    >
      {children}
    </motion.a>
  );
}