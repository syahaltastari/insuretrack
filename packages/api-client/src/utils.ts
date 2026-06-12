import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class composition helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const IDR_FMT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Format angka IDR dengan prefix "Rp" dan separator titik. Contoh: 100_000_000 → "Rp 100.000.000". */
export function formatIdr(n: number): string {
  return `Rp ${IDR_FMT.format(n)}`;
}

/** Format compact IDR. Contoh: 100_000_000 → "Rp 100jt", 1_500_000_000 → "Rp 1,5M". */
export function formatIdrShort(n: number): string {
  if (n >= 1_000_000_000) {
    const m = n / 1_000_000_000;
    return `Rp ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace(".", ",")}M`;
  }
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return `Rp ${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1).replace(".", ",")}jt`;
  }
  if (n >= 1_000) {
    return `Rp ${(n / 1_000).toFixed(0)}rb`;
  }
  return `Rp ${IDR_FMT.format(n)}`;
}
