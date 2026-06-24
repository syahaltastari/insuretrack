// 3 how-it-works steps untuk section dengan background `swatch-ube`.
// `n` adalah nomor urut dengan leading zero untuk konsistensi visual
// dengan design system typography (`mono` class).

export type HowItWorksStep = {
  n: string;
  t: string;
  d: string;
};

export const STEPS: readonly HowItWorksStep[] = [
  {
    n: "01",
    t: "Daftar Online",
    d: "Isi formulir, upload KTP, dapat invoice dalam hitungan menit.",
  },
  {
    n: "02",
    t: "Bayar Premi",
    d: "Selesaikan pembayaran via payment gateway. Status ter-update otomatis.",
  },
  {
    n: "03",
    t: "Polis Terbit",
    d: "E-policy PDF langsung di email. Aktivasi portal customer.",
  },
];
