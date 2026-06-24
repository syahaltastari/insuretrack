//! CSRF defense via double-submit cookie pattern.
//!
//! Flow:
//! 1. Login/activate/password-reset-consume set dua cookie: session
//!    (HttpOnly) + csrf (NOT HttpOnly).
//! 2. Frontend mirror value csrf cookie ke header `X-CSRF-Token`.
//! 3. Backend middleware cocokkan `X-CSRF-Token` header dengan
//!    `csrf_cookie` value — mismatch → 403.
//!
//! Mengapa cukup: SameSite=Lax sudah block cross-site form POST,
//! dan semua endpoint kita terima JSON `Content-Type: application/json`
//! (bukan `application/x-www-form-urlencoded`) — browser tidak bisa
//! kirim JSON body dari form CSRF sederhana. Double-submit CSRF adalah
//! defense-in-depth tambahan untuk kasus cross-site XHR/fetch dengan
//! Content-Type JSON yang di-trigger script di same-site subdomain.

use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use axum_extra::extract::cookie::CookieJar;

use crate::{error::AppError, state::AppState};

/// Path yang di-skip dari CSRF check. Pola: endpoint yang tidak punya
/// session cookie (sebelum login), yang pakai auth scheme lain
/// (webhook), atau yang intrinsically low-risk (logout).
///
/// Logout di-skip karena:
///   1. Attacker forcing user logout = annoying tapi no data loss, no
///      privilege escalation — low CSRF risk.
///   2. Cross-origin dev mode: cookie CSRF di-set di origin backend
///      (port 8080), FE di origin berbeda (port 3000) tidak bisa baca
///      via document.cookie untuk mirror ke X-CSRF-Token. Same-origin
///      rewrites di dev sudah workaround ini, tapi logout skip list
///      adalah belt-and-suspenders untuk production juga.
///   3. Logout endpoint return 401 kalau session invalid (RequireCustomer
///      extractor) — CSRF guard redundant sebagai extra check.
const CSRF_SKIP_PATHS: &[&str] = &[
    "/api/admin/login",
    "/api/admin/logout",
    "/api/customer/login",
    "/api/customer/logout",
    "/api/customer/activate",
    "/api/customer/password/reset",
    "/api/public/payment/webhook",
];

pub async fn csrf_guard(
    State(state): State<AppState>,
    cookies: CookieJar,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    // GET/HEAD/OPTIONS: aman secara spec, skip check.
    if matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(next.run(req).await);
    }

    // Path tertentu: skip (lihat doc-comment di atas).
    if CSRF_SKIP_PATHS.contains(&req.uri().path()) {
        return Ok(next.run(req).await);
    }

    // Bandingkan cookie vs header.
    let cookie_value = cookies
        .get(&state.config.csrf_cookie_name)
        .map(|c| c.value().to_string())
        .ok_or(AppError::Forbidden)?;
    let header_value = req
        .headers()
        .get("X-CSRF-Token")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::Forbidden)?;

    // Constant-time compare untuk mitigasi timing attack (beda panjang
    // pun tetap aman — early-return di `if len differs` di-skip, tapi
    // keduanya short random string jadi tidak krusial; tetap defensive).
    if !constant_time_eq(cookie_value.as_bytes(), header_value.as_bytes()) {
        return Err(AppError::Forbidden);
    }

    Ok(next.run(req).await)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut acc = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        acc |= x ^ y;
    }
    acc == 0
}
