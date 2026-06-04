-- Migrasi 0005_clients_testimonials.sql
-- Marketing collateral: corporate clients (B2B) dan customer testimonials.
-- Tampil di landing page carousel.

-- ============== clients ==============
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  logo_path VARCHAR NOT NULL,
  industry VARCHAR,
  website VARCHAR,
  contact_person VARCHAR,
  contact_email VARCHAR,
  contact_phone VARCHAR,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_active_sort ON clients(is_active, sort_order);
CREATE INDEX idx_clients_name ON clients(LOWER(name));

-- ============== testimonials ==============
CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name VARCHAR NOT NULL,
  photo_path VARCHAR,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT NOT NULL,
  role VARCHAR,
  company VARCHAR,
  policy_type VARCHAR,
  display_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_testimonials_active_featured ON testimonials(is_active, is_featured, display_date DESC);
CREATE INDEX idx_testimonials_rating ON testimonials(rating);

-- ============== seed data untuk demo ==============
-- (Logo/foto placeholder saja; production perlu upload file via admin UI.)
INSERT INTO clients (name, logo_path, industry, website, contact_person, contact_email, contact_phone, sort_order) VALUES
  ('PT Bank Nusantara', '/var/uploads/clients/seed-bank-nusantara.svg', 'Perbankan', 'https://nusantara.example', 'Andi Wijaya', 'andi@nusantara.example', '+62-21-555-0101', 1),
  ('CV Mitra Sehat', '/var/uploads/clients/seed-mitra-sehat.svg', 'Kesehatan', 'https://mitrasehat.example', 'Siti Rahayu', 'siti@mitrasehat.example', '+62-21-555-0102', 2),
  ('Toko Sumber Rezeki', '/var/uploads/clients/seed-sumber-rezeki.svg', 'Ritel', 'https://sumberrezeki.example', 'Budi Hartono', 'budi@sumberrezeki.example', '+62-21-555-0103', 3),
  ('PT Garuda Logistik', '/var/uploads/clients/seed-garuda-logistik.svg', 'Logistik', 'https://garuda.example', 'Dewi Lestari', 'dewi@garuda.example', '+62-21-555-0104', 4);

INSERT INTO testimonials (customer_name, rating, review, role, company, policy_type, is_featured, display_date) VALUES
  ('Andi Setiawan', 5,
   'Prosesnya cepat dan tanpa ribet. Polis terbit dalam hitungan menit setelah pembayaran. Tim customer service juga sangat membantu saat saya butuh klarifikasi.',
   'Pemilik usaha', 'Toko Sumber Rezeki', 'LIFE', TRUE, '2026-05-15'),
  ('Sari Wahyuni', 5,
   'Saya bandingkan beberapa platform, InsureTrack paling transparan soal premi dan coverage. Klaim juga diproses cepat tanpa drama.',
   'Ibu rumah tangga', '—', 'HEALTH', TRUE, '2026-05-22'),
  ('Rudi Hartono', 4,
   'Pengalaman klaim personal accident lancar, dokumen yang diminta jelas. Hanya perlu waktu untuk upload file-nya, tapi worth it.',
   'Karyawan swasta', 'PT Garuda Logistik', 'PERSONAL_ACCIDENT', TRUE, '2026-06-01'),
  ('Maya Lestari', 5,
   'Aktivasi portal cepat, e-policy langsung masuk email. Saya bisa langsung download dan simpan. Tidak perlu nunggu surat fisik.',
   'Mahasiswa', '—', 'LIFE', FALSE, '2026-06-02');
