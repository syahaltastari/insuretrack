"use client";

//! `ColumnVisibilityMenu` — popover dengan checkbox list untuk hide/show
//! kolom. Pakai `table.getAllLeafColumns()` + `column.getToggleVisibilityHandler()`
//! dari TanStack. State-nya sendiri (mana kolom hidden) diurus oleh
//! `useAdminTable` hook (persist ke localStorage per-pathname).

import { Popover, PopoverContent, PopoverTrigger } from "@insuretrack/ui";
import { Columns } from "lucide-react";
import type { Table } from "@tanstack/react-table";

export function ColumnVisibilityMenu<T>({
  table,
}: {
  table: Table<T>;
}) {
  // getAllLeafColumns() = semua kolom tanpa nested group headers
  // (kita tidak pakai group headers, jadi ini sama dengan semua).
  const allColumns = table.getAllLeafColumns();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="clay-button ghost size-small"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Tampilkan / sembunyikan kolom (preferensi disimpan per-halaman)"
          aria-label="Tampilkan / sembunyikan kolom"
        >
          <Columns size={14} />
          <span>Kolom</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="clay-card"
        align="end"
        sideOffset={8}
        style={{
          padding: 12,
          width: 240,
          // Override default `p-4` dari PopoverContent cn() — kita
          // sudah set padding: 12 di atas. (CSS specificity tinggi
          // karena inline style.)
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        <p
          className="uppercase-label"
          style={{
            color: "var(--warm-silver)",
            marginBottom: 8,
          }}
        >
          Tampilkan kolom
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {allColumns.map((col) => {
            const headerText =
              typeof col.columnDef.header === "string"
                ? col.columnDef.header
                : col.id;
            return (
              <label
                key={col.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  userSelect: "none",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--oat-light)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <input
                  type="checkbox"
                  checked={col.getIsVisible()}
                  onChange={col.getToggleVisibilityHandler()}
                  style={{ cursor: "pointer" }}
                />
                <span>{headerText}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => table.setColumnVisibility({})}
          className="clay-button ghost size-small"
          style={{ marginTop: 12, width: "100%" }}
        >
          Reset ke default
        </button>
      </PopoverContent>
    </Popover>
  );
}
