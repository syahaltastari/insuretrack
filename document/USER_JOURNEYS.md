# User Journeys — InsureTrack

A walkthrough of every user-facing flow in the InsureTrack platform.
Each journey is **self-contained** — you can read it top-to-bottom and
test it step-by-step without flipping back to other sections.

> **Who should read this?**
> - New developers onboarding to the codebase.
> - QA / testers who want a manual test script.
> - Anyone who wants to understand the system without reading 1,500 lines of Rust.

---

## Quick Reference

### Base URLs (local dev)

| Service | URL | Notes |
| --- | --- | --- |
| Customer portal | `http://localhost:3000` | Public landing at `/`. Logged-in area under `/portal/*`. Marketing pages under `/about`, `/faq`, `/products/[slug]`, etc. |
| Admin backoffice | `http://localhost:3001` | Everything under `/admin/*`. |
| Backend REST API | `http://localhost:8080/api` | See "API Conventions" below. |
| Resend inbox (dev) | your registered email | Required to receive activation / invoice / claim emails. |
| MailHog / mailcatcher (if set up) | n/a | We use Resend directly; check your real inbox. |

### Test credentials (seed data)

After running `docker compose up -d --build`, the database is seeded with:

- **Admin:** username `admin`, password `admin` (change before production!)
- **Customer:** no seed customer — register one through the public flow.
- **Storage:** defaults to `local` (uploads go to `./apps/backend/uploads/`).

### API Conventions

- All responses are JSON. Successful responses return the data directly; errors use:
  ```json
  { "error": { "code": "VALIDATION", "message": "..." } }
  ```
- Customer auth: `Authorization: Bearer <jwt>` from `POST /api/customer/login`.
- Admin auth: `Authorization: Bearer <jwt>` from `POST /api/admin/login`.
- Webhook secret: `X-Webhook-Secret: dev_webhook_secret_change_me` (set in `.env`).
- Customer vs admin JWTs are role-scoped — middleware refuses a customer token on admin routes and vice versa. A customer may only see/modify their own rows.

### Status state machines (quick reference)

Spec §10. Worth knowing for testing:

- **Invoice:** `UNPAID → PAID | EXPIRED | CANCELLED`
- **Registration:** `PENDING → PAID → ISSUED`  |  `PENDING → CANCELLED`
- **Policy:** `ACTIVE → LAPSED | EXPIRED`
- **Claim:** `SUBMITTED → UNDER_REVIEW → APPROVED → PAID`  |  `SUBMITTED | UNDER_REVIEW → REJECTED`
- **Inquiry:** thread model — see box below.

> **Inquiry is a thread, not a status ladder.**
> Since migration 0011, every inquiry has many messages in `inquiry_messages`.
> The parent `inquiries.status` reflects the *direction of the latest message*:
>
> - `OPEN` — last message was from the **customer**; admin must reply.
> - `ANSWERED` — last message was from an **admin**; customer may reply or close.
> - `CLOSED` — terminal (manual close by either party, OR auto-close because
>   no reply was sent within `INQUIRY_AUTO_CLOSE_DAYS` days — default 7).
>
> Status transitions are driven by `last_sender_type` on the parent row
> and a `last_message_at` timestamp checked lazily on every GET.

### Identifier formats (spec §9)

Monthly-reset sequences allocated inside a DB transaction:

| Entity | Format | Example |
| --- | --- | --- |
| Registration | `REG-YYYYMM-NNNNNN` | `REG-202606-000001` |
| Invoice | `INV-YYYYMM-NNNNNN` | `INV-202606-000001` |
| Policy | `POL-YYYYMM-NNNNNN` | `POL-202606-000001` |
| Claim | `CLM-YYYYMM-NNNNNN` | `CLM-202606-000001` |
| Inquiry | `INQ-YYYYMM-NNNNNN` | `INQ-202606-000001` |

### Audit events emitted

Every meaningful action writes a row to `audit_logs` (`actor`, `action`, `entity_type`, `entity_id`, `metadata` JSONB, `ip_address`):

`admin_login`, `customer_login`, `customer_registered`, `registration_created`, `invoice_generated`, `payment_received`, `policy_issued`, `claim_submitted`, `claim_status_changed`, `claim_payment_proof_uploaded`, `inquiry_submitted`, `inquiry_message_sent`, `inquiry_closed_by_customer`, `inquiry_closed_by_admin`, `customer_profile_updated`, `customer_password_changed`, `customer_password_reset`, `admin_profile_updated`, `admin_password_changed`.

---

## Part 1 — Public Flows (no authentication)

### J1. Browse the Public Landing Page

**Goal:** A visitor lands on the homepage, learns about the platform, browses products, sees client logos and testimonials.

**Path:** `http://localhost:3000/` (no `/portal/` prefix)

**Sections on the page (in order, all server-rendered):**

1. **Hero** — headline "Asuransi digital, polis langsung terbit.", subline, two CTAs: **Beli Polis Sekarang** (→ `/portal/register`) and **Lihat Produk** (smooth-scroll to `#products`).
2. **Products** — 3 cards (Life, Personal Accident, Health) loaded from `GET /api/public/products`. Each card links to a detail page at `/products/[slug]`.
3. **How it works** — 3 numbered steps: "01 Daftar Online", "02 Bayar Premi", "03 Polis Terbit" (on ube swatch background).
4. **Why InsureTrack** — 6 benefit tiles: Tanpa Cabang, Auto-Accept, E-Policy PDF, Portal Customer, Pembayaran Aman, Audit Trail.
5. **Clients (B2B partners)** — logo strip loaded from `GET /api/public/clients`. Hidden if empty.
6. **Testimonials** — carousel loaded from `GET /api/public/testimonials`. Hidden if empty.
7. **CTA** — "Siap melindungi yang Anda cintai?" with **Mulai Sekarang** button (on matcha swatch background).
8. **Contact** — `cs@insuretrack.example` + `(021) 555-0100` + "Bogor, Indonesia".

Top of page: `Navbar` with links `Beranda`, `Tentang`, `FAQ`, `Produk` (dropdown), and right-side `Masuk` / `Daftar` buttons.

**Test it:**
1. Open `http://localhost:3000/`.
2. Scroll through every section. All images load (no broken icons). Carousel is swipeable.
3. Click **Lihat Produk** → smooth-scrolls to products.
4. Click any product card → goes to `/products/[slug]` (J1b).
5. Click **Beli Polis Sekarang** or **Mulai Sekarang** → navigates to `/portal/register` (NOT `/register` — that path doesn't exist).

**APIs touched (frontend reads on mount):**
- `GET /api/public/products` — returns `{ data: { products: Product[], plans: ProductPlan[] } }` (nested object, not flat array).
- `GET /api/public/clients`
- `GET /api/public/testimonials`

---

### J1b. View Product Detail Page

**Goal:** A visitor reads static marketing copy for a single product (coverage range, benefits, FAQ-style Q&A).

**Path:** `http://localhost:3000/products/[slug]` — slugs: `life`, `personal-accident`, `health`.

**What's on the page:**
- Product name + icon.
- Coverage details: `Uang Pertanggungan` range (e.g. "Rp 100jt – Rp 5M"), `Masa Pertanggungan` range, `Usia Masuk` range.
- Benefits list.
- "Cara klaim" steps.
- Exclusions list.
- CTA button **Ajukan Asuransi Ini** (→ `/portal/register` if logged out, `/portal/insurance/new` if logged in).

**Data source:** `apps/portal/lib/product-details.ts` (static). No backend fetch — content is marketing material, not transactional.

**Test it:**
1. Click a product card on landing page.
2. Verify the slug matches the URL (e.g. `LIFE` product → `/products/life`).
3. Try a wrong slug like `/products/foobar` → should render `not-found.tsx`.

---

### J1c. Read Marketing Pages

**Goal:** A visitor reads about the company, FAQs, and legal pages.

**Paths:**

| URL | Content |
| --- | --- |
| `/about` | Misi, Visi, Nilai (3-4 value tiles), team placeholder. |
| `/faq` | FAQ grouped per topic (Pendaftaran, Produk, Pembayaran, Polis, Klaim, Keamanan). Each item is a native `<details>` (no JS, accessible, SEO-friendly). |
| `/privacy` | Privacy policy text. |
| `/terms` | Terms of service text. |

All four pages are static (server components) — no backend calls. They share the `Navbar` + `Footer` from `app/(marketing)/layout.tsx`.

**Test it:**
1. Click **Tentang** in the navbar → `/about` loads.
2. Click **FAQ** → grouped questions render, each `<details>` is toggleable.
3. Verify the footer is consistent across all marketing pages.

---

### J2. Register a New Customer Account

**Goal:** A visitor creates a portal account. **Account creation is now decoupled from insurance application** (since the flow split). Insurance application happens later at `/portal/insurance/new` after login.

**Path:** `http://localhost:3000/portal/register`

**Form fields:** `full_name`, `email`, `password`, `mobile_number`.

**Password rules** (server + client): min 8 chars, 1 uppercase, 1 digit.

**Steps:**
1. Open `/portal/register`.
2. Fill in the form. Password input shows a strength hint.
3. Click **Daftar →**.
4. Backend creates a customer with `portal_status = 'PENDING'`, hashes the password (argon2id), and queues an activation email (`PORTAL_ACTIVATION`).
5. You see a success screen: "Akun portal kamu sudah dibuat" with a button **Ke Halaman Login**.

**After registration:**
- The activation email arrives at the address you used. (Make sure `.env` has `RESEND_API_KEY` set, or email sending will fail.)
- Customer is in the DB with `portal_status = 'PENDING'` — they cannot log in until they activate.
- Audit: `customer_registered`.

**API:**
```
POST /api/public/customers
Content-Type: application/json

{
  "full_name": "Test User",
  "email": "test@example.com",
  "password": "Password123",
  "mobile_number": "081234567890"
}
```

**Response:**
```json
{
  "customer_id": "uuid...",
  "email": "test@example.com",
  "activation_url": "http://localhost:3000/portal/activate?token=eyJ..."
}
```

> The `activation_url` is also returned in the response for convenience in dev — but in production, only the email would have it.

---

### J3. Activate the Account

**Goal:** New customer clicks the activation link in the email to enable login.

**Path:** `http://localhost:3000/portal/activate?token=<jwt>`

> The link is single-use. After activation, clicking it again returns 404.

**Steps:**
1. Open the activation email. Click the **Aktifkan Akun Saya →** button (or copy the URL).
2. The page reads the token from the URL and shows a single button: **Aktifkan Akun →**.
3. Click it. The backend flips `portal_status` from `PENDING` to `ACTIVE` and issues a fresh login JWT.
4. You are redirected to `/portal/dashboard` — already logged in.

**No password form anymore.** The password you set during registration is kept. Activation is purely an email-confirmation step.

**API:**
```
POST /api/customer/activate
Content-Type: application/json

{ "token": "<jwt from email>" }
```

**What to test:**
- [ ] Click activation link in fresh email → page loads, button visible.
- [ ] Click button → redirected to dashboard.
- [ ] Refresh the activation URL in browser → should error (token already used).
- [ ] Try to log in **before** activating → should fail with 403 Forbidden.

---

### J4. Request Password Reset (Forgot Password)

**Goal:** A customer who forgot their password gets a reset link via email.

**Path:** `http://localhost:3000/portal/reset`

**Steps:**
1. Open `/portal/reset`.
2. Enter the registered email.
3. Backend returns a `reset_token` in the response (in production, only via email).
4. Open `/portal/reset/consume?token=<jwt>` (the link from the email).
5. Enter a new password, confirm, click submit.
6. Password is updated. Audit: `customer_password_reset`. You can now log in with the new password.

**API:**
```
POST /api/customer/password/reset
Content-Type: application/json
{ "email": "test@example.com" }
```

Response includes `reset_token` and `reset_url` (for testing convenience).

```
POST /api/customer/password/reset/consume
Content-Type: application/json
{ "token": "<jwt>", "new_password": "NewPassword456" }
```

---

### J4b. Track Registration Status (Public Lookup)

**Goal:** A visitor with a `registration_no` can check status without logging in. Useful for the "after payment" return-URL flow.

**Path:** No UI page in the customer portal — this is a backend-only endpoint that the frontend (or any third party) can hit.

**API:**
```
GET /api/public/registrations/REG-202606-000001
```

**Response:**
```json
{
  "registration_no": "REG-202606-000001",
  "status": "ISSUED",
  "invoice_status": "PAID",
  "policy_no": "POL-202606-000001"
}
```

> The customer portal shows the same data through the protected `/portal/policies` and `/portal/invoices` pages — this public endpoint is for cases where the user isn't logged in (e.g. a return-URL after external payment).

---

## Part 2 — Customer Portal (logged-in)

> All flows below assume you've completed **J2 + J3** (registered + activated) and are logged in.
> The portal stores the JWT in `localStorage` under `insuretrack_customer_token`. To "log out" during testing, open DevTools → Application → Local Storage → delete that key.

### J5. Customer Login

**Path:** `http://localhost:3000/portal/login`

**Form fields:** `email`, `password`.

**Steps:**
1. Open `/portal/login` (you'll be redirected here automatically if you visit a protected page while logged out).
2. Enter the email and password you used in J2.
3. Click **Login →**. On success, you're redirected to `/portal/dashboard`. Audit: `customer_login`.

**API:**
```
POST /api/customer/login
Content-Type: application/json
{ "username": "test@example.com", "password": "Password123" }
```

**Response:**
```json
{ "token": "eyJ...", "role": "customer" }
```

**Errors to test:**
- Wrong password → 401 Unauthorized.
- Account not activated → 403 Forbidden.

---

### J6. View Dashboard

**Path:** `http://localhost:3000/portal/dashboard`

**What's on the page:**
- 4 metric cards: active policy count, total sum assured, open claim count, open inquiry count.
- Quick-action buttons: Apply for Insurance, View Policies, View Invoices, Submit Claim, Create Inquiry.
- Conditional banner: if no active policies, shows a prominent "Ajukan Asuransi Sekarang" CTA pointing to `/portal/insurance/new`.

**API:**
```
GET /api/customer/me
Authorization: Bearer <jwt>
```

---

### J7. Apply for Insurance — Individu (single participant)

**Goal:** A logged-in customer submits an insurance application for **themselves**. The form has 4 tabs.

**Path:** `http://localhost:3000/portal/insurance/new` → default tab "Individu".

> For group/Instansi (N participants in one submission), see **J7b** — same page, switch to the "Instansi" tab.

**Form structure (4 tabs):**

| # | Tab | Fields |
| --- | --- | --- |
| 1 | **Data Pribadi** | `nik` (16 digits, unique), `full_name`, `birth_place`, `birth_date` (≤ today), `gender` (MALE/FEMALE), `address`, `rt_rw` (format `001/002`), `village`, `district`, `city`, `province`, `postal_code`. For product `LIFE`: also `beneficiary_name` (ahli waris, **required**). |
| 2 | **Kontak** | `email`, `mobile_number` (10–15 digits). Pre-filled from your portal account. |
| 3 | **Informasi Asuransi** | `plan_code` (composite id, e.g. `LIFE_BASIC`, `HEALTH_PREMIUM` — picked from the `PlanPicker` showing product plans from `GET /api/public/products`), `coverage_term` (years, must fall in product's allowed range). |
| 4 | **KTP** | `id_card` (JPG / PNG / PDF, max 5 MB). |

Tab triggers show a checkmark (✓) when all their fields are valid. Tab navigation is unrestricted (no Next-gate) — full schema validation runs at submit.

**Steps:**
1. Open `/portal/insurance/new` (must be logged in).
2. Fill the 4 tabs. KTP is required.
3. Click submit. The backend:
   - Validates the data (NIK 16 digits, dates not in future, beneficiary required if `LIFE`, etc.).
   - Inserts a `registrations` row with `applicant_type = 'INDIVIDU'`, `status = 'PENDING'`.
   - Inserts an `invoices` row with `status = 'UNPAID'`, computes `premium_amount` from `plan_code` × `coverage_term`.
   - Renders an invoice PDF, saves to storage, updates `invoices.pdf_path`.
   - Sends 2 emails: **REGISTRATION_SUCCESS** (text-only) + **INVOICE_NOTIFICATION** (with PDF attachment).
   - Audit events: `registration_created`, `invoice_generated`.
4. You're redirected to a confirmation page showing `REG-YYYYMM-NNNNNN` + `INV-YYYYMM-NNNNNN`.

**API:**
```
POST /api/customer/registrations
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

-- data (JSON string)
{
  "applicant_type": "INDIVIDU",
  "nik": "3201234567890001",
  "full_name": "Test User",
  "birth_place": "Jakarta",
  "birth_date": "1990-01-15",
  "gender": "MALE",
  "address": "Jl. Sudirman 1",
  "rt_rw": "001/002",
  "village": "Menteng",
  "district": "Menteng",
  "city": "Jakarta Pusat",
  "province": "DKI Jakarta",
  "postal_code": "10310",
  "email": "test@example.com",
  "mobile_number": "081234567890",
  "product": "LIFE",
  "plan_code": "LIFE_BASIC",
  "sum_assured": "100000000",
  "coverage_term": 10,
  "beneficiary_name": "Andi Tester"
}

-- id_card (binary, JPG/PNG/PDF, max 5 MB)
```

**Response:**
```json
{
  "registration_no": "REG-202606-000001",
  "invoice_no": "INV-202606-000001",
  "status": "PENDING"
}
```

**What to verify:**
- [ ] Customer row in DB now has NIK, address, etc.
- [ ] New rows in `registrations` and `invoices` tables.
- [ ] `registrations.applicant_type = 'INDIVIDU'`.
- [ ] File at `apps/backend/uploads/invoices/<uuid>.pdf`.
- [ ] Invoice row's `pdf_path` is set.
- [ ] 2 emails in `email_logs`: `REGISTRATION_SUCCESS` and `INVOICE_NOTIFICATION`.
- [ ] 2 audit_logs entries: `registration_created`, `invoice_generated`.

---

### J7b. Apply for Group Insurance — Instansi (N participants)

**Goal:** A representative submits a group registration for N participants at once. Supports bulk import via CSV/Excel.

**Path:** `http://localhost:3000/portal/insurance/new` → switch to the "Instansi" tab.

**Form structure (4 tabs):**

1. **Data Instansi** — `company_name` (**required**), `company_npwp` (optional, 15-16 digits, format `99.999.999.9-999.999`), `company_industry` (optional). For the representative (who submits): `rep_nik`, `rep_full_name`, `rep_email`, `rep_mobile`.
2. **Informasi Asuransi** — product (LIFE/PA/HEALTH), `plan_code` (Basic/Standard/Premium), `coverage_term`. **Shared by all peserta.**
3. **Data Peserta** — add participants via "+ Tambah Manual" or "Import CSV/Excel". For product `LIFE`, `beneficiary_name` is **required per peserta**. Min 1, max 500 peserta.
4. **Konfirmasi** — review ringkasan + total premi (computed live as `Σ monthly_premium × 12 × coverage_term`).

**Expected CSV/Excel columns (header row, case-insensitive):**
```
NIK, Nama Lengkap, Tempat Lahir, Tanggal Lahir (YYYY-MM-DD),
Jenis Kelamin (MALE/FEMALE), Alamat, RT/RW (format 001/002),
Kelurahan, Kecamatan, Kota, Provinsi, Kode Pos (5 digit),
Email, No HP, Ahli Waris (untuk LIFE)
```

**API:**
```
POST /api/customer/registrations
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

data: {
  "applicant_type": "INSTANSI",
  "nik": "representative NIK",
  "full_name": "representative name",
  "email": "...",
  "mobile_number": "...",
  "company_name": "PT ABC",
  "company_npwp": "01.234.567.8-901.000",
  "company_industry": "Manufaktur",
  "plan_code": "LIFE_STANDARD",
  "coverage_term": 5,
  "participants": [
    { "nik": "...", "full_name": "...", "birth_place": "...", "birth_date": "1990-01-15",
      "gender": "MALE", "address": "...", "rt_rw": "001/002", "village": "...",
      "district": "...", "city": "...", "province": "...", "postal_code": "12345",
      "beneficiary_name": "..." },
    { ... N-1 more ... }
  ]
}
```

**What to verify:**
- [ ] `registrations.applicant_type = 'INSTANSI'`, `company_name` populated.
- [ ] N rows in `registration_participants` for that registration. Per-group NIK uniqueness enforced.
- [ ] `invoices.premium_amount` = Σ per-peserta premium (backend uses `calculate_group_premium`).
- [ ] After payment webhook fires, `policies` has N rows for this registration, each with a different `participant_id`.
- [ ] Email `INVOICE_NOTIFICATION` mentions "N peserta" in body.
- [ ] In `/portal/policies`, N rows appear with a "Peserta" column showing NIK + nama.
- [ ] Limit: 500 peserta per registrasi.

---

### J7c. Import CSV/Excel Peserta (Bulk Upload)

**Goal:** Validate CSV/Excel import flow + error handling.

**Path:** `http://localhost:3000/portal/insurance/new` → tab "Instansi" → tab "Data Peserta" → "Import CSV / Excel".

**Steps:**
1. Prepare a CSV/Excel with a header row + 3+ data rows (intentionally make 1 invalid).
2. Click import → choose file.
3. Preview shows with color coding: green = valid, red = invalid + inline error message.
4. Edit invalid rows directly in preview (click cell → input).
5. Click **Terapkan N baris valid** → rows are appended to the `ParticipantTable`.
6. Continue submit per J7b.

**Test it:**
- [ ] Upload CSV with 5 valid rows → all apply.
- [ ] Upload with 1 NIK in wrong format → preview shows error.
- [ ] Fix NIK in preview → row becomes valid → can be applied.
- [ ] Upload Excel (`.xlsx`) → parsed same as CSV (ExcelJS, not SheetJS).
- [ ] Upload a non-CSV/Excel file (e.g. `.pdf`) → error: "Format file tidak didukung".

**API:** Pure client-side parse. No upload-to-backend endpoint — file is parsed in the browser, then submitted as JSON in J7b.

---

### J8. Pay the Invoice (Simulated Webhook)

**Goal:** Customer (or payment gateway) calls the webhook to mark invoice as paid. The system then issues the e-policy.

**This flow is server-to-server, not user-driven.** The customer doesn't "click pay" in the portal yet — we simulate the gateway callback.

**API:**
```
POST /api/public/payment/webhook
Content-Type: application/json
X-Webhook-Secret: dev_webhook_secret_change_me

{
  "invoice_no": "INV-202606-000001",
  "payment_status": "PAID",
  "payment_date": "2026-06-07"
}
```

**What the backend does (in a single transaction):**
1. Update `invoices.status = 'PAID'`, set `paid_at`.
2. Update `registrations.status = 'PAID'`. Audit: `payment_received`.
3. Generate `policy_no` (e.g., `POL-202606-000001`).
4. Insert `policies` row with `status = 'ACTIVE'`.
5. Update `registrations.status = 'ISSUED'`.
6. Commit.
7. Render e-policy PDF, save to storage, update `policies.pdf_path`. Audit: `policy_issued`.
8. Send 2 emails: **PAYMENT_SUCCESS** (text) + **E_POLICY_DELIVERY** (with PDF attachment).
9. (Already covered) **PORTAL_ACTIVATION** is sent only on the *first* issued policy for that customer, with a one-time set-password link. Subsequent policies just send `E_POLICY_DELIVERY`.

**For INSTANSI registrations** the same flow runs once per registration, but step 4 creates **N policies**, one per row in `registration_participants`, each with its own `policies.participant_id`.

**What to verify:**
- [ ] `invoices.status = 'PAID'`.
- [ ] Policy row exists with the new `policy_no`.
- [ ] `policies.pdf_path` is set, file exists.
- [ ] Customer now has 1 (or N) active policies in dashboard (J6).
- [ ] Email with e-policy PDF arrives in inbox.
- [ ] Audit: `payment_received`, `policy_issued`.

**Idempotency:** Replay the same webhook → returns `200 OK` with `replayed: true`, no duplicate policy, no duplicate emails.

---

### J9. View Policies (and Download e-Policy PDF)

**Path:** `http://localhost:3000/portal/policies`

**Steps:**
1. Open `/portal/policies`. Table shows: No. Polis, Produk, **Peserta** (NIK + nama — useful for Instansi groups), UP, Premi, Efektif, Berakhir, Status, Aksi.
2. Click **📄 PDF** on a row → downloads `POL-YYYYMM-NNNNNN.pdf` (e-policy).

**API:**
```
GET /api/customer/policies
GET /api/customer/policies/:id
GET /api/customer/policies/:id/pdf  (returns application/pdf)
```

---

### J10. View Invoices (and Download Invoice PDF)

**Path:** `http://localhost:3000/portal/invoices`

**Steps:**
1. Open `/portal/invoices`. Table: No. Invoice, No. Reg, Premi, Jatuh Tempo, Status, Aksi.
2. Click **📄 PDF** → downloads `INV-YYYYMM-NNNNNN.pdf`.

**API:**
```
GET /api/customer/invoices
GET /api/customer/invoices/:id
GET /api/customer/invoices/:id/pdf
```

---

### J11. Submit a Claim

**Path:** `http://localhost:3000/portal/claims/new` (or via `/portal/claims` → **Ajukan Klaim** button, gated by `activePolicyCount > 0`)

**Form fields (multipart):**
- `data` (JSON): `policy_id`, `claim_type`, `incident_date`, `claimed_amount`, `description`.
- `documents` (file(s)): evidence (JPG/PNG/PDF, max 5 MB each).

**Claim types** (closed set, 5 values):

| Code | Display | Typical product |
| --- | --- | --- |
| `DEATH` | Klaim meninggal | LIFE |
| `ACCIDENT` | Klaim kecelakaan | PA, HEALTH |
| `HOSPITALIZATION` | Klaim rawat inap | HEALTH |
| `MATURITY` | Klaim jatuh tempo | LIFE |
| `SURRENDER` | Klaim surrender | LIFE |

**Validation rules (server-side):**
- The policy must be `ACTIVE` and belong to the customer.
- `incident_date` must not be in the future.
- `incident_date` must fall within the policy's effective → expiry range.
- `claimed_amount` must be > 0 and ≤ sum assured.

**Steps:**
1. Open the form. Pick a policy from your active ones.
2. Fill the rest. Upload at least one document.
3. Submit. Backend creates a claim with `status = 'SUBMITTED'`, generates `claim_no`, sends **CLAIM_RECEIVED** email, audits `claim_submitted`.

**API:**
```
POST /api/customer/claims
Authorization: Bearer <jwt>
Content-Type: multipart/form-data
```

---

### J12. View Claims and Track Status

**Path:** `http://localhost:3000/portal/claims`

**Steps:**
1. Open `/portal/claims`. Table: No. Klaim, No. Polis, Tipe, Tanggal, Nominal, Status.
2. Click a claim row to see detail (decision note, `payment_proof_path` if PAID, updated_at, etc.).
3. After admin reviews (J23), the status changes and you get an email (**CLAIM_STATUS_UPDATE**).

**API:**
```
GET /api/customer/claims
GET /api/customer/claims/:id
```

---

### J13. Create an Inquiry

**Path:** `http://localhost:3000/portal/inquiries` → in-page form at the top of the list page. (There is no separate `/portal/inquiries/new` — list + create + detail are all on the same page.)

**Form fields:** `subject` (5–200 chars), `message` (10–5000 chars). `policy_id` is **not** a form field in the current UI (it's been dropped for simplicity — admins can still see which customer submitted; for the policy-link feature, link through the inquiry detail).

**Steps:**
1. Open `/portal/inquiries`.
2. Fill subject + message. Submit. Backend creates an inquiry with `status = 'OPEN'`, generates `inquiry_no`, creates the first message in `inquiry_messages` (sender_type=CUSTOMER, sender_id=you, sender_name=your name). Audit: `inquiry_submitted`.
3. The new inquiry appears in the list as a card; click to expand the thread (see J14).

**API:**
```
POST /api/customer/inquiries
Authorization: Bearer <jwt>
Content-Type: application/json

{ "subject": "...", "message": "..." }
```

---

### J14. Participate in an Inquiry Thread

**Goal:** A customer reads an existing inquiry (with admin's reply) and either continues the thread or closes it.

**Path:** `http://localhost:3000/portal/inquiries` → click any card in the list.

**Thread view (right side of the page after clicking a card):**
- All `inquiry_messages` are rendered in chronological order, each with sender name, sender type badge (CUSTOMER / ADMIN), and timestamp.
- Admin's messages are styled differently (ube background) than customer's (matcha).
- If the inquiry is `OPEN` (i.e. last message is yours), the bottom of the thread shows a **Balas** form (textarea + submit).
- If the inquiry is `ANSWERED` (i.e. last message is admin's), the **Balas** form is also enabled — replying flips the status back to `OPEN`.
- If the inquiry is `CLOSED`, the **Balas** form is hidden. A banner explains "Tiket ini sudah ditutup.".

**Reply to thread:**
1. Type a new message. Click **Kirim Balasan**.
2. Backend inserts a new `inquiry_messages` row (sender_type=CUSTOMER), updates `last_message_at`, `last_sender_type = 'CUSTOMER'`, sets status back to `OPEN`. Sends an internal notification email to admin (subject `[Inquiry INQ-...] Balasan dari customer`). Audit: `inquiry_message_sent`.

**Close inquiry:**
1. Click **Tutup Tiket** (button visible when status is `ANSWERED` — i.e. admin already replied and you don't want to continue).
2. Backend sets `status = 'CLOSED'`, `closed_at = now()`. Audit: `inquiry_closed_by_customer`.

**Auto-close behavior:** If neither party replies for `INQUIRY_AUTO_CLOSE_DAYS` (default 7) days after the last message, the inquiry is auto-closed on the next GET. No email is sent for auto-close.

**API:**
```
GET  /api/customer/inquiries/:id
POST /api/customer/inquiries/:id/messages
     { "message": "..." }
POST /api/customer/inquiries/:id/close
```

---

### J15. Edit Profile

**Path:** `http://localhost:3000/portal/profile`

**Form fields:** `full_name`, `email`, `mobile_number`.

**Steps:**
1. Open `/portal/profile`. The form is pre-filled with current values from `/api/customer/me`.
2. Edit and submit. Backend validates (email format, mobile digit count, email uniqueness) and updates. Audits `customer_profile_updated`.
3. The user menu in the topbar immediately reflects the new name.

**API:**
```
GET /api/customer/me
PATCH /api/customer/me
Authorization: Bearer <jwt>
Content-Type: application/json

{ "full_name": "...", "email": "...", "mobile_number": "..." }
```

**Editable fields:** `full_name`, `email`, `mobile_number`. Other fields (NIK, address, etc.) are locked once an insurance application exists, to maintain consistency with the issued policy. To change locked fields, contact admin.

---

### J16. Change Password (while logged in)

**Path:** `http://localhost:3000/portal/password` (or via the user menu in the topbar)

**Form fields:** `current_password`, `new_password`, `confirm_password`.

**Steps:**
1. Open `/portal/password`. (Easier via the avatar in the topbar → **Ganti Password**.)
2. Enter your current password and the new one (min 8 chars, 1 uppercase, 1 digit, must differ from current).
3. Submit. Backend verifies the current password, hashes the new one (argon2id), updates. Audits `customer_password_changed`.

**API:**
```
POST /api/customer/password/change
Authorization: Bearer <jwt>
Content-Type: application/json

{ "current_password": "...", "new_password": "..." }
```

Returns `204 No Content` on success.

**If you forgot your current password** → use J4 (password reset via email) instead.

---

### J17. Logout

**Path:** Top-right of the portal — click your avatar → **Logout**.

Or programmatically: `localStorage.removeItem("insuretrack_customer_token")` then navigate to `/portal/login`.

**What to verify:**
- [ ] After logout, navigating to `/portal/dashboard` redirects to `/portal/login`.
- [ ] The `insuretrack_customer_token` key is gone from `localStorage`.

---

## Part 3 — Customer Portal Layout (visual reference)

The portal uses a sidebar + topbar layout. Understanding it helps when testing navigation.

```
┌─────────────────────────────────────────────────────────────┐
│ ☰ [sidebar toggle] [minimize]  InsureTrack Portal  [👤 ▼] │  ← topbar
├─────────────┬───────────────────────────────────────────────┤
│ Dashboard   │                                               │
│ Polis Saya  │                                               │
│ Klaim       │         <page content here>                   │
│ Pertanyaan  │                                               │
│             │                                               │
│ [sidebar    │                                               │
│  toggles    │                                               │
│  via JS]    │                                               │
└─────────────┴───────────────────────────────────────────────┘
```

- The topbar right has the **user menu** (avatar + name + email). Click to expand:
  - **Profil Saya** → `/portal/profile`
  - **Ganti Password** → `/portal/password`
  - **Logout** → clears token, redirects to `/portal/login`
- Sidebar items route to `/portal/dashboard`, `/portal/policies`, `/portal/claims`, `/portal/inquiries`.
- The sidebar is collapsible (☰ button on mobile, minimize button on desktop).

---

## Part 4 — Admin Backoffice (logged-in as admin)

> Admin is a separate role. Token is stored under `insuretrack_admin_token` in `localStorage`.

### J18. Admin Login

**Path:** `http://localhost:3001/admin/login`

**Default credentials** (from seed migration): username `admin`, password `admin`. **Change before any real use.**

**API:**
```
POST /api/admin/login
Content-Type: application/json
{ "username": "admin", "password": "admin" }
```

Response: `{ token, role: "admin" }`. Audit: `admin_login`.

---

### J19. Admin Dashboard

**Path:** `http://localhost:3001/admin/dashboard`

**Shows:** total registrations (split by `INDIVIDU` / `INSTANSI` if backend supports it), total invoices, paid vs unpaid, total policies, total premium collected, plus chart data (registrations per month, etc.).

**API:**
```
GET /api/admin/dashboard/stats
GET /api/admin/dashboard/charts
```

---

### J20. View Registrations (List)

**Path:** `http://localhost:3001/admin/registrations`

Table: No. Reg, **Tipe** (INDIVIDU / INSTANSI badge), Nama, Email, Produk, UP, Coverage Term, Status, Tanggal.

**Features:**
- Search by name, reg no, NIK, email.
- Filter by status (PENDING, PAID, ISSUED, CANCELLED).
- Pagination.
- **Export CSV** button → downloads all matching rows as CSV (uses the same filters).

**API:**
```
GET /api/admin/registrations?page=1&page_size=20&q=...&status=...
GET /api/admin/registrations/:id   # detail (see J20b)
```

---

### J20b. View Registration Detail (with Instansi participants)

**Goal:** A staff member opens a single registration to see full info — customer, product, invoice, policy, and (for `INSTANSI`) all participants.

**Path:** `http://localhost:3001/admin/registrations/[id]`

**What's shown:**

- **Header:** `registration_no`, status badge, `applicant_type` badge (INDIVIDU/INSTANSI), created date.
- **Customer block:** name, email, NIK, mobile, address fields.
- **Insurance block:** product, plan, sum assured, coverage term, beneficiary_name (if LIFE).
- **Company block** (INSTANSI only): company_name, company_npwp, company_industry.
- **Participants table** (INSTANSI only): N rows from `registration_participants`, columns = NIK, Nama, Tanggal Lahir, Gender, Beneficiary.
- **Invoice block:** `invoice_no`, premium_amount, due_date, status, 📄 PDF download.
- **Policy block:** `policy_no`, status, effective/expiry, 📄 PDF download (if ISSUED).

**API:**
```
GET /api/admin/registrations/:id
```

---

### J21. View Invoices

**Path:** `http://localhost:3001/admin/invoices`

Table: No. Invoice, No. Reg, Nama, Premi, Jatuh Tempo, Status.

**Features:** search, filter, CSV export, **📄 PDF** button per row (downloads `INV-...pdf`).

**API:**
```
GET /api/admin/invoices?...
GET /api/admin/invoices/:id
GET /api/admin/invoices/:id/pdf
```

---

### J22. View Policies

**Path:** `http://localhost:3001/admin/policies`

Same as J21 but for policies. Table includes a **Peserta** column (NIK + nama) for INSTANSI-sourced policies. PDF download gives the e-policy.

**API:**
```
GET /api/admin/policies
GET /api/admin/policies/:id
GET /api/admin/policies/:id/pdf
```

---

### J23. Review and Update a Claim (+ Upload Payment Proof)

**Path:** `http://localhost:3001/admin/claims` → click a claim card

**Form per claim card:**
- Status dropdown: `SUBMITTED → UNDER_REVIEW → APPROVED → PAID`, or `→ REJECTED` at any point before `APPROVED`.
- Decision note (text, max 2000 chars).
- **Payment proof file picker** — visible **only** when transitioning to `PAID`. Upload JPG / PNG / PDF, max 5 MB. Stored at `payment_proofs/{claim_id}/{filename}`.

**Steps:**
1. Open `/admin/claims`. Click a row to see detail.
2. Change status, add decision note. Optionally attach payment proof.
3. Submit. The backend:
   - Validates the transition per spec §10 state machine.
   - For the `APPROVED → PAID` transition, requires a `payment_proof_path` (file must be uploaded first via the dedicated endpoint, see below).
   - Updates the claim.
   - Sends **CLAIM_STATUS_UPDATE** email to customer.
   - Audits `claim_status_changed`. If a proof was uploaded, also `claim_payment_proof_uploaded`.

**State machine (claim):** `SUBMITTED → UNDER_REVIEW → APPROVED → PAID`, or to `REJECTED`. Invalid transitions are rejected with 400.

**Payment proof upload endpoint (called separately, before PATCH):**
```
POST /api/admin/claims/:id/payment-proof
Content-Type: multipart/form-data
-- proof (binary, JPG/PNG/PDF, max 5 MB)
```

Returns `{ payment_proof_path: "payment_proofs/.../..." }`. The PATCH then uses this path.

**API:**
```
GET  /api/admin/claims
PATCH /api/admin/claims/:id
Content-Type: application/json

{ "status": "APPROVED", "decision_note": "Dokumen lengkap, klaim disetujui." }
```

For `PAID`:
```
POST /api/admin/claims/:id/payment-proof  (upload first)
PATCH /api/admin/claims/:id
{ "status": "PAID", "decision_note": "Klaim dibayar via transfer BCA.", "payment_proof_path": "..." }
```

---

### J24. Respond to an Inquiry Thread

**Path:** `http://localhost:3001/admin/inquiries` → click an inquiry card

**Thread view (right side of the page after clicking a card):**
- All messages in chronological order. Each shows sender_name + sender_type (CUSTOMER badge matcha, ADMIN badge ube) + timestamp.
- Customer's messages (subject + first message) are at the top.

**Reply form (bottom of the thread):**
- Textarea + **Kirim Balasan** button. Visible when status is `OPEN` (last message is customer's).
- Hidden when status is `CLOSED` (terminal).

**Close inquiry (manual):**
- **Tutup Tiket** button visible when status is `ANSWERED` (last message is admin's). Sets `status = 'CLOSED'`, `closed_at = now()`. Audit: `inquiry_closed_by_admin`.

**Side panel: inquiry list filters**
- Filter by status: All / OPEN / ANSWERED / CLOSED.
- Search by inquiry_no, subject, customer name.
- Pagination.

**Backend behavior on admin reply:**
1. Insert a new `inquiry_messages` row (sender_type=ADMIN, sender_name=`admin.full_name`).
2. Update `last_message_at`, `last_sender_type = 'ADMIN'`, set status to `ANSWERED`.
3. Send **INQUIRY_RESPONSE** email to customer (subject `[Inquiry INQ-...] Balasan dari tim InsureTrack`).
4. Audit: `inquiry_message_sent`.

**API:**
```
GET  /api/admin/inquiries
GET  /api/admin/inquiries/:id
POST /api/admin/inquiries/:id/messages
     { "message": "..." }
POST /api/admin/inquiries/:id/close
```

---

### J25. Manage Clients (Marketing)

**Path:** `http://localhost:3001/admin/clients`

Add / edit / activate corporate clients that appear on the public landing page (J1). Each client has name, logo image, industry, website, contact info.

**Logo upload:** Image (JPG/PNG/WebP/SVG), max 2 MB. Backend saves to `clients/<uuid>/<file>` in storage. Public URL exposed via `GET /api/public/clients`.

**API:**
```
GET    /api/admin/clients
POST   /api/admin/clients
GET    /api/admin/clients/:id
PATCH  /api/admin/clients/:id
DELETE /api/admin/clients/:id
```

---

### J26. Manage Testimonials

**Path:** `http://localhost:3001/admin/testimonials`

Add / edit / feature / activate customer testimonials. Each has customer name, photo (optional), rating (1–5), review, role, company, policy type, display date, `is_featured` flag.

**API:** same shape as J25.

---

### J27. View Email Logs

**Path:** `http://localhost:3001/admin/email-logs`

Table: recipient, `email_type` (REGISTRATION_SUCCESS, INVOICE_NOTIFICATION, PAYMENT_SUCCESS, E_POLICY_DELIVERY, PORTAL_ACTIVATION, CLAIM_RECEIVED, CLAIM_STATUS_UPDATE, INQUIRY_RESPONSE), subject, status (SENT/FAILED/QUEUED), `error_message`, `sent_at`.

Useful for debugging "did the email actually go out?" or "why did this email fail?".

**API:**
```
GET /api/admin/email-logs?status=FAILED
```

---

### J28. View Audit Logs

**Path:** `http://localhost:3001/admin/audit-logs`

Every meaningful action emits an audit row. See the full list in the **Quick Reference → Audit events emitted** section above.

Filter by `entity_type` (e.g. `claim`, `inquiry`, `registration`) or `actor` (e.g. `customer:<uuid>` or `admin:<uuid>`).

**API:**
```
GET /api/admin/audit-logs?entity_type=claim
```

---

### J29. Edit Admin Profile

**Path:** `http://localhost:3001/admin/profile` (via avatar menu)

**API:**
```
GET  /api/admin/me
PATCH /api/admin/me
{ "full_name": "...", "email": "..." }
```

Audit: `admin_profile_updated`.

---

### J30. Change Admin Password

**Path:** `http://localhost:3001/admin/profile` → **Ganti Password**

**API:**
```
POST /api/admin/me/password
{ "current_password": "...", "new_password": "..." }
```

Audit: `admin_password_changed`.

---

## Part 5 — End-to-End Test Scripts (suggested order)

If you're testing from scratch, follow this order. Each step builds on the previous.

### Prerequisite

```bash
# Start the stack (Docker Compose, full local)
cd /path/to/insuretrack
docker compose up -d --build

# Wait for backend healthy
docker compose logs backend | grep "listening on"

# Seed admin user already exists in DB (username: admin / password: admin)
```

> **Native local dev (no Docker):** if you're running the hybrid setup with
> PostgreSQL 18 native on port 5432, see `document/RUNBOOK_VPS_DEV.md` for
> the alternative `dev.bat` workflow.

### Suggested test sequence

| # | Journey | What to verify |
| --- | --- | --- |
| 1 | J1 Browse landing | Hero, 3 product cards, 3-step "How it works", 6 benefits, clients (if any), testimonials (if any) all render. Carousel is swipeable. |
| 2 | J1b Product detail | Click a product card → `/products/[slug]` loads, copy matches product. |
| 3 | J1c Marketing pages | Visit `/about`, `/faq`, `/privacy`, `/terms` — all load with shared navbar/footer. |
| 4 | J2 Register | Account created, activation email sent. |
| 5 | J3 Activate | Account becomes ACTIVE, can log in. |
| 6 | J5 Customer login | Token saved, dashboard loads. |
| 7 | J7 Apply Individu | 2 emails arrive, invoice PDF generated. |
| 8 | J7b Apply Instansi | 1 registration with N participants → invoice for N × premium. |
| 9 | J7c CSV import | Preview shows green/red, fix invalid → apply. |
| 10 | J10 View invoices | Invoice PDF downloadable. |
| 11 | J8 Pay invoice (webhook) Individu | 1 policy issued, e-policy PDF emailed. |
| 12 | J8 Pay invoice (webhook) Instansi | N policies issued, N e-policy PDFs emailed. |
| 13 | J9 View policies | N policy rows for Instansi, each with Peserta column. PDF downloadable. |
| 14 | J11 Submit claim | Claim row created, status SUBMITTED. |
| 15 | J23 Admin review claim (SUBMITTED → UNDER_REVIEW → APPROVED) | Status changes, email to customer. |
| 16 | J23 Admin mark claim PAID with payment proof | Status PAID, payment_proof_path set, email sent. |
| 17 | J13 Create inquiry | Inquiry row created, status OPEN, first message in thread. |
| 18 | J24 Admin reply inquiry | Status ANSWERED, thread has 2 messages, email to customer. |
| 19 | J14 Customer reply in thread | Status back to OPEN, 3 messages, internal email to admin. |
| 20 | J14b Customer closes inquiry | Status CLOSED, closed_at set, audit row. |
| 21 | J4 Forgot password | Reset link works, can set new password. |
| 22 | J15 Edit profile | Name updated in topbar. |
| 23 | J16 Change password | Can log in with new password. |
| 24 | J17 Logout | Token cleared, protected pages redirect. |
| 25 | J18 Admin login | Admin panel loads. |
| 26 | J19–J22 Admin views | All data visible, CSV export works, PDFs downloadable. |
| 27 | J20b Admin registration detail | For INSTANSI, see N participants in detail page. |
| 28 | J25–J26 Admin marketing | Add a new client, see it on landing. |
| 29 | J27–J28 Admin logs | Failed emails visible, audit trail complete (all 18 action types). |

---

## Part 6 — Quick Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Memuat..." stuck on `/portal/login` or `/admin/login` | Auth guard in shell not skipping public paths | Restart dev server (`pnpm dev:portal` or `pnpm dev:admin`). |
| Activation email never arrives | `RESEND_API_KEY` empty in `.env` | Fill in real key, `docker compose restart backend`. |
| Webhook returns 401 | `X-Webhook-Secret` header missing or wrong | Match value in `.env` (`PAYMENT_WEBHOOK_SECRET`). |
| Backend won't start | `RESEND_API_KEY` empty (hard-fail by design) | Fill in `.env` and restart. |
| Invoice PDF not downloadable | `invoices.pdf_path` NULL | Check backend logs around the registration submission. |
| Login fails with 403 | Account not activated | Re-send activation link (no built-in flow yet — manually insert activation token in DB or re-register). |
| Inquiry status stuck on ANSWERED | Customer hasn't replied yet | Expected — wait for customer reply, or auto-close kicks in after `INQUIRY_AUTO_CLOSE_DAYS`. |
| Claim PATCH to PAID rejected | `payment_proof_path` not set | Upload proof first via `POST /api/admin/claims/:id/payment-proof`, then PATCH. |
| Instansi submission rejected | Empty `participants` array | At least 1 participant required. Max 500. |
| LIFE submission rejected | Missing `beneficiary_name` | Required for LIFE on either registration form (Individu) or per-peserta in Instansi. |
| TS red underline in `packages/*/tsconfig.json` | Stale `tsconfig.tsbuildinfo` | `rm -f packages/*/tsconfig.tsbuildinfo` then reload VS Code. |
| `cargo build` complains about rustc version | `Cargo.lock` pulled newer AWS SDK | Bump rustc tag in `apps/backend/Dockerfile`. |

---

## See also

- `Technical Specification Document Digital Insurance v1.2.pdf` — full functional spec (FS-01..FS-20), API contracts, state machines, identifier formats.
- `DESIGN.md` — design system (colors, fonts, components, layout grid).
- `CONTRIBUTING.md` — commit message standard, PR conventions.
- `CLAUDE.md` (root) — code comment standard, monorepo structure, project conventions.
- `document/RUNBOOK_VPS_DEV.md` — VPS dev deployment runbook (Dokploy + Traefik).
