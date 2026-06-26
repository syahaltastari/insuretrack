//! Auth extractors for Axum handlers.
//!
//!   RequireAdmin       : 401 jika tanpa/expired token, 403 jika role != admin
//!   RequireSuperAdmin  : 401 + 403 admin, 403 tambahan jika bukan super_admin
//!   RequireCustomer    : 401 jika tanpa/expired token, 403 jika role != customer
//!   OptionalAdminAuth / OptionalCustomerAuth : decode token jika ada,
//!                        return None kalau tidak
//!
//! Token dibaca dari cookie role-specific (`Config::admin_session_cookie_name`
//! atau `Config::customer_session_cookie_name`) — BUKAN satu nama shared.
//! Admin dan customer punya cookie terpisah supaya browser tidak kirim
//! JWT admin ke endpoint customer (atau sebaliknya) hanya karena
//! keduanya di host yang sama (`localhost`) — cookie tidak di-scope per
//! port. Lihat doc-comment di `Config` untuk detail. `Authorization:
//! Bearer` tidak lagi dibaca — cookie-only untuk menutup XSS token-theft.

use axum::{
    async_trait,
    extract::{FromRequestParts, Request},
    http::request::Parts,
    RequestPartsExt,
};
use axum_extra::extract::cookie::CookieJar;

use crate::{
    auth::{Claims, Role},
    error::AppError,
    state::AppState,
};

/// Baca + verify JWT dari cookie `cookie_name`. Dipakai oleh extractor
/// role-specific di bawah supaya admin/customer tidak baca cookie yang
/// sama.
async fn read_claims(
    parts: &mut Parts,
    state: &AppState,
    cookie_name: &str,
) -> Result<Claims, AppError> {
    let jar = parts.extract::<CookieJar>().await.map_err(|_| AppError::Unauthorized)?;
    let cookie = jar.get(cookie_name).ok_or(AppError::Unauthorized)?;
    state.tokens.verify(cookie.value())
}

pub struct RequireAdmin(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for RequireAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let claims = read_claims(parts, state, &state.config.admin_session_cookie_name).await?;
        if claims.role != Role::Admin {
            return Err(AppError::Forbidden);
        }
        Ok(Self(claims))
    }
}

pub struct RequireCustomer(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for RequireCustomer {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let claims =
            read_claims(parts, state, &state.config.customer_session_cookie_name).await?;
        if claims.role != Role::Customer {
            return Err(AppError::Forbidden);
        }
        Ok(Self(claims))
    }
}

pub struct OptionalAdminAuth(pub Option<Claims>);

#[async_trait]
impl FromRequestParts<AppState> for OptionalAdminAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let claims = read_claims(parts, state, &state.config.admin_session_cookie_name)
            .await
            .ok();
        Ok(Self(claims))
    }
}

pub struct OptionalCustomerAuth(pub Option<Claims>);

#[async_trait]
impl FromRequestParts<AppState> for OptionalCustomerAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let claims = read_claims(parts, state, &state.config.customer_session_cookie_name)
            .await
            .ok();
        Ok(Self(claims))
    }
}

/// Layer tambahan di atas `RequireAdmin` — juga cek flag `is_super_admin`
/// di JWT claims. 401/403 dari RequireAdmin (token/k role); 403 lagi kalau
/// admin tapi bukan super_admin.
///
/// Stale sampai token expire (default 8h) setelah promote/demote karena
/// flag di-issue sekali saat login. Acceptable untuk admin internal —
/// trade-off explicit di JWT claim doc. Logout (drop cookie) + login
/// ulang menjadi cara user untuk refresh status setelah promote/demote.
pub struct RequireSuperAdmin(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for RequireSuperAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let RequireAdmin(claims) = RequireAdmin::from_request_parts(parts, state).await?;
        if !claims.is_super_admin {
            return Err(AppError::Forbidden);
        }
        Ok(Self(claims))
    }
}

// Suppress unused-import warning untuk `Request` (di-impor oleh future
// use cases; biarkan accessible di crate ini).
#[allow(dead_code)]
fn _request_phantom(_: Request) {}
