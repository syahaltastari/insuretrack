"use client";

/**
 * Switch — iOS-style toggle. Stateless: parent owns `checked`.
 *
 *   <Switch checked={on} onChange={setOn} ariaLabel="Toggle X" />
 *
 * Visual: 44×24 track, 20×18 thumb, `--matcha-600` saat ON (konsisten
 * dengan semantic "approve" di design system per CLAUDE.md).
 *
 * Dipakai admin-only untuk sekarang; portal app bisa reuse untuk
 * preference user (notifications, dll).
 */

import { useId } from "react";

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
};

export function Switch({ checked, onChange, disabled, ariaLabel }: SwitchProps) {
  const id = useId();
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "1px solid var(--oat-border)",
        background: checked ? "var(--matcha-600)" : "var(--oat-light)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.18s ease",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "var(--pure-white)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          transition: "left 0.18s ease",
        }}
      />
    </button>
  );
}
