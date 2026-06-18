//! Integration test untuk inquiry thread state machine (FS-20).
//!
//! State transitions (spec §10.5 + inquiry_messages thread migration 0011):
//!   OPEN      + customer msg → OPEN   (last_sender = CUSTOMER)
//!   OPEN      + admin msg    → ANSWERED
//!   ANSWERED  + customer msg → OPEN
//!   ANSWERED  + admin msg    → ANSWERED
//!   *         + close        → CLOSED (terminal)

mod common;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use serde_json::{json, Value};
use serial_test::serial;
use tower::ServiceExt;
use uuid::Uuid;

async fn seed_open_inquiry(pool: &sqlx::PgPool) -> (Uuid, Uuid) {
    let customer_id = common::seed_customer(pool, "inq-cust@test.local", "ACTIVE").await;

    let now = chrono::Utc::now();
    let inq_no = format!("INQ-{}-000001", now.format("%Y%m"));
    let (inquiry_id,): (Uuid,) = sqlx::query_as(
        r#"INSERT INTO inquiries (inquiry_no, customer_id, subject, message, status)
           VALUES ($1, $2, 'Test Inquiry', 'Initial question', 'OPEN')
           RETURNING id"#,
    )
    .bind(&inq_no)
    .bind(customer_id)
    .fetch_one(pool)
    .await
    .unwrap();
    (customer_id, inquiry_id)
}

async fn customer_message(
    app: &common::TestApp,
    customer_id: Uuid,
    inquiry_id: Uuid,
    msg: &str,
) -> (StatusCode, Value) {
    let token = common::customer_token(app, customer_id);
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/customer/inquiries/{inquiry_id}/messages"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from(json!({ "message": msg }).to_string()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

async fn admin_message(
    app: &common::TestApp,
    inquiry_id: Uuid,
    msg: &str,
) -> (StatusCode, Value) {
    let token = common::admin_token(app, insuretrack_backend::auth::jwt::Role::Admin, true).await;
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/admin/inquiries/{inquiry_id}/messages"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from(json!({ "message": msg }).to_string()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

async fn admin_close(app: &common::TestApp, inquiry_id: Uuid) -> (StatusCode, Value) {
    let token = common::admin_token(app, insuretrack_backend::auth::jwt::Role::Admin, true).await;
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/admin/inquiries/{inquiry_id}/close"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

async fn status_of(pool: &sqlx::PgPool, inquiry_id: Uuid) -> String {
    let row: (String,) = sqlx::query_as("SELECT status FROM inquiries WHERE id = $1")
        .bind(inquiry_id)
        .fetch_one(pool)
        .await
        .unwrap();
    row.0
}

#[tokio::test]
#[serial]
async fn inquiry_thread_full_flow() {
    let app = common::spawn_app().await;
    let (customer_id, inquiry_id) = seed_open_inquiry(&app.pool).await;
    let initial_email_count = app.email.count();

    // 1. Customer msg (status stays OPEN — last_sender = CUSTOMER)
    let (s, _) = customer_message(&app, customer_id, inquiry_id, "Bump dari customer").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(status_of(&app.pool, inquiry_id).await, "OPEN");

    // 2. Admin reply → ANSWERED
    let (s, _) = admin_message(&app, inquiry_id, "Balasan admin").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(status_of(&app.pool, inquiry_id).await, "ANSWERED");

    // 3. Customer msg → OPEN (kembali ke customer queue)
    let (s, _) = customer_message(&app, customer_id, inquiry_id, "Follow up customer").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(status_of(&app.pool, inquiry_id).await, "OPEN");

    // 4. Admin reply → ANSWERED
    let (s, _) = admin_message(&app, inquiry_id, "Balasan admin kedua").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(status_of(&app.pool, inquiry_id).await, "ANSWERED");

    // 5. Admin close → CLOSED (terminal)
    let (s, _) = admin_close(&app, inquiry_id).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(status_of(&app.pool, inquiry_id).await, "CLOSED");

    // 6. Try to post message after CLOSED → reject
    let (s, _) = customer_message(&app, customer_id, inquiry_id, "After close").await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "post setelah CLOSED harus ditolak");

    // 4 admin messages → 4 InquiryResponse emails.
    let admin_emails = app
        .email
        .all()
        .iter()
        .skip(initial_email_count) // skip emails from earlier test (but truncate di spawn_app)
        .filter(|e| e.subject.contains("Inquiry") || e.subject.contains("[Inquiry"))
        .count();
    assert!(
        admin_emails >= 3,
        "setiap admin reply harus trigger email InquiryResponse (min 3: 2 reply + 1 close notification), dapat {admin_emails}"
    );
}

#[tokio::test]
#[serial]
async fn inquiry_other_customer_cannot_post_message() {
    let app = common::spawn_app().await;
    let (owner_id, inquiry_id) = seed_open_inquiry(&app.pool).await;

    // Different customer tries to post — should be rejected (ownership filter).
    let other_id = common::seed_customer(&app.pool, "attacker@test.local", "ACTIVE").await;
    let (s, _) = customer_message(&app, other_id, inquiry_id, "Hijack attempt").await;
    assert_eq!(
        s,
        StatusCode::NOT_FOUND,
        "customer lain harusnya tidak lihat inquiry ini"
    );

    // Owner masih bisa post (sanity check).
    let (s, _) = customer_message(&app, owner_id, inquiry_id, "Owner msg").await;
    assert_eq!(s, StatusCode::OK);
}
