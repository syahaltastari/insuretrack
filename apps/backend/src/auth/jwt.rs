//! JWT issuance & verification (HS256).
//!
//! Claims:
//!   sub  : subject id (UUID string for customer; username for admin)
//!   role : "admin" | "customer"
//!   purpose : optional, e.g. "activation" or "password_reset" for one-time tokens
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
    pub exp: i64,
    pub iat: i64,
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
        ttl_seconds: i64,
    ) -> Result<String, AppError> {
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: subject.to_string(),
            role,
            purpose,
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
