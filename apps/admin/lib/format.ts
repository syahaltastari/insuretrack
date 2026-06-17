//! Format utilities untuk admin tables.
//!
//! Tujuan: konsistensi tampilan di semua halaman. Semua angka uang
//! muncul sebagai "Rp X.XXX.XXX", semua tanggal sebagai "17 Jun 2026",
//! semua datetime sebagai "17 Jun 2026, 17.30".
//!
//! Return `"—"` untuk nilai null/invalid supaya cell tidak crash
//! atau tampil "Invalid Date" / "NaN" — admin lebih mudah baca tabel
//! yang konsisten daripada error yang tersebar.

/**
 * Format angka sebagai Rupiah Indonesia: "Rp 1.000.000".
 * No decimal, dot separator, "Rp" prefix. Return `"—"` kalau invalid.
 */
export function formatCurrency(
  value: number | string | null | undefined,
): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format tanggal saja: "17 Jun 2026". Format compact, Indonesian locale.
 * Return `"—"` kalau invalid.
 */
export function formatDate(
  value: string | Date | null | undefined,
): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Format tanggal + waktu: "17 Jun 2026, 17.30". 24-hour, dot separator
 * (Indonesian convention). Return `"—"` kalau invalid.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
