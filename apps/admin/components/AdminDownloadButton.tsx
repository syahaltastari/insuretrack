"use client";

import { useState } from "react";
import { toast } from "sonner";
import { API_BASE, getAdminToken } from "@insuretrack/api-client";

/**
 * Tombol download PDF generik untuk actions column / detail page.
 *
 * Behavior:
 * - Fetch dengan Bearer token admin.
 * - Ambil filename dari `Content-Disposition` header backend (kalau ada);
 *   fallback ke nama generik supaya file tetap bisa di-save.
 * - Trigger download via blob URL + `<a download>` click programmatic.
 *
 * Reuse di:
 * - AdminListPage (kolom "Aksi" — invoice / policy / receipt PDF).
 * - Registration detail page (tombol unduh di section Invoice / Polis).
 */
export function AdminDownloadButton({
  path,
  label,
  title,
  variant = "ghost",
}: {
  /** API path, e.g. `/admin/invoices/{id}/pdf`. */
  path: string;
  /** Text tombol, e.g. "📄 Invoice" atau "🧾 Bukti Bayar". */
  label: string;
  /** Hover tooltip. */
  title?: string;
  /** Button style variant. Default `ghost` cocok untuk inline list.
   *  Pakai `solid-ube` untuk primary CTA di detail page header. */
  variant?: "ghost" | "solid-ube" | "solid-matcha";
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;
    const token = getAdminToken();
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        toast.error(
          "Gagal download: " +
            (r.status === 404 ? "file belum tersedia" : `HTTP ${r.status}`),
        );
        return;
      }
      const disposition = r.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? path.split("/").pop() ?? "download.pdf";

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal download PDF");
    } finally {
      setLoading(false);
    }
  };

  const cls =
    variant === "solid-ube"
      ? "clay-button solid-ube size-small"
      : variant === "solid-matcha"
        ? "clay-button solid-matcha size-small"
        : "clay-button ghost size-small";

  return (
    <button
      type="button"
      className={cls}
      onClick={handleClick}
      disabled={loading}
      title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {loading ? "Mengunduh..." : label}
    </button>
  );
}