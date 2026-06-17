"use client";

import * as React from "react";
import { cn } from "@insuretrack/api-client";

/**
 * FilterSelect — wrapper <select> dengan styling Clay filter bar.
 *
 * Styling konsisten dengan komponen filter lain (search input,
 * DateRangePicker trigger) via shared `.clay-filter-input` /
 * `.clay-filter-select` classes di globals.css. Tinggi (40px),
 * padding, font, border, dan background identik dengan input
 * sebelahnya di filter bar — tidak ada lagi inkonsistensi
 * per-element.
 *
 * Default option pattern: caller harus sediakan option pertama
 * dengan `value: ""` dan `label: "Semua" | "Pilih…" | dst`. Option
 * ini **tidak disabled** (admin boleh reset ke "Semua") dan tampil
 * sebagai default saat value === "".
 */
export type FilterSelectOption = {
  value: string;
  label: string;
};

export type FilterSelectProps = {
  /** Optional label (rendered as caption above the select). */
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  ariaLabel?: string;
  className?: string;
  /** Lebar default; number → px, string → nilai CSS. Default "auto". */
  width?: string | number;
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  ariaLabel,
  className,
  width = "auto",
}: FilterSelectProps) {
  return (
    <label className="inline-flex flex-col gap-1">
      {label && (
        <span className="text-xs uppercase tracking-wider text-warm-silver font-semibold">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={cn("clay-select", className)}
        style={{ width }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
