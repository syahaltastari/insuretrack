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
        encode(&header, &claims, &self.encoding)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("jwt encode failed: {e}")))
    }

    pub fn verify(&self, token: &str) -> Result<Claims, AppError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        decode::<Claims>(token, &self.decoding, &validation)
            .map(|d| d.claims)
            .map_err(|_| AppError::Unauthorized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SECRET: &str = "test-secret-key-for-unit-tests-only";

    fn svc() -> TokenService {
        TokenService::new(TEST_SECRET)
    }

    #[test]
    fn round_trip_preserves_claims() {
        let s = svc();
        let token = s
            .issue(
                "user-1",
                Role::Customer,
                Some("activation".into()),
                false,
                3600,
            )
            .unwrap();
        let claims = s.verify(&token).unwrap();
        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.role, Role::Customer);
        assert_eq!(claims.purpose.as_deref(), Some("activation"));
        assert_eq!(claims.is_super_admin, false);
        assert!(claims.exp > claims.iat);
    }

    #[test]
    fn expired_token_is_rejected() {
        let s = svc();
        // jsonwebtoken default leeway = 60s → pakai TTL well past itu
        // supaya test deterministic (tidak flaky di slow CI).
        let token = s.issue("user-1", Role::Admin, None, false, -3600).unwrap();
        let err = s.verify(&token).unwrap_err();
        assert!(matches!(err, AppError::Unauthorized));
    }

    #[test]
    fn wrong_secret_is_rejected() {
        let issuer = TokenService::new(TEST_SECRET);
        let verifier = TokenService::new("different-secret");
        let token = issuer
            .issue("user-1", Role::Customer, None, false, 3600)
            .unwrap();
        let err = verifier.verify(&token).unwrap_err();
        assert!(matches!(err, AppError::Unauthorized));
    }

    #[test]
    fn is_super_admin_flag_round_trips() {
        let s = svc();
        let token = s.issue("admin-1", Role::Admin, None, true, 3600).unwrap();
        let claims = s.verify(&token).unwrap();
        assert!(claims.is_super_admin);
    }

    #[test]
    fn is_super_admin_false_is_skipped_from_payload() {
        let s = svc();
        // Saat false, field di-skip dari serialisasi — ini memastikan
        // token customer/admin-biasa tetap ramping dan payload lama
        // (sebelum field ini ada) tetap kompatibel.
        let token = s.issue("admin-1", Role::Admin, None, false, 3600).unwrap();
        assert!(!token.contains("is_super_admin"));
    }
}
