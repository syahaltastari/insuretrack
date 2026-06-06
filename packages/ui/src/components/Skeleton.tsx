//! Skeleton loading placeholders — grey pulse boxes yang match shape
//! data yang akan di-render. Dipakai selama async fetch untuk
//! perceived performance yang lebih baik dari plain "Memuat..." text.

/**
 * Single skeleton bar. Default: rounded box 1em tall.
 * Bisa di-customize width/height/shape via props atau className.
 */
export function Skeleton({
  width = "100%",
  height,
  circle = false,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${circle ? "skeleton-circle" : ""} ${className ?? ""}`.trim()}
      style={{
        display: "inline-block",
        width: typeof width === "number" ? `${width}px` : width,
        height: height
          ? typeof height === "number"
            ? `${height}px`
            : height
          : undefined,
        verticalAlign: "middle",
        ...style,
      }}
    />
  );
}

/**
 * Multi-line text skeleton. Render N baris dengan width yang
 * bervariasi (100%, 85%, 70%, dst.) untuk natural look seperti
 * paragraf asli. Baris terakhir otomatis lebih pendek.
 */
export function SkeletonText({
  lines = 3,
  lastLineWidth = "60%",
  gap = 8,
}: {
  lines?: number;
  lastLineWidth?: string;
  gap?: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", flexDirection: "column", gap }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : "100%"}
          height={12}
        />
      ))}
    </div>
  );
}

/**
 * Card-shaped skeleton (full rectangle dengan padding). Cocok untuk
 * section cards di detail pages atau metric cards di dashboard.
 */
export function SkeletonCard({
  rows = 3,
  className,
  style,
}: {
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`clay-card feature skeleton-card ${className ?? ""}`.trim()}
      style={{ padding: 24, ...style }}
    >
      <Skeleton width="40%" height={18} style={{ marginBottom: 16 }} />
      <SkeletonText lines={rows} />
    </div>
  );
}

/**
 * Table-shaped skeleton: header row + N data rows dengan column widths
 * yang proporsional. Cocok untuk list pages.
 */
export function SkeletonTable({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  // Lebar default tiap kolom (%), jumlah = `columns`. Total = 100%.
  // Boleh di-customize per use case dengan prop `columnWidths`.
  const defaultWidths = [25, 20, 15, 20, 20];
  return (
    <div className="clay-table-wrap" aria-hidden="true">
      <table className="clay-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <Skeleton
                  width={`${defaultWidths[i % defaultWidths.length]}%`}
                  height={12}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <Skeleton
                    width={`${defaultWidths[c % defaultWidths.length]}%`}
                    height={14}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
