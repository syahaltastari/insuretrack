"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import type { DayPickerProps } from "react-day-picker";
import { cn } from "@insuretrack/api-client";

import "react-day-picker/style.css";

/**
 * Theme Clay wrapper around `react-day-picker` v9.
 *
 * Wraps the headless DayPicker in a Clay-styled container and overrides
 * the default rdp classNames so the calendar matches InsureTrack's
 * design tokens (matcha accent, warm cream background, oat borders).
 *
 * Color tokens used:
 *   - `--matcha-600` for selected day + today indicator
 *   - `--warm-cream` for the calendar background
 *   - `--oat-border` for the day-grid border + day hover
 *   - `--warm-charcoal` for normal day text
 *   - `--warm-silver` for disabled / outside-month days
 *
 * Mode is forwarded to DayPicker as-is (`single` | `multiple` | `range`
 * | `default`). For the admin filter, the `DateRangePicker` composite
 * uses `range` mode.
 *
 * ## Nav button architecture
 *
 * Kita override `PreviousMonthButton` & `NextMonthButton` components
 * langsung (BUKAN cuma `classNames.button_previous` / `button_next`).
 * rdp v9 default render `<button>` untuk prev/next + nested `<Chevron>`
 * child SVG. Pada beberapa kondisi, click handler `handlePreviousClick`
 * rdp tidak reach ke button element (chevron child atau parent
 * pointer-events eat the click), sehingga button visible tapi tidak
 * respond onClick. Override component = single button element dengan
 * onClick di props, no nesting issue, click 100% reliable.
 *
 * @example
 *   <Calendar
 *     mode="range"
 *     selected={{ from, to }}
 *     onSelect={(range) => setRange(range)}
 *     numberOfMonths={2}
 *   />
 */
export type CalendarProps = DayPickerProps;

// Shared button styling — di-share antara prev/next untuk konsistensi.
// `relative z-10` supaya button selalu di atas sibling elements
// (mis. caption_label) yang mungkin overlap.
const navButtonClass = cn(
  "!w-8 !h-8 inline-flex items-center justify-center rounded-[var(--radius-sharp)]",
  "border border-oat-border bg-warm-cream text-warm-charcoal",
  "hover:bg-oat-light transition-colors",
  "cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueberry-800",
  "relative z-10"
);

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // Pakai default navLayout (undefined) yang render `<Nav>` component
      // di pojok caption. `<Nav>` berisi 2 buttons (prev & next) yang
      // bisa di-override via `components.PreviousMonthButton` /
      // `components.NextMonthButton`. Layout container (`rdp-nav`) di
      // style absolute inset-x-0 top-0 + flex justify-between supaya
      // prev di pojok kiri, next di pojok kanan — sejajar secara
      // horizontal dengan caption_label yang ada di tengah.
      className={cn("clay-calendar p-3", className)}
      classNames={{
        // Months grid (default 2 columns when numberOfMonths=2)
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-3 relative",
        month_caption:
          "relative flex justify-center items-center text-sm font-semibold h-11",
        caption_label: "text-sm font-semibold",
        // Nav absolute full-width di pojok caption, flex justify-between
        // = prev di kiri, next di kanan. z-10 supaya di atas caption_label
        // (kalau ada overlap).
        nav: "absolute inset-x-0 top-0 h-11 flex items-center justify-between px-1 z-10",
        // Weekday row
        weekdays: "flex",
        weekday:
          "text-warm-silver rounded-md w-9 font-normal text-[0.7rem] uppercase tracking-wider",
        // Day grid
        week: "flex w-full mt-1",
        day: "h-9 w-9 p-0 text-center text-sm focus-within:relative",
        day_button: cn(
          "inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-sharp)]",
          "text-warm-charcoal hover:bg-oat-light transition-colors",
          "aria-selected:bg-matcha-600 aria-selected:text-pure-white aria-selected:hover:bg-matcha-800"
        ),
        // Range-specific: middle of a selected range
        range_start: "rounded-l-[var(--radius-sharp)]",
        range_end: "rounded-r-[var(--radius-sharp)]",
        range_middle:
          "aria-selected:bg-matcha-300 aria-selected:text-clay-black rounded-none",
        // Today
        today: "font-bold text-matcha-800",
        // Outside + disabled
        outside: "text-warm-silver opacity-50",
        disabled: "text-warm-silver opacity-30 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      // rdp v9 pass props berikut ke PreviousMonthButton /
      // NextMonthButton: type="button", className, tabIndex,
      // aria-disabled, aria-label, onClick, data-animated-button,
      // children=<Chevron orientation=... />. Kita spread semua props
      // (penting: onClick, aria-disabled, tabIndex) + override className
      // + replace children dengan lucide-react icon (rdp default Chevron
      // SVG sulit di-override styling-nya).
      components={{
        PreviousMonthButton: (componentProps) => (
          <button
            type="button"
            {...componentProps}
            className={cn(navButtonClass, componentProps.className)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ),
        NextMonthButton: (componentProps) => (
          <button
            type="button"
            {...componentProps}
            className={cn(navButtonClass, componentProps.className)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
