-- Migration 0008: relax customer schema untuk registration flow split.
--
-- Setelah flow split, account creation dan insurance application
-- dipisah. Account creation (POST /api/public/customers) hanya
-- butuh email + password + nama + mobile. Field-field insurance-
-- spesifik (nik, ktp, address, dll.) baru diisi saat customer
-- submit insurance form (POST /api/customer/registrations, requires
-- auth).
--
-- Migration ini ALTER kolom-kolom yang sebelumnya NOT NULL menjadi
-- NULLABLE. Existing rows (kalau ada) tetap valid karena mereka
-- sudah punya values.

-- 1. Relax customers: columns yang sebelumnya NOT NULL jadi nullable.
ALTER TABLE customers
  ALTER COLUMN nik DROP NOT NULL,
  ALTER COLUMN birth_place DROP NOT NULL,
  ALTER COLUMN birth_date DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN rt_rw DROP NOT NULL,
  ALTER COLUMN village DROP NOT NULL,
  ALTER COLUMN district DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL,
  ALTER COLUMN province DROP NOT NULL,
  ALTER COLUMN postal_code DROP NOT NULL,
  ALTER COLUMN mobile_number DROP NOT NULL,
  ALTER COLUMN id_card_path DROP NOT NULL;

-- Setelah ALTER, account creation bisa insert customer dengan field
-- insurance-specific = NULL. Insurance application akan UPDATE
-- customer dengan field yang sebenarnya (nik, ktp, address, dll.)
-- via endpoint POST /api/customer/registrations.
