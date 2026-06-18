//! Generator audit_logs — 1 row per business event.
//!
//! Spec FS-15: 11 actions ter-ekspos. Untuk seeder, kita buat 1 row
//! per entity yang baru di-create + beberapa business event tambahan.

use chrono::{Duration, Utc};
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde_json::json;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::seed::{
    claims::SeededClaim, customers::SeededCustomer, inquiries::SeededInquiry,
    invoices::SeededInvoice, policies::SeededPolicy, registrations::SeededRegistration,
};

#[derive(Debug, Clone)]
pub struct SeededAuditLog {
    pub id: Uuid,
    pub action: String,
    pub actor: String,
    pub entity_type: String,
}

pub async fn seed_audit_logs(
    tx: &mut Transaction<'_, Postgres>,
    customers: &[SeededCustomer],
    registrations: &[SeededRegistration],
    invoices: &[SeededInvoice],
    policies: &[SeededPolicy],
    claims: &[SeededClaim],
    inquiries: &[SeededInquiry],
) -> anyhow::Result<Vec<SeededAuditLog>> {
    let mut rng = StdRng::seed_from_u64(0xA0D17_u64);
    let mut out = Vec::new();

    // 1) customer.created — 1 per customer.
    for c in customers {
        out.push(
            write_audit(
                &mut **tx,
                "registration.created",
                "customer",
                c.id,
                Some(json!({ "nik_hash_prefix": &c.nik[..6], "email": &c.email })),
                "customer:seed",
                &mut rng,
            )
            .await?,
        );
    }

    // 2) registration.created + invoice.generated.
    for (i, reg) in registrations.iter().enumerate() {
        out.push(
            write_audit(
                &mut **tx,
                "registration.created",
                "registration",
                reg.id,
                Some(json!({
                    "registration_no": &reg.registration_no,
                    "product": &reg.product,
                    "sum_assured": reg.sum_assured.to_string(),
                })),
                "customer:seed",
                &mut rng,
            )
            .await?,
        );

        if let Some(inv) = invoices.get(i) {
            out.push(
                write_audit(
                    &mut **tx,
                    "invoice.generated",
                    "invoice",
                    inv.id,
                    Some(json!({
                        "invoice_no": &inv.invoice_no,
                        "premium": inv.premium_amount.to_string(),
                    })),
                    "system",
                    &mut rng,
                )
                .await?,
            );
        }
    }

    // 3) payment.received + policy.issued — untuk invoice PAID + ada policy.
    for (i, inv) in invoices.iter().enumerate() {
        if inv.status != "PAID" {
            continue;
        }
        out.push(write_audit(
            &mut **tx,
            "payment.received",
            "invoice",
            inv.id,
            Some(json!({ "payment_method": "WEBHOOK", "amount": inv.premium_amount.to_string() })),
            "payment-gateway",
            &mut rng,
        )
        .await?);

        if let Some(pol) = policies.get(i) {
            out.push(
                write_audit(
                    &mut **tx,
                    "policy.issued",
                    "policy",
                    pol.id,
                    Some(json!({
                        "policy_no": &pol.policy_no,
                        "effective_date": pol.effective_date.to_string(),
                    })),
                    "system",
                    &mut rng,
                )
                .await?,
            );
        }
    }

    // 4) claim.submitted + claim.status_changed.
    for claim in claims {
        out.push(
            write_audit(
                &mut **tx,
                "claim.submitted",
                "claim",
                claim.id,
                Some(json!({
                    "claim_no": &claim.claim_no,
                    "claimed_amount": claim.claimed_amount.to_string(),
                })),
                "customer:seed",
                &mut rng,
            )
            .await?,
        );
        if claim.status != "SUBMITTED" && claim.status != "UNDER_REVIEW" {
            out.push(
                write_audit(
                    &mut **tx,
                    "claim.status_changed",
                    "claim",
                    claim.id,
                    Some(json!({ "new_status": &claim.status })),
                    "admin",
                    &mut rng,
                )
                .await?,
            );
        }
    }

    // 5) inquiry.submitted + inquiry.answered.
    for inq in inquiries {
        out.push(
            write_audit(
                &mut **tx,
                "inquiry.submitted",
                "inquiry",
                inq.id,
                Some(json!({ "inquiry_no": &inq.inquiry_no })),
                "customer:seed",
                &mut rng,
            )
            .await?,
        );
        if inq.status != "OPEN" {
            out.push(
                write_audit(
                    &mut **tx,
                    "inquiry.answered",
                    "inquiry",
                    inq.id,
                    Some(json!({ "new_status": &inq.status })),
                    "admin",
                    &mut rng,
                )
                .await?,
            );
        }
    }

    // 6) Beberapa admin.login (3) — untuk realism audit log.
    for _ in 0..3 {
        out.push(
            write_audit(
                &mut **tx,
                "admin.login",
                "admin",
                Uuid::nil(),
                Some(json!({ "username": "admin" })),
                "admin",
                &mut rng,
            )
            .await?,
        );
    }

    Ok(out)
}

async fn write_audit(
    tx: &mut sqlx::PgConnection,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Option<serde_json::Value>,
    actor: &str,
    rng: &mut StdRng,
) -> anyhow::Result<SeededAuditLog> {
    let ip = format!("10.0.{}.{}", rng.gen_range(0..255), rng.gen_range(0..255));
    let created_at = Utc::now() - Duration::days(rng.gen_range(0..30));

    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO audit_logs (
            actor, action, entity_type, entity_id, metadata, ip_address, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(actor)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(metadata)
    .bind(&ip)
    .bind(created_at.naive_utc())
    .fetch_one(&mut *tx)
    .await?;

    Ok(SeededAuditLog {
        id,
        action: action.to_string(),
        actor: actor.to_string(),
        entity_type: entity_type.to_string(),
    })
}
