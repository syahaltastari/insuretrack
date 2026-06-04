-- Migrasi 0003_constraints.sql
-- Memperketat kolom-kolom yang di spec FS-02 divalidasi server-side.
-- Aturan NIK 16 digit & email/mobile format akan divalidasi di aplikasi
-- (regex sulit & tidak portabel di CHECK constraint PostgreSQL). Yang
-- bisa di-enforce di DB kita taruh di sini.

-- 1. Product catalog: hanya 3 produk yang dijual (FS-01).
ALTER TABLE registrations
  ADD CONSTRAINT registrations_product_check
  CHECK (product IN ('LIFE', 'PERSONAL_ACCIDENT', 'HEALTH'));

-- 2. Gender enum (FS-02: Personal Information).
ALTER TABLE customers
  ADD CONSTRAINT customers_gender_check
  CHECK (gender IN ('MALE', 'FEMALE'));

-- 3. Mobile number: 10..15 digit (FS-02: Contact Information).
--    Panjang dijaga oleh VARCHAR, digit-only dijaga oleh regex via CHECK.
ALTER TABLE customers
  ADD CONSTRAINT customers_mobile_check
  CHECK (mobile_number ~ '^[0-9]{10,15}$');

-- 4. NIK 16 digit (FS-02).
ALTER TABLE customers
  ADD CONSTRAINT customers_nik_check
  CHECK (nik ~ '^[0-9]{16}$');

-- 5. Portal status enum: sudah ada di init.sql sebagai CHECK nullable.
--    Tidak diubah.

-- 6. Claimed amount harus positif dan tidak melebihi sum_assured policy
--    terkait. Validasi silang ini akan dilakukan service layer
--    (memerlukan JOIN ke policies) — tidak bisa di CHECK constraint.

-- 7. Coverage term: minimal 1 tahun (sanity guard, spec tidak eksplisit).
ALTER TABLE registrations
  ADD CONSTRAINT registrations_coverage_term_check
  CHECK (coverage_term >= 1);

-- 8. Sum assured: harus positif.
ALTER TABLE registrations
  ADD CONSTRAINT registrations_sum_assured_check
  CHECK (sum_assured > 0);
