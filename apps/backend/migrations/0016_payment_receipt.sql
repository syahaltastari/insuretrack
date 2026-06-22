-- Migration 0016: Payment receipt — kolom bukti pembayaran di invoices.
--
-- Menambah 4 kolom ke invoices untuk mendukung dokumen Bukti Pembayaran
-- (receipt) yang distinct dari Invoice PDF. Receipt di-render di payment
-- webhook setelah invoice bertransisi UNPAID → PAID, dan memuat metadata
-- pembayaran yang dikirim payment gateway:
--
--   * receipt_pdf_path   : key/path PDF receipt di storage. NULL sampai
--                          render di payment_webhook selesai. Setelah
--                          commit, file tersedia via download endpoint.
--                          NULL untuk invoice lama / seed yang belum di-
--                          bayar (aman — endpoint return 404).
--   * payment_channel    : channel bayar dari gateway (mis.
--                          VIRTUAL_ACCOUNT_BCA, QRIS, EWALLET_OVO).
--                          Opsional — gateway lama / mock mungkin tidak
--                          kirim. NULL = tidak diketahui.
--   * payment_reference  : id transaksi / nomor referensi dari gateway
--                          (mis. TRX-20260622-9F3A21). Opsional.
--   * paid_amount        : nominal yang benar-benar dibayar. Untuk MVP
--                          sama dengan premium_amount, tapi disimpan di
--                          kolom terpisah agar partial payment / diskon /
--                          rounding bisa diverge tanpa migration baru.
--
-- Naming: prefix `receipt_` untuk bedakan dari invoices.pdf_path
-- (kolom invoice PDF di 0009) — receipts adalah dokumen kedua yang
-- disimpan per invoice. Tidak ada collision dengan claims.payment_proof_path
-- (0010) — beda tabel.
--
-- Idempotency: tidak ada IF NOT EXISTS — sqlx::migrate! menolak re-run,
-- dan ALTER TABLE ADD COLUMN tanpa IF NOT EXISTS di PG < 9.6 akan error.
-- Untuk Postgres 15+ behavior aman (error if exists). Kalau butuh
-- re-runnable migration, tambahkan IF NOT EXISTS (lihat 0015 untuk pattern).

ALTER TABLE invoices ADD COLUMN receipt_pdf_path  VARCHAR;
ALTER TABLE invoices ADD COLUMN payment_channel   VARCHAR;
ALTER TABLE invoices ADD COLUMN payment_reference VARCHAR;
ALTER TABLE invoices ADD COLUMN paid_amount       NUMERIC(15,2);

COMMENT ON COLUMN invoices.receipt_pdf_path IS
  'Storage key untuk Bukti Pembayaran PDF. NULL sampai render webhook selesai.';

COMMENT ON COLUMN invoices.payment_channel IS
  'Channel bayar dari payment gateway (VIRTUAL_ACCOUNT_BCA, QRIS, EWALLET_OVO, dll). NULL jika gateway tidak mengirim.';

COMMENT ON COLUMN invoices.payment_reference IS
  'ID transaksi / nomor referensi dari payment gateway. Opsional, NULL jika gateway tidak mengirim.';

COMMENT ON COLUMN invoices.paid_amount IS
  'Nominal yang benar-benar dibayar. Untuk MVP = invoices.premium_amount; kolom terpisah agar partial payment / diskon bisa ditambah tanpa migration.';