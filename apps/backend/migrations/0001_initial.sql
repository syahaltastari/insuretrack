-- Migrasi 0001_initial.sql
-- Schema awal: 10 tabel inti sesuai spec §7.
-- Snapshot historis: db/SCHEMA_REFERENCE.sql (jangan diedit setelah M1).

-- Mengaktifkan ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nik VARCHAR(16) UNIQUE NOT NULL,
  full_name VARCHAR NOT NULL,
  birth_place VARCHAR NOT NULL,
  birth_date DATE NOT NULL CHECK (birth_date <= CURRENT_DATE),
  gender VARCHAR NOT NULL,
  address VARCHAR NOT NULL,
  rt_rw VARCHAR NOT NULL,
  village VARCHAR NOT NULL,
  district VARCHAR NOT NULL,
  city VARCHAR NOT NULL,
  province VARCHAR NOT NULL,
  postal_code VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  mobile_number VARCHAR NOT NULL,
  id_card_path VARCHAR NOT NULL,
  password_hash VARCHAR,
  portal_status VARCHAR CHECK (portal_status IN ('PENDING', 'ACTIVE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. registrations
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_no VARCHAR UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  product VARCHAR NOT NULL,
  sum_assured NUMERIC NOT NULL,
  coverage_term INTEGER NOT NULL,
  status VARCHAR CHECK (
    status IN ('PENDING', 'PAID', 'ISSUED', 'CANCELLED')
  ),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_no VARCHAR UNIQUE NOT NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  premium_amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR CHECK (
    status IN ('UNPAID', 'PAID', 'EXPIRED', 'CANCELLED')
  ),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. policies
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_no VARCHAR UNIQUE NOT NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE RESTRICT,
  product VARCHAR NOT NULL,
  sum_assured NUMERIC NOT NULL,
  premium NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status VARCHAR CHECK (status IN ('ACTIVE', 'LAPSED', 'EXPIRED')),
  pdf_path VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. claims
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_no VARCHAR UNIQUE NOT NULL,
  policy_id UUID REFERENCES policies(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  claim_type VARCHAR NOT NULL,
  incident_date DATE NOT NULL,
  claimed_amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR CHECK (
    status IN (
      'SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'PAID'
    )
  ),
  decision_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. claim_documents
CREATE TABLE claim_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  file_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 7. inquiries
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_no VARCHAR UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  subject VARCHAR NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED')),
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- 8. email_logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient VARCHAR NOT NULL,
  email_type VARCHAR NOT NULL,
  subject VARCHAR NOT NULL,
  status VARCHAR CHECK (status IN ('SENT', 'FAILED', 'QUEUED')),
  error_message TEXT,
  sent_at TIMESTAMPTZ
);

-- 9. audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  entity_type VARCHAR NOT NULL,
  entity_id UUID,
  metadata JSONB,
  ip_address VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. admin_users
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  role VARCHAR DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk query yang sering dipakai di admin back-office.
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_customer ON registrations(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_registration ON invoices(registration_id);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_registration ON policies(registration_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_customer ON claims(customer_id);
CREATE INDEX idx_claims_policy ON claims(policy_id);
CREATE INDEX idx_inquiries_status ON inquiries(status);
CREATE INDEX idx_inquiries_customer ON inquiries(customer_id);
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient);
CREATE INDEX idx_email_logs_type ON email_logs(email_type);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
