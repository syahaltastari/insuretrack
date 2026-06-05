//! Admin CRUD for marketing collateral: clients & testimonials.
//! Mounted at /api/admin/clients and /api/admin/testimonials.

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::RequireAdmin,
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
        marketing,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/clients", get(list_clients).post(create_client))
        .route(
            "/clients/:id",
            get(get_client)
                .patch(update_client)
                .delete(delete_client),
        )
        .route(
            "/testimonials",
            get(list_testimonials).post(create_testimonial),
        )
        .route(
            "/testimonials/:id",
            get(get_testimonial)
                .patch(update_testimonial)
                .delete(delete_testimonial),
        )
}

// ============================================================
// Clients
// ============================================================

#[derive(Serialize, sqlx::FromRow)]
struct ClientRow {
    id: Uuid,
    name: String,
    logo_path: String,
    industry: Option<String>,
    website: Option<String>,
    contact_person: Option<String>,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    sort_order: i32,
    is_active: bool,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
struct ClientForm {
    name: String,
    industry: Option<String>,
    website: Option<String>,
    contact_person: Option<String>,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    sort_order: Option<i32>,
    is_active: Option<bool>,
    notes: Option<String>,
}

async fn parse_multipart_json_and_file(
    mut multipart: Multipart,
) -> AppResult<(serde_json::Value, Option<(String, String, Vec<u8>)>)> {
    let mut data_json: Option<String> = None;
    let mut file: Option<(String, String, Vec<u8>)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "data" => {
                data_json = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Validation(format!("data: {e}")))?,
                );
            }
            "logo" | "photo" => {
                let file_name = field.file_name().unwrap_or("asset").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(format!("file: {e}")))?
                    .to_vec();
                file = Some((file_name, content_type, bytes));
            }
            _ => {}
        }
    }
    let json_str = data_json.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let v: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| AppError::Validation(format!("invalid JSON: {e}")))?;
    Ok((v, file))
}

async fn list_clients(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<ClientRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM clients
         WHERE ($1 = '' OR LOWER(name) LIKE LOWER($1) OR LOWER(industry) LIKE LOWER($1))
           AND ($2 = '' OR is_active = ($2 = 'true'))
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<ClientRow> = sqlx::query_as(
        r#"
        SELECT id, name, logo_path, industry, website, contact_person, contact_email,
               contact_phone, sort_order, is_active, notes, created_at, updated_at
          FROM clients
         WHERE ($1 = '' OR LOWER(name) LIKE LOWER($1) OR LOWER(industry) LIKE LOWER($1))
           AND ($2 = '' OR is_active = ($2 = 'true'))
         ORDER BY sort_order ASC, created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_client(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ClientRow>> {
    let row: Option<ClientRow> = sqlx::query_as(
        r#"SELECT id, name, logo_path, industry, website, contact_person, contact_email,
                  contact_phone, sort_order, is_active, notes, created_at, updated_at
             FROM clients WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    row.map(Json).ok_or(AppError::NotFound("client".into()))
}

async fn create_client(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let (json, file) = parse_multipart_json_and_file(multipart).await?;
    let form: ClientForm = serde_json::from_value(json)
        .map_err(|e| AppError::Validation(format!("invalid form: {e}")))?;

    if form.name.trim().is_empty() {
        return Err(AppError::Validation("name required".into()));
    }

    let (file_name, content_type, bytes) = file
        .ok_or_else(|| AppError::Validation("logo file (field 'logo') is required".into()))?;

    let new_id = Uuid::new_v4();
    let logo_path =
        marketing::save_image(&state.config.upload_dir, "clients", new_id, &file_name, &content_type, &bytes).await?;

    let row: ClientRow = sqlx::query_as(
        r#"
        INSERT INTO clients
          (id, name, logo_path, industry, website, contact_person, contact_email,
           contact_phone, sort_order, is_active, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, TRUE), $11)
        RETURNING id, name, logo_path, industry, website, contact_person, contact_email,
                  contact_phone, sort_order, is_active, notes, created_at, updated_at
        "#,
    )
    .bind(new_id)
    .bind(&form.name)
    .bind(&logo_path)
    .bind(form.industry.as_deref())
    .bind(form.website.as_deref())
    .bind(form.contact_person.as_deref())
    .bind(form.contact_email.as_deref())
    .bind(form.contact_phone.as_deref())
    .bind(form.sort_order.unwrap_or(0))
    .bind(form.is_active)
    .bind(form.notes.as_deref())
    .fetch_one(&state.pool)
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "client_created",
            entity_type: "client",
            entity_id: Some(new_id),
            metadata: Some(serde_json::json!({ "name": form.name })),
            ip_address: None,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_client(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    multipart: Multipart,
) -> AppResult<Json<ClientRow>> {
    let (json, file_opt) = parse_multipart_json_and_file(multipart).await?;
    let form: ClientForm = serde_json::from_value(json)
        .map_err(|e| AppError::Validation(format!("invalid form: {e}")))?;

    // If new logo provided, save it (overwriting path). Otherwise keep existing.
    let new_logo_path: Option<String> = if let Some((file_name, content_type, bytes)) = file_opt {
        Some(
            marketing::save_image(&state.config.upload_dir, "clients", id, &file_name, &content_type, &bytes)
                .await?,
        )
    } else {
        None
    };

    let row: ClientRow = sqlx::query_as(
        r#"
        UPDATE clients SET
            name = COALESCE($2, name),
            logo_path = COALESCE($3, logo_path),
            industry = COALESCE($4, industry),
            website = COALESCE($5, website),
            contact_person = COALESCE($6, contact_person),
            contact_email = COALESCE($7, contact_email),
            contact_phone = COALESCE($8, contact_phone),
            sort_order = COALESCE($9, sort_order),
            is_active = COALESCE($10, is_active),
            notes = COALESCE($11, notes),
            updated_at = now()
        WHERE id = $1
        RETURNING id, name, logo_path, industry, website, contact_person, contact_email,
                  contact_phone, sort_order, is_active, notes, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(if form.name.is_empty() { None } else { Some(form.name.as_str()) })
    .bind(new_logo_path.as_deref())
    .bind(form.industry.as_deref())
    .bind(form.website.as_deref())
    .bind(form.contact_person.as_deref())
    .bind(form.contact_email.as_deref())
    .bind(form.contact_phone.as_deref())
    .bind(form.sort_order)
    .bind(form.is_active)
    .bind(form.notes.as_deref())
    .fetch_one(&state.pool)
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "client_updated",
            entity_type: "client",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({ "name": form.name })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

async fn delete_client(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let res = sqlx::query("DELETE FROM clients WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("client".into()));
    }

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "client_deleted",
            entity_type: "client",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================
// Testimonials
// ============================================================

#[derive(Serialize, sqlx::FromRow)]
struct TestimonialRow {
    id: Uuid,
    customer_name: String,
    photo_path: Option<String>,
    rating: i32,
    review: String,
    role: Option<String>,
    company: Option<String>,
    policy_type: Option<String>,
    display_date: NaiveDate,
    is_featured: bool,
    is_active: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
struct TestimonialForm {
    customer_name: String,
    rating: i32,
    review: String,
    role: Option<String>,
    company: Option<String>,
    policy_type: Option<String>,
    display_date: Option<NaiveDate>,
    is_featured: Option<bool>,
    is_active: Option<bool>,
}

async fn list_testimonials(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<TestimonialRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM testimonials
         WHERE ($1 = '' OR LOWER(customer_name) LIKE LOWER($1) OR LOWER(review) LIKE LOWER($1))
           AND ($2 = '' OR is_active = ($2 = 'true'))
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<TestimonialRow> = sqlx::query_as(
        r#"
        SELECT id, customer_name, photo_path, rating, review, role, company,
               policy_type, display_date, is_featured, is_active, created_at, updated_at
          FROM testimonials
         WHERE ($1 = '' OR LOWER(customer_name) LIKE LOWER($1) OR LOWER(review) LIKE LOWER($1))
           AND ($2 = '' OR is_active = ($2 = 'true'))
         ORDER BY display_date DESC, created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_testimonial(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<TestimonialRow>> {
    let row: Option<TestimonialRow> = sqlx::query_as(
        r#"SELECT id, customer_name, photo_path, rating, review, role, company,
                  policy_type, display_date, is_featured, is_active, created_at, updated_at
             FROM testimonials WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    row.map(Json).ok_or(AppError::NotFound("testimonial".into()))
}

async fn create_testimonial(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let (json, file_opt) = parse_multipart_json_and_file(multipart).await?;
    let form: TestimonialForm = serde_json::from_value(json)
        .map_err(|e| AppError::Validation(format!("invalid form: {e}")))?;

    if form.customer_name.trim().is_empty() {
        return Err(AppError::Validation("customer_name required".into()));
    }
    if !(1..=5).contains(&form.rating) {
        return Err(AppError::Validation("rating must be 1..=5".into()));
    }
    if form.review.trim().is_empty() {
        return Err(AppError::Validation("review required".into()));
    }

    let new_id = Uuid::new_v4();
    let photo_path: Option<String> = if let Some((fn_, ct, bytes)) = file_opt {
        Some(marketing::save_image(&state.config.upload_dir, "testimonials", new_id, &fn_, &ct, &bytes).await?)
    } else {
        None
    };

    let row: TestimonialRow = sqlx::query_as(
        r#"
        INSERT INTO testimonials
          (id, customer_name, photo_path, rating, review, role, company, policy_type,
           display_date, is_featured, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                COALESCE($9, CURRENT_DATE), COALESCE($10, FALSE), COALESCE($11, TRUE))
        RETURNING id, customer_name, photo_path, rating, review, role, company,
                  policy_type, display_date, is_featured, is_active, created_at, updated_at
        "#,
    )
    .bind(new_id)
    .bind(&form.customer_name)
    .bind(photo_path.as_deref())
    .bind(form.rating)
    .bind(&form.review)
    .bind(form.role.as_deref())
    .bind(form.company.as_deref())
    .bind(form.policy_type.as_deref())
    .bind(form.display_date)
    .bind(form.is_featured)
    .bind(form.is_active)
    .fetch_one(&state.pool)
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "testimonial_created",
            entity_type: "testimonial",
            entity_id: Some(new_id),
            metadata: Some(serde_json::json!({ "customer_name": form.customer_name })),
            ip_address: None,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_testimonial(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    multipart: Multipart,
) -> AppResult<Json<TestimonialRow>> {
    let (json, file_opt) = parse_multipart_json_and_file(multipart).await?;
    let form: TestimonialForm = serde_json::from_value(json)
        .map_err(|e| AppError::Validation(format!("invalid form: {e}")))?;

    if !(1..=5).contains(&form.rating) {
        return Err(AppError::Validation("rating must be 1..=5".into()));
    }

    let new_photo_path: Option<String> = if let Some((fn_, ct, bytes)) = file_opt {
        Some(marketing::save_image(&state.config.upload_dir, "testimonials", id, &fn_, &ct, &bytes).await?)
    } else {
        None
    };

    let row: TestimonialRow = sqlx::query_as(
        r#"
        UPDATE testimonials SET
            customer_name = COALESCE($2, customer_name),
            photo_path = COALESCE($3, photo_path),
            rating = COALESCE($4, rating),
            review = COALESCE($5, review),
            role = COALESCE($6, role),
            company = COALESCE($7, company),
            policy_type = COALESCE($8, policy_type),
            display_date = COALESCE($9, display_date),
            is_featured = COALESCE($10, is_featured),
            is_active = COALESCE($11, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING id, customer_name, photo_path, rating, review, role, company,
                  policy_type, display_date, is_featured, is_active, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(if form.customer_name.is_empty() { None } else { Some(form.customer_name.as_str()) })
    .bind(new_photo_path.as_deref())
    .bind(if (1..=5).contains(&form.rating) { Some(form.rating) } else { None })
    .bind(if form.review.is_empty() { None } else { Some(form.review.as_str()) })
    .bind(form.role.as_deref())
    .bind(form.company.as_deref())
    .bind(form.policy_type.as_deref())
    .bind(form.display_date)
    .bind(form.is_featured)
    .bind(form.is_active)
    .fetch_one(&state.pool)
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "testimonial_updated",
            entity_type: "testimonial",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({ "customer_name": form.customer_name })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

async fn delete_testimonial(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let res = sqlx::query("DELETE FROM testimonials WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("testimonial".into()));
    }

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "testimonial_deleted",
            entity_type: "testimonial",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
