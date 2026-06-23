"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Download, ArrowUp, ArrowDown, ArrowUpDown, X, Check, Copy } from "lucide-react";
import { flexRender } from "@tanstack/react-table";
import {
  Pagination,
  SkeletonTable,
  DateRangePicker,
  type DateRangeValue,
  FilterChipBar,
  type FilterChip,
  FilterSelect,
} from "@insuretrack/ui";
import { API_BASE, getAdminToken } from "@insuretrack/api-client";
import { useAdminTable } from "@/lib/useAdminTable";
import { ColumnVisibilityMenu } from "@/components/ColumnVisibilityMenu";
import { AdminDownloadButton } from "@/components/AdminDownloadButton";
import type {
  AdminColumnMeta,
  Column,
  DateFieldOption,
  SortableColumn,
} from "@/lib/adminTableTypes";

export type { Column, DateFieldOption, SortableColumn };

/**
 * AdminListPage — shared list page for Invoice / Policy / Claim / Inquiry
 * (and any future admin entity with the same query shape).
 *
 * Filter capabilities (since admin-filter-enhancement):
 *   - Search `q` (ILIKE on entity's text columns)
 *   - Status (single-select dropdown)
 *   - Date range (DateRangePicker with 4 presets) + date column
 *     dropdown (which date column to filter)
 *   - Product (LIFE/PERSONAL_ACCIDENT/HEALTH) for Policy + Claim
 *   - Claim type (DEATH/ACCIDENT/...) for Claim
 *   - Sort by column header (klik toggle asc/desc)
 *   - Active filter chips with "✕" per filter + "Reset all"
 *   - URL-driven state (semua filter ada di searchParams, shareable)
 *   - Export CSV dengan filter yang sama
 *
 * Backward-compat: kalau caller tidak pass `dateField`/`products`/
 * `claimTypes`/`sortableColumns`, halaman tetap jalan dengan
 * search + status saja (old behavior).
 */
export function AdminListPage<T extends { id: string }>({
  title,
  endpoint,
  columns,
  searchPlaceholder = "Cari (nama, no, email, NIK)...",
  statusOptions,
  statusFilterParam = "status",
  statusFilterLabel,
  /** Query param name to send the status filter under. Default "status"
   *  (matches registrations, invoices, claims, etc.). Set to "entity_type"
   *  for endpoints that filter the `entity_type` column instead
   *  (currently only `/admin/audit-logs`). */
  statusOptionsLabel,
  detailBasePath,
  pdfDownloadPath,
  receiptDownloadPath,
  actions,
  headerActions,
  formSlot,
  emptyMessage = "Tidak ada data.",
  enableExport = true,
  // ----- New filter props (admin-filter-enhancement) -----
  /** If provided, render a date-column dropdown + DateRangePicker. */
  dateField,
  /** Default date column value when URL has no `date_field` param. */
  defaultDateField,
  /** If provided, render a product filter dropdown. */
  products,
  /** If provided, render a claim_type filter dropdown. */
  claimTypes,
  /** Columns that the header can sort by. If provided, header is clickable
   *  and sort indicators are shown. */
  sortableColumns,
}: {
  title: string;
  endpoint: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  statusOptions?: string[];
  statusFilterParam?: "status" | "entity_type";
  statusFilterLabel?: string;
  statusOptionsLabel?: string;
  detailBasePath?: string;
  pdfDownloadPath?: (row: T) => string | null;
  /** Path untuk download Bukti Pembayaran (receipt). Hanya tampil kalau non-null. */
  receiptDownloadPath?: (row: T) => string | null;
  /** Per-row action buttons (Edit, Hapus, etc.) rendered in a trailing "Aksi" column. */
  actions?: (row: T) => ReactNode;
  /** Extra controls shown in the page header right side (e.g. "+ Tambah"). */
  headerActions?: ReactNode;
  /** Optional content rendered between the search bar and the table (e.g. an inline form, or empty when a modal is closed). */
  formSlot?: ReactNode;
  /** Override the "Tidak ada data" message. */
  emptyMessage?: string;
  /** Show the "Export CSV" button next to the search bar. Defaults to true. */
  enableExport?: boolean;
  /** Date column options. When provided, the date filter UI is rendered. */
  dateField?: DateFieldOption[];
  /** Default date column (must be one of `dateField[].value`). */
  defaultDateField?: string;
  /** Product filter options (LIFE | PERSONAL_ACCIDENT | HEALTH). */
  products?: string[];
  /** Claim type filter options (DEATH | ACCIDENT | ...). */
  claimTypes?: string[];
  /** Sortable columns. If provided, clickable headers + sort indicators. */
  sortableColumns?: SortableColumn[];
}) {
  // ----- URL sync helpers -----
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qFromUrl = searchParams.get("q") ?? "";
  const statusFromUrl = searchParams.get(statusFilterParam) ?? "";
  const dateFromUrl = searchParams.get("date_from") ?? "";
  const dateToUrl = searchParams.get("date_to") ?? "";
  const dateFieldFromUrl = searchParams.get("date_field") ?? "";
  const productFromUrl = searchParams.get("product") ?? "";
  const claimTypeFromUrl = searchParams.get("claim_type") ?? "";
  // `page_size` di-URL-kan supaya shareable. Backend clamp ke 1-100
  // (lihat `PageQuery::page_size()` di repo/mod.rs). Default 20.
  const pageSizeFromUrl = searchParams.get("page_size");
  const pageSize = pageSizeFromUrl
    ? Math.max(1, Math.min(100, Number(pageSizeFromUrl) || 20))
    : 20;
  // `sort_by` / `sort_dir` diurus oleh `useAdminTable` hook — baca
  // dari `sorting` state di bawah, bukan dari URL langsung.

  // ----- Local state -----
  const [qInput, setQInput] = useState(qFromUrl);
  const [status, setStatus] = useState(statusFromUrl);
  // Date range as Date objects (for the picker). Convert to/from URL.
  const dateRange = useMemo<DateRangeValue | undefined>(() => {
    if (!dateFromUrl) return undefined;
    const from = new Date(dateFromUrl + "T00:00:00");
    const to = dateToUrl ? new Date(dateToUrl + "T00:00:00") : undefined;
    return { from, to };
  }, [dateFromUrl, dateToUrl]);
  const [activeDateField, setActiveDateField] = useState(
    dateFieldFromUrl || defaultDateField || dateField?.[0]?.value || ""
  );
  const [product, setProduct] = useState(productFromUrl);
  const [claimType, setClaimType] = useState(claimTypeFromUrl);

  // Lookup helpers — must be declared before they're used in `chips`.
  const dateFieldOptionsMap = useMemo(
    () => Object.fromEntries((dateField ?? []).map((o) => [o.value, o.label])),
    [dateField]
  );

  // ----- Data state -----
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `pageSize` di-read dari URL (lihat deklarasi di atas) — bukan
  // hardcoded. Dipakai untuk fetch params + Pagination component.

  // ----- Table wrap ref (untuk reset vertical scroll saat ganti page) -----
  // Saat user klik Next/Prev, kita scroll wrap ke top supaya user
  // lihat awal data page baru (bukan tengah-tengah karena scroll
  // position terbawa). Horizontal scroll TIDAK ter-reset — kalau
  // user sedang baca kolom di kanan, posisi horizontal tetap.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);

  // ----- TanStack Table (controlled mode) -----
  // `sorting` lives in the hook + URL; tidak ada local sort state di sini.
  // `table`/`headerGroups`/`rows` di-render langsung oleh JSX di bawah.
  const { table, sorting, headerGroups, rows } = useAdminTable<T>({
    data,
    columns,
    sortableColumns,
  });
  // Derived values untuk load/CSV/chip (mirror `sorting`).
  const sortBy = sorting[0]?.id ?? "";
  const sortDir = sorting[0]?.desc === false ? "asc" : "desc";

  // ----- URL update helper -----
  const setFilterParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Always reset page when filters change.
      params.delete("page");
      for (const [k, v] of Object.entries(next)) {
        if (v && v.length > 0) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  // Debounce search input → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qFromUrl) setFilterParams({ q: qInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Sync local state when URL changes from outside (back/forward, link).
  // Sort state diurus oleh `useAdminTable` hook.
  useEffect(() => {
    setQInput(qFromUrl);
    setStatus(statusFromUrl);
    setActiveDateField(dateFieldFromUrl || defaultDateField || dateField?.[0]?.value || "");
    setProduct(productFromUrl);
    setClaimType(claimTypeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, statusFromUrl, dateFieldFromUrl, dateFromUrl, dateToUrl, productFromUrl, claimTypeFromUrl]);

  // ----- Data fetch -----
  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (qFromUrl) params.set("q", qFromUrl);
      if (statusFromUrl) params.set(statusFilterParam, statusFromUrl);
      if (dateFromUrl) params.set("date_from", dateFromUrl);
      if (dateToUrl) params.set("date_to", dateToUrl);
      if (dateField) params.set("date_field", activeDateField);
      if (product) params.set("product", product);
      if (claimType) params.set("claim_type", claimType);
      if (sortBy) params.set("sort_by", sortBy);
      if (sortBy) params.set("sort_dir", sortDir);

      const r = await fetch(`${API_BASE}${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json.data);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    qFromUrl,
    statusFromUrl,
    dateFromUrl,
    dateToUrl,
    activeDateField,
    product,
    claimType,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Filter change handlers -----
  const onDateRangeChange = (range: DateRangeValue | undefined) => {
    setFilterParams({
      date_from: range?.from ? toIsoDate(range.from) : undefined,
      date_to: range?.to ? toIsoDate(range.to) : undefined,
    });
    setPage(1);
  };

  const onDateFieldChange = (v: string) => {
    setActiveDateField(v);
    setFilterParams({ date_field: v });
    setPage(1);
  };

  const onStatusChange = (v: string) => {
    setStatus(v);
    setFilterParams({ [statusFilterParam]: v });
    setPage(1);
  };

  const onProductChange = (v: string) => {
    setProduct(v);
    setFilterParams({ product: v });
    setPage(1);
  };

  const onClaimTypeChange = (v: string) => {
    setClaimType(v);
    setFilterParams({ claim_type: v });
    setPage(1);
  };

  const onPageSizeChange = (v: string) => {
    // v = "" artinya default (20). setFilterParams reset page ke 1
    // dan hapus param kalau value kosong.
    setFilterParams({
      page_size: v || undefined,
    });
    setPage(1);
  };

  const resetAll = () => {
    setQInput("");
    setStatus("");
    setActiveDateField(defaultDateField || dateField?.[0]?.value || "");
    setProduct("");
    setClaimType("");
    // Sort state diurus oleh `useAdminTable` — `router.replace(pathname)`
    // di bawah akan trigger hook untuk clear sort_by/sort_dir dari URL.
    router.replace(pathname);
    setPage(1);
  };

  // ----- Active filter chips -----
  const chips: FilterChip[] = [];
  if (qFromUrl) {
    chips.push({
      key: "q",
      label: `Cari: "${qFromUrl}"`,
      onRemove: () => setFilterParams({ q: undefined }),
    });
  }
  if (statusFromUrl) {
    chips.push({
      key: "status",
      label: `Status: ${statusFromUrl}`,
      onRemove: () => setFilterParams({ [statusFilterParam]: undefined }),
    });
  }
  if (dateFromUrl || dateToUrl) {
    const dfLabel = dateFromUrl ? formatShortDate(dateFromUrl) : "…";
    const dtLabel = dateToUrl ? formatShortDate(dateToUrl) : "…";
    const dfName = activeDateField ? dateFieldOptionsMap[activeDateField] ?? activeDateField : "";
    chips.push({
      key: "date",
      label: `Tanggal${dfName ? ` (${dfName})` : ""}: ${dfLabel} – ${dtLabel}`,
      onRemove: () => setFilterParams({ date_from: undefined, date_to: undefined }),
    });
  }
  if (product) {
    chips.push({
      key: "product",
      label: `Produk: ${product}`,
      onRemove: () => setFilterParams({ product: undefined }),
    });
  }
  if (claimType) {
    chips.push({
      key: "claim_type",
      label: `Tipe klaim: ${claimType}`,
      onRemove: () => setFilterParams({ claim_type: undefined }),
    });
  }
  if (sortBy) {
    chips.push({
      key: "sort",
      label: `Sort: ${sortBy} ${sortDir}`,
      onRemove: () => setFilterParams({ sort_by: undefined, sort_dir: undefined }),
    });
  }

  // ----- CSV export with current filters -----
  const csvHref = useMemo(() => {
    const params = new URLSearchParams({ format: "csv" });
    if (qFromUrl) params.set("q", qFromUrl);
    if (statusFromUrl) params.set(statusFilterParam, statusFromUrl);
    if (dateFromUrl) params.set("date_from", dateFromUrl);
    if (dateToUrl) params.set("date_to", dateToUrl);
    if (dateField) params.set("date_field", activeDateField);
    if (product) params.set("product", product);
    if (claimType) params.set("claim_type", claimType);
    if (sortBy) params.set("sort_by", sortBy);
    if (sortBy) params.set("sort_dir", sortDir);
    return `${API_BASE}${endpoint}?${params.toString()}`;
  }, [
    qFromUrl,
    statusFromUrl,
    dateFromUrl,
    dateToUrl,
    activeDateField,
    product,
    claimType,
    sortBy,
    sortDir,
    endpoint,
  ]);

  // ----- Render -----
  const showActionsCol = Boolean(actions) || Boolean(pdfDownloadPath) || Boolean(receiptDownloadPath);
  const colCount = columns.length + (showActionsCol ? 1 : 0);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            {title}
          </h1>
        </div>
        {headerActions}
      </div>

      {/* Filter bar */}
      <div
        className="clay-card"
        style={{
          padding: 16,
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          {/* Search input */}
          <label className="inline-flex flex-col gap-1" style={{ flex: 1, minWidth: 200 }}>
            <span className="text-xs uppercase tracking-wider text-warm-silver font-semibold">
              Cari
            </span>
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={searchPlaceholder}
              className="clay-input"
              aria-label="Cari"
            />
          </label>

          {/* Date range picker + date column dropdown */}
          {dateField && dateField.length > 0 && (
            <>
              <DateRangePicker
                value={dateRange}
                onChange={onDateRangeChange}
                ariaLabel="Pilih rentang tanggal filter"
              />
              <FilterSelect
                label="Kolom tanggal"
                value={activeDateField}
                onChange={onDateFieldChange}
                options={dateField.map((o) => ({ value: o.value, label: o.label }))}
                ariaLabel="Kolom tanggal"
                width={160}
              />
            </>
          )}

          {/* Status dropdown */}
          {statusOptions && statusOptions.length > 0 && (
            <FilterSelect
              label={statusFilterLabel ?? "Status"}
              value={status}
              onChange={onStatusChange}
              options={[
                { value: "", label: statusOptionsLabel ?? "Semua" },
                ...statusOptions.map((s) => ({ value: s, label: s })),
              ]}
              ariaLabel="Status"
              width={180}
            />
          )}

          {/* Product dropdown */}
          {products && products.length > 0 && (
            <FilterSelect
              label="Produk"
              value={product}
              onChange={onProductChange}
              options={[
                { value: "", label: "Semua" },
                ...products.map((p) => ({ value: p, label: p })),
              ]}
              ariaLabel="Produk"
              width={170}
            />
          )}

          {/* Claim type dropdown */}
          {claimTypes && claimTypes.length > 0 && (
            <FilterSelect
              label="Tipe klaim"
              value={claimType}
              onChange={onClaimTypeChange}
              options={[
                { value: "", label: "Semua" },
                ...claimTypes.map((c) => ({ value: c, label: c })),
              ]}
              ariaLabel="Tipe klaim"
              width={170}
            />
          )}

          {/* Reset (when any filter active) */}
          {chips.length > 0 && (
            <button
              type="button"
              onClick={resetAll}
              className="clay-button ghost size-small"
              title="Hapus semua filter"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <X size={14} /> Reset
            </button>
          )}

          {/* View controls — di kanan (page size, kolom visibility, export) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <FilterSelect
              label="Per halaman"
              value={pageSize === 20 ? "" : String(pageSize)}
              onChange={onPageSizeChange}
              options={[
                { value: "", label: "20" },
                { value: "10", label: "10" },
                { value: "50", label: "50" },
                { value: "100", label: "100" },
              ]}
              ariaLabel="Jumlah baris per halaman"
              width={130}
            />
            <ColumnVisibilityMenu table={table} />
            {enableExport && (
              <a
                href={csvHref}
                target="_blank"
                rel="noopener noreferrer"
                className="clay-button ghost size-small"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Download semua baris (mengikuti filter saat ini) sebagai CSV"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </a>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        <FilterChipBar chips={chips} onResetAll={resetAll} />
      </div>

      {formSlot}

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {loading && <SkeletonTable rows={5} columns={colCount} />}

      {!loading && data.length === 0 && (
        <div
          className="clay-card feature dashed"
          style={{ textAlign: "center", padding: "48px 24px", marginTop: 8 }}
        >
          <Inbox
            size={40}
            style={{ color: "var(--warm-silver)", margin: "0 auto" }}
          />
          <p
            className="body"
            style={{ color: "var(--warm-charcoal)", margin: "12px 0 0 0" }}
          >
            {emptyMessage}
          </p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <>
          <div className="clay-table-wrap" ref={wrapRef}>
            <table className="clay-table sticky-columns">
              <thead>
                {headerGroups.map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta as
                        | AdminColumnMeta
                        | undefined;
                      const isSortable = header.column.getCanSort();
                      const colSort = header.column.getIsSorted(); // false | "asc" | "desc"
                      return (
                        <th
                          key={header.id}
                          className={meta?.hideOnMobile ? "hide-mobile" : undefined}
                          style={{
                            ...(meta?.width ? { width: meta.width } : {}),
                            ...(isSortable
                              ? { cursor: "pointer", userSelect: "none" }
                              : {}),
                          }}
                          onClick={
                            isSortable
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                          role={isSortable ? "button" : undefined}
                          aria-sort={
                            colSort === "asc"
                              ? "ascending"
                              : colSort === "desc"
                                ? "descending"
                                : isSortable
                                  ? "none"
                                  : undefined
                          }
                          title={
                            isSortable
                              ? `Klik untuk sort by ${meta?.sortValue ?? header.column.id}`
                              : undefined
                          }
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {isSortable &&
                              (colSort === "asc" ? (
                                <ArrowUp size={12} />
                              ) : colSort === "desc" ? (
                                <ArrowDown size={12} />
                              ) : (
                                <ArrowUpDown
                                  size={12}
                                  style={{ opacity: 0.4 }}
                                />
                              ))}
                          </span>
                        </th>
                      );
                    })}
                    {showActionsCol && <th style={{ width: 200, minWidth: 180 }}>Aksi</th>}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | AdminColumnMeta
                        | undefined;
                      const value = flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      );
                      // Tooltip native browser: muncul saat hover (~1s
                      // delay). Pakai raw value (`cell.getValue()`) supaya
                      // admin lihat full text tanpa click ke detail.
                      // Skip kalau kosong (no point showing empty tooltip).
                      //
                      // PENTING: `title` dipasang di INNER content (`<a>`
                      // dan value ReactNode) — bukan di `<td>`. Kalau
                      // dipasang di `<td>`, hover di child element
                      // (e.g. `<a>`) tidak trigger tooltip `<td>`.
                      const titleText = String(cell.getValue() ?? "");
                      const tdClass = meta?.hideOnMobile
                        ? "hide-mobile"
                        : undefined;
                      return (
                        <td key={cell.id} className={tdClass}>
                          {detailBasePath ? (
                            <a
                              href={`${detailBasePath}/${row.original.id}`}
                              title={titleText || undefined}
                              style={{
                                color: "var(--clay-black)",
                                fontWeight: 500,
                              }}
                            >
                              {value}
                            </a>
                          ) : isValidElement(value) ? (
                            // Inner element (e.g. `<code>`, `<span>`)
                            // — clone dengan title ditambahkan.
                            cloneElement(
                              value as ReactElement<{ title?: string }>,
                              { title: titleText || undefined },
                            )
                          ) : (
                            // Plain text/ReactNode tanpa wrapper.
                            // title tidak bisa di-attach ke text node
                            // langsung — wrap dalam `<span>` dengan title.
                            <span title={titleText || undefined}>{value}</span>
                          )}
                          {/* Copy-to-clipboard button — muncul on cell hover */}
                          {titleText && <CopyButton value={titleText} />}
                        </td>
                      );
                    })}
                    {showActionsCol && (
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {pdfDownloadPath && (() => {
                            const path = pdfDownloadPath(row.original);
                            if (!path) return null;
                            return (
                              <AdminDownloadButton
                                key="pdf"
                                path={path}
                                label="📄 Invoice"
                                title="Download invoice PDF"
                              />
                            );
                          })()}
                          {receiptDownloadPath && (() => {
                            const path = receiptDownloadPath(row.original);
                            if (!path) return null;
                            return (
                              <AdminDownloadButton
                                key="receipt"
                                path={path}
                                label="🧾 Bukti Bayar"
                                title="Download bukti pembayaran PDF"
                              />
                            );
                          })()}
                          {actions && actions(row.original)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}

// ----- CopyButton (cell copy-to-clipboard) -----
//
// Hover-reveal button di kanan cell. Click → copy raw value (pakai
// `cell.getValue()`) ke clipboard. Visual feedback: icon jadi Check
// + toast "Disalin ke clipboard" selama 1.5s.
//
// Fallback ke `document.execCommand("copy")` kalau navigator.clipboard
// tidak tersedia (e.g. non-HTTPS context, browser lama).
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    // Prevent click bubbling ke parent element (mis. `<a>` di
    // first cell yang navigate ke detail page).
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;

    const flashCopied = () => {
      setCopied(true);
      toast.success("Disalin ke clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        flashCopied();
        return;
      }
      // Fallback path — older browsers / non-secure context.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flashCopied();
      } finally {
        document.body.removeChild(ta);
      }
    } catch (err) {
      toast.error("Gagal menyalin ke clipboard");
    }
  };

  return (
    <button
      type="button"
      className={`clay-table-cell-copy${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Salin ke clipboard"
      aria-label="Salin ke clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ----- helpers -----

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso: string): string {
  // iso is YYYY-MM-DD
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const mIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)} ${months[mIdx] ?? "?"} ${parts[0]}`;
}
