// 6 benefit items untuk section "Kenapa InsureTrack". Tone concise,
// value-prop oriented, bahasa awam. Icon name harus valid IconName
// (lihat packages/ui/src/components/Icon.tsx).

import type { IconName } from "@insuretrack/ui";

export type Benefit = {
  icon: IconName;
  title: string;
  desc: string;
};

export const BENEFITS: readonly Benefit[] = [
  {
    icon: "ShieldCheck",
    title: "Tanpa Cabang",
    desc: "100% online, dari formulir hingga polis terbit.",
  },
  {
    icon: "Zap",
    title: "Auto-Accept",
    desc: "Tidak ada underwriting manual. Polis terbit otomatis.",
  },
  {
    icon: "FileText",
    title: "E-Policy PDF",
    desc: "Polis elektronik dikirim ke email Anda.",
  },
  {
    icon: "LayoutDashboard",
    title: "Portal Customer",
    desc: "Lihat polis, ajukan klaim, tanya jawab—semua di portal.",
  },
  {
    icon: "Lock",
    title: "Pembayaran Aman",
    desc: "Payment gateway tepercaya. Idempotent webhook.",
  },
  {
    icon: "ScrollText",
    title: "Audit Trail",
    desc: "Setiap aksi tercatat untuk transparansi penuh.",
  },
];
