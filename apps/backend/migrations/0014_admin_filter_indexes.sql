-- Migrasi 0014_admin_filter_indexes.sql
-- Composite & date indexes untuk mendukung pola query admin filter baru
-- (lihat routes/admin.rs::list_invoices/policies/claims/inquiries_admin).
-- Index existing di 0001_initial.sql hanya untuk kolom `status` (single column)
-- atau FK. Tambahan ini membuat filter + sort yang sering dipakai admin
-- (mis. "invoice UNPAID bulan ini sort by due_date asc") cukup cepat tanpa
-- seq scan, bahkan saat tabel sudah punya ratusan ribu row.
--
-- Naming convention: `idx_<tabel>_<kolom>` untuk single-column, atau
-- `idx_<tabel>_<pattern>` untuk composite. Urutan kolom composite
-- mengikuti selectivity: kolom `status` / `product` / `claim_type` (low
-- cardinality) dulu, lalu `created_at` / sort column (high cardinality,
-- range-friendly).
--
-- Semua pakai `IF NOT EXISTS` agar migration aman di-apply ulang
-- (idempotent). Tidak ada kolom baru — pure index additions.

-- ============================================================
-- invoices
-- ============================================================

-- Pola query paling umum: "invoice dengan status X, sort by created_at
-- desc". Composite (status, created_at DESC) bisa serve query ini
-- langsung tanpa sort step.
CREATE INDEX IF NOT EXISTS idx_invoices_status_created_at
  ON invoices(status, created_at DESC);

-- Filter "akan jatuh tempo minggu depan" — pola di due_date.
-- Range query di kolom DATE (bukan TIMESTAMPTZ), sederhana.
CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON invoices(due_date);

-- Sort by premium_amount ASC/DESC untuk filter nominal.
-- Single column karena di-filter tanpa `status` kombinasi.
CREATE INDEX IF NOT EXISTS idx_invoices_premium_amount
  ON invoices(premium_amount);

-- Filter "invoice yang sudah dibayar bulan ini" — paid_at range.
-- Partial index: hanya row yang PAID yang menarik (NULL paid_at
-- tidak perlu di-index). Partial index hemat ruang & lebih cepat
-- untuk query admin yang fokus ke paid invoices.
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at
  ON invoices(paid_at)
  WHERE paid_at IS NOT NULL;

-- ============================================================
-- policies
-- ============================================================

-- "Polis LIFE bulan ini sort by created_at desc" — composite.
CREATE INDEX IF NOT EXISTS idx_policies_product_created_at
  ON policies(product, created_at DESC);

-- Filter "polis yang akan expired dalam 30 hari" — pola di expiry_date.
CREATE INDEX IF NOT EXISTS idx_policies_expiry_date
  ON policies(expiry_date);

-- Sort by sum_assured.
CREATE INDEX IF NOT EXISTS idx_policies_sum_assured
  ON policies(sum_assured);

-- ============================================================
-- claims
-- ============================================================

-- "Claim ACCIDENT di produk PERSONAL_ACCIDENT sort by submitted_at desc"
-- — composite 3 kolom dengan low-cardinality leading.
CREATE INDEX IF NOT EXISTS idx_claims_status_claim_type_submitted_at
  ON claims(status, claim_type, submitted_at DESC);

-- Filter "incident date dalam coverage period" — pola di incident_date.
CREATE INDEX IF NOT EXISTS idx_claims_incident_date
  ON claims(incident_date);

-- Sort by claimed_amount.
CREATE INDEX IF NOT EXISTS idx_claims_claimed_amount
  ON claims(claimed_amount);

-- ============================================================
-- inquiries
-- ============================================================

-- "Inquiry OPEN sort by last message asc" — composite.
-- last_message_at di-index DESC karena default sort kebanyakan query
-- admin adalah "yang paling baru di-respond".
CREATE INDEX IF NOT EXISTS idx_inquiries_status_last_message_at
  ON inquiries(status, last_message_at DESC);

-- Default sort by last_message_at (kalau tidak filter by status).
CREATE INDEX IF NOT EXISTS idx_inquiries_last_message_at
  ON inquiries(last_message_at DESC);

-- ============================================================
-- Catatan operasional
-- ============================================================
-- - Setelah migration ini di-apply, jalankan ANALYZE untuk update
--   planner statistics: `ANALYZE invoices; ANALYZE policies; ANALYZE
--   claims; ANALYZE inquiries;`
-- - Index baru menambah biaya INSERT/UPDATE/DELETE — monitor
--   pg_stat_user_indexes.idx_scan untuk pastikan index dipakai dan
--   pg_stat_user_tables untuk pastikan trade-off worth it.
-- - Composite index (status, created_at DESC) bisa juga serve query
--   `WHERE status = X` (leftmost-prefix) — jadi idx_invoices_status
--   yang lama (single column) bisa di-drop setelah migration ini,
--   tapi untuk backward-compat kita biarkan saja.
