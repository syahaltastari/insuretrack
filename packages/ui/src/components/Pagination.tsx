"use client";

// Pagination — pakai clay-button + ghost variant.
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginTop: 24,
        justifyContent: "flex-end",
        flexWrap: "wrap",
      }}
    >
      <span className="caption" style={{ color: "var(--warm-charcoal)", marginRight: "auto" }}>
        Halaman {page} dari {totalPages} · {total} total
      </span>
      <button className="clay-button ghost size-small" onClick={() => onChange(1)} disabled={page <= 1}>
        « Awal
      </button>
      <button className="clay-button ghost size-small" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        ‹ Prev
      </button>
      <button className="clay-button ghost size-small" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Next ›
      </button>
      <button className="clay-button ghost size-small" onClick={() => onChange(totalPages)} disabled={page >= totalPages}>
        Akhir »
      </button>
    </div>
  );
}
