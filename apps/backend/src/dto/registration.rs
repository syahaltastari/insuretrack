//! DTOs untuk submission registrasi — shared antara public.rs (validate)
//! dan customer.rs (handler). Dipisah agar file mod.rs tidak membengkak
//! setelah ada participant-level fields.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Tipe pendaftar. Wire format uppercase (`INDIVIDU` | `INSTANSI`)
/// untuk konsistensi dengan status enum lain (OPEN/CLOSED, dll).
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum ApplicantType {
    Individu,
    Instansi,
}

/// Tipe data peserta (untuk alur Instansi; tidak dipakai di Individu).
/// Field-field ini 1-to-1 dengan kolom `customers` (tanpa `password_hash`,
/// `portal_status`, dan lain-lain yang spesifik ke akun portal) karena
/// Instansi participants BUKAN customer dengan akun portal — mereka
/// hanya record di polis.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ParticipantData {
    pub nik: String,
    pub full_name: String,
    pub birth_place: String,
    pub birth_date: chrono::NaiveDate,
    pub gender: String,
    pub address: String,
    pub rt_rw: String,
    pub village: String,
    pub district: String,
    pub city: String,
    pub province: String,
    pub postal_code: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub mobile_number: Option<String>,
    #[serde(default)]
    pub beneficiary_name: Option<String>,
}

/// Body `data` dari multipart submission `POST /api/customer/registrations`.
///
/// Untuk backward-compat: `applicant_type` di-`#[serde(default)]` agar
/// request lama (tanpa field ini) di-deserialize sebagai `Individu`.
/// Institution fields dan `participants` juga default Option/Vec kosong.
#[derive(Debug, Deserialize)]
pub struct RegistrationData {
    pub nik: String,
    pub full_name: String,
    pub birth_place: String,
    pub birth_date: chrono::NaiveDate,
    pub gender: String,
    pub address: String,
    pub rt_rw: String,
    pub village: String,
    pub district: String,
    pub city: String,
    pub province: String,
    pub postal_code: String,
    pub email: String,
    pub mobile_number: String,
    /// Kode plan (`"LIFE_BASIC"`). Backend lookup via `find_plan` untuk
    /// derive `product` & `sum_assured`.
    pub plan_code: String,
    pub coverage_term: i32,
    #[serde(default)]
    pub beneficiary_name: Option<String>,

    // === Group registration (V3 — Instansi flow) ===
    #[serde(default = "default_applicant_type")]
    pub applicant_type: ApplicantType,
    #[serde(default)]
    pub company_name: Option<String>,
    #[serde(default)]
    pub company_npwp: Option<String>,
    #[serde(default)]
    pub company_industry: Option<String>,
    #[serde(default)]
    pub participants: Vec<ParticipantData>,
}

fn default_applicant_type() -> ApplicantType {
    ApplicantType::Individu
}

/// Hitung total premi untuk N peserta (semua pakai plan & term yang sama).
/// Single-participant premium dikalikan N.
pub fn calculate_group_premium(per_participant: Decimal, participant_count: usize) -> Decimal {
    (per_participant * Decimal::from(participant_count)).round_dp(2)
}
