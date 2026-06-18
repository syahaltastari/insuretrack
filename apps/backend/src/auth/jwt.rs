//! JWT issuance & verification (HS256).
//!
//! Claims:
//!   sub  : subject id (UUID string for customer; UUID string for admin)
//!   role : "admin" | "customer"
//!   purpose : optional, e.g. "activation" or "password_reset" for one-time tokens
//!   is_super_admin : admin-only flag, di-skip serialize kalau false supaya
//!                    token customer tetap ramping. `#[serde(default)]` agar
//!                    token lama (issued sebelum field ini ada) tetap valid.
//!   exp / iat : standard expiry / issued-at

use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    Customer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: Role,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    /// Hanya relevan untuk `role = Admin`. `false`/absent = admin biasa,
    /// `true` = super admin (boleh kelola user lain). Stale sampai token
    /// expire (8h) setelah promote/demote — acceptable untuk admin internal.
    #[serde(default, skip_serializing_if = "is_false")]
    pub is_super_admin: bool,
    pub exp: i64,
    pub iat: i64,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Clone)]
pub struct TokenService {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl TokenService {
    pub fn new(secret: &str) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn issue(
        &self,
        subject: &str,
        role: Role,
        purpose: Option<String>,
        is_super_admin: bool,
        ttl_seconds: i64,
    ) -> Result<String, AppError> {
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: subject.to_string(),
            role,
            purpose,
            is_super_admin,
            exp: now + ttl_seconds,
            iat: now,
        };
        let header = Header::new(Algorithm::HS256);
        encode(&header, &claims, &self.encoding).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("jwt encode failed: {e}"))
        })
    }

    pub fn verify(&self, token: &str) -> Result<Claims, AppError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        decode::<Claims>(token, &self.decoding, &validation)
            .map(|d| d.claims)
            .map_err(|_| AppError::Unauthorized)
    }
}
