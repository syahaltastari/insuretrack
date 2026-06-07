//! Request/response DTOs (serde).
//!
//! Dipisah dari entity domain agar wire format bisa evolusi tanpa
//! menyentuh struct internal.

use serde::{Deserialize, Serialize};

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

// ---- Products ----

#[derive(Debug, Clone, Serialize)]
pub struct Product {
    pub code: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

pub fn product_catalog() -> Vec<Product> {
    vec![
        Product {
            code: "LIFE",
            name: "Life Insurance",
            description: "Perlindungan jiwa dengan manfaat uang pertanggungan kepada ahli waris.",
        },
        Product {
            code: "PERSONAL_ACCIDENT",
            name: "Personal Accident Insurance",
            description: "Santunan akibat kecelakaan yang menyebabkan cacat atau meninggal.",
        },
        Product {
            code: "HEALTH",
            name: "Health Insurance",
            description: "Penggantian biaya rawat inap dan perawatan kesehatan.",
        },
    ]
}

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
