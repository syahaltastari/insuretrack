"use client";

/**
 * Modal alert modern untuk form submission feedback. Pakai Radix
 * AlertDialog primitives (sudah ada di packages/ui) — bukan `Confirm`
 * (yang destructive-only).
 *
 * Variant:
 *   - success → matcha (hijau)
 *   - warning → lemon (kuning)
 *   - error   → pomegranate (merah)
 *   - info    → ube (ungu)
 *
 * Pakai pattern:
 *   <ResultDialog
 *     open={!!result}
 *     onOpenChange={...}
 *     variant="error"
 *     title="..."
 *     description="..."
 *   />
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@insuretrack/ui";

export type ResultVariant = "success" | "warning" | "error" | "info";

interface ResultDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  variant: ResultVariant;
  title: string;
  description?: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
}

const VARIANT_STYLE: Record<
  ResultVariant,
  { bg: string; accent: string; emoji: string }
> = {
  success: { bg: "var(--matcha-300)", accent: "var(--matcha-600)", emoji: "✓" },
  warning: { bg: "var(--lemon-400)", accent: "var(--lemon-700)", emoji: "⚠" },
  error: {
    bg: "var(--pomegranate-400)",
    accent: "var(--pomegranate-400)",
    emoji: "✕",
  },
  info: { bg: "var(--ube-300)", accent: "var(--ube-800)", emoji: "ℹ" },
};

export function ResultDialog({
  open,
  onOpenChange,
  variant,
  title,
  description,
  primaryLabel = "OK",
  onPrimary,
}: ResultDialogProps) {
  const v = VARIANT_STYLE[variant];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {/* Header band — full-width colored band dengan emoji icon besar.
            Pull margin negative untuk align ke edge AlertDialogContent
            padding (24px). Konsisten dengan clay design system. */}
        <div
          style={{
            display: "grid",
            placeItems: "center",
            padding: "20px 16px",
            background: v.bg,
            borderRadius: "var(--radius-card) var(--radius-card) 0 0",
            margin: "-24px -24px 0 -24px",
          }}
        >
          <span
            style={{
              fontSize: "2.25rem",
              color: "var(--clay-black)",
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            {v.emoji}
          </span>
        </div>
        <AlertDialogHeader style={{ paddingTop: 16 }}>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              {typeof description === "string" ? (
                <p style={{ marginTop: 8, lineHeight: 1.55 }}>{description}</p>
              ) : (
                description
              )}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              onPrimary?.();
              onOpenChange(false);
            }}
          >
            {primaryLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
