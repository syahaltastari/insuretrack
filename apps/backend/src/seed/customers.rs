//! Generator customers.
//!
//! 30 customers realistic Indonesia. 3 pertama dapat password hash
//! + portal_status='ACTIVE' (login-able di portal). Sisanya PENDING
//!
//! (belum aktivasi, tidak punya password).

use chrono::{Datelike, NaiveDate};
use rand::{rngs::StdRng, Rng, SeedableRng};
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    auth::password::hash_password,
    seed::{config::SeedConfig, data, id_card},
};

/// Outcome yang di-paksakan untuk registration customer ini. Override
/// default distribution `i % 20` di seed_registrations supaya 4
/// portal customer demo punya 3 skenario jelas (lihat assignment
/// di `seed_customers`).
///
/// Alasan pisah dari `eligible_applicant_types`: outcome mengatur
/// status registration (apakah sukses atau gagal), sedangkan eligibility
/// mengatur applicant_type (INDIVIDU vs INSTANSI). Bisa di-combine —
/// customer Success bisa eligible INDIVIDU saja atau INSTANSI saja
/// atau mixed, independent dari outcome-nya.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationOutcome {
    /// Pakai distribution default `i % 20` di seed_registrations.
    /// Ini untuk non-portal customer (27 dari 30 customer demo).
    Default,
    /// Registration selalu `ISSUED` (status akhir sukses, dapat policy).
    /// Dipakai untuk 3 portal customer pertama (i=0..2) supaya demo
    /// flow login → lihat polis tanpa ada skenario gagal yang
    /// membingungkan.
    Success,
    /// Registration selalu `PENDING` dengan invoice `EXPIRED`
    /// (overdue, lewat `due_date`). Dipakai untuk 1 portal customer
    /// ke-4 (i=3 kalau portal customers >= 4) supaya demo bisa
    /// tunjukkan skenario "registrasi gagal karena lewat tanggal
    /// registrasi" tanpa harus inject manual.
    Expired,
}

/// Output 1 customer yang baru di-insert. Digunakan caller untuk
/// downstream steps (registrations, claims, dst.) yang butuh customer
/// reference.
#[derive(Debug, Clone)]
pub struct SeededCustomer {
    pub id: Uuid,
    pub email: String,
    pub full_name: String,
    pub birth_date: NaiveDate,
    pub nik: String,
    pub province: String,
    pub city: String,
    /// `Some((plaintext_password, ...))` kalau customer ini punya
    /// portal access; `None` untuk yang PENDING.
    pub portal_password: Option<String>,
    /// Applicant types yang boleh di-assign ke customer ini saat
    /// seed_registrations round-robin. Filter supaya customer tertentu
    /// hanya jadi representative registration type tertentu saja —
    /// penting untuk 3 portal customer demo supaya tag output CLI
    /// terdistribusi rapi (1 mixed, 1 Individu only, 1 Instansi only).
    ///
    /// Default `[INDIVIDU, INSTANSI]` (mixed). Customer dengan
    /// `portal_password` non-None di i=0..2 di-override supaya
    /// demo flow punya 3 variasi.
    pub eligible_applicant_types: Vec<&'static str>,
    /// Outcome yang di-paksa untuk registration customer ini. Lihat
    /// `RegistrationOutcome` untuk variasi.
    pub registration_outcome: RegistrationOutcome,
}

/// Password yang dipakai untuk 3 portal customers (fixed untuk demo,
/// mudah diingat). Spec tidak minta password random — yang penting
/// predictable supaya saat onboarding klien, support tinggal baca
/// dari console output.
const DEMO_PASSWORD: &str = "Demo1234!";

pub async fn seed_customers(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
) -> anyhow::Result<Vec<SeededCustomer>> {
    let mut rng = StdRng::seed_from_u64(0xC0FFEE_u64);
    let mut out = Vec::with_capacity(cfg.counts.customers);

    // Track uniqueness dalam batch ini (NIK & email bisa collide
    // dengan existing rows kalau --reset tidak dipakai — caller panggil
    // reset dulu kalau mau deterministic).
    let mut used_niks = std::collections::HashSet::new();
    let mut used_emails = std::collections::HashSet::new();

    // Pre-hash password sekali untuk efisiensi (3 customers pakai
    // password yang sama). Hash beda per user karena salt random,
    // tapi generation cost berkurang.
    let pre_hashed = if cfg.counts.customers_with_portal > 0 {
        Some(hash_password(DEMO_PASSWORD).map_err(|e| anyhow::anyhow!("hash password: {e}"))?)
    } else {
        None
    };

    for i in 0..cfg.counts.customers {
        // Nama — kombinatorik first × last, tapi pakai modulo untuk
        // uniqueness deterministik (bukan collision random).
        let first = data::FIRST_NAMES[i % data::FIRST_NAMES.len()];
        let last = data::LAST_NAMES[(i * 7 + 3) % data::LAST_NAMES.len()];
        let full_name = format!("{first} {last}");

        // Birth date: usia 25-65 tahun. Ambil tanggal acak dalam 365
        // hari sebelum hari jadi ke-{age_years} dari epoch 2026-06-15.
        let age_years = rng.gen_range(25..=65_i32);
        let epoch = NaiveDate::from_ymd_opt(2026 - age_years, 6, 15).unwrap();
        let offset_days = rng.gen_range(0..365_i64);
        let birth_date = epoch
            .checked_sub_signed(chrono::Duration::days(offset_days))
            .expect("birth_date arithmetic underflow");

        // NIK 16 digit: PROVINSI(2) + KOTA(2) + DDMMYY(6) + URUT(4) + KEC(2).
        let nik = unique_nik(&mut rng, birth_date, &mut used_niks);

        // Email: firstname.lastnameNN@example.com dengan NN 2-digit
        // untuk uniqueness (max 99 customers — load mode pakai 6 digit).
        let email = unique_email(first, last, &mut rng, &mut used_emails);

        // Lokasi random — provinsi + kota.
        let (city, province) = random_location(&mut rng);

        // Mobile: +62 8xx (10-15 digit per spec).
        let mobile = random_mobile(&mut rng);

        // Address components.
        let street = data::STREETS[rng.gen_range(0..data::STREETS.len())];
        let house_no = rng.gen_range(1..200);
        let address = format!("{street} No. {house_no}");
        let rt_rw = format!("{:03}/{:03}", rng.gen_range(1..20), rng.gen_range(1..20));
        let village = format!("Kelurahan {}", data::LAST_NAMES[rng.gen_range(0..10)]);
        let district = format!("Kecamatan {}", data::LAST_NAMES[rng.gen_range(10..20)]);
        let postal_code = format!("{:05}", rng.gen_range(10000..99999));

        // Gender: random 50/50.
        let gender = if rng.gen_bool(0.5) { "MALE" } else { "FEMALE" };

        // Place of birth: nama kota (subset CITIES).
        let birth_place = data::CITIES[rng.gen_range(0..data::CITIES.len())];

        // Insert & tangkap id.
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO customers (
                nik, full_name, birth_place, birth_date, gender,
                address, rt_rw, village, district, city, province, postal_code,
                email, mobile_number, id_card_path, password_hash, portal_status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING id
            "#,
        )
        .bind(&nik)
        .bind(&full_name)
        .bind(birth_place)
        .bind(birth_date)
        .bind(gender)
        .bind(&address)
        .bind(&rt_rw)
        .bind(&village)
        .bind(&district)
        .bind(city)
        .bind(province)
        .bind(&postal_code)
        .bind(&email)
        .bind(&mobile)
        // id_card_path: dipost-dated — kita tulis file setelah insert
        // supaya kita tahu UUID final. Untuk konsistensi, kita panggil
        // write_stub dengan id yang akan di-generate (predetermined via
        // uuid::new_v4 — race-prone). Solusi: tulis stub lalu pass path.
        .bind("placeholder")
        .bind(Option::<String>::None)
        .bind(Option::<&str>::None)
        .fetch_one(&mut **tx)
        .await?;

        // Tulis stub KTP file & update path.
        let relative_path = id_card::write_stub(&cfg.upload_dir, id).await?;
        sqlx::query("UPDATE customers SET id_card_path = $1 WHERE id = $2")
            .bind(&relative_path)
            .bind(id)
            .execute(&mut **tx)
            .await?;

        // 3 customer pertama: ACTIVE + password.
        let portal_password = if i < cfg.counts.customers_with_portal {
            let hash = pre_hashed.as_ref().expect("hash pre-computed");
            sqlx::query(
                "UPDATE customers SET password_hash = $1, portal_status = 'ACTIVE' WHERE id = $2",
            )
            .bind(hash)
            .bind(id)
            .execute(&mut **tx)
            .await?;
            Some(DEMO_PASSWORD.to_string())
        } else {
            None
        };

        // Eligibility per customer untuk assignment registration:
        //   i=0 (portal, demo "mixed")  → eligible INDIVIDU + INSTANSI
        //   i=1 (portal, "Individu")    → eligible INDIVIDU saja
        //   i=2 (portal, "Instansi")    → eligible INSTANSI saja
        //   i>=3 (non-portal)           → eligible INDIVIDU + INSTANSI
        //
        // Tujuan: tag CLI output punya 3 variasi supaya onboarding
        // bisa demo ke klien 3 skenario berbeda (lihat
        // `print_portal_credentials` di printer.rs).
        let eligible_applicant_types: Vec<&'static str> = if i == 1 && cfg.counts.customers_with_portal >= 2 {
            vec!["INDIVIDU"]
        } else if i == 2 && cfg.counts.customers_with_portal >= 3 {
            vec!["INSTANSI"]
        } else {
            // i=0 (mixed portal) atau non-portal → eligible dua-duanya.
            vec!["INDIVIDU", "INSTANSI"]
        };

        // Outcome per customer untuk demo flow yang konsisten:
        //   i=0..2 (3 portal customer sukses)  → RegistrationOutcome::Success
        //   i=3 (portal customer ke-4, kalau ada) → RegistrationOutcome::Expired
        //   i>=4 atau non-portal              → RegistrationOutcome::Default
        //
        // Tujuan: 3 portal customer pertama dijamin sukses (ada policy,
        // bisa di-demo full flow login → lihat polis). Portal customer
        // ke-4 dipakai untuk demo skenario gagal (invoice EXPIRED,
        // registration PENDING, tidak ada policy).
        let registration_outcome = if i < 3 && cfg.counts.customers_with_portal > i {
            RegistrationOutcome::Success
        } else if i == 3 && cfg.counts.customers_with_portal >= 4 {
            RegistrationOutcome::Expired
        } else {
            RegistrationOutcome::Default
        };

        out.push(SeededCustomer {
            id,
            email,
            full_name,
            birth_date,
            nik,
            province: province.to_string(),
            city: city.to_string(),
            portal_password,
            eligible_applicant_types,
            registration_outcome,
        });
    }

    Ok(out)
}

/// Generate NIK 16 digit unique dalam batch: PROV(2) + KOTA(2) +
/// DDMMYY(6) + URUT(4) + KEC(2). Loop sampai unik.
fn unique_nik(
    rng: &mut StdRng,
    birth: NaiveDate,
    used: &mut std::collections::HashSet<String>,
) -> String {
    // Default kota pool kalau provinsi tidak ditemukan di NIK_KOTA_PER_PROV.
    const DEFAULT_KOTA: &[&str] = &["01"];

    for _ in 0..1000 {
        // Pilih random PROV + KOTA dari pool curated.
        let prov_entry = &data::NIK_PROVINSI[rng.gen_range(0..data::NIK_PROVINSI.len())];
        let prov = prov_entry.1;
        let kota_list: &[&str] = data::NIK_KOTA_PER_PROV
            .iter()
            .find(|(p, _)| *p == prov)
            .map(|(_, k)| *k)
            .unwrap_or(DEFAULT_KOTA);
        let kota = kota_list[rng.gen_range(0..kota_list.len())];

        // DDMMYY (urutan DDMM, bukan DDMY).
        let dd = birth.day();
        let mm = birth.month();
        let yy = birth.year() % 100;
        let ddmmyy = format!("{:02}{:02}{:02}", dd, mm, yy);

        // 4-digit urut + 2-digit kode kecamatan acak.
        let urut: u32 = rng.gen_range(1..=9999);
        let kec: u32 = rng.gen_range(1..=99);
        let nik = format!("{}{}{}{:04}{:02}", prov, kota, ddmmyy, urut, kec);

        if used.insert(nik.clone()) {
            return nik;
        }
    }
    panic!("unable to generate unique NIK after 1000 attempts — increase NIK pool");
}

/// Generate email unique: firstname.lastnameNN@example.com.
fn unique_email(
    first: &str,
    last: &str,
    rng: &mut StdRng,
    used: &mut std::collections::HashSet<String>,
) -> String {
    let first_lower = first.to_lowercase();
    let last_lower = last.to_lowercase();
    for _ in 0..100 {
        let nn: u32 = rng.gen_range(1..=99);
        let email = format!("{first_lower}.{last_lower}{nn:02}@example.com");
        if used.insert(email.clone()) {
            return email;
        }
    }
    panic!("unable to generate unique email after 100 attempts");
}

/// Pilih random (city, province) tuple dari pool. Province tidak
/// selalu match dengan city (e.g. "Jakarta Selatan" ada di "DKI
/// Jakarta") — pool curated untuk variasi.
fn random_location(rng: &mut StdRng) -> (&'static str, &'static str) {
    let idx = rng.gen_range(0..data::CITIES.len() + data::PROVINCES.len());
    if idx < data::CITIES.len() {
        let city = data::CITIES[idx];
        // Default province = "DKI Jakarta" untuk Jakarta-area, else random.
        let province = if city.starts_with("Jakarta") {
            "DKI Jakarta"
        } else {
            data::PROVINCES[rng.gen_range(0..data::PROVINCES.len())]
        };
        (city, province)
    } else {
        // idx di range [CITIES.len(), CITIES.len() + PROVINCES.len()),
        // jadi idx - CITIES.len() aman dalam bounds PROVINCES.
        let province = data::PROVINCES[idx - data::CITIES.len()];
        let city = data::CITIES[rng.gen_range(0..data::CITIES.len())];
        (city, province)
    }
}

/// Mobile: digit-only 10–15 karakter (constraint `^[0-9]{10,15}$`).
/// Format: `62` + prefix operator (`811`/`812`/`813`/`821`) + 8 digit
/// random subscriber = total 13 digit.
fn random_mobile(rng: &mut StdRng) -> String {
    let prefix = match rng.gen_range(0..4) {
        0 => "811",
        1 => "812",
        2 => "813",
        _ => "821",
    };
    let suffix: u32 = rng.gen_range(10_000_000..=99_999_999);
    format!("62{prefix}{suffix:08}")
}

/// Silence unused import untuk PgConnection (reserved untuk batch
/// optimization di M4+).
#[allow(dead_code)]
fn _typecheck_conn(_: &mut PgConnection) {}
