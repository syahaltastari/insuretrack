-- Migrasi 0009_invoice_pdf_path.sql
-- Tambah kolom `pdf_path` ke tabel `invoices` agar invoice PDF yang
-- di-generate di submit_insurance_application (services/pdf.rs::render_invoice)
-- bisa di-download ulang dari portal dan admin (mirip policies.pdf_path di
-- 0001_initial.sql:71).
--
-- Nullable: invoice PDF di-render saat registrasi dibuat, tapi kolom ini
-- di-set via UPDATE terpisah di luar transaction utama (lihat
-- routes/customer.rs::submit_insurance_application) — jadi baris lama
-- hasil migrasi sebelumnya boleh NULL tanpa破坏 data existing.

ALTER TABLE invoices ADD COLUMN pdf_path VARCHAR;
