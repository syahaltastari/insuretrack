//! Request/response DTOs (serde).
//!
//! Dipisah dari entity domain agar wire format bisa evolusi tanpa
//! menyentuh struct internal.

pub mod registration;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---- Auth ----

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub role: String,
    /// ID of the authenticated entity. `customer_id` for customer role,
    /// `admin_id` for admin role. Provided to FE to avoid decoding JWT
    /// or making a roundtrip to /me for common cases (avatar, breadcrumb,
    /// topbar greeting). Optional so legacy call sites that don't fill
    /// it can still compile.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Uuid>,
    /// Admin-only flag: true kalau akun punya hak mengelola user lain.
    /// `skip_serializing_if` agar customer login response tetap ramping
    /// (field ini tidak relevan untuk customer).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_super_admin: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ActivateRequest {
    /// Activation JWT (purpose="activation") — diperoleh dari link di email.
    /// Password sudah di-set saat register, jadi activation flow ini cuma
    /// flip portal_status dari PENDING → ACTIVE.
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordResetRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordResetConsumeRequest {
    pub token: String,
    pub new_password: String,
}

// ---- Products & Plans ----

// Sumber tunggal untuk daftar produk & plan. Untuk MVP, hard-coded di
// sini — hanya 3 produk × 3 tier = 9 rows. Kalau nanti butuh admin-CRUD,
// promote ke tabel `product_plans` dan ganti `find_plan` dengan sqlx query.
//
// Pricing model: `premium = plan.monthly_premium * 12 * coverage_term_years`.
// Plan adalah source of truth untuk UP & premi; registration request hanya
// membawa `plan_code` (lihat RegistrationData di routes/public.rs).

#[derive(Debug, Clone, Serialize)]
pub struct Product {
    pub code: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ProductPlan {
    pub code: &'static str,
    pub product_code: &'static str,
    pub tier: &'static str, // "BASIC" | "STANDARD" | "PREMIUM"
    pub name: &'static str,
    pub sum_assured: rust_decimal::Decimal,
    pub monthly_premium: rust_decimal::Decimal,
    pub description: &'static str,
}

pub fn product_catalog() -> Vec<Product> {
    // Derived dari PLAN_CATALOG: untuk setiap plan, daftarkan product
    // metadata sekali (pertama kali muncul). Urutan produk = urutan plan.
    let mut out: Vec<Product> = Vec::new();
    for plan in PLAN_CATALOG {
        if let Some(meta) = product_meta(plan.product_code) {
            if !out.iter().any(|x| x.code == meta.code) {
                out.push(meta);
            }
        }
    }
    out
}

fn product_meta(code: &str) -> Option<Product> {
    match code {
        "LIFE" => Some(Product {
            code: "LIFE",
            name: "Life Insurance",
            description: "Perlindungan jiwa dengan manfaat uang pertanggungan kepada ahli waris.",
        }),
        "PERSONAL_ACCIDENT" => Some(Product {
            code: "PERSONAL_ACCIDENT",
            name: "Personal Accident Insurance",
            description: "Santunan akibat kecelakaan yang menyebabkan cacat atau meninggal.",
        }),
        "HEALTH" => Some(Product {
            code: "HEALTH",
            name: "Health Insurance",
            description: "Penggantian biaya rawat inap dan perawatan kesehatan.",
        }),
        _ => None,
    }
}

const PLAN_CATALOG: &[ProductPlan] = &[
    ProductPlan {
        code: "LIFE_BASIC",
        product_code: "LIFE",
        tier: "BASIC",
        name: "Basic",
        sum_assured: rust_decimal_macros::dec!(100_000_000),
        monthly_premium: rust_decimal_macros::dec!(75_000),
        description: "Perlindungan jiwa dasar dengan uang pertanggungan Rp 100 juta.",
    },
    ProductPlan {
        code: "LIFE_STANDARD",
        product_code: "LIFE",
        tier: "STANDARD",
        name: "Standard",
        sum_assured: rust_decimal_macros::dec!(500_000_000),
        monthly_premium: rust_decimal_macros::dec!(200_000),
        description: "Perlindungan jiwa menengah dengan uang pertanggungan Rp 500 juta.",
    },
    ProductPlan {
        code: "LIFE_PREMIUM",
        product_code: "LIFE",
        tier: "PREMIUM",
        name: "Premium",
        sum_assured: rust_decimal_macros::dec!(1_000_000_000),
        monthly_premium: rust_decimal_macros::dec!(350_000),
        description: "Perlindungan jiwa premium dengan uang pertanggungan Rp 1 miliar.",
    },
    ProductPlan {
        code: "PA_BASIC",
        product_code: "PERSONAL_ACCIDENT",
        tier: "BASIC",
        name: "Basic",
        sum_assured: rust_decimal_macros::dec!(25_000_000),
        monthly_premium: rust_decimal_macros::dec!(20_000),
        description: "Santunan kecelakaan dasar dengan uang pertanggungan Rp 25 juta.",
    },
    ProductPlan {
        code: "PA_STANDARD",
        product_code: "PERSONAL_ACCIDENT",
        tier: "STANDARD",
        name: "Standard",
        sum_assured: rust_decimal_macros::dec!(75_000_000),
        monthly_premium: rust_decimal_macros::dec!(50_000),
        description: "Santunan kecelakaan menengah dengan uang pertanggungan Rp 75 juta.",
    },
    ProductPlan {
        code: "PA_PREMIUM",
        product_code: "PERSONAL_ACCIDENT",
        tier: "PREMIUM",
        name: "Premium",
        sum_assured: rust_decimal_macros::dec!(200_000_000),
        monthly_premium: rust_decimal_macros::dec!(100_000),
        description: "Santunan kecelakaan premium dengan uang pertanggungan Rp 200 juta.",
    },
    ProductPlan {
        code: "HEALTH_BASIC",
        product_code: "HEALTH",
        tier: "BASIC",
        name: "Basic",
        sum_assured: rust_decimal_macros::dec!(50_000_000),
        monthly_premium: rust_decimal_macros::dec!(100_000),
        description: "Manfaat rawat inap dasar dengan plafon tahunan Rp 50 juta.",
    },
    ProductPlan {
        code: "HEALTH_STANDARD",
        product_code: "HEALTH",
        tier: "STANDARD",
        name: "Standard",
        sum_assured: rust_decimal_macros::dec!(150_000_000),
        monthly_premium: rust_decimal_macros::dec!(250_000),
        description: "Rawat inap + rawat jalan extended dengan plafon tahunan Rp 150 juta.",
    },
    ProductPlan {
        code: "HEALTH_PREMIUM",
        product_code: "HEALTH",
        tier: "PREMIUM",
        name: "Premium",
        sum_assured: rust_decimal_macros::dec!(500_000_000),
        monthly_premium: rust_decimal_macros::dec!(500_000),
        description: "Manfaat catastrophic + cashless RS rekanan, plafon tahunan Rp 500 juta.",
    },
];

pub fn product_plan_catalog() -> Vec<ProductPlan> {
    PLAN_CATALOG.to_vec()
}

/// Lookup plan by code. Return `None` kalau plan_code tidak ditemukan —
/// caller harus map ke `AppError::Validation`.
pub fn find_plan(code: &str) -> Option<&'static ProductPlan> {
    PLAN_CATALOG.iter().find(|p| p.code == code)
}

pub fn product_name_from_code(code: &str) -> &'static str {
    product_meta(code).map(|p| p.name).unwrap_or("Insurance Product")
}

// ---- Registration (V3: group/Instansi) ----
//
// Definisi tipe + helper ada di sub-module `registration`. Di-re-export
// di sini agar import path existing (`dto::RegistrationData`,
// `dto::ParticipantData`, dll.) tidak berubah.
pub use registration::{calculate_group_premium, ApplicantType, ParticipantData, RegistrationData};

// ---- Dashboard ----

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_registrations: i64,
    pub total_invoices: i64,
    pub total_paid_invoices: i64,
    pub total_unpaid_invoices: i64,
    pub total_policies: i64,
    pub total_premium_collected: rust_decimal::Decimal,
}
