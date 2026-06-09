-- Migrasi 0010_claim_payment_proof.sql
-- Tambah kolom `payment_proof_path` ke tabel `claims` agar admin bisa
-- meng-upload bukti transfer saat menandai klaim sebagai PAID.
-- File di-store via storage abstraction (local filesystem atau R2)
-- dengan key prefix `payment_proofs/{claim_id}/{filename}` — lihat
-- services/storage.rs::save_payment_proof.
--
-- Nullable: klaim existing (yang sudah berstatus PAID sebelum fitur ini
-- ada, atau yang statusnya bukan PAID) tidak punya bukti pembayaran,
-- sehingga NULL adalah default yang valid.

ALTER TABLE claims ADD COLUMN payment_proof_path VARCHAR;
