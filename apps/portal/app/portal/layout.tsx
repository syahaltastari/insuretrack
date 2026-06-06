// Layout untuk semua /portal/* routes.
//
// PENTING: PortalShell dipindahkan dari inline (per-page) ke layout ini
// supaya shell TIDAK remount setiap navigasi. Sebelumnya, PortalShell
// dipanggil di setiap page.tsx — saat user navigasi, shell baru di-
// mount, useEffect jalan, ready=false briefly, tampil 'Memuat...'
// flash. Dengan layout, shell tetap mounted, ready di-check sekali
// saat pertama masuk /portal/*, dan navigasi internal tidak re-trigger
// loading state.

import { PortalShell } from "@/components/PortalShell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
