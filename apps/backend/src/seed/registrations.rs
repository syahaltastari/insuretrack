//! Generator registrations.
//!
//! 50 registrations, di-spread 4 bulan ke belakang. Status state
//! machine (spec §10.2): PENDING/PAID/ISSUED/CANCELLED — distribution
//! deterministic via index modulo untuk konsistensi antar run.
//!
//! `created_at` di-backdate ke bulan yang dipilih supaya identifier
//! prefix `REG-YYYYMM-NNNNNN` berbeda per bulan (sesuai spec §9).
//!
//! Applicant type distribution:
//!   - INDIVIDU (80%): 1 peserta = customer (existing flow)
//!   - INSTANSI (20%): 1 group dengan N peserta (5-20 random); identitas
//!     peserta jadi row `customers` (resolve-by-NIK atau dibuat baru),
//!     relasi ke group disimpan di `registration_members`.
//!     1 invoice per group, N policies per group (1 per peserta).

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use rand::{rngs::StdRng, Rng, SeedableRng};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, customers::SeededCustomer, data::Product},
};

/// Output 1 peserta Instansi. Hanya di-populate untuk applicant_type='INSTANSI'.
#[derive(Debug, Clone)]
pub struct SeededParticipant {
    pub id: Uuid,
    pub nik: String,
    pub full_name: String,
    pub birth_date: NaiveDate,
}

#[derive(Debug, Clone)]
pub struct SeededRegistration {
    pub id: Uuid,
    pub registration_no: String,
    pub customer_id: Uuid,
    pub product: String,
    pub sum_assured: Decimal,
    pub coverage_term: i32,
    pub status: String,
    pub created_at: DateTime<Utc>,
    /// `INDIVIDU` atau `INSTANSI`. Untuk INDIVIDU, `participants` kosong.
    pub applicant_type: String,
    /// Jumlah peserta di group. `1` untuk INDIVIDU, `>= 5` untuk INSTANSI.
    /// `participants.len()` setelah seed selesai — dipakai downstream
    /// (policies.rs) tanpa perlu inspect Vec length.
    pub participant_count: usize,
    /// Detail peserta. Kosong untuk INDIVIDU (data peserta = customer).
    pub participants: Vec<SeededParticipant>,
    /// Kalau `true`, invoices.rs harus set invoice ke `EXPIRED` (lewat
    /// `due_date`) bukan `UNPAID`. Dipakai untuk RegistrationOutcome::Expired
    /// customer (1 portal customer ke-4) supaya demo skenario gagal
    /// punya invoice yang sesuai.
    pub force_expired_invoice: bool,
}

pub async fn seed_registrations(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    customers: &[SeededCustomer],
) -> anyhow::Result<Vec<SeededRegistration>> {
    let mut rng = StdRng::seed_from_u64(0xBEEFCAFE_u64);
    let mut out = Vec::with_capacity(cfg.counts.registrations);

    // 4 bulan ke belakang (counted from "now" = 2026-06-15). Bulan
    // dipilih deterministik per index supaya distribusi stabil.
    let now = Utc::now();
    let base_year = now.format("%Y").to_string().parse::<i32>()?;
    let base_month = now.format("%m").to_string().parse::<u32>()?;

    // Pre-filter customer pool per applicant_type supaya round-robin
    // hanya memilih customer yang eligible. Customer dengan
    // `eligible_applicant_types` berisi type tertentu akan di-skip
    // saat registration type lain di-assign. Alasan: 3 portal customer
    // demo di-set eligibility-nya supaya CLI output punya 3 variasi
    // tag (mixed / Individu only / Instansi only). Tanpa filter ini,
    // round-robin acak bakal bikin semua portal customer mixed.
    let individu_pool: Vec<&SeededCustomer> = customers
        .iter()
        .filter(|c| c.eligible_applicant_types.contains(&"INDIVIDU"))
        .collect();
    let instansi_pool: Vec<&SeededCustomer> = customers
        .iter()
        .filter(|c| c.eligible_applicant_types.contains(&"INSTANSI"))
        .collect();
    if individu_pool.is_empty() || instansi_pool.is_empty() {
        anyhow::bail!(
            "no eligible customers for applicant_type — check eligibility assignment (individu_pool={}, instansi_pool={})",
            individu_pool.len(),
            instansi_pool.len()
        );
    }

    for i in 0..cfg.counts.registrations {
        // Tentukan bulan: distribusi deterministik per i, range offset
        // 1..=4 (4 bulan ke belakang). `n_months` selalu 4 (bukan
        // `--registrations` value) supaya spread fix ke 4 bulan walau
        // registrations count kecil.
        let n_months = cfg.months_back.clamp(1, 12) as u32;
        let month_offset = (i as u32 % n_months) + 1;
        let (year, month) = subtract_months(base_year, base_month, month_offset);

        // Pilih product random.
        let product = match rng.gen_range(0..3) {
            0 => Product::Life,
            1 => Product::PersonalAccident,
            _ => Product::Health,
        };
        let (sa_min, sa_max) = product.sum_assured_range();
        let sum_assured: u64 = rng.gen_range(sa_min..=sa_max);
        let (ct_min, ct_max) = product.coverage_term_range();
        let coverage_term = rng.gen_range(ct_min..=ct_max);

        // Applicant type distribution (deterministic by index ratio).
        // `i as f32 / total < group_ratio` ⇒ Instansi. Untuk 50 regs
        // dan group_ratio=0.2: i=0..9 (10 regs) = INSTANSI, i=10..49
        // = INDIVIDU. Reproducible antar run (deterministic by i),
        // dan match group_ratio dengan presisi: 10/50 = 20%.
        let total = cfg.counts.registrations.max(1);
        let is_group = (i as f32) < (total as f32 * cfg.counts.group_ratio);
        let applicant_type = if is_group { "INSTANSI" } else { "INDIVIDU" };

        // Pilih customer dari pool yang eligible untuk applicant_type
        // ini. Round-robin supaya distribusi merata ke semua customer
        // eligible. Customer yang di-skip dari pool akan tetap punya
        // registration type lainnya (jika eligible).
        let customer = if is_group {
            instansi_pool[i % instansi_pool.len()]
        } else {
            individu_pool[i % individu_pool.len()]
        };

        // Status distribution (deterministic via modulo), dengan override
        // berdasarkan `customer.registration_outcome`:
        //   Success → ISSUED (reg guaranteed sukses, dapat policy)
        //   Expired → PENDING + force_expired_invoice flag (invoice akan
        //             di-set EXPIRED di invoices.rs — lewat due_date)
        //   Default → i % 20 mapping existing
        let outcome = customer.registration_outcome;
        let status = match outcome {
            crate::seed::customers::RegistrationOutcome::Success => "ISSUED".to_string(),
            crate::seed::customers::RegistrationOutcome::Expired => "PENDING".to_string(),
            crate::seed::customers::RegistrationOutcome::Default => match i % 20 {
                0 => "PENDING".to_string(),
                1 => "CANCELLED".to_string(),
                2..=5 => "PAID".to_string(), // 4/20 = 20%
                _ => "ISSUED".to_string(),   // 15/20 = 75%
            },
        };
        let force_expired_invoice =
            outcome == crate::seed::customers::RegistrationOutcome::Expired;

        // Company info: NULL untuk INDIVIDU, random untuk INSTANSI.
        let (company_name, company_npwp, company_industry) = if is_group {
            let name = crate::seed::data::COMPANY_NAMES
                [rng.gen_range(0..crate::seed::data::COMPANY_NAMES.len())]
            .to_string();
            let npwp = crate::seed::data::random_npwp(&mut rng);
            let industry = crate::seed::data::COMPANY_INDUSTRIES
                [rng.gen_range(0..crate::seed::data::COMPANY_INDUSTRIES.len())]
            .to_string();
            (Some(name), Some(npwp), Some(industry))
        } else {
            (None, None, None)
        };

        // Allocate identifier untuk bulan ini.
        let year_month = format!("{:04}{:02}", year, month);
        let registration_no =
            next_id_with_year_month(tx, IdEntity::Registration, &year_month).await?;

        // `created_at` di-set ke tanggal 5-25 di bulan tersebut, jam 10 pagi.
        let day = 5 + (i as u32 % 21);
        let created_naive = NaiveDate::from_ymd_opt(year, month, day)
            .expect("valid date")
            .and_hms_opt(10, 0, 0)
            .expect("valid time");
        let created_at: DateTime<Utc> = Utc.from_utc_datetime(&created_naive);

        // Insert registration row.
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO registrations (
                registration_no, customer_id, product, sum_assured,
                coverage_term, status, created_at, applicant_type,
                company_name, company_npwp, company_industry
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
            "#,
        )
        .bind(&registration_no)
        .bind(customer.id)
        .bind(product.as_str())
        .bind(Decimal::from(sum_assured))
        .bind(coverage_term)
        .bind(&status)
        .bind(created_naive)
        .bind(applicant_type)
        .bind(company_name.as_deref())
        .bind(company_npwp.as_deref())
        .bind(company_industry.as_deref())
        .fetch_one(&mut **tx)
        .await?;

        // Untuk INSTANSI: generate N peserta. Setiap peserta di-resolve ke
        // `customers` by NIK (reuse kalau sudah ada — sama logic dengan
        // resolve_or_create_member_customer di routes/customer.rs), lalu
        // relasinya ke group ini disimpan di `registration_members`.
        // `SeededParticipant.id` = registration_members.id (bukan
        // customers.id) supaya policies.rs bisa langsung bind ke
        // `policies.member_id`.
        let mut participants: Vec<SeededParticipant> = Vec::new();
        if is_group {
            let n = rng.gen_range(
                cfg.counts.min_participants..=cfg.counts.max_participants,
            );
            let mut local_used_niks = std::collections::HashSet::new();
            for _ in 0..n {
                let (p_nik, p_full_name, p_birth_date) = generate_participant(
                    &mut rng,
                    &mut local_used_niks,
                );

                let customer_id: Uuid = if let Some(existing) = sqlx::query_scalar::<_, Uuid>(
                    "SELECT id FROM customers WHERE nik = $1",
                )
                .bind(&p_nik)
                .fetch_optional(&mut **tx)
                .await?
                {
                    existing
                } else {
                    sqlx::query_scalar(
                        r#"
                        INSERT INTO customers
                          (nik, full_name, birth_place, birth_date, gender, address,
                           rt_rw, village, district, city, province, postal_code)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        RETURNING id
                        "#,
                    )
                    .bind(&p_nik)
                    .bind(&p_full_name)
                    .bind("Jakarta")
                    .bind(p_birth_date)
                    .bind("MALE")
                    .bind("Jl. Perusahaan No. 1")
                    .bind("001/002")
                    .bind("Kelurahan Karyawan")
                    .bind("Kecamatan Pusat")
                    .bind("Jakarta Selatan")
                    .bind("DKI Jakarta")
                    .bind("12345")
                    .fetch_one(&mut **tx)
                    .await?
                };

                let member_id: Uuid = sqlx::query_scalar(
                    r#"
                    INSERT INTO registration_members (registration_id, customer_id, beneficiary_name)
                    VALUES ($1, $2, $3)
                    RETURNING id
                    "#,
                )
                .bind(id)
                .bind(customer_id)
                .bind(Option::<String>::None)
                .fetch_one(&mut **tx)
                .await?;

                participants.push(SeededParticipant {
                    id: member_id,
                    nik: p_nik,
                    full_name: p_full_name,
                    birth_date: p_birth_date,
                });
            }
        }

        let participant_count = if is_group { participants.len() } else { 1 };

        out.push(SeededRegistration {
            id,
            registration_no,
            customer_id: customer.id,
            product: product.as_str().to_string(),
            sum_assured: Decimal::from(sum_assured),
            coverage_term,
            status,
            created_at,
            applicant_type: applicant_type.to_string(),
            participant_count,
            participants,
            force_expired_invoice,
        });
    }

    Ok(out)
}

/// Generate 1 peserta Instansi (NIK unique dalam group, nama realistic).
/// HashSet lokal cuma mencegah 2 peserta di group YANG SAMA generate NIK
/// identik; NIK yang sama muncul lagi di group lain akan resolve ke
/// customer yang sudah ada (lihat `customers.nik UNIQUE` + resolve-by-nik
/// di atas), bukan error.
fn generate_participant(
    rng: &mut StdRng,
    used_niks: &mut std::collections::HashSet<String>,
) -> (String, String, NaiveDate) {
    // NIK 16 digit: PROV(2) + KOTA(2) + DDMMYY(6) + URUT(4) + KEC(2).
    // Range PROV dari 01-94 (sama dengan customers, tapi tidak conflict
    // karena tabel berbeda). Untuk peserta, kita hardcode PROV=KOTA=11
    // (kode Jakarta) supaya simple — variasi NIK datang dari DDMMYY
    // birth date + URUT random.
    const PROV: &str = "31";
    const KOTA: &str = "71";

    for _ in 0..1000 {
        // Birth date acak untuk variasi NIK: 25-55 tahun.
        let age_years = rng.gen_range(25..=55_i32);
        let epoch = NaiveDate::from_ymd_opt(2026 - age_years, 6, 15).unwrap();
        let offset_days = rng.gen_range(0..365_i64);
        let birth_date = epoch
            .checked_sub_signed(chrono::Duration::days(offset_days))
            .expect("birth_date arithmetic underflow");

        let ddmmyy = format!(
            "{:02}{:02}{:02}",
            birth_date.day(),
            birth_date.month(),
            birth_date.year() % 100
        );
        let urut: u32 = rng.gen_range(1..=9999);
        let kec: u32 = rng.gen_range(1..=99);
        let nik = format!("{PROV}{KOTA}{ddmmyy}{urut:04}{kec:02}");

        if used_niks.insert(nik.clone()) {
            // Nama: dari pool customers (sengaja reuse — realistis
            // bahwa banyak nama umum ada di perusahaan manapun).
            let first = crate::seed::data::FIRST_NAMES
                [rng.gen_range(0..crate::seed::data::FIRST_NAMES.len())];
            let last = crate::seed::data::LAST_NAMES
                [rng.gen_range(0..crate::seed::data::LAST_NAMES.len())];
            let full_name = format!("{first} {last}");
            return (nik, full_name, birth_date);
        }
    }
    panic!("unable to generate unique participant NIK after 1000 attempts");
}

/// Helper: kurangi `month` sebanyak `n` dari (year, month). Menghandle
/// rollover tahun (Jan → Dec tahun sebelumnya). `n` diasumsikan
/// non-negative dan kecil (<= 24).
fn subtract_months(year: i32, month: u32, n: u32) -> (i32, u32) {
    let total = year as i64 * 12 + month as i64 - n as i64;
    let new_year = total.div_euclid(12) as i32;
    let new_month_raw = total.rem_euclid(12) as u32;
    // rem_euclid returns 0..12, dengan 0 = Desember tahun sebelumnya
    // (artinya kita perlu (new_year-1, 12)). Tapi `div_euclid` sudah
    // handle ini — kalau raw=0 dan ada rollover, new_year sudah di-
    // adjust. Tetap: kalau raw==0, new_month jadi 12 dan new_year-1.
    let (new_year, new_month) = if new_month_raw == 0 {
        (new_year - 1, 12)
    } else {
        (new_year, new_month_raw)
    };
    (new_year, new_month)
}
