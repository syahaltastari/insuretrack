//! Integration tests untuk admin customer management endpoints.
//!
//! Spec §8.3 v1.2 tidak mendaftarkan endpoint customers — tests ini
//! adalah contract untuk extension `/api/admin/customers/*`.
//! Pola: mirror `claims.rs` — seed → call endpoint → assert response.

mod common;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use serde_json::json;
use serial_test::serial;
use uuid::Uuid;

use insuretrack_backend::auth::jwt::Role;

// ---- Helpers --------------------------------------------------------------
//
// Setelah migrasi ke cookie auth, request admin butuh `Cookie:` header
// (session) untuk GET, dan `Cookie:` + `X-CSRF-Token` untuk mutating.

const TEST_CSRF: &str = "test-csrf-token";

/// Seed admin + return (token, admin_id). Caller bangun Cookie header
/// sendiri via `common::cookie_session` (GET) atau `common::cookie_with_csrf`
/// (mutating). Decoupling ini supaya caller bisa akses token untuk debugging
/// atau test tertentu.
async fn admin_auth(app: &common::TestApp) -> (String, Uuid) {
    let token = common::admin_token(app, Role::Admin, true).await;
    let admin_id: (Uuid,) =
        sqlx::query_as("SELECT id FROM admin_users WHERE username = 'testadmin'")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    (token, admin_id.0)
}

fn get_json(app: &common::TestApp, uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method(Method::GET)
        .uri(uri)
        .header(header::COOKIE, common::cookie_session(app, token))
        .body(Body::empty())
        .unwrap()
}

fn post_empty(app: &common::TestApp, uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(
            header::COOKIE,
            common::cookie_with_csrf(app, token, TEST_CSRF),
        )
        .header("X-CSRF-Token", TEST_CSRF)
        .body(Body::empty())
        .unwrap()
}

// ---- List -----------------------------------------------------------------

#[tokio::test]
#[serial]
async fn list_customers_returns_paginated() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    // Seed 3 customers.
    for i in 0..3 {
        common::seed_customer(&app.pool, &format!("c{i}@test.local"), "PENDING").await;
    }

    let (status, body) = common::response_json(
        common::send(
            &app,
            get_json(&app, "/api/admin/customers?page=1&page_size=2", &token),
        )
        .await,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["total"], 3);
    assert_eq!(body["page"], 1);
    assert_eq!(body["page_size"], 2);
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
}

#[tokio::test]
#[serial]
async fn list_customers_search_filters_by_email() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    common::seed_customer(&app.pool, "alpha@test.local", "ACTIVE").await;
    common::seed_customer(&app.pool, "beta@test.local", "ACTIVE").await;
    common::seed_customer(&app.pool, "gamma@other.local", "ACTIVE").await;

    let (_, body) = common::response_json(
        common::send(&app, get_json(&app, "/api/admin/customers?q=alpha", &token)).await,
    )
    .await;
    assert_eq!(body["total"], 1);
    assert_eq!(body["data"][0]["email"], "alpha@test.local");
}

#[tokio::test]
#[serial]
async fn list_customers_filter_by_portal_status() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    common::seed_customer(&app.pool, "p1@test.local", "PENDING").await;
    common::seed_customer(&app.pool, "p2@test.local", "PENDING").await;
    common::seed_customer(&app.pool, "a1@test.local", "ACTIVE").await;

    let (_, body) = common::response_json(
        common::send(
            &app,
            get_json(&app, "/api/admin/customers?status=PENDING", &token),
        )
        .await,
    )
    .await;
    assert_eq!(body["total"], 2);
}

#[tokio::test]
#[serial]
async fn list_customers_filter_by_is_active() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "x@test.local", "ACTIVE").await;
    // Deactivate
    sqlx::query("UPDATE customers SET is_active = FALSE, deactivated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&app.pool)
        .await
        .unwrap();
    common::seed_customer(&app.pool, "y@test.local", "ACTIVE").await;

    let (_, body) = common::response_json(
        common::send(
            &app,
            get_json(&app, "/api/admin/customers?active=false", &token),
        )
        .await,
    )
    .await;
    assert_eq!(body["total"], 1);
    assert_eq!(body["data"][0]["is_active"], false);
}

#[tokio::test]
#[serial]
async fn list_customers_csv_format() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    common::seed_customer(&app.pool, "csv@test.local", "ACTIVE").await;

    let resp = common::send(
        &app,
        get_json(&app, "/api/admin/customers?format=csv", &token),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .map(|v| v.to_str().unwrap().to_string())
        .unwrap_or_default();
    assert!(ct.starts_with("text/csv"), "expected text/csv, got {ct}");
    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let body = String::from_utf8(bytes.to_vec()).unwrap();
    // Header row + at least 1 data row. Field headers dipisah koma,
    // jadi cek substring per-field supaya tidak rapuh terhadap urutan.
    let header_line = body.lines().next().unwrap_or("");
    for col in ["ID", "NIK", "Nama", "Email", "HP", "Portal", "Aktif"] {
        assert!(
            header_line.contains(col),
            "header harus punya kolom '{col}', got: {header_line}"
        );
    }
    assert!(body.contains("csv@test.local"));
}

#[tokio::test]
#[serial]
async fn list_customers_requires_admin_token() {
    let app = common::spawn_app().await;
    // Tanpa token → 401
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/admin/customers")
        .body(Body::empty())
        .unwrap();
    let resp = common::send(&app, req).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

// ---- Detail ---------------------------------------------------------------

#[tokio::test]
#[serial]
async fn get_customer_detail_embeds_counts() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let customer_id = common::seed_customer(&app.pool, "d@test.local", "ACTIVE").await;

    // Seed 2 registrations untuk customer ini
    for i in 1..=2 {
        let reg_no = format!("REG-REG-{:04}", i);
        sqlx::query(
            "INSERT INTO registrations (registration_no, customer_id, product, sum_assured, coverage_term, status, applicant_type) \
             VALUES ($1, $2, 'LIFE', 100000000, 10, 'PENDING', 'INDIVIDU')",
        )
        .bind(&reg_no)
        .bind(customer_id)
        .execute(&app.pool)
        .await
        .unwrap();
    }

    let resp = common::send(
        &app,
        get_json(&app, &format!("/api/admin/customers/{customer_id}"), &token),
    )
    .await;
    let (status, body) = common::response_json(resp).await;
    if status != StatusCode::OK {
        eprintln!("DEBUG detail body: {body}");
    }
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], customer_id.to_string());
    assert_eq!(body["email"], "d@test.local");
    assert_eq!(body["registrations_count"], 2);
    assert_eq!(body["recent_registrations"].as_array().unwrap().len(), 2);
}

#[tokio::test]
#[serial]
async fn get_customer_not_found_returns_404() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let random_id = Uuid::new_v4();
    let (status, _) = common::response_json(
        common::send(
            &app,
            get_json(&app, &format!("/api/admin/customers/{random_id}"), &token),
        )
        .await,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---- Activate / Deactivate ------------------------------------------------

#[tokio::test]
#[serial]
async fn deactivate_then_activate_toggles_is_active() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "tog@test.local", "ACTIVE").await;

    // Deactivate
    let resp = common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{id}/deactivate"),
            &token,
        ),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    let row: (bool, Option<chrono::DateTime<chrono::Utc>>) =
        sqlx::query_as("SELECT is_active, deactivated_at FROM customers WHERE id = $1")
            .bind(id)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(row.0, false);
    assert!(row.1.is_some(), "deactivated_at harus di-set");

    // Activate
    let resp = common::send(
        &app,
        post_empty(&app, &format!("/api/admin/customers/{id}/activate"), &token),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    let row: (bool, Option<chrono::DateTime<chrono::Utc>>) =
        sqlx::query_as("SELECT is_active, deactivated_at FROM customers WHERE id = $1")
            .bind(id)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(row.0, true);
    // Re-activate harus clear deactivated_at
    assert!(
        row.1.is_none(),
        "deactivated_at harus NULL setelah aktivasi ulang"
    );
}

#[tokio::test]
#[serial]
async fn deactivate_already_inactive_returns_404() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "ai@test.local", "ACTIVE").await;
    // First deactivate: success
    let r1 = common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{id}/deactivate"),
            &token,
        ),
    )
    .await;
    assert_eq!(r1.status(), StatusCode::NO_CONTENT);
    // Second: 404
    let r2 = common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{id}/deactivate"),
            &token,
        ),
    )
    .await;
    assert_eq!(r2.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial]
async fn deactivate_creates_audit_log() {
    let app = common::spawn_app().await;
    let (token, admin_id) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "audit@test.local", "ACTIVE").await;

    common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{id}/deactivate"),
            &token,
        ),
    )
    .await;

    let entry: (String, String, String, Option<serde_json::Value>) = sqlx::query_as(
        "SELECT actor, action, entity_type, metadata \
         FROM audit_logs \
         WHERE entity_type = 'customer' AND entity_id = $1 \
           AND action = 'customer_deactivated_by_admin' \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(entry.0, admin_id.to_string());
    assert_eq!(entry.1, "customer_deactivated_by_admin");
    assert_eq!(entry.2, "customer");
    assert_eq!(entry.3.unwrap()["actor_id"], json!(admin_id.to_string()));
}

// ---- Login gate -----------------------------------------------------------

#[tokio::test]
#[serial]
async fn deactivated_customer_cannot_login() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "block@test.local", "ACTIVE").await;
    // Set password yang valid (argon2 hash placeholder dari seed_customer
    // adalah 'argon2id$placeholder' — tidak valid hash, jadi kita UPDATE
    // dengan hash dari password yang kita tahu).
    use insuretrack_backend::auth::password;
    let new_hash = password::hash_password("Test1234!").unwrap();
    sqlx::query("UPDATE customers SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(id)
        .execute(&app.pool)
        .await
        .unwrap();

    // Deactivate
    common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{id}/deactivate"),
            &token,
        ),
    )
    .await;

    // Coba login → harus 401
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/customer/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({"username": "block@test.local", "password": "Test1234!"}).to_string(),
        ))
        .unwrap();
    let resp = common::send(&app, req).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial]
async fn active_customer_can_login() {
    let app = common::spawn_app().await;
    let _ = admin_auth(&app).await; // touch admin to ensure schema
    let id = common::seed_customer(&app.pool, "ok@test.local", "ACTIVE").await;
    use insuretrack_backend::auth::password;
    let h = password::hash_password("Test1234!").unwrap();
    sqlx::query("UPDATE customers SET password_hash = $1 WHERE id = $2")
        .bind(&h)
        .bind(id)
        .execute(&app.pool)
        .await
        .unwrap();

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/customer/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({"username": "ok@test.local", "password": "Test1234!"}).to_string(),
        ))
        .unwrap();
    let resp = common::send(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
}

// ---- Reset password -------------------------------------------------------

#[tokio::test]
#[serial]
async fn reset_password_returns_plaintext_and_works_for_login() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "reset@test.local", "ACTIVE").await;

    let (_, body) = common::response_json(
        common::send(
            &app,
            post_empty(
                &app,
                &format!("/api/admin/customers/{id}/reset-password"),
                &token,
            ),
        )
        .await,
    )
    .await;
    let new_pw = body["new_password"]
        .as_str()
        .expect("new_password")
        .to_string();
    assert!(!new_pw.is_empty());
    assert!(new_pw.len() >= 8);

    // Login pakai password baru harus sukses
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/customer/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({"username": "reset@test.local", "password": new_pw}).to_string(),
        ))
        .unwrap();
    let resp = common::send(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
#[serial]
async fn reset_password_audit_stores_length_not_plaintext() {
    let app = common::spawn_app().await;
    let (token, admin_id) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "raudit@test.local", "ACTIVE").await;

    let (_, body) = common::response_json(
        common::send(
            &app,
            post_empty(
                &app,
                &format!("/api/admin/customers/{id}/reset-password"),
                &token,
            ),
        )
        .await,
    )
    .await;
    let plaintext = body["new_password"].as_str().unwrap().to_string();

    let entry: (String, Option<serde_json::Value>) = sqlx::query_as(
        "SELECT action, metadata FROM audit_logs \
         WHERE entity_type = 'customer' AND entity_id = $1 \
           AND action = 'customer_password_reset_by_admin' \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(entry.0, "customer_password_reset_by_admin");
    let meta = entry.1.unwrap();
    assert_eq!(meta["actor_id"], json!(admin_id.to_string()));
    assert_eq!(meta["generated_password_length"], 16);
    // SECURITY: plaintext TIDAK boleh masuk ke audit metadata
    let meta_str = meta.to_string();
    assert!(
        !meta_str.contains(&plaintext),
        "audit metadata leaked plaintext password"
    );
}

// ---- Resend activation ----------------------------------------------------

#[tokio::test]
#[serial]
async fn resend_activation_for_pending_sends_email() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "ra@test.local", "PENDING").await;
    app.email.clear();

    let (status, body) = common::response_json(
        common::send(
            &app,
            post_empty(
                &app,
                &format!("/api/admin/customers/{id}/resend-activation"),
                &token,
            ),
        )
        .await,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);
    assert_eq!(body["email"], "ra@test.local");

    // Email harus terkirim
    assert_eq!(app.email.count(), 1, "activation email harus dikirim");
    let sent = app.email.last().unwrap();
    assert_eq!(sent.to, "ra@test.local");
    assert!(sent.subject.contains("Aktivasi"));
    assert!(sent.text.contains("/portal/activate?token="));
}

#[tokio::test]
#[serial]
async fn resend_activation_refuses_if_already_active() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let id = common::seed_customer(&app.pool, "already@test.local", "ACTIVE").await;

    let (status, body) = common::response_json(
        common::send(
            &app,
            post_empty(
                &app,
                &format!("/api/admin/customers/{id}/resend-activation"),
                &token,
            ),
        )
        .await,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"]["message"]
        .as_str()
        .unwrap()
        .contains("sudah aktif"));
}

#[tokio::test]
#[serial]
async fn resend_activation_for_missing_customer_returns_404() {
    let app = common::spawn_app().await;
    let (token, _) = admin_auth(&app).await;
    let random_id = Uuid::new_v4();
    let resp = common::send(
        &app,
        post_empty(
            &app,
            &format!("/api/admin/customers/{random_id}/resend-activation"),
            &token,
        ),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}
