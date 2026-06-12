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
| Customer portal | `http://localhost:3000` | Public landing at `/`. Logged-in area under `/portal/*`. |
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

### Status state machines (quick reference)

Spec §10. Worth knowing for testing:

- **Invoice:** `UNPAID → PAID | EXPIRED | CANCELLED`
- **Registration:** `PENDING → PAID → ISSUED | PENDING → CANCELLED`
- **Policy:** `ACTIVE → LAPSED | EXPIRED`
- **Claim:** `SUBMITTED → UNDER_REVIEW → APPROVED → PAID | SUBMITTED|UNDER_REVIEW → REJECTED`
- **Inquiry:** `OPEN → ANSWERED → CLOSED`

---

## Part 1 — Public Flows (no authentication)

### J1. Browse the Public Landing Page

**Goal:** A visitor lands on the homepage, browses products, sees client logos and testimonials.

**Path:** `http://localhost:3000/` (no `/portal/` prefix)

**What's on the page:**
- Hero: "Asuransi digital, prosesnya cepat, polis langsung terbit." with two CTAs: **Beli Polis Sekarang** and **Lihat Produk**.
- Product catalog (3 products): Life Insurance, Personal Accident, Health Insurance.
- Client logos (B2B partners).
- Customer testimonials with photos and ratings.
- Footer with company info.

**Test it:**
1. Open `http://localhost:3000/` in your browser.
2. Scroll through. Click **Lihat Produk** — it should smooth-scroll to the products section.
3. Click **Beli Polis Sekarang** — it should navigate to `/portal/register` (NOT `/register` — that path doesn't exist).

**APIs touched (frontend reads on mount):**
- `GET /api/public/products`
- `GET /api/public/clients`
- `GET /api/public/testimonials`

---

### J2. Register a New Customer Account

**Goal:** A visitor creates a portal account so they can apply for insurance later.

**Path:** `http://localhost:3000/portal/register`

**Form fields:** `full_name`, `email`, `password`, `mobile_number`.

**Steps:**
1. Open `/portal/register`.
2. Fill in the form. Password requirements: min 8 chars, 1 uppercase, 1 digit.
3. Click **Daftar →**.
4. Backend creates a customer with `portal_status = 'PENDING'`, hashes the password, and sends an activation email.
5. You see a success screen: "Akun portal kamu sudah dibuat" with a button **Ke Halaman Login**.

**After registration:**
- The activation email arrives at the address you used. (Make sure your `.env` has `RESEND_API_KEY` set, or email sending will fail.)
- Customer is in the DB with `portal_status = 'PENDING'` — they cannot log in until they activate.

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

> The `activation_url` is also returned in the response for convenience — but in production, only the email would have it.

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
6. Password is updated. You can now log in with the new password.

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

## Part 2 — Customer Portal (logged-in)

> All flows below assume you've completed **J2 + J3** (registered + activated) and are logged in.
> The portal stores the JWT in `localStorage` under `insuretrack_customer_token`. To "log out" during testing, open DevTools → Application → Local Storage → delete that key.

### J5. Customer Login

**Path:** `http://localhost:3000/portal/login`

**Form fields:** `email`, `password`.

**Steps:**
1. Open `/portal/login` (you'll be redirected here automatically if you visit a protected page while logged out).
2. Enter the email and password you used in J2.
3. Click **Login →**. On success, you're redirected to `/portal/dashboard`.

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
- Conditional banner: if no active policies, shows a prominent "Ajukan Asuransi Sekarang" CTA.

**API:**
```
GET /api/customer/me
Authorization: Bearer <jwt>
```

---

### J7. Apply for Insurance (Submit Registration)

**Goal:** A logged-in customer submits an insurance application.

**Path:** `http://localhost:3000/portal/insurance/new`

**Form fields (multipart):**
- `data` (JSON string): `nik`, `full_name`, `birth_place`, `birth_date`, `gender`, `address`, `rt_rw`, `village`, `district`, `city`, `province`, `postal_code`, `email`, `mobile_number`, `product`, `sum_assured`, `coverage_term`.
- `id_card` (file): KTP image (JPG/PNG/PDF, max 5 MB).

**Steps:**
1. Open `/portal/insurance/new`. You'll see the form pre-filled with your portal data.
2. Fill in any missing insurance fields (especially NIK — 16 digits, KTP upload).
3. Pick a product (LIFE / PERSONAL_ACCIDENT / HEALTH), enter sum assured, coverage term in years.
4. Click submit. The backend:
   - Updates the customer row with insurance-specific fields and KTP path.
   - Creates a `registrations` row with `status = 'PENDING'`.
   - Creates an `invoices` row with `status = 'UNPAID'`.
   - Renders an invoice PDF and saves it to storage.
   - Updates the invoice with `pdf_path`.
   - Sends 2 emails: **RegistrationSuccess** (text-only) and **InvoiceNotification** (with PDF attachment).
   - Audit events: `registration_created`, `invoice_generated`.

**API:**
```
POST /api/customer/registrations
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

-- data
{
  "nik": "3201234567890001",
  "full_name": "Test User",
  "birth_place": "Jakarta",
  "birth_date": "1990-01-15",
  "gender": "MALE",
  ...
  "product": "LIFE",
  "sum_assured": "100000000",
  "coverage_term": 10
}

-- id_card (binary)
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
- [ ] File at `apps/backend/uploads/invoices/<uuid>.pdf`.
- [ ] Invoice row's `pdf_path` is set.
- [ ] 2 emails in `email_logs`: REGISTRATION_SUCCESS and INVOICE_NOTIFICATION.
- [ ] 2 audit_logs entries.

---

### J7b. Apply for Group Insurance (Instansi Flow, Multi-Participant)

**Goal:** A representative submits a group registration for N participants at once. Supports bulk import via CSV/Excel.

**Path:** `http://localhost:3000/portal/insurance/new` (after login) → pilih "Instansi" tab.

**Form structure (4 tabs):**
1. **Data Instansi** — `company_name` (wajib), `company_npwp` (opsional), `company_industry` (opsional); `rep_nik`, `rep_full_name`, `rep_email`, `rep_mobile` untuk data perwakilan.
2. **Informasi Asuransi** — produk (LIFE/PA/HEALTH), plan (Basic/Standard/Premium), masa pertanggungan. Shared by all peserta.
3. **Data Peserta** — tambahkan peserta via "+ Tambah Manual" atau "Import CSV/Excel". Kolom Ahli Waris wajib untuk produk Jiwa.
4. **Konfirmasi** — review ringkasan + total premi.

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
Content-Type: multipart/form-data

data: {
  "applicant_type": "INSTANSI",
  "nik": "representative NIK",
  "full_name": "representative name",
  "email": "...",
  "mobile_number": "...",
  "company_name": "PT ABC",
  "plan_code": "LIFE_STANDARD",
  "coverage_term": 5,
  "participants": [
    { "nik": "...", "full_name": "...", "birth_place": "...", "birth_date": "1990-01-15",
      "gender": "MALE", "address": "...", "rt_rw": "001/002", "village": "...",
      "district": "...", "city": "...", "province": "...", "postal_code": "12345",
      "beneficiary_name": "..." },
    { ... 14 more ... }
  ]
}
```

**What to verify:**
- [ ] `registrations.applicant_type = 'INSTANSI'`, `company_name` populated.
- [ ] `SELECT COUNT(*) FROM registration_participants WHERE registration_id = $1` == jumlah peserta.
- [ ] `invoices.premium_amount` = N × `monthly_premium × 12 × coverage_term`.
- [ ] (Setelah payment webhook) `SELECT COUNT(*) FROM policies WHERE registration_id = $1` == N. Tiap policy punya `participant_id` berbeda.
- [ ] Email `INVOICE_NOTIFICATION` mention "N peserta".
- [ ] Di portal `/portal/policies`, N baris muncul dengan kolom "Peserta" berisi nik + nama.

**Limit:** Maksimal 500 peserta per registrasi. Minimal 1.

---

### J7c. Import CSV/Excel Peserta (Bulk Upload)

**Goal:** Validasi CSV/Excel import flow + error handling.

**Path:** `http://localhost:3000/portal/insurance/new` → tab "Instansi" → tab "Data Peserta" → "Import CSV / Excel".

**Steps:**
1. Siapkan CSV/Excel dengan header row + 3+ baris data (sengaja buat 1 invalid).
2. Klik tombol import → pilih file.
3. Preview muncul dengan color coding: hijau = valid, merah = invalid + error message.
4. Edit baris invalid langsung di preview (klik cell → input).
5. Klik "Terapkan N baris valid" → baris masuk ke ParticipantTable.
6. Lanjutkan submit seperti J7b.

**Test it:**
- [ ] Upload CSV dengan 5 baris valid → semua apply.
- [ ] Upload dengan 1 baris NIK format salah → preview shows error.
- [ ] Fix NIK di preview → row jadi valid → bisa di-apply.
- [ ] Upload Excel (.xlsx) → parsed sama seperti CSV (ExcelJS, bukan SheetJS).
- [ ] Upload file non-CSV/Excel (mis. .pdf) → error message: "Format file tidak didukung".

**API:** Pure client-side parse. Tidak ada endpoint upload file ke backend — file di-parse di browser lalu di-submit sebagai JSON.

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
2. Update `registrations.status = 'PAID'`.
3. Generate `policy_no` (e.g., `POL-202606-000001`).
4. Insert `policies` row with `status = 'ACTIVE'`.
5. Update `registrations.status = 'ISSUED'`.
6. Commit.
7. Render e-policy PDF, save to storage, update `policies.pdf_path`.
8. Send 2 emails: **PaymentSuccess** (text) + **EPolicyDelivery** (with PDF attachment).
9. Audit: `policy_issued`.

**What to verify:**
- [ ] Policy row exists with the new `policy_no`.
- [ ] `policies.pdf_path` is set, file exists.
- [ ] Customer now has 1 active policy in dashboard (J6).
- [ ] Email with e-policy PDF arrives in inbox.

**Idempotency:** Replay the same webhook → returns success with `replayed: true`, no duplicate policy, no duplicate emails.

---

### J9. View Policies (and Download e-Policy PDF)

**Path:** `http://localhost:3000/portal/policies`

**Steps:**
1. Open `/portal/policies`. Table shows: No. Polis, Produk, UP, Premi, Efektif, Berakhir, Status, Aksi.
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

**Path:** `http://localhost:3000/portal/claims/new` (or via `/portal/claims` → "Ajukan Klaim" button)

**Form fields (multipart):**
- `data` (JSON): `policy_id`, `claim_type` (e.g., "DEATH_BENEFIT", "MEDICAL_REIMBURSEMENT", "ACCIDENTAL_INJURY"), `incident_date`, `claimed_amount`, `description`.
- `documents` (file(s)): evidence (JPG/PNG/PDF, max 5 MB each).

**Validation rules (server-side):**
- The policy must be `ACTIVE` and belong to the customer.
- `incident_date` must not be in the future.
- `incident_date` must fall within the policy's effective → expiry range.
- `claimed_amount` must be > 0 and ≤ sum assured.

**Steps:**
1. Open the form. Pick a policy from your active ones.
2. Fill the rest. Upload at least one document.
3. Submit. Backend creates a claim with `status = 'SUBMITTED'`, generates `claim_no`, sends **ClaimReceived** email, audits `claim_submitted`.

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
2. Click a claim to see detail (decision note, updated_at, etc.).
3. After admin reviews (J22), the status changes and you get an email (**ClaimStatusUpdate**).

**API:**
```
GET /api/customer/claims
GET /api/customer/claims/:id
```

---

### J13. Create an Inquiry

**Path:** `http://localhost:3000/portal/inquiries/new` (or via dashboard)

**Form fields:** `policy_id` (optional), `subject`, `message`.

**Steps:**
1. Open the form. Optionally link to a specific policy.
2. Fill subject + message. Submit. Backend creates inquiry with `status = 'OPEN'`, generates `inquiry_no`, audits `inquiry_submitted`.

**API:**
```
POST /api/customer/inquiries
Authorization: Bearer <jwt>
Content-Type: application/json

{ "policy_id": "uuid", "subject": "...", "message": "..." }
```

---

### J14. View Inquiries and Read Responses

**Path:** `http://localhost:3000/portal/inquiries`

After admin responds (J23), the inquiry's `status` becomes `ANSWERED` (or `CLOSED` if closed). The response text appears in the detail view. You also get an email (**InquiryResponse**).

**API:**
```
GET /api/customer/inquiries
GET /api/customer/inquiries/:id
```

---

### J15. Edit Profile

**Path:** `http://localhost:3000/portal/profile`

**Form fields:** `full_name`, `email`, `mobile_number`.

**Steps:**
1. Open `/portal/profile`. The form is pre-filled with current values from `/api/customer/me`.
2. Edit and submit. Backend validates (email format, mobile digit count, email uniqueness) and updates. Audits `customer_profile_updated`.
3. The user menu in the topbar (J18) immediately reflects the new name.

**API:**
```
GET /api/customer/me         # load current values
PATCH /api/customer/me       # save
Authorization: Bearer <jwt>
Content-Type: application/json

{ "full_name": "...", "email": "...", "mobile_number": "..." }
```

**Editable fields:** `full_name`, `email`, `mobile_number`. Other fields (NIK, address, etc.) are locked once an insurance application exists, to maintain consistency with the issued policy.

---

### J16. Change Password (while logged in)

**Path:** `http://localhost:3000/portal/password` (or via the user menu in the topbar)

**Form fields:** `current_password`, `new_password`, `confirm_password`.

**Steps:**
1. Open `/portal/password`. (Easier via the avatar in the topbar → **Ganti Password**.)
2. Enter your current password and the new one (min 8 chars, 1 uppercase, 1 digit, must differ from current).
3. Submit. Backend verifies the current password, hashes the new one, updates. Audits `customer_password_changed`.

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

Response: `{ token, role: "admin" }`.

---

### J19. Admin Dashboard

**Path:** `http://localhost:3001/admin/dashboard`

**Shows:** total registrations, total invoices, paid vs unpaid, total policies, total premium collected, plus chart data (registrations per month, etc.).

**API:**
```
GET /api/admin/dashboard/stats
GET /api/admin/dashboard/charts
```

---

### J20. View Registrations

**Path:** `http://localhost:3001/admin/registrations`

Table: No. Reg, Nama, Email, Produk, UP, Coverage Term, Status, Tanggal.

**Features:**
- Search by name, reg no, NIK, email.
- Filter by status (PENDING, PAID, ISSUED, CANCELLED).
- Pagination.
- **Export CSV** button → downloads all matching rows as CSV (uses the same filters).

**API:**
```
GET /api/admin/registrations?page=1&page_size=20&q=...&status=...
GET /api/admin/registrations/:id   # detail
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

Same as J21 but for policies. PDF download gives the e-policy.

---

### J23. Review and Update a Claim

**Path:** `http://localhost:3001/admin/claims` → click a claim

**Form:** status dropdown (SUBMITTED → UNDER_REVIEW → APPROVED → PAID, or REJECTED at any point before APPROVED), decision note (text).

**Steps:**
1. Open `/admin/claims`. Click a row to see detail.
2. Change status, add decision note. Submit.
3. Backend validates the transition (per spec §10 state machine), updates the claim, sends **ClaimStatusUpdate** email, audits `claim_status_changed`.

**API:**
```
GET /api/admin/claims
PATCH /api/admin/claims/:id
Content-Type: application/json

{ "status": "APPROVED", "decision_note": "Dokumen lengkap, klaim disetujui." }
```

**State machine (claim):** SUBMITTED → UNDER_REVIEW → APPROVED → PAID, or to REJECTED. Invalid transitions are rejected with 400.

---

### J24. Respond to an Inquiry

**Path:** `http://localhost:3001/admin/inquiries` → click an inquiry

**Form:** response text, optional "close" checkbox.

**Steps:**
1. Open the inquiry detail.
2. Type the response. Optionally check "close" to set status to CLOSED (instead of ANSWERED).
3. Submit. Backend updates the inquiry, sends **InquiryResponse** email, audits `inquiry_answered`.

**API:**
```
GET /api/admin/inquiries
POST /api/admin/inquiries/:id/respond
Content-Type: application/json

{ "response": "Jawaban...", "close": false }
```

---

### J25. Manage Clients (Marketing)

**Path:** `http://localhost:3001/admin/clients`

Add / edit / activate corporate clients that appear on the public landing page (J1). Each client has name, logo image, industry, website, contact info.

**Logo upload:** Image (JPG/PNG/WebP/SVG), max 2 MB. Backend saves to `clients/<uuid>/<file>` in storage.

---

### J26. Manage Testimonials

**Path:** `http://localhost:3001/admin/testimonials`

Add / edit / feature / activate customer testimonials. Each has customer name, photo (optional), rating (1-5), review, role, company, policy type, display date, is_featured flag.

---

### J27. View Email Logs

**Path:** `http://localhost:3001/admin/email-logs`

Table: recipient, email_type, subject, status (SENT/FAILED/QUEUED), error_message, sent_at.

Useful for debugging "did the email actually go out?" or "why did this email fail?"

**API:**
```
GET /api/admin/email-logs?status=FAILED
```

---

### J28. View Audit Logs

**Path:** `http://localhost:3001/admin/audit-logs`

Every meaningful action emits an audit row: admin login, customer login, registration created, invoice generated, payment received, policy issued, claim submitted, claim status changed, inquiry submitted, inquiry answered, email sent, profile updated, password changed.

Filter by entity type or actor.

**API:**
```
GET /api/admin/audit-logs?entity_type=claim
```

---

### J29. Edit Admin Profile

**Path:** `http://localhost:3001/admin/profile` (via avatar menu)

**API:**
```
GET /api/admin/me
PATCH /api/admin/me
{ "full_name": "...", "email": "..." }
```

---

### J30. Change Admin Password

**Path:** `http://localhost:3001/admin/profile` → "Ganti Password"

**API:**
```
POST /api/admin/me/password
{ "current_password": "...", "new_password": "..." }
```

---

## Part 5 — End-to-End Test Scripts (suggested order)

If you're testing from scratch, follow this order. Each step builds on the previous.

### Prerequisite

```bash
# Start the stack
cd /path/to/insuretrack
docker compose up -d --build

# Wait for backend healthy
docker compose logs backend | grep "listening on"

# Seed admin user already exists in DB (username: admin / password: admin)
```

### Suggested test sequence

| # | Journey | What to verify |
| --- | --- | --- |
| 1 | J1 Browse landing | All sections render, no broken images. |
| 2 | J2 Register | Account created, activation email sent. |
| 3 | J3 Activate | Account becomes ACTIVE, can log in. |
| 4 | J5 Customer login | Token saved, dashboard loads. |
| 5 | J7 Apply for insurance | 2 emails arrive, invoice PDF generated. |
| 6 | J10 View invoices | Invoice PDF downloadable. |
| 7 | J8 Pay invoice (webhook) | Policy issued, e-policy PDF emailed. |
| 8 | J9 View policies | Policy PDF downloadable. |
| 9 | J11 Submit claim | Claim row created, status SUBMITTED. |
| 10 | J23 Admin review claim | Status changes, email to customer. |
| 11 | J13 Create inquiry | Inquiry row created, status OPEN. |
| 12 | J24 Admin respond inquiry | Status ANSWERED, email to customer. |
| 13 | J15 Edit profile | Name updated in topbar. |
| 14 | J16 Change password | Can log in with new password. |
| 15 | J4 Forgot password | Reset link works, can set new password. |
| 16 | J17 Logout | Token cleared, protected pages redirect. |
| 17 | J18 Admin login | Admin panel loads. |
| 18 | J19-J22 Admin views | All data visible, CSV export works, PDFs downloadable. |
| 19 | J25-J26 Admin marketing | Add a new client, see it on landing. |
| 20 | J27-J28 Admin logs | Failed emails visible, audit trail complete. |

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
| TS red underline in `packages/*/tsconfig.json` | Stale `tsconfig.tsbuildinfo` | `rm -f packages/*/tsconfig.tsbuildinfo` then reload VS Code. |
| `cargo build` complains about rustc version | `Cargo.lock` pulled newer AWS SDK | Bump rustc tag in `apps/backend/Dockerfile`. |

---

## See also

- `Technical Specification Document Digital Insurance v1.2.pdf` — full functional spec (FS-01..FS-20), API contracts, state machines, identifier formats.
- `DESIGN.md` — design system (colors, fonts, components, layout grid).
- `CONTRIBUTING.md` — commit message standard, PR conventions.
- `CLAUDE.md` (root) — code comment standard, monorepo structure, project conventions.
