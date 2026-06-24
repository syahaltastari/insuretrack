//! Integration tests untuk double-submit CSRF defense.
//!
//! Bekerja pada level middleware (`auth::csrf::csrf_guard`): semua
//! request mutating (POST/PUT/PATCH/DELETE) harus menyertakan header
//! `X-CSRF-Token` yang cocok dengan cookie `insuretrack_csrf`.
//! Skip-list untuk endpoint publik (login, activate, password reset,
//! webhook) didefinisikan di `auth::csrf::CSRF_SKIP_PATHS`.

mod common;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use serial_test::serial;
use tower::ServiceExt;

const TEST_CSRF: &str = "test-csrf-token";

/// Seed admin + return session token. `csrf` diset eksplisit supaya
/// bisa dibandingkan dengan nilai yang dikirim di header.
async fn admin_session(app: &common::TestApp) -> String {
    common::admin_token(app, insuretrack_backend::auth::jwt::Role::Admin, true).await
}

#[tokio::test]
#[serial]
async fn mutating_without_csrf_header_is_rejected() {
    let app = common::spawn_app().await;
    let token = admin_session(&app).await;

    // Hanya session cookie, tanpa X-CSRF-Token header.
    // PATCH /api/admin/me dengan `{}` body = valid request (no-op update).
    let req = Request::builder()
        .method(Method::PATCH)
        .uri("/api/admin/me")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, common::cookie_session(&app, &token))
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::FORBIDDEN,
        "PATCH tanpa X-CSRF-Token harus ditolak oleh CSRF guard"
    );
}

#[tokio::test]
#[serial]
async fn mutating_with_mismatched_csrf_is_rejected() {
    let app = common::spawn_app().await;
    let token = admin_session(&app).await;

    // Cookie berisi csrf "abc", header berisi "xyz" → mismatch.
    let req = Request::builder()
        .method(Method::PATCH)
        .uri("/api/admin/me")
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::COOKIE,
            common::cookie_with_csrf(&app, &token, "abc"),
        )
        .header("X-CSRF-Token", "xyz")
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::FORBIDDEN,
        "cookie vs header CSRF mismatch harus ditolak"
    );
}

#[tokio::test]
#[serial]
async fn mutating_with_matching_csrf_passes_guard() {
    let app = common::spawn_app().await;
    let token = admin_session(&app).await;

    // cookie + header sama → lanjut ke handler. PATCH /api/admin/me
    // dengan `{}` body = no-op update → return 200 dengan admin data.
    // Kalau dapat 403 → CSRF guard salah reject.
    let req = Request::builder()
        .method(Method::PATCH)
        .uri("/api/admin/me")
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::COOKIE,
            common::cookie_with_csrf(&app, &token, TEST_CSRF),
        )
        .header("X-CSRF-Token", TEST_CSRF)
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "CSRF guard harus pass-through, handler return 200 untuk no-op update, dapat {}",
        resp.status()
    );
}

#[tokio::test]
#[serial]
async fn get_requests_skip_csrf_check() {
    let app = common::spawn_app().await;
    let token = admin_session(&app).await;

    // GET tanpa X-CSRF-Token — harus 200, bukan 403.
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/admin/dashboard/charts")
        .header(header::COOKIE, common::cookie_session(&app, &token))
        .body(Body::empty())
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "GET harus skip CSRF guard"
    );
}

#[tokio::test]
#[serial]
async fn login_endpoint_skips_csrf_check() {
    // Login tidak punya session cookie sebelumnya, jadi CSRF guard
    // di-skip (lihat CSRF_SKIP_PATHS). POST /api/admin/login tanpa
    // X-CSRF-Token harus 200/401 (tergantung credential), BUKAN 403.
    let app = common::spawn_app().await;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/admin/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    // Empty body → validation error 400, BUKAN 403.
    assert_ne!(
        resp.status(),
        StatusCode::FORBIDDEN,
        "login endpoint harus skip CSRF guard, dapat 403 (salah)"
    );
}

#[tokio::test]
#[serial]
async fn login_response_sets_both_cookies() {
    // Setelah login sukses, response harus punya 2 Set-Cookie header:
    // session (HttpOnly) + csrf (tidak HttpOnly). Validasi pakai raw header.
    let app = common::spawn_app().await;
    common::seed_admin(&app.pool, "testadmin").await;

    use argon2::password_hash::PasswordHasher;
    use insuretrack_backend::auth::password;
    let hashed = password::hash_password("Test1234!").unwrap();
    sqlx::query("UPDATE admin_users SET password_hash = $1 WHERE username = 'testadmin'")
        .bind(&hashed)
        .execute(&app.pool)
        .await
        .unwrap();

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/admin/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({"username": "testadmin", "password": "Test1234!"}).to_string(),
        ))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let cookies: Vec<String> = resp
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect();

    // Minimal 2 Set-Cookie: session + csrf
    let has_session = cookies
        .iter()
        .any(|c| c.starts_with(&app.config.session_cookie_name) && c.contains("HttpOnly"));
    let has_csrf = cookies
        .iter()
        .any(|c| c.starts_with(&app.config.csrf_cookie_name) && !c.contains("HttpOnly"));
    assert!(has_session, "session cookie HttpOnly harus di-set: {cookies:?}");
    assert!(has_csrf, "CSRF cookie (non-HttpOnly) harus di-set: {cookies:?}");
}

#[tokio::test]
#[serial]
async fn logout_endpoints_skip_csrf_check() {
    // Logout ada di CSRF skip list —lihat `auth::csrf::CSRF_SKIP_PATHS`.
    // Alasan: cross-origin dev mode cookie tidak visible, plus logout
    // intrinsically low-risk (attacker forcing logout = annoying saja,
    // no data loss). Verify dengan test: POST /api/customer/logout
    // tanpa X-CSRF-Token harus 401 (RequireCustomer reject karena belum
    // login) atau 204, BUKAN 403.
    let app = common::spawn_app().await;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/customer/logout")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    // Tanpa session cookie → 401 dari RequireCustomer extractor.
    // Yang penting: status BUKAN 403 (CSRF guard tidak reject).
    assert_ne!(
        resp.status(),
        StatusCode::FORBIDDEN,
        "logout harus skip CSRF guard — dapat 403 berarti CSRF block (salah)"
    );
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "tanpa session harus 401, bukan 200/204"
    );

    // Sama untuk admin logout.
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/admin/logout")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_ne!(
        resp.status(),
        StatusCode::FORBIDDEN,
        "admin logout harus skip CSRF guard"
    );
}

#[tokio::test]
#[serial]
async fn logout_response_clears_cookies_via_set_cookie_header() {
    // Regression test: kalau response 204 tapi tanpa Set-Cookie header,
    // browser tidak tahu harus hapus cookie — user tetap logged in setelah
    // klik logout. axum_extra::CookieJar implements IntoResponseParts
    // (bukan IntoResponse), jadi HARUS return 3-tuple
    // (StatusCode, CookieJar, body) untuk trigger IntoResponseParts.
    // Lihat routes/{admin,customer}.rs::logout.
    let app = common::spawn_app().await;

    // Seed customer supaya login bisa authenticate.
    let customer_id =
        common::seed_customer(&app.pool, "logout-smoke@test.local", "ACTIVE").await;
    use insuretrack_backend::auth::password;
    let hashed = password::hash_password("Test1234!").unwrap();
    sqlx::query("UPDATE customers SET password_hash = $1 WHERE id = $2")
        .bind(&hashed)
        .bind(customer_id)
        .execute(&app.pool)
        .await
        .unwrap();

    // Login untuk dapat session + csrf cookies valid.
    let login = app
        .router
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/customer/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "username": "logout-smoke@test.local",
                        "password": "Test1234!",
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login.status(), StatusCode::OK);

    // Ambil session cookie value (JWT) dari response, forward ke logout.
    // Cookie value di-parse dari "name=value; attr=..." — extract hanya
    // bagian "value" sebelum ';'.
    let session_cookie = login
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .find_map(|v| {
            let s = v.to_str().ok()?;
            let full = s.strip_prefix(&format!("{}=", app.config.session_cookie_name))?;
            // Split di ';' pertama (cookie attributes separator)
            let value = full.split(';').next()?.trim();
            if value.is_empty() { None } else { Some(value.to_string()) }
        })
        .expect("login harus return session cookie dengan value non-empty");

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/customer/logout")
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::COOKIE,
            format!("{}={}", app.config.session_cookie_name, session_cookie),
        )
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // **Critical assertion**: response harus punya 2 Set-Cookie header
    // (session + csrf) dengan Max-Age=0. Kalau tidak ada → bug regresi
    // dari 2-tuple yang lupa trigger IntoResponseParts.
    let cookies: Vec<String> = resp
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect();
    let has_session_clear = cookies.iter().any(|c| {
        c.starts_with(&app.config.session_cookie_name) && c.contains("Max-Age=0")
    });
    let has_csrf_clear = cookies.iter().any(|c| {
        c.starts_with(&app.config.csrf_cookie_name) && c.contains("Max-Age=0")
    });
    assert!(
        has_session_clear,
        "session cookie harus di-clear (Max-Age=0): {cookies:?}"
    );
    assert!(
        has_csrf_clear,
        "CSRF cookie harus di-clear (Max-Age=0): {cookies:?}"
    );
}
