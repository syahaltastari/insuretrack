//! Integration tests untuk `POST /api/public/payment/webhook` (spec FS-06).
//!
//! Skenario paling kritis di sini: **idempotency**. Spec §3.2 mewajibkan
//! replay webhook (gateway callback lebih dari 1× untuk invoice yang sama)
//! tidak menyebabkan duplicate policy atau duplicate email.

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

/// Seed minimal: customer (ACTIVE) + registration (PENDING) + invoice (UNPAID).
/// Returns (customer_id, registration_id, invoice_no).
async fn seed_pending_invoice(pool: &sqlx::PgPool) -> (Uuid, Uuid, String) {
    let customer_id = common::seed_customer(pool, "budi@test.local", "ACTIVE").await;

    // Insert registration
    let now = Utc::now();
    let reg_no = format!("REG-{}-000001", now.format("%Y%m"));
    let (reg_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO registrations (registration_no, customer_id, product, sum_assured, coverage_term, status, applicant_type)
           VALUES ($1, $2, 'LIFE', 100000000, 10, 'PENDING', 'INDIVIDU')
           RETURNING id"#,
    )
    .bind(&reg_no)
    .bind(customer_id)
    .fetch_one(pool)
    .await
    .unwrap();

    // Insert invoice UNPAID
    let inv_no = format!("INV-{}-000001", now.format("%Y%m"));
    sqlx::query(
        r#"INSERT INTO invoices (invoice_no, registration_id, premium_amount, due_date, status)
           VALUES ($1, $2, 9000000, now() + interval '7 days', 'UNPAID')"#,
    )
    .bind(&inv_no)
    .bind(reg_id)
    .execute(pool)
    .await
    .unwrap();

    (customer_id, reg_id, inv_no)
}

async fn call_webhook(app: &common::TestApp, secret: &str, body: Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/public/payment/webhook")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-webhook-secret", secret)
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

#[tokio::test]
#[serial]
async fn webhook_idempotency_five_replays_yield_one_policy() {
    let app = common::spawn_app().await;
    let (customer_id, _reg_id, inv_no) = seed_pending_invoice(&app.pool).await;

    let body = json!({
        "invoice_no": inv_no,
        "payment_status": "PAID",
        "payment_date": "2026-06-18",
    });

    // Panggil 5× — hanya call pertama yang benar-benar transition; sisanya
    // return `replayed: true`.
    for i in 1..=5 {
        let (status, value) =
            call_webhook(&app, &app.config.payment_webhook_secret, body.clone()).await;
        assert_eq!(status, StatusCode::OK, "call #{i} status");

        if i == 1 {
            assert_eq!(value["replayed"], json!(false));
            assert!(
                value["policy_no"].is_string(),
                "policy_no harus di-return pada call pertama"
            );
        } else {
            assert_eq!(
                value["replayed"],
                json!(true),
                "call #{i} harus di-mark replayed"
            );
            assert!(value["policy_no"].is_null(), "policy_no null pada replay");
        }
    }

    // Exactly 1 policy issued.
    let policy_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM policies WHERE registration_id IN (SELECT id FROM registrations WHERE customer_id = $1)")
            .bind(customer_id)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(policy_count.0, 1, "tepat 1 policy dibuat");

    // Email "Payment Success" + "E-Policy Delivery" + "Portal Activation"
    // terkirim tepat 1× (bukan 5×). Plus "Invoice Notification" waktu
    // registrasi tidak relevan di flow ini (cuma registration flow).
    let payment_emails = app
        .email
        .all()
        .into_iter()
        .filter(|e| {
            e.subject.contains("Payment")
                || e.subject.contains("Polis")
                || e.subject.contains("Aktivasi")
        })
        .count();
    assert!(
        (2..=5).contains(&payment_emails),
        "email flow harus ~3 (Payment + E-Policy + Activation), dapat {payment_emails}"
    );
}

#[tokio::test]
#[serial]
async fn webhook_rejects_wrong_secret() {
    let app = common::spawn_app().await;
    let (_cust_id, _reg_id, inv_no) = seed_pending_invoice(&app.pool).await;

    let (status, _) = call_webhook(
        &app,
        "wrong-secret",
        json!({
            "invoice_no": inv_no,
            "payment_status": "PAID",
        }),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Invoice masih UNPAID.
    let row: (String,) = sqlx::query_as("SELECT status FROM invoices WHERE invoice_no = $1")
        .bind(&inv_no)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(row.0, "UNPAID");
}

#[tokio::test]
#[serial]
async fn webhook_rejects_non_paid_status() {
    let app = common::spawn_app().await;
    let (_cust_id, _reg_id, inv_no) = seed_pending_invoice(&app.pool).await;

    let (status, value) = call_webhook(
        &app,
        &app.config.payment_webhook_secret,
        json!({
            "invoice_no": inv_no,
            "payment_status": "EXPIRED",
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(value["error"]["message"].as_str().unwrap().contains("PAID"));

    // Invoice masih UNPAID.
    let row: (String,) = sqlx::query_as("SELECT status FROM invoices WHERE invoice_no = $1")
        .bind(&inv_no)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(row.0, "UNPAID");
}

#[tokio::test]
#[serial]
async fn webhook_returns_404_for_unknown_invoice() {
    let app = common::spawn_app().await;
    let (status, _) = call_webhook(
        &app,
        &app.config.payment_webhook_secret,
        json!({
            "invoice_no": "INV-209912-999999",
            "payment_status": "PAID",
        }),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial]
async fn webhook_issues_exactly_n_policies_for_instansi() {
    let app = common::spawn_app().await;
    let customer_id = common::seed_customer(&app.pool, "hr@test.local", "ACTIVE").await;

    // Build INSTANSI registration with 3 participants.
    let now = Utc::now();
    let reg_no = format!("REG-{}-000002", now.format("%Y%m"));
    let inv_no = format!("INV-{}-000002", now.format("%Y%m"));

    let mut tx = app.pool.begin().await.unwrap();
    let (reg_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO registrations (registration_no, customer_id, product, sum_assured, coverage_term, status, applicant_type)
           VALUES ($1, $2, 'HEALTH', 50000000, 5, 'PENDING', 'INSTANSI')
           RETURNING id"#,
    )
    .bind(&reg_no)
    .bind(customer_id)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    // Invoice: total premium = 3 × per_participant
    sqlx::query(
        r#"INSERT INTO invoices (invoice_no, registration_id, premium_amount, due_date, status)
           VALUES ($1, $2, 15000000, now() + interval '7 days', 'UNPAID')"#,
    )
    .bind(&inv_no)
    .bind(reg_id)
    .execute(&mut *tx)
    .await
    .unwrap();

    // 3 participants
    for i in 1..=3 {
        let nik = format!("320101010101000{}", i);
        sqlx::query(
            r#"INSERT INTO registration_participants (
                registration_id, nik, full_name, birth_place, birth_date, gender,
                address, rt_rw, village, district, city, province, postal_code, mobile_number, email
            ) VALUES (
                $1, $2, $3, 'Jakarta', '1990-01-01', 'MALE',
                'Jl. Test', '001/002', 'Kel', 'Kec', 'Jakarta', 'DKI', '12345',
                '081234567890', 'p@test.local'
            )"#,
        )
        .bind(reg_id)
        .bind(nik)
        .bind(format!("Participant {i}"))
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();

    // Hit webhook.
    let (status, value) = call_webhook(
        &app,
        &app.config.payment_webhook_secret,
        json!({
            "invoice_no": inv_no,
            "payment_status": "PAID",
            "payment_date": "2026-06-18",
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["replayed"], json!(false));

    // Exactly 3 policies created, each linked to a participant.
    let policies: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM policies WHERE registration_id = $1 AND participant_id IS NOT NULL",
    )
    .bind(reg_id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(
        policies.0, 3,
        "INSTANSI harus issue 3 policies (1 per participant)"
    );

    // Each policy premium = total / 3.
    let premiums: Vec<rust_decimal::Decimal> = sqlx::query_scalar(
        "SELECT premium FROM policies WHERE registration_id = $1 ORDER BY policy_no",
    )
    .bind(reg_id)
    .fetch_all(&app.pool)
    .await
    .unwrap();
    assert_eq!(premiums.len(), 3);
    for p in premiums {
        assert_eq!(p, rust_decimal::Decimal::from(5_000_000));
    }
}
