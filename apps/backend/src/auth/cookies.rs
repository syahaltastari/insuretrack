//! Helpers untuk set/clear auth cookies (session + CSRF) di response.
//!
//! - **Session cookie** — HttpOnly + Secure + SameSite=Lax + JWT.
//!   HttpOnly men-disable JavaScript access; XSS tidak bisa curi token.
//!   `Secure` di-set sesuai `Config::cookie_secure` (true di HTTPS prod).
//! - **CSRF cookie** — TIDAK HttpOnly, JS-readable via `document.cookie`.
//!   Frontend kirim value-nya sebagai header `X-CSRF-Token` di tiap
//!   request mutating; backend cocokkan dengan cookie value (double-submit).
//!
//! Domain attribute opsional lewat `Config::cookie_domain`. Kosong = host-only
//! (cukup untuk dev di mana FE & BE di port berbeda — browser kirim cookie
//! karena request target = BE host). Production subdomain (`portal.X`,
//! `admin.X`, `api.X`) butuh `Domain=.X` agar cookie diteruskan.

use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use time::Duration;

use crate::config::Config;

/// Generate random 32-byte CSRF token, base64url-encoded (~43 chars).
/// Dipakai di companion cookie; FE mirror ke `X-CSRF-Token` header.
pub fn generate_csrf_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Build (session, csrf) cookie pair untuk response login yang sukses.
/// `ttl_seconds` cocokkan dengan `TokenService::issue` TTL.
pub fn build_auth_cookies(
    cfg: &Config,
    session_jwt: String,
    csrf_token: String,
    ttl_seconds: i64,
) -> CookieJar {
    let mut jar = CookieJar::new();

    let mut session = Cookie::build((cfg.session_cookie_name.clone(), session_jwt))
        .http_only(true)
        .secure(cfg.cookie_secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(Duration::seconds(ttl_seconds))
        .build();
    if !cfg.cookie_domain.is_empty() {
        session.set_domain(cfg.cookie_domain.clone());
    }
    jar = jar.add(session);

    let mut csrf = Cookie::build((cfg.csrf_cookie_name.clone(), csrf_token))
        .http_only(false) // JS harus bisa baca untuk mirror ke X-CSRF-Token
        .secure(cfg.cookie_secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(Duration::seconds(ttl_seconds))
        .build();
    if !cfg.cookie_domain.is_empty() {
        csrf.set_domain(cfg.cookie_domain.clone());
    }
    jar = jar.add(csrf);

    jar
}

/// Build clear-cookie pair untuk logout (Max-Age=0). Browser drop
/// cookie-nya immediately; value field di-set empty string sesuai
/// konvensi `Set-Cookie` untuk deletion.
pub fn build_clear_cookies(cfg: &Config) -> CookieJar {
    let mut jar = CookieJar::new();

    let mut session = Cookie::build((cfg.session_cookie_name.clone(), String::new()))
        .http_only(true)
        .secure(cfg.cookie_secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(Duration::ZERO)
        .build();
    if !cfg.cookie_domain.is_empty() {
        session.set_domain(cfg.cookie_domain.clone());
    }
    jar = jar.remove(session);

    let mut csrf = Cookie::build((cfg.csrf_cookie_name.clone(), String::new()))
        .http_only(false)
        .secure(cfg.cookie_secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(Duration::ZERO)
        .build();
    if !cfg.cookie_domain.is_empty() {
        csrf.set_domain(cfg.cookie_domain.clone());
    }
    jar = jar.remove(csrf);

    jar
}
