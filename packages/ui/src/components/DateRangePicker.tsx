"use client";

import * as React from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@insuretrack/api-client";

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

/**
 * DateRangePicker — admin filter composite.
 *
 * Trigger: button yang menampilkan label ringkas ("10–15 Jun 2026" atau
 * "Pilih tanggal…" atau "—"). Klik → popover dengan 4 preset chip
 * (Hari ini / 7 hari / Bulan ini / Tahun ini) di atas + range calendar
 * (2 bulan side-by-side di desktop, 1 bulan di mobile via rdp default).
 *
 * Behavior:
 * - Preset chip: langsung set from + to (to = end-of-day untuk
 *   inklusif).
 * - Calendar range: dari rdp `mode="range"`. Pilih start dulu, lalu
 *   end. Klik lagi start akan reset.
 * - Apply: setiap perubahan (preset atau range) auto-apply ke onChange,
 *   tidak ada tombol "Terapkan" eksplisit (klik chip / pilih tanggal
 *   langsung commit). UX lebih cepat untuk filter inline.
 * - Reset: tombol "Reset" di footer popover + tombol "✕" di trigger
 *   ketika ada nilai.
 *
 * Display: `id-ID` locale dengan format "d MMM yyyy" ("10 Jun 2026").
 */
export type DateRangeValue = { from?: Date; to?: Date };

export type DateRangePickerProps = {
  /** Controlled value. `undefined` saat filter tidak aktif. */
  value?: DateRangeValue;
  /** Dipanggil setiap ada perubahan. `undefined` saat user reset. */
  onChange: (range: DateRangeValue | undefined) => void;
  /** Placeholder saat tidak ada nilai. Default: "Pilih tanggal…". */
  placeholder?: string;
  /** Tampilkan tombol Reset di footer popover. Default: true. */
  showReset?: boolean;
  /** Lebar trigger. Default: auto. */
  className?: string;
  /** ARIA label untuk trigger. */
  ariaLabel?: string;
};

const PRESETS: Array<{ label: string; getValue: () => DateRangeValue }> = [
  {
    label: "Hari ini",
    getValue: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { from: today, to: end };
    },
  },
  {
    label: "7 hari terakhir",
    getValue: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    },
  },
  {
    label: "Bulan ini",
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: start, to: end };
    },
  },
  {
    label: "Tahun ini",
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { from: start, to: end };
    },
  },
];

function formatRange(range: DateRangeValue | undefined): string {
  if (!range?.from) return "";
  if (!range.to) {
    return format(range.from, "d MMM yyyy", { locale: idLocale });
  }
  // Same month → "10–15 Jun 2026". Different month → "10 Jun – 5 Jul 2026".
  if (
    range.from.getFullYear() === range.to.getFullYear() &&
    range.from.getMonth() === range.to.getMonth()
  ) {
    return `${format(range.from, "d", { locale: idLocale })}–${format(
      range.to,
      "d MMM yyyy",
      { locale: idLocale }
    )}`;
  }
  return `${format(range.from, "d MMM", { locale: idLocale })} – ${format(
    range.to,
    "d MMM yyyy",
    { locale: idLocale }
  )}`;
}

function toRdpRange(range: DateRangeValue | undefined): DateRange | undefined {
  if (!range?.from) return undefined;
  return { from: range.from, to: range.to };
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal…",
  showReset = true,
  className,
  ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  // Local working copy so the calendar can be played with without
  // committing on every keystroke. Applied on Apply button click OR
  // on any preset chip click (presets are explicit single-click actions).
  const [draft, setDraft] = React.useState<DateRangeValue | undefined>(value);

  // Reset draft to value when popover opens (in case user opens, plays,
  // then closes without applying).
  React.useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasValue = Boolean(value?.from);
  const label = hasValue ? formatRange(value) : placeholder;
  const draftHasValue = Boolean(draft?.from);

  const applyDraft = () => {
    onChange(draft);
    setOpen(false);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const next = preset.getValue();
    setDraft(next);
    onChange(next);
    setOpen(false);
  };

  const reset = () => {
    setDraft(undefined);
    onChange(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "Pilih rentang tanggal"}
          className={cn(
            "clay-input",
            "min-w-[200px] max-w-full",
            hasValue && "border-matcha-600",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <CalendarIcon className="h-4 w-4 flex-shrink-0 text-warm-silver" />
            <span className={cn("truncate", !hasValue && "text-warm-silver")}>
              {label}
            </span>
          </span>
          {hasValue && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Hapus rentang tanggal"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-warm-silver hover:bg-oat-light hover:text-clay-black"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        // `w-max` (= `width: max-content`) bikin popover expand ke
        // natural content width — penting untuk 2-month range calendar
        // (~576px) yang lebih lebar dari default popover. Default rdp
        // `w-72` dari shadcn PopoverContent base akan memotong tombol
        // nav di kanan calendar sehingga hanya "ujung" yang clickable.
        className="w-max min-w-[600px] p-0 max-w-[calc(100vw-2rem)]"
      >
        <div className="flex flex-col">
          {/* Preset chips */}
          <div
            role="group"
            aria-label="Preset rentang tanggal"
            className="flex flex-wrap gap-2 px-3 pt-3 pb-2 border-b border-oat-light"
          >
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-medium",
                  "border border-oat-border bg-warm-cream text-warm-charcoal",
                  "hover:bg-oat-light transition-colors"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Range calendar */}
          <div className="px-1 py-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={toRdpRange(draft)}
              onSelect={(range) => {
                // rdp's `onSelect` returns DateRange | undefined; map to
                // our DateRangeValue.
                if (!range) {
                  setDraft(undefined);
                } else {
                  setDraft({ from: range.from, to: range.to });
                }
              }}
              initialFocus
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-oat-light">
            <span className="text-xs text-warm-silver">
              {draft?.from && draft?.to
                ? formatRange(draft)
                : draft?.from
                  ? `${format(draft.from, "d MMM yyyy", { locale: idLocale })} → …`
                  : "Pilih tanggal mulai & akhir"}
            </span>
            <div className="flex items-center gap-2">
              {showReset && draftHasValue && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-[var(--radius-sharp)] border border-oat-border bg-warm-cream px-3 py-1.5 text-xs font-medium text-warm-charcoal hover:bg-oat-light"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={applyDraft}
                disabled={!draftHasValue}
                className={cn(
                  "rounded-[var(--radius-sharp)] px-3 py-1.5 text-xs font-semibold transition-colors",
                  draftHasValue
                    ? "bg-ube-800 text-pure-white hover:bg-clay-black"
                    : "bg-oat-light text-warm-silver cursor-not-allowed"
                )}
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
