//! Auth extractors for Axum handlers.
//!
//!   RequireAdmin    : 401 jika tanpa/expired token, 403 jika role != admin
//!   RequireCustomer : 401 jika tanpa/expired token, 403 jika role != customer
//!   OptionalAuth    : decode token jika ada, return None kalau tidak
//!
//! `Authenticated` adalah helper yang expose `Claims` ke handler.

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts, HeaderMap},
};

use crate::{
    auth::{Claims, Role},
    error::AppError,
    state::AppState,
};

fn extract_bearer(headers: &HeaderMap) -> Result<&str, AppError> {
    let raw = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    raw.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)
}

pub struct Authenticated(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for Authenticated {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(&parts.headers)?;
        let claims = state.tokens.verify(token)?;
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
        let result = match extract_bearer(&parts.headers) {
            Ok(token) => state.tokens.verify(token).ok(),
            Err(_) => None,
        };
        Ok(Self(result))
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
