"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Sonner toaster — drop <Toaster /> once in the root layout. Use the
 * `toast.success` / `toast.error` / `toast.info` helpers anywhere.
 *
 * Color theme is wired to our CSS variables (warm cream + dark text).
 */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "var(--pure-white)",
          color: "var(--clay-black)",
          border: "1px solid var(--oat-border)",
          fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        },
      }}
    />
  );
}
