//! Auth extractors for Axum handlers.
//!
//!   RequireAdmin       : 401 jika tanpa/expired token, 403 jika role != admin
//!   RequireSuperAdmin  : 401 + 403 admin, 403 tambahan jika bukan super_admin
//!   RequireCustomer    : 401 jika tanpa/expired token, 403 jika role != customer
//!   OptionalAuth       : decode token jika ada, return None kalau tidak
//!
//! `Authenticated` adalah helper yang expose `Claims` ke handler.
//!
//! Token dibaca dari cookie `Config::session_cookie_name` (HttpOnly JWT
//! di-set saat login via `Set-Cookie`). `Authorization: Bearer` tidak
//! lagi dibaca — cookie-only untuk menutup XSS token-theft.

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

pub struct Authenticated(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for Authenticated {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = parts.extract::<CookieJar>().await.map_err(|_| AppError::Unauthorized)?;
        let cookie = jar
            .get(&state.config.session_cookie_name)
            .ok_or(AppError::Unauthorized)?;
        let claims = state.tokens.verify(cookie.value())?;
        Ok(Self(claims))
    }
}

pub struct OptionalAuth(pub Option<Claims>);

#[async_trait]
impl FromRequestParts<AppState> for OptionalAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = match parts.extract::<CookieJar>().await {
            Ok(j) => j,
            Err(_) => return Ok(Self(None)),
        };
        let claims = jar
            .get(&state.config.session_cookie_name)
            .and_then(|c| state.tokens.verify(c.value()).ok());
        Ok(Self(claims))
    }
}

pub struct RequireAdmin(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for RequireAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let Authenticated(claims) = Authenticated::from_request_parts(parts, state).await?;
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
        let Authenticated(claims) = Authenticated::from_request_parts(parts, state).await?;
        if claims.role != Role::Customer {
            return Err(AppError::Forbidden);
        }
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
