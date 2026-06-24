"use client";

/**
 * MotionLink — anchor dengan hover scale + tap micro-interaction.
 *
 * ## CSS-based (sebelumnya framer-motion)
 *
 * Hover-only animation, no entrance — pakai CSS class `.hover-scale`
 * saja. Lebih ringan (no JS), lebih predictable, zero hydration risk.
 */

import { type ReactNode } from "react";

type MotionLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
};

export function MotionLink({ children, className, href }: MotionLinkProps) {
  return (
    <a href={href} className={`hover-scale ${className ?? ""}`}>
      {children}
    </a>
  );
}
