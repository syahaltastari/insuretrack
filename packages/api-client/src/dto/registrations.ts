// Wire DTOs untuk registrasi — Individu + Instansi (group).
// Sesuai backend `apps/backend/src/dto/registration.rs`. Backend serve via
// `POST /api/customer/registrations` (multipart) dengan field `data` =
// JSON-encoded RegistrationData. `applicant_type` discriminator pilih
// flow: "INDIVIDU" (single-participant, data di root) atau "INSTANSI"
// (N peserta di `participants`, info perusahaan di `company_*`).

export type ApplicantType = "INDIVIDU" | "INSTANSI";

export interface ParticipantData {
  /** 16 digit NIK. Wajib. */
  nik: string;
  full_name: string;
  birth_place: string;
  /** YYYY-MM-DD. Backend enforces <= today. */
  birth_date: string;
  gender: "MALE" | "FEMALE";
  address: string;
  /** Format: "001/002". */
  rt_rw: string;
  village: string;
  district: string;
  city: string;
  province: string;
  /** 5 digit. */
  postal_code: string;
  /** Opsional untuk peserta kolektif. */
  email?: string;
  /** Opsional. 10-15 digit, digits only. */
  mobile_number?: string;
  /** Wajib untuk produk LIFE, NULL untuk PA/HEALTH. */
  beneficiary_name?: string;
}

export interface RegistrationRequest {
  /** Discriminator: "INDIVIDU" atau "INSTANSI". */
  applicant_type: ApplicantType;

  // === Representative fields (root) — berlaku untuk kedua flow ===
  nik: string;
  full_name: string;
  birth_place: string;
  birth_date: string;
  gender: "MALE" | "FEMALE";
  address: string;
  rt_rw: string;
  village: string;
  district: string;
  city: string;
  province: string;
  postal_code: string;
  email: string;
  mobile_number: string;
  plan_code: string;
  coverage_term: number;
  /** Wajib untuk produk LIFE, opsional untuk PA/HEALTH. Untuk INDIVIDU
   *  flow, beneficiary ini yang dipakai. Untuk INSTANSI, beneficiary
   *  per-peserta di `participants[].beneficiary_name`. */
  beneficiary_name?: string;

  // === Institution fields (INSTANSI only) ===
  /** Wajib untuk INSTANSI. NULL/ignored untuk INDIVIDU. */
  company_name?: string;
  /** Opsional. 15-16 digit NPWP. */
  company_npwp?: string;
  /** Opsional. */
  company_industry?: string;

  // === Participants array (INSTANSI only) ===
  /** Untuk INDIVIDU: kosong. Untuk INSTANSI: minimal 1, max 500. */
  participants: ParticipantData[];
}

/** Response dari `POST /api/customer/registrations` — sama untuk kedua flow. */
export interface RegistrationResponse {
  registration_no: string;
  invoice_no: string;
  status: "PENDING" | "PAID" | "ISSUED" | "CANCELLED";
}
