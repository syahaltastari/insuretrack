//! Stub KTP file untuk seeder.
//!
//! Schema `customers.id_card_path NOT NULL` — jadi tiap customer yang
//! di-insert butuh path. Untuk demo, kita tulis file PNG 1x1 pixel
//! sebagai placeholder. Admin tidak akan download KTP customer (hanya
//! di public registration flow), jadi file corrupt/placeholder tidak
//! masalah. Step 5+ bisa improve kalau perlu real KTP content.

use std::path::Path;

use sqlx::PgPool;
use tokio::fs;
use uuid::Uuid;

/// 1x1 pixel transparent PNG (67 bytes). Di-hardcode supaya tidak
/// tambah dependency `image`/`png` cuma untuk stub.
const PLACEHOLDER_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // 8-bit RGBA + CRC
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, // IDAT length + type
    0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, // zlib stream
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, // deflate
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND length + type
    0x42, 0x60, 0x82, // CRC
];

/// Tulis stub KTP file ke `${upload_dir}/customers/{customer_id}/ktp.png`.
/// Return relative path (disimpan di `customers.id_card_path`).
pub async fn write_stub(upload_dir: &str, customer_id: Uuid) -> anyhow::Result<String> {
    let relative = format!("customers/{}/ktp.png", customer_id);
    let absolute = Path::new(upload_dir).join(&relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(&absolute, PLACEHOLDER_PNG).await?;

    Ok(relative)
}

/// Hapus semua stub KTP files di `${upload_dir}/customers/`. Dipanggil
/// saat `--reset` supaya disk tidak numpuk stub dari run sebelumnya.
pub async fn clean_stubs(upload_dir: &str) -> anyhow::Result<()> {
    let dir = Path::new(upload_dir).join("customers");
    if dir.exists() {
        fs::remove_dir_all(&dir).await?;
    }
    Ok(())
}

/// Silence unused import warning untuk PgPool (akan dipakai di step 5+).
#[allow(dead_code)]
fn _typecheck(_: &PgPool) {}
