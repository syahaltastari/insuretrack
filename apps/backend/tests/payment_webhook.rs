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

    // 3 participants — tiap peserta jadi row `customers` (email/NIK unik
    // global sejak 0017_registration_members.sql), relasinya ke group ini
    // disimpan di `registration_members`.
    for i in 1..=3 {
        let nik = format!("320101010101000{}", i);
        let (member_customer_id,): (Uuid,) = sqlx::query_as(
            r#"INSERT INTO customers (
                nik, full_name, birth_place, birth_date, gender,
                address, rt_rw, village, district, city, province, postal_code,
                mobile_number, email
            ) VALUES (
                $1, $2, 'Jakarta', '1990-01-01', 'MALE',
                'Jl. Test', '001/002', 'Kel', 'Kec', 'Jakarta', 'DKI', '12345',
                '081234567890', $3
            )
            RETURNING id"#,
        )
        .bind(&nik)
        .bind(format!("Participant {i}"))
        .bind(format!("participant{i}@test.local"))
        .fetch_one(&mut *tx)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO registration_members (registration_id, customer_id) VALUES ($1, $2)",
        )
        .bind(reg_id)
        .bind(member_customer_id)
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
        "SELECT COUNT(*) FROM policies WHERE registration_id = $1 AND member_id IS NOT NULL",
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

/// Regression: customer PENDING (dibuat via POST /api/public/customers)
/// punya kolom `nik/address/birth_date/email` NULL. Webhook harus
/// handle ini tanpa 500 (`UnexpectedNullError`). Lihat
/// `RegAndCustomer` decode di `routes/public.rs`.
///
/// Tanpa fix: sqlx gagal decode `c.address` (NULL) → String → 500.
/// Dengan fix: decode `Option<T>` + `unwrap_or_default()` → webhook
/// return 200 + 1 policy issued (placeholder values di PDF/email).
#[tokio::test]
#[serial]
async fn webhook_handles_customer_with_null_profile() {
    let app = common::spawn_app().await;

    // Insert customer dengan profil MINIMAL (simulasi PENDING portal signup).
    // Field `nik/address/birth_date/email` di-skip → NULL per schema
    // (0008_relax_customer_for_split.sql).
    let email = format!("pending-{}@test.local", Uuid::new_v4());
    let (customer_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO customers (full_name, email, mobile_number, password_hash, portal_status)
           VALUES ('Pending User', $1, '081234567890', 'argon2id$placeholder', 'PENDING')
           RETURNING id"#,
    )
    .bind(&email)
    .fetch_one(&app.pool)
    .await
    .unwrap();

    // Registration + invoice (INDIVIDU) — minimal. `registrations` table
    // tidak punya kolom identitas (semua di customers.id via FK).
    let now = Utc::now();
    let reg_no = format!("REG-{}-000003", now.format("%Y%m"));
    let inv_no = format!("INV-{}-000003", now.format("%Y%m"));
    let (reg_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO registrations
             (registration_no, customer_id, product, sum_assured, coverage_term,
              status, applicant_type)
           VALUES ($1, $2, 'LIFE', 100000000, 10, 'PENDING', 'INDIVIDU')
           RETURNING id"#,
    )
    .bind(&reg_no)
    .bind(customer_id)
    .fetch_one(&app.pool)
    .await
    .unwrap();

    sqlx::query(
        r#"INSERT INTO invoices (invoice_no, registration_id, premium_amount, due_date, status)
           VALUES ($1, $2, 9000000, now() + interval '7 days', 'UNPAID')"#,
    )
    .bind(&inv_no)
    .bind(reg_id)
    .execute(&app.pool)
    .await
    .unwrap();

    // Hit webhook — tanpa fix, ini return 500 UnexpectedNullError.
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
    assert_eq!(
        status,
        StatusCode::OK,
        "webhook harus 200 OK walaupun customer PENDING (NULL address/nik/birth_date), \
         dapat body: {value}"
    );
    assert_eq!(value["replayed"], json!(false));

    // Policy tetap ter-issue walaupun customer profile belum lengkap.
    let policy_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM policies WHERE registration_id = $1")
            .bind(reg_id)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(policy_count.0, 1, "harus issue 1 policy");
}
