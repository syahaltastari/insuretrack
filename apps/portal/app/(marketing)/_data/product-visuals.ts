// Visual mapping per product: icon + background tone (CSS var name).
// Tone diambil dari design system (lihat packages/ui/src/styles/globals.css
// untuk palet lengkap). Index produk diasumsikan stabil sesuai urutan
// backend: [Life, Personal Accident, Health].
//
// `tone` di sini adalah NAMA SUFFIX warna di globals.css, dipakai
// sebagai `var(--${tone})` di inline style. Tailwind dynamic class
// `bg-${tone}` dihindari untuk menghindari purge issue.

import type { IconName } from "@insuretrack/ui";

export type ProductVisual = {
  icon: IconName;
  /** CSS var suffix, mis. "matcha-300" → `var(--matcha-300)`. */
  tone: string;
};

export const PRODUCT_VISUALS: readonly ProductVisual[] = [
  { icon: "HeartPulse", tone: "matcha-300" },
  { icon: "BriefcaseMedical", tone: "slushie-500" },
  { icon: "Stethoscope", tone: "ube-300" },
];
