//! Integration tests untuk claim admin PATCH (FS-19, state machine).
//!
//! Customer submit claim pakai multipart/form-data (lebih kompleks),
//! jadi test fokus pada admin-side state machine enforcement — itu
//! yang paling berisiko dan belum punya unit test (Invoice/Registration
//! juga belum, tapi itu covered di payment_webhook.rs).

mod common;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use chrono::Utc;
use serde_json::{json, Value};
use serial_test::serial;
use tower::ServiceExt;
use uuid::Uuid;

/// Seed customer + ACTIVE policy + 1 SUBMITTED claim. Returns ids.
async fn seed_submitted_claim(pool: &sqlx::PgPool, product: &str) -> (Uuid, Uuid, Uuid, Uuid) {
    let customer_id = common::seed_customer(pool, "claim-cust@test.local", "ACTIVE").await;
    let now = Utc::now();
    let reg_no = format!("REG-{}-000001", now.format("%Y%m"));
    let inv_no = format!("INV-{}-000001", now.format("%Y%m"));
    let pol_no = format!("POL-{}-000001", now.format("%Y%m"));

    let mut tx = pool.begin().await.unwrap();
    let (reg_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO registrations (registration_no, customer_id, product, sum_assured, coverage_term, status, applicant_type)
           VALUES ($1, $2, $3, 100000000, 10, 'ISSUED', 'INDIVIDU')
           RETURNING id"#,
    )
    .bind(&reg_no)
    .bind(customer_id)
    .bind(product)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    sqlx::query(
        r#"INSERT INTO invoices (invoice_no, registration_id, premium_amount, due_date, status, paid_at)
           VALUES ($1, $2, 9000000, now() - interval '1 day', 'PAID', now())"#,
    )
    .bind(&inv_no)
    .bind(reg_id)
    .execute(&mut *tx)
    .await
    .unwrap();

    let sum_assured: i64 = if product == "HEALTH" {
        50_000_000
    } else {
        100_000_000
    };
    let (policy_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO policies (
            policy_no, registration_id, product, sum_assured, premium,
            effective_date, expiry_date, status
        ) VALUES (
            $1, $2, $3, $4, 9000000,
            CURRENT_DATE - interval '1 month', CURRENT_DATE + interval '9 years', 'ACTIVE'
        ) RETURNING id"#,
    )
    .bind(&pol_no)
    .bind(reg_id)
    .bind(product)
    .bind(sum_assured)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    let claim_no = format!("CLM-{}-000001", now.format("%Y%m"));
    let (claim_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO claims (
            claim_no, policy_id, customer_id, claim_type, incident_date,
            claimed_amount, description, status
        ) VALUES ($1, $2, $3, 'DEATH', CURRENT_DATE - interval '5 days',
                  10000000, 'Seeded claim for state machine test', 'SUBMITTED')
        RETURNING id"#,
    )
    .bind(&claim_no)
    .bind(policy_id)
    .bind(customer_id)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    tx.commit().await.unwrap();
    (customer_id, policy_id, claim_id, customer_id)
}

async fn admin_patch_claim(
    app: &common::TestApp,
    claim_id: Uuid,
    new_status: &str,
) -> (StatusCode, Value) {
    let token = common::admin_token(app, insuretrack_backend::auth::jwt::Role::Admin, true).await;
    let csrf = "test-csrf-token";
    let req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/admin/claims/{claim_id}"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, common::cookie_with_csrf(app, &token, csrf))
        .header("X-CSRF-Token", csrf)
        .body(Body::from(
            json!({
                "status": new_status,
                "decision_note": format!("test transition to {new_status}")
            })
            .to_string(),
        ))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

#[tokio::test]
#[serial]
async fn claim_full_legal_chain() {
    let app = common::spawn_app().await;
    let (_cust, _pol, claim_id, _) = seed_submitted_claim(&app.pool, "LIFE").await;

    // SUBMITTED → UNDER_REVIEW
    let (s, v) = admin_patch_claim(&app, claim_id, "UNDER_REVIEW").await;
    assert_eq!(s, StatusCode::OK, "to UNDER_REVIEW: {v}");
    assert_eq!(v["status"], "UNDER_REVIEW");

    // UNDER_REVIEW → APPROVED
    let (s, v) = admin_patch_claim(&app, claim_id, "APPROVED").await;
    assert_eq!(s, StatusCode::OK, "to APPROVED: {v}");

    // APPROVED → PAID
    let (s, v) = admin_patch_claim(&app, claim_id, "PAID").await;
    assert_eq!(s, StatusCode::OK, "to PAID: {v}");
    assert_eq!(v["status"], "PAID");

    // DB reflects PAID.
    let row: (String,) = sqlx::query_as("SELECT status FROM claims WHERE id = $1")
        .bind(claim_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(row.0, "PAID");
}

#[tokio::test]
#[serial]
async fn claim_illegal_skip_to_paid_rejected() {
    let app = common::spawn_app().await;
    let (_cust, _pol, claim_id, _) = seed_submitted_claim(&app.pool, "HEALTH").await;

    // SUBMITTED → PAID (ILLEGAL — must pass through UNDER_REVIEW + APPROVED)
    let (status, body) = admin_patch_claim(&app, claim_id, "PAID").await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "skip harus ditolak: {body}"
    );

    let row: (String,) = sqlx::query_as("SELECT status FROM claims WHERE id = $1")
        .bind(claim_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(row.0, "SUBMITTED", "status DB tidak boleh berubah");
}

#[tokio::test]
#[serial]
async fn claim_cannot_go_backwards() {
    let app = common::spawn_app().await;
    let (_cust, _pol, claim_id, _) = seed_submitted_claim(&app.pool, "PERSONAL_ACCIDENT").await;

    // SUBMITTED → UNDER_REVIEW (legal)
    let (s, _) = admin_patch_claim(&app, claim_id, "UNDER_REVIEW").await;
    assert_eq!(s, StatusCode::OK);

    // UNDER_REVIEW → SUBMITTED (ILLEGAL — no backwards)
    let (s, _) = admin_patch_claim(&app, claim_id, "SUBMITTED").await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial]
async fn claim_rejected_is_terminal() {
    let app = common::spawn_app().await;
    let (_cust, _pol, claim_id, _) = seed_submitted_claim(&app.pool, "HEALTH").await;

    // SUBMITTED → REJECTED (legal)
    let (s, _) = admin_patch_claim(&app, claim_id, "REJECTED").await;
    assert_eq!(s, StatusCode::OK);

    // REJECTED → anything (ILLEGAL — terminal)
    for to in ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "PAID"] {
        let (s, _) = admin_patch_claim(&app, claim_id, to).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "REJECTED → {to} harus ditolak");
    }
}

#[tokio::test]
#[serial]
async fn claim_admin_requires_auth() {
    let app = common::spawn_app().await;
    let (_cust, _pol, claim_id, _) = seed_submitted_claim(&app.pool, "LIFE").await;

    // Tanpa token/cookie → 403 (CSRF guard fire duluan, sebelum auth check).
    let req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/admin/claims/{claim_id}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "status": "UNDER_REVIEW" }).to_string()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);

    // Dengan customer cookie (wrong role) → 403.
    let cust_token = common::customer_token(&app, _cust);
    let csrf = "test-csrf-token";
    let req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/admin/claims/{claim_id}"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::COOKIE,
            common::cookie_with_csrf(&app, &cust_token, csrf),
        )
        .header("X-CSRF-Token", csrf)
        .body(Body::from(json!({ "status": "UNDER_REVIEW" }).to_string()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}
