// Form schemas untuk alur pendaftaran — Individu + Instansi (group).
// Schema ini dipake di /portal/insurance/new untuk 2 form berbeda
// (Individu: existing flow; Instansi: 4-tab baru dengan N participants).
//
// Sesuai backend DTOs di `apps/backend/src/dto/registration.rs` —
// validate_registration di backend enforce rules yang sama.
//
// Reusable fields (nik, phone, email, dateNotFuture) dari common.ts.

import { z } from "zod";
import {
  nikSchema,
  phoneSchema,
  dateNotFutureSchema,
  optionalString,
} from "./common";

// ---- Participant (untuk Instansi flow) ---------------------------------

/** Schema untuk 1 peserta di Instansi. Field identik dengan Individu
 *  kecuali email & mobile_number opsional (banyak peserta kolektif
 *  tidak punya email pribadi di tahap pendaftaran). */
export const participantSchema = z.object({
  nik: nikSchema,
  full_name: z.string().trim().min(1, "Nama lengkap wajib diisi").max(120),
  birth_place: z.string().trim().min(1, "Tempat lahir wajib diisi").max(80),
  birth_date: dateNotFutureSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  address: z.string().trim().min(1, "Alamat wajib diisi").max(500),
  rt_rw: z
    .string()
    .trim()
    .regex(/^\d{1,3}\/\d{1,3}$/, "Format RT/RW: 001/002"),
  village: z.string().trim().min(1, "Kelurahan wajib diisi").max(80),
  district: z.string().trim().min(1, "Kecamatan wajib diisi").max(80),
  city: z.string().trim().min(1, "Kota wajib diisi").max(80),
  province: z.string().trim().min(1, "Provinsi wajib diisi").max(80),
  postal_code: z.string().trim().regex(/^\d{5}$/, "Kode pos 5 digit"),
  // Opsional di client (backend validate hanya untuk product tertentu,
  // mis. email untuk delivery e-policy, mobile untuk kontak klaim).
  email: optionalString(160),
  mobile_number: optionalString(20),
  // Wajib untuk LIFE, opsional untuk PA/HEALTH. Validation di backend
  // via validate_registration (per-product check). Client-side biarkan
  // optional — backend yang enforce.
  beneficiary_name: optionalString(120),
});
export type ParticipantValues = z.infer<typeof participantSchema>;

// ---- Institution info (untuk Instansi flow) ---------------------------

/** Schema untuk data perusahaan/instansi. company_name wajib; sisanya opsional. */
export const institutionSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(1, "Nama instansi wajib diisi")
    .max(200, "Nama instansi maksimal 200 karakter"),
  /** NPWP format Indonesia: 15-16 digit (strip/dot diabaikan saat validasi). */
  company_npwp: z
    .string()
    .trim()
    .optional()
    .refine(
      (s) => {
        if (!s) return true;
        const digits = s.replace(/[\s.\-]/g, "");
        return /^\d{15,16}$/.test(digits);
      },
      { message: "NPWP 15-16 digit" },
    ),
  company_industry: optionalString(100),
});
export type InstitutionValues = z.infer<typeof institutionSchema>;
