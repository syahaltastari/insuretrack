"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { buttonVariants } from "./button";
import { cn } from "@insuretrack/api-client";

/**
 * Reusable shadcn-style confirmation dialog. Renders the `trigger` as the
 * trigger element, and opens an AlertDialog with the given title/description
 * when clicked. `onConfirm` fires when the user confirms.
 *
 * Use this everywhere instead of `window.confirm()` so the UX is consistent
 * with the rest of the design system.
 *
 *   <Confirm
 *     trigger={<Button variant="destructive">Hapus</Button>}
 *     title="Hapus klien?"
 *     description="Klien akan dihapus permanen."
 *     confirmLabel="Hapus"
 *     destructive
 *     onConfirm={handleDelete}
 *   />
 */
export function Confirm({
  trigger,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  destructive = false,
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
  /** Controlled mode. If omitted, AlertDialog manages its own open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              {typeof description === "string" ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
            onClick={(e) => {
              // If onConfirm is async, Radix's onClick won't await — that's
              // fine for confirmation UX (the user gets the toast feedback).
              void Promise.resolve(onConfirm?.());
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
