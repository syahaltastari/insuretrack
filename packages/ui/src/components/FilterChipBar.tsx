"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@insuretrack/api-client";

/**
 * FilterChipBar — baris chip "Active filter: [Status: UNPAID ✕] [Date: 1–15
 * Jun ✕] [Reset all]".
 *
 * Dipakai di bawah search/filter bar untuk menunjukkan filter yang
 * sedang aktif. Setiap chip punya tombol "✕" untuk menghapus 1 filter;
 * tombol "Reset all" di kanan menghapus semua.
 *
 * Styling: warm cream chip dengan oat border, ikon X di kanan.
 */
export type FilterChip = {
  /** Identifier unik (untuk key React). */
  key: string;
  /** Label yang ditampilkan, mis. "Status: UNPAID" atau "Date: 1–15 Jun". */
  label: string;
  /** Dipanggil saat user klik "✕" pada chip ini. */
  onRemove: () => void;
};

export type FilterChipBarProps = {
  chips: FilterChip[];
  /** Label "Reset all" — kalau tidak ada, tombol tidak muncul. */
  onResetAll?: () => void;
  /** Class tambahan untuk wrapper. */
  className?: string;
};

export function FilterChipBar({ chips, onResetAll, className }: FilterChipBarProps) {
  if (chips.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Filter aktif"
      className={cn(
        "flex flex-wrap items-center gap-2 mt-3",
        className
      )}
    >
      <span className="text-xs uppercase tracking-wider text-warm-silver font-semibold mr-1">
        Filter aktif:
      </span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)]",
            "bg-warm-cream border border-oat-border",
            "pl-3 pr-1.5 py-1 text-xs font-medium text-clay-black"
          )}
        >
          <span className="truncate max-w-[280px]">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Hapus filter ${chip.label}`}
            className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded-full",
              "text-warm-silver hover:bg-oat-light hover:text-clay-black",
              "transition-colors flex-shrink-0"
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {onResetAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onResetAll}
          className={cn(
            "text-xs font-semibold text-pomegranate-400 hover:underline",
            "ml-1 px-1"
          )}
        >
          Reset semua
        </button>
      )}
    </div>
  );
}
