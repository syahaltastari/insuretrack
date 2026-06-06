"use client";

import { useEffect, useState, ReactNode } from "react";
import { toast } from "sonner";
import { Inbox, Download } from "lucide-react";
import { Pagination, SkeletonTable } from "@insuretrack/ui";
import { API_BASE } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string;
  /** Hide this column on screens < 768px to keep the table compact on mobile. */
  hideOnMobile?: boolean;
};

export function AdminListPage<T extends { id: string }>({
  title,
  endpoint,
  columns,
  searchPlaceholder = "Cari (nama, no, email, NIK)...",
  statusOptions,
  detailBasePath,
  pdfDownloadPath,
  actions,
  headerActions,
  formSlot,
  emptyMessage = "Tidak ada data.",
  enableExport = true,
}: {
  title: string;
  endpoint: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  statusOptions?: string[];
  detailBasePath?: string;
  pdfDownloadPath?: (row: T) => string | null;
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
}) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const r = await fetch(`${API_BASE}${endpoint}?${params}`, {
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
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const showActionsCol = Boolean(actions) || Boolean(pdfDownloadPath);
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

      <form
        onSubmit={onSearch}
        style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="clay-input"
          style={{ flex: 1, minWidth: 200 }}
        />
        {statusOptions && (
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="clay-select"
            style={{ width: 200 }}
          >
            <option value="">Semua status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="clay-button solid-ube">
          Cari
        </button>
        {enableExport && (
          <a
            href={(() => {
              const params = new URLSearchParams({ format: "csv" });
              if (q) params.set("q", q);
              if (status) params.set("status", status);
              return `${API_BASE}${endpoint}?${params}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="clay-button ghost size-small"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Download semua baris (mengikuti filter saat ini) sebagai CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </a>
        )}
      </form>

      {formSlot}

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {loading && <SkeletonTable rows={5} columns={columns.length + (showActionsCol ? 1 : 0)} />}

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
          <div className="clay-table-wrap">
            <table className="clay-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={String(c.key)}
                      className={c.hideOnMobile ? "hide-mobile" : undefined}
                      style={c.width ? { width: c.width } : undefined}
                    >
                      {c.label}
                    </th>
                  ))}
                  {showActionsCol && <th style={{ width: 160 }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => {
                      const v = c.render
                        ? c.render(row)
                        : (row as Record<string, unknown>)[c.key as string];
                      return (
                        <td
                          key={String(c.key)}
                          className={c.hideOnMobile ? "hide-mobile" : undefined}
                        >
                          {detailBasePath ? (
                            <a
                              href={`${detailBasePath}/${row.id}`}
                              style={{
                                color: "var(--clay-black)",
                                fontWeight: 500,
                              }}
                            >
                              {v as ReactNode}
                            </a>
                          ) : (
                            (v as ReactNode)
                          )}
                        </td>
                      );
                    })}
                    {showActionsCol && (
                      <td>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          {pdfDownloadPath &&
                            (() => {
                              const path = pdfDownloadPath(row);
                              if (!path) return null;
                              const token = getAdminToken();
                              return (
                                <button
                                  className="clay-button ghost size-small"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    const r = await fetch(
                                      `${API_BASE}${path}`,
                                      {
                                        headers: {
                                          Authorization: `Bearer ${token}`,
                                        },
                                      },
                                    );
                                    if (!r.ok) return toast.error("Gagal download PDF");
                                    const blob = await r.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `policy-${row.id}.pdf`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                >
                                  📄 PDF
                                </button>
                              );
                            })()}
                          {actions && actions(row)}
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
