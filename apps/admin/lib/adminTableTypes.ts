//! Shared types untuk `AdminListPage` + `useAdminTable` hook.
//!
//! Dipisah dari `AdminListPage.tsx` agar `useAdminTable` (di folder
//! `lib/`) bisa import tanpa circular dependency. Page-specific types
//! seperti `Column<T>` TIDAK di-export ke pages — pages cuma pakai
//! inline object literal yang sesuai shape ini lewat prop `columns`.

import type { ReactNode } from "react";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string;
  /** Hide this column on screens < 768px to keep the table compact on mobile. */
  hideOnMobile?: boolean;
  /**
   * Sort key for header click. If set, header becomes clickable
   * and clicking it toggles sort by this key. Must match one of
   * the `sortableColumns` declared on the page. If omitted, column
   * is not sortable.
   */
  sortValue?: string;
};

export type DateFieldOption = { value: string; label: string };
export type SortableColumn = { value: string; label: string };

/**
 * Metadata yang disisipkan ke TanStack `ColumnDef.meta`. Hook
 * `useAdminTable` membacanya untuk render header/body (width,
 * hideOnMobile, sortValue) tanpa menambah prop baru ke TanStack API.
 */
export type AdminColumnMeta = {
  width?: string;
  hideOnMobile?: boolean;
  /** Backend `sort_by` value — sama dengan `Column.sortValue`. */
  sortValue?: string;
};
