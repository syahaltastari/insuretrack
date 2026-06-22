/**
 * Map submission/async error ke ResultDialog state.
 *
 * Tujuan: tampilkan pesan user-friendly Indonesia untuk SEMUA error
 * (network fail, server error, validation, dll.) dan JANGAN expose
 * technical detail seperti "Failed to fetch", "internal server error",
 * atau stack trace ke end user.
 *
 * Return ResultState yang bisa langsung dipakai <ResultDialog variant=...>.
 *
 * Success submit TIDAK lewat sini — caller render success card sendiri
 * (lebih visual karena ada detail seperti registration_no, invoice_no).
 */

import { ApiError } from "@insuretrack/api-client";

export type ResultState =
  | { kind: "idle" }
  | {
      kind: "warning";
      title: string;
      description?: React.ReactNode;
    }
  | {
      kind: "error";
      title: string;
      description?: React.ReactNode;
    }
  | {
      kind: "info";
      title: string;
      description?: React.ReactNode;
    };

export const IDLE: ResultState = { kind: "idle" };

export function mapSubmitError(err: unknown): ResultState {
  // Network failure — fetch() reject dengan TypeError.
  // Chrome: "Failed to fetch", Firefox: "NetworkError when attempting
  // to fetch resource", Safari: "Load failed". Semua kita rangkum jadi
  // 1 pesan generic — JANGAN tampilkan raw message.
  if (err instanceof TypeError) {
    return {
      kind: "error",
      title: "Tidak dapat terhubung ke server",
      description:
        "Periksa koneksi internet Anda dan coba lagi dalam beberapa saat. Jika masalah berlanjut, hubungi tim support InsureTrack.",
    };
  }
  // API error envelope (status 4xx/5xx dari backend).
  if (err instanceof ApiError) {
    // Server errors → generic. Jangan expose technical detail backend
    // (stack trace, sql error, dll.) ke user.
    if (err.status >= 500) {
      return {
        kind: "error",
        title: "Server sedang sibuk",
        description:
          "Tim kami sedang menangani masalah ini. Silakan coba lagi dalam beberapa menit. Jika masih gagal, hubungi support InsureTrack.",
      };
    }
    // Specific code mapping — code dari backend yang punya UX message
    // spesifik. Tambah sesuai kebutuhan.
    switch (err.code) {
      case "EMAIL_NOT_ACTIVATED":
        return {
          kind: "warning",
          title: "Email belum diaktivasi",
          description:
            "Cek kotak masuk email Anda dan klik link aktivasi. Setelah aktif, kembali ke halaman ini untuk melanjutkan pendaftaran.",
        };
      case "VALIDATION_ERROR":
      case "validation_failed":
        // Backend message diasumsikan user-friendly (lihat validate_individu
        // di public.rs — sudah di-Indonesiakan). Tampilkan apa adanya.
        return {
          kind: "warning",
          title: "Periksa kembali data Anda",
          description: err.message,
        };
      case "FORBIDDEN":
        return {
          kind: "warning",
          title: "Akses ditolak",
          description:
            "Anda tidak memiliki izin untuk aksi ini. Hubungi support InsureTrack jika ini terasa keliru.",
        };
      case "NOT_FOUND":
        return {
          kind: "warning",
          title: "Data tidak ditemukan",
          description:
            "Data yang Anda cari tidak tersedia. Coba muat ulang halaman, atau kembali beberapa saat lagi.",
        };
      case "CONFLICT":
        return {
          kind: "warning",
          title: "Data sudah ada",
          description: err.message,
        };
      case "IDEMPOTENT_REPLAY":
        return {
          kind: "info",
          title: "Permintaan sudah pernah diproses",
          description:
            "Sistem mendeteksi Anda sudah pernah mengirim permintaan yang sama. Tidak ada perubahan baru yang perlu dilakukan.",
        };
      default:
        // 4xx dengan code lain (atau tanpa code) → tampilkan apa adanya.
        // Asumsi: backend message sudah user-friendly.
        if (err.status >= 400 && err.status < 500) {
          return {
            kind: "warning",
            title: "Tidak dapat memproses permintaan",
            description: err.message,
          };
        }
        return {
          kind: "error",
          title: "Terjadi kesalahan",
          description:
            "Silakan coba lagi. Jika masalah berlanjut, hubungi support InsureTrack.",
        };
    }
  }
  // Unknown error — fallback generic.
  return {
    kind: "error",
    title: "Terjadi kesalahan",
    description:
      "Silakan coba lagi. Jika masalah berlanjut, hubungi support InsureTrack.",
  };
}
