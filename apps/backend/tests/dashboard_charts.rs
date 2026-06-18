//! Integration tests untuk `GET /api/admin/dashboard/charts`.
//!
//! Coverage point: granularity auto-selection (Day/Week/Month) dan
//! bucketing (padded keys, missing-day fill).
//!
//! Response shape (lihat `services::dashboard::DashboardCharts`):
//!   granularity, from, to,
//!   registrations_per_period, policies_per_period, revenue_per_period,
//!   invoice_status_breakdown, claim_status_breakdown, policy_product_breakdown

mod common;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use chrono::Utc;
use serde_json::Value;
use serial_test::serial;
use tower::ServiceExt;
use uuid::Uuid;

async fn get_charts(app: &common::TestApp, query: &str) -> (StatusCode, Value) {
    let token = common::admin_token(app, insuretrack_backend::auth::jwt::Role::Admin, true).await;
    let req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/admin/dashboard/charts?{query}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    common::response_json(resp).await
}

/// Seed N registrations across past 60 days (1 customer).
async fn seed_registrations(pool: &sqlx::PgPool, count: usize) -> Uuid {
    let customer_id = common::seed_customer(pool, "chart-cust@test.local", "ACTIVE").await;
    for i in 0..count {
        let days_ago = (i as i64) * 5;
        let now = Utc::now();
        let reg_no = format!("REG-{}-{:06}", now.format("%Y%m"), i + 1);
        sqlx::query(
            r#"INSERT INTO registrations (
                registration_no, customer_id, product, sum_assured, coverage_term,
                status, applicant_type, created_at
            ) VALUES ($1, $2, 'LIFE', 100000000, 10, 'PENDING', 'INDIVIDU',
                      now() - ($3 || ' days')::interval)"#,
        )
        .bind(&reg_no)
        .bind(customer_id)
        .bind(days_ago.to_string())
        .execute(pool)
        .await
        .unwrap();
    }
    customer_id
}

#[tokio::test]
#[serial]
async fn charts_auto_picks_week_for_60_day_range() {
    let app = common::spawn_app().await;
    let _cust = seed_registrations(&app.pool, 12).await;

    // Past 60 days from today.
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let from = (Utc::now() - chrono::Duration::days(60))
        .format("%Y-%m-%d")
        .to_string();
    let (status, value) = get_charts(&app, &format!("from={from}&to={today}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["granularity"], "week", "60-day range → auto Week");

    let buckets = value["registrations_per_period"].as_array().unwrap();
    assert!(
        !buckets.is_empty(),
        "ada minimal 1 bucket untuk range valid"
    );
    for b in buckets {
        let key = b["bucket"].as_str().unwrap();
        assert!(
            key.len() == 10 && key.contains('-'),
            "bucket key harus ISO date YYYY-MM-DD, dapat {key}"
        );
    }
    // Total registrations dalam buckets = 12 (semua seed masuk).
    let total: i64 = buckets
        .iter()
        .map(|b| b["count"].as_i64().unwrap())
        .sum();
    assert_eq!(total, 12, "total count = jumlah seeded");
}

#[tokio::test]
#[serial]
async fn charts_explicit_granularity_overrides_auto() {
    let app = common::spawn_app().await;
    seed_registrations(&app.pool, 3).await;

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let from = (Utc::now() - chrono::Duration::days(10))
        .format("%Y-%m-%d")
        .to_string();
    let (status, value) = get_charts(&app, &format!("from={from}&to={today}&granularity=day")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["granularity"], "day", "explicit granularity di-honor");
}

#[tokio::test]
#[serial]
async fn charts_handles_empty_data() {
    let app = common::spawn_app().await;
    // No seed.

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let from = (Utc::now() - chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    let (status, value) = get_charts(&app, &format!("from={from}&to={today}")).await;
    assert_eq!(status, StatusCode::OK);

    // Empty registrations array (atau buckets dengan count=0).
    let buckets = value["registrations_per_period"].as_array().unwrap();
    let total: i64 = buckets
        .iter()
        .map(|b| b["count"].as_i64().unwrap())
        .sum();
    assert_eq!(total, 0, "no seed → total count = 0");

    // Breakdown harus ada (mungkin 0 entries karena no data).
    assert!(
        value["invoice_status_breakdown"].is_array(),
        "invoice_status_breakdown harus array"
    );
}

#[tokio::test]
#[serial]
async fn charts_rejects_bad_date_format() {
    let app = common::spawn_app().await;
    let (status, _value) = get_charts(&app, "from=not-a-date&to=2026-06-01").await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "bad format harus 400");
}

#[tokio::test]
#[serial]
async fn charts_requires_admin_role() {
    let app = common::spawn_app().await;

    // Tanpa token → 401.
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/admin/dashboard/charts")
        .body(Body::empty())
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // Customer token → 403.
    let cust_token = common::customer_token(&app, Uuid::new_v4());
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/admin/dashboard/charts")
        .header(header::AUTHORIZATION, format!("Bearer {cust_token}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}
