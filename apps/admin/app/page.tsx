import { redirect } from "next/navigation";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

/**
 * Root index — server-side redirect ke halaman login admin.
 *
 * Setelah login berhasil, AdminShell guard di tujuan page akan
 * bounce ke /admin/dashboard jika token valid ditemukan di
 * localStorage.
 */
export default function RootIndex() {
  redirect("/admin/login");
}
