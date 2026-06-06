// Layout untuk semua /admin/* routes.
//
// PENTING: AdminShell dipindahkan dari inline (per-page) ke layout ini
// supaya shell TIDAK remount setiap navigasi. Sebelumnya, AdminShell
// dipanggil di setiap page.tsx — saat user navigasi, shell baru di-
// mount, useEffect jalan, ready=false briefly, tampil '<main>Memuat...
// </main>' (no sidebar) — flash yang confusing. Dengan layout, shell
// tetap mounted, ready di-check sekali saat pertama masuk /admin/*,
// dan navigasi internal tidak re-trigger loading state.

import { AdminShell } from "@/components/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
