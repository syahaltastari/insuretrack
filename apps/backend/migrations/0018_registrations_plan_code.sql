-- Migration 0018: registrations.plan_code — composite plan identifier.
--
-- registrations.product (kolom VARCHAR dari 0001_initial) hanya menyimpan
-- kategori produk ("LIFE" | "PERSONAL_ACCIDENT" | "HEALTH"), bukan plan
-- spesifik (mis. "LIFE_BASIC" vs "LIFE_STANDARD"). Plan code lengkap
-- dibutuhkan untuk:
--
--   1. Invoice & receipt PDF — tampilkan plan tier (Basic/Standard/Premium)
--      di samping product name, agar customer bisa audit bahwa mereka
--      ditagih plan yang benar.
--   2. List view admin/portal — filter & display plan tanpa lookup ke
--      PLAN_CATALOG di Rust setiap render.
--   3. Audit trail — plan_code yang di-bind saat registrasi tidak bisa
--      berubah walau PLAN_CATALOG di-update (pricing di kemudian hari).
--
-- NULLABLE: rows existing (dari seed atau registrasi sebelum migration ini)
-- tidak punya plan_code. List view render product_label saja tanpa
-- tier suffix; PDF lama tidak di-re-render.
--
-- Tidak ada CHECK constraint — validasi shape (regex `^[A-Z_]+_(BASIC|STANDARD|PREMIUM)$`)
-- ada di frontend form (zod) dan backend validate_registration. DB hanya
-- menyimpan string yang valid secara runtime.
--
-- Idempotency: ALTER TABLE ADD COLUMN tanpa IF NOT EXISTS — sqlx::migrate!
-- menolak re-run. Lihat 0016 untuk pattern komentar ini.

ALTER TABLE registrations
  ADD COLUMN plan_code VARCHAR(50);

COMMENT ON COLUMN registrations.plan_code IS
  'Composite plan code (mis. LIFE_BASIC) — lihat PLAN_CATALOG di src/dto/mod.rs. NULLABLE untuk backward compat dengan rows lama.';

-- Index untuk filter/list view "tampilkan semua invoice plan X".
-- Ukuran kecil (50 char) — index cost rendah.
CREATE INDEX idx_registrations_plan_code ON registrations(plan_code);
