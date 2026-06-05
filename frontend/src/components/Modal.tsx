"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <dialog>-based modal.
 * - Closes on Esc (native) and backdrop click.
 * - `onClose` is called when the user dismisses (not when open prop changes).
 * - When `open` toggles to true we call showModal(); to false we close().
 * - The dialog's `close` event fires on Esc / dialog form method=close, so we
 *   route that back to onClose.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 640,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // When dialog fires its native `close` event (Esc, form[method=dialog]),
  // mirror it into our React state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onNativeClose = () => onClose();
    dlg.addEventListener("close", onNativeClose);
    return () => dlg.removeEventListener("close", onNativeClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="clay-modal"
      style={{ maxWidth }}
      // Click on dialog itself (not children) is treated as backdrop click.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="clay-modal-header">
        <h2 className="card-heading">{title}</h2>
        <button
          type="button"
          aria-label="Tutup"
          className="clay-modal-close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="clay-modal-body">{children}</div>
      {footer && <div className="clay-modal-footer">{footer}</div>}
    </dialog>
  );
}
