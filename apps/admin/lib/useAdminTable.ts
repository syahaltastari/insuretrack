//! `useAdminTable` — tipis wrapper di atas TanStack Table v8 yang
//! ngejembatanin format `Column<T>[]` (kita) ke `ColumnDef<T>[]` (TanStack)
//! + sync sort state ke URL params.
//!
//! ## Kenapa controlled mode (manual*)
//!
//! Backend kita server-driven: filter, sort, pagination semua terjadi
//! di SQL dengan response shape `Page<T>`. TanStack's default row models
//! (`getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`)
//! adalah client-side — tidak cocok untuk `audit_logs`/`email_logs` yang
//! bisa ratusan ribu rows.
//!
//! Controlled mode = kita yang supply state (sorting, filtering, page)
//! eksplisit, dan TanStack cuma jadi view-state machine. Backend tetap
//! source of truth; TanStack handle sort indicator, ARIA, dan future
//! features (column visibility, row selection, resize, virtualization).
//!
//! ## URL sync
//!
//! Sort state di-sync ke `searchParams` `sort_by` + `sort_dir`:
//! - User click header → `setSorting` → useEffect → `router.replace`
//! - Back/forward navigation → URL berubah → useEffect → `setSorting`
//! - Page selalu di-reset ke 1 saat sort berubah (sesuai pattern existing).

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type Table,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  AdminColumnMeta,
  Column,
  SortableColumn,
} from "@/lib/adminTableTypes";

export type UseAdminTableOptions<T extends { id: string }> = {
  /** Data dari backend `Page<T>.data`. */
  data: T[];
  /** Column config (lihat `Column<T>`). */
  columns: Column<T>[];
  /** Whitelist dari page — hanya `sortValue` yang match boleh di-sort. */
  sortableColumns?: SortableColumn[];
  /**
   * Opsional: cell wrapper. Dipakai untuk render cell dengan
   * extra logic (mis. wrap ke `<a href={detailBasePath}>`).
   * Default: render cell apa adanya.
   */
  wrapCell?: (ctx: {
    row: T;
    cellValue: ReactNode;
  }) => ReactNode;
};

export type UseAdminTableResult<T extends { id: string }> = {
  table: Table<T>;
  /** Sorting state (biasanya `[{ id, desc }]` atau `[]`). */
  sorting: SortingState;
  /** Column visibility state (key = column id, value = `false` = hidden).
   *  Kolom yang visible tidak perlu ada di map (default = visible). */
  columnVisibility: VisibilityState;
  /** Header groups siap di-render di `<thead>`. */
  headerGroups: ReturnType<Table<T>["getHeaderGroups"]>;
  /** Rows siap di-render di `<tbody>`. */
  rows: ReturnType<Table<T>["getRowModel"]>["rows"];
  /** Helper render cell — handle `c.render` + raw value + `wrapCell`. */
  renderCell: (cellInfo: {
    row: T;
    columnId: string;
  }) => ReactNode;
};

export function useAdminTable<T extends { id: string }>(
  opts: UseAdminTableOptions<T>,
): UseAdminTableResult<T> {
  const { data, columns, sortableColumns, wrapCell } = opts;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortByFromUrl = searchParams.get("sort_by") ?? "";
  const sortDirFromUrl =
    searchParams.get("sort_dir") === "asc" ? "asc" : "desc";

  // ----- Build column defs from our Column<T> -----
  const sortableValues = useMemo(
    () => new Set((sortableColumns ?? []).map((s) => s.value)),
    [sortableColumns],
  );

  const columnDefs = useMemo<ColumnDef<T>[]>(() => {
    return columns.map((c) => {
      const sortId = c.sortValue;
      const isSortable = !!sortId && sortableValues.has(sortId);
      return {
        // `id` jadi identity di sort state & URL sort_by. Kalau
        // sortable, pake sortValue; kalau tidak, pake key.
        id: sortId ?? String(c.key),
        // `accessorFn` karena `c.key` bisa dynamic string
        // (bukan keyof T). Kita handle type-casting di sini.
        accessorFn: (row: T) => {
          const rec = row as unknown as Record<string, unknown>;
          return rec[String(c.key)];
        },
        header: c.label,
        // Cell function: kalau `c.render` ada, pakai; kalau tidak,
        // fallback ke raw value via accessorFn. flexRender handle
        // keduanya.
        cell: c.render
          ? (info) => c.render!(info.row.original)
          : undefined,
        enableSorting: isSortable,
        meta: {
          width: c.width,
          hideOnMobile: c.hideOnMobile,
          sortValue: c.sortValue,
        } satisfies AdminColumnMeta,
      } as ColumnDef<T>;
    });
  }, [columns, sortableValues]);

  // ----- Sorting state (initialized from URL) -----
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (!sortByFromUrl) return [];
    return [{ id: sortByFromUrl, desc: sortDirFromUrl === "desc" }];
  });

  // ----- Column visibility (persisted ke localStorage per-page) -----
  // Preferensi user (mana kolom yang di-hide) bukan data — tidak
  // disimpan di URL. localStorage scoped per pathname agar setiap
  // halaman admin bisa punya konfigurasi sendiri.
  const visibilityStorageKey = pathname
    ? `admin_table_visibility_${pathname}`
    : null;

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      if (typeof window === "undefined" || !visibilityStorageKey) return {};
      try {
        const stored = window.localStorage.getItem(visibilityStorageKey);
        if (stored) return JSON.parse(stored) as VisibilityState;
      } catch {
        // localStorage unavailable / invalid JSON — fall through ke default
      }
      return {};
    },
  );

  // Persist ke localStorage setiap visibility berubah. Hanya simpan
  // kolom yang di-hide (`false`) — kolom visible adalah default.
  useEffect(() => {
    if (typeof window === "undefined" || !visibilityStorageKey) return;
    try {
      const hidden = Object.fromEntries(
        Object.entries(columnVisibility).filter(
          ([, v]) => v === false,
        ),
      ) as VisibilityState;
      if (Object.keys(hidden).length === 0) {
        window.localStorage.removeItem(visibilityStorageKey);
      } else {
        window.localStorage.setItem(
          visibilityStorageKey,
          JSON.stringify(hidden),
        );
      }
    } catch {
      // localStorage write failure (private mode, quota) — silent
    }
  }, [columnVisibility, visibilityStorageKey]);

  // ----- URL → state sync (back/forward navigation) -----
  useEffect(() => {
    const fromUrl: SortingState = sortByFromUrl
      ? [{ id: sortByFromUrl, desc: sortDirFromUrl === "desc" }]
      : [];
    setSorting((prev) => {
      const same =
        prev.length === fromUrl.length &&
        (prev[0]?.id ?? null) === (fromUrl[0]?.id ?? null) &&
        (prev[0]?.desc ?? null) === (fromUrl[0]?.desc ?? null);
      return same ? prev : fromUrl;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortByFromUrl, sortDirFromUrl]);

  // ----- State → URL sync (user-initiated sort change) -----
  // Hapus `page` saat sort berubah (sesuai pattern existing di
  // AdminListPage.setFilterParams). Pakai `router.replace` dengan
  // searchParams yang sudah ada + sort_by/sort_dir.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (sorting.length === 0) {
      params.delete("sort_by");
      params.delete("sort_dir");
    } else {
      params.set("sort_by", sorting[0].id);
      params.set("sort_dir", sorting[0].desc ? "desc" : "asc");
    }
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    // Skip replace kalau URL tidak berubah (avoid re-render loop)
    const currentQs = searchParams.toString();
    const current = currentQs ? `${pathname}?${currentQs}` : pathname;
    if (next !== current) {
      router.replace(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting]);

  // ----- TanStack table instance -----
  const table = useReactTable<T>({
    data,
    columns: columnDefs,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    // Controlled mode: backend yang sort, filter, paginate. Kita
    // cuma supply data yang sudah diproses server.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getCoreRowModel: getCoreRowModel(),
    // getRowId: gunakan id (UUID) supaya re-render stabil
    getRowId: (row) => row.id,
  });

  // ----- Render helpers -----
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  // Callback untuk render cell. Kita bungkus di sini supaya
  // AdminListPage tidak perlu import flexRender langsung.
  const renderCell = useCallback(
    (cellInfo: { row: T; columnId: string }): ReactNode => {
      const row = table.getRow(cellInfo.columnId ? cellInfo.row.id : cellInfo.row.id);
      // Cari cell yang sesuai columnId
      const cell = row.getAllCells().find((c) => c.column.id === cellInfo.columnId);
      if (!cell) return null;
      const value = flexRender(cell.column.columnDef.cell, cell.getContext());
      return wrapCell ? wrapCell({ row: cellInfo.row, cellValue: value }) : value;
    },
    [table, wrapCell],
  );

  return {
    table,
    sorting,
    columnVisibility,
    headerGroups,
    rows,
    renderCell,
  };
}
