# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: InsureTrack — Digital Insurance Platform

End-to-end online policy registration & issuance system. Auto-accept insurance product, no manual underwriting: customer registers → invoice is generated → payment webhook fires → policy is issued (e-policy PDF delivered by email). Also includes a customer self-service portal (policies, claims, inquiries) and an admin back office.

Full requirements live in **`document/spec/Technical Specification Document Digital Insurance v1.2.pdf`** (read it for functional specs FS-01..FS-20, API contracts, identifier formats, status state machines, and non-functional requirements).

## Technology Stack (per spec)

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (React + TypeScript), Tailwind CSS |
| Backend | Rust (Axum
 or Actix Web), async runtime Tokio |
| Database | PostgreSQL 15 |
| PDF | Server-side rendering library (chosen at backend implementation) |
| Orchestration | Docker Compose |

## Current Phase Status

The repository is in **Phase 1** (database only). Per the `docker-compose.yml` comments and `profiles: ["skip_for_now"]` flags:

- **Fase 1 ✅ (current):** PostgreSQL with schema + seed.
- **Fase 2 ✅:** Rust backend at `./apps/backend` — implemented (port 8080).
- **Fase 3 ✅:** Next.js surfaces at `./apps/portal` (port 3000) + `./apps/admin` (port 3001) — implemented.

The `db`, `backend`, `portal`, and `admin` services are declared in `docker-compose.yml`. Run `docker compose up -d` to start all four.

## Development Commands

The only runnable artifact today is the database. Backend/frontend commands will be added when those services land.

```bash
# Start the database (creates volume on first run; sqlx::migrate! applies
# apps/backend/migrations/*.sql at backend startup)
docker compose up -d db

# Tail logs (e.g. to watch migrations apply)
docker compose logs -f db

# Stop, preserving the pgdata volume
docker compose down

# Stop AND wipe the database volume (full reset)
docker compose down -v

# Connect with psql (host machine)
psql "postgres://insurance_admin:insurance_password@localhost:5432/digital_insurance"
```


DB connection (from host):
- host `localhost`, port `5432`
- user `insurance_admin`, password `insurance_password`
- database `digital_insurance`

## High-Level Architecture

Three-tier, loosely coupled over HTTP, all orchestrated by `docker-compose.yml`:

```
┌──────────────────┐   ┌────────────────────┐   ┌──────────────┐
│ Next.js frontend │ → │ Rust REST API      │ → │ PostgreSQL 15│
│ (3 surfaces:     │   │ (Axum/Actix)       │   │              │
│  public landing, │   │ Stateless, JWT     │   │              │
│  customer portal,│   │ auth, async        │   │              │
│  admin portal)   │   │                    │   │              │
└──────────────────┘   └────────────────────┘   └──────────────┘
                              │
                              ├── payment gateway (webhook in)
                              ├── email provider (out, with delivery log)
                              └── PDF renderer (e-policy generation)
```

Backend services per the spec (to be built in Fase 2): Registration, Invoicing, Email, Payment Webhook Handler, Policy (PDF), Customer Portal, Claims, Inquiry, Admin Back Office.

## Data Model (PostgreSQL)

Schema is the source of truth in `apps/backend/migrations/` (7 incremental
SQL files: 0001_initial, 0002_id_sequences, 0003_constraints, 0004_seed,
0005_clients_testimonials, 0006_normalize_seed_paths, 0007_admin_profile).
Applied at backend startup via `sqlx::migrate!`. Lifecycle flow:

```
customers ─┬─→ registrations ─┬─→ invoices ─(paid via webhook)─→ policies ─┬─→ claims ─→ claim_documents
           │                  │                                            │
           │                  └────────(status: PENDING|PAID|ISSUED|     ├─→ inquiries
           │                                       CANCELLED)              │
           │                                                               │
           └─→ email_logs                                                  │
admin_users (separate; not linked to customers)                            │
audit_logs (actor/action/entity/metadata/ip; writes from all services)    │
```

Key design points visible in `apps/backend/migrations/`:
- Every table uses `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`; the `uuid-ossp` extension is enabled in `0001_initial.sql`.
- `customers` carry the unique `nik` (16-char Indonesian national ID) and an `email` (also unique); the password hash and `portal_status` (`PENDING|ACTIVE`) are nullable until portal access is provisioned.
- Reference actions are deliberately mixed: `registrations` cascade from `customers`; `policies` uses `RESTRICT` against `registrations` (you must not delete a registration that has a policy); `inquiries.policy_id` uses `SET NULL` so the inquiry survives policy deletion.
- `audit_logs.metadata` is `JSONB` — keep structured data in there, not in adjacent string columns.
- `email_logs` and `audit_logs` are append-only by convention; no UPDATE statements should target them.
- A single seed `admin_users` row (`username = 'admin'`) is inserted in `0004_seed.sql` for early testing — its argon2id hash is a placeholder, regenerate before any real use.
- Identifier formats (`registration_no`, `invoice_no`, `policy_no`, `claim_no`, `inquiry_no`) and the status state machines are defined in §9 and §10 of the spec PDF — check there before inventing a new prefix or transition.

## Conventions Specific to This Repo

- SQL comments in `apps/backend/migrations/*.sql` and labels in `docker-compose.yml` are written in **Bahasa Indonesia**; spec PDF and code identifiers are in English. Match the file's existing language when adding comments.
- Schema changes go in `apps/backend/migrations/` as a new numbered file (e.g. `0008_<feature>.sql`). sqlx::migrate! applies them in order at backend startup; never edit a migration that has been deployed.
- Hardcoded credentials in `docker-compose.yml` are placeholders for local dev only; real deployments must override via env or secrets (see spec §12). `JWT_SECRET` in compose is a dev-only literal — replace per environment.

## Spec Quick Reference

Canonical source is `Technical Specification Document Digital Insurance v1.2.pdf` (§8, §9, §10, FS-01..FS-20). Treat this section as a lookup card — open the PDF for full text and sample payloads.

### Identifier formats (spec §9)

All five reset monthly; the per-month sequence MUST be allocated inside a DB transaction so concurrent requests cannot mint duplicates.

| Entity | Format | Example |
| --- | --- | --- |
| Registration | `REG-YYYYMM-NNNNNN` | `REG-202606-000001` |
| Invoice | `INV-YYYYMM-NNNNNN` | `INV-202606-000001` |
| Policy | `POL-YYYYMM-NNNNNN` | `POL-202606-000001` |
| Claim | `CLM-YYYYMM-NNNNNN` | `CLM-202606-000001` |
| Inquiry | `INQ-YYYYMM-NNNNNN` | `INQ-202606-000001` |

### Status state machines (spec §10)

The DB `CHECK` constraints in `init.sql` validate that a value is *one of* the allowed states, not that a transition is legal. Enforce transitions in the Rust service layer.

- **Invoice:** `UNPAID → PAID | EXPIRED | CANCELLED`
- **Registration:** `PENDING → PAID → ISSUED`  |  `PENDING → CANCELLED`
- **Policy:** `ACTIVE → LAPSED | EXPIRED`
- **Claim:** `SUBMITTED → UNDER_REVIEW → APPROVED → PAID`  |  `SUBMITTED | UNDER_REVIEW → REJECTED`
- **Inquiry:** `OPEN → ANSWERED → CLOSED`

### REST API surface (spec §8)

- **Public (4):** `GET /api/products`, `POST /api/registrations` (multipart, includes KTP file), `GET /api/registrations/{regNo}`, `POST /api/payment/webhook`
- **Customer JWT (~10):** `activate`, `login`, `password/reset`, `me`, `policies` (+ `/{id}` + `/{id}/pdf`), `claims` (+ `/{id}`), `inquiries` (+ `/{id}`)
- **Admin JWT (~12):** `login`, `dashboard/stats`, `registrations` (+ `/{id}`), `invoices` (+ `/{id}`), `policies` (+ `/{id}/pdf`), `claims` (incl. `PATCH /{id}` to update status + decision note), `inquiries` (incl. `POST /{id}/respond`), `email-logs`, `audit-logs`

Customer and admin JWTs are role-scoped — middleware must refuse a customer token on admin routes and vice versa, and a customer may only see/modify their own rows.

### Product catalog & validation (spec FS-01, FS-02)

Three products drive the platform: **Life Insurance**, **Personal Accident Insurance**, **Health Insurance**. There is no `products` table yet — `registrations.product` is a free `VARCHAR`. When implementing the registration endpoint, validate against this closed set (consider promoting to a `products` table or `CHECK` constraint).

Hard server-side validation rules:

- `nik` — exactly 16 digits, unique
- `email` — valid format, unique
- `mobile_number` — 10–15 digits
- `birth_date` — not in the future (`<= CURRENT_DATE`, already enforced)
- KTP upload — JPG / PNG / PDF only, max 5 MB, MIME validated server-side, stored in non-public storage, served only via authorized endpoints
- `claim_type` — depends on the product (FS-19)
- `incident_date` (claims) — not in the future, must fall inside the policy's coverage period
- `claimed_amount` — positive, must not exceed the policy's sum assured

### Email types (spec FS-05)

Every send MUST be recorded in `email_logs` with status `SENT` / `FAILED` / `QUEUED`:

1. `REGISTRATION_SUCCESS` — registration completed
2. `INVOICE_NOTIFICATION` — invoice generated
3. `PAYMENT_SUCCESS` — payment received
4. `E_POLICY_DELIVERY` — policy issued (**attachment: policy PDF**)
5. `PORTAL_ACTIVATION` — policy issued, with one-time set-password link
6. `CLAIM_RECEIVED` — claim submitted
7. `CLAIM_STATUS_UPDATE` — claim status changed by admin
8. `INQUIRY_RESPONSE` — admin answered an inquiry

### Pipeline integrity (spec §3.2)

The issuance pipeline (`registration → invoice → paid webhook → policy + PDF → emails`) MUST be wrapped in a DB transaction per stage. The payment webhook MUST be **idempotent**: a repeat callback for an already-PAID invoice returns success without issuing a duplicate policy or re-sending emails. Design the backend state machine with that guarantee in mind.

### Audit events (spec FS-15)

Every entry below MUST produce a row in `audit_logs` (`actor`, `action`, `entity_type`, `entity_id`, `metadata` JSONB, `ip_address`): admin login, customer login, registration created, invoice generated, payment received, policy issued, claim submitted, claim status changed, inquiry submitted, inquiry answered, email sent.

## Design System (frontend)

Visual system inspired by Clay.com — see `document/product/DESIGN.md` for the full spec. Implemented in `packages/ui/src/styles/globals.css` (di-import via `@insuretrack/ui/styles/globals.css` di layout masing-masing app). All UI must use these tokens/classes; do not introduce ad-hoc inline styles for color, radius, or shadow.

### Fonts
- **Body/UI:** Plus Jakarta Sans (substitute for proprietary Roobert; both geometric with rich OpenType features)
- **Monospace:** Space Mono (spec-faithful)
- Loaded via `next/font/google` in `layout.tsx` as CSS variables `--font-jakarta` and `--font-space-mono`
- All headings use the 5 OpenType stylistic sets (`"ss01"`, `"ss03"`, `"ss10"`, `"ss11"`, `"ss12"`); body omits `ss01`

### Color tokens (CSS variables)
- Canvas: `--warm-cream: #faf9f7` (non-negotiable — never cool white)
- Text: `--clay-black: #000`, secondary `--warm-silver: #9f9b93`, `--warm-charcoal: #55534e`
- Borders: `--oat-border: #dad4c8` (warm), `--oat-light: #eee9df`, `--cool-border: #e6e8ec`, `--dark-border: #525a69`
- Swatch palette: `--matcha-{300,600,800}`, `--slushie-{500,800}`, `--lemon-{400,500,700,800}`, `--ube-{300,800,900}`, `--pomegranate-400`, `--blueberry-800`

### Available component classes
- **Layout:** `.clay-container`, `.clay-section`, `.clay-grid.cols-{2,3}`
- **Cards:** `.clay-card`, `.clay-card.feature` (24px radius, 32px padding), `.clay-card.section` (40px radius), `.clay-card.dashed`
- **Buttons (with signature hover):** `.clay-button` (default), `.solid-white`, `.solid-ube`, `.solid-matcha`, `.solid-slushie`, `.solid-pomegranate`, `.ghost`, `.pill`, `.size-{large,small}`
  - Signature hover: `rotateZ(-8deg) translateY(-80%)` + `box-shadow: rgb(0,0,0) -7px 7px`
- **Inputs:** `.clay-input`, `.clay-select`, `.clay-textarea`, `.clay-label`
- **Tables:** `.clay-table` (with hover row)
- **Badges:** `.clay-badge` + variants `.matcha/.slushie/.ube/.pomegranate/.lemon/.blueberry/.muted`, or status-tinted `.status-{active,paid,issued,approved,answered,sent,submitted,open,pending,unpaid,under_review,queued,rejected,lapsed,expired,failed,cancelled,closed}`
- **Typography:** `.display-hero`, `.display-secondary`, `.section-heading`, `.card-heading`, `.feature-title`, `.body`, `.body-large`, `.body-standard`, `.body-medium`, `.uppercase-label`, `.caption`, `.small`, `.mono`
- **Swatch section backgrounds:** `.swatch-matcha`, `.swatch-matcha-deep`, `.swatch-slushie`, `.swatch-slushie-deep`, `.swatch-ube`, `.swatch-ube-deep`, `.swatch-lemon`, `.swatch-lemon-deep`

### Shadows
- `--shadow-clay`: 3-layer (cast + inset highlight + edge) — used by `.clay-card`
- `--shadow-hard-hover`: `rgb(0,0,0) -7px 7px` — applied on button hover

### Color usage rules
- **Maximum 2 swatch colors per section** (per `document/product/DESIGN.md` §7)
- Swatch colors are for **full sections**, not small accents
- Dashed borders (`border-style: dashed`) for decorative/secondary containers
- Borders: always warm oat, never neutral gray

### Section role color hints
- Public landing: ub (hero CTA), lemon/ube accents
- Admin: ube (primary actions), pomegranate (danger/reject), matcha (approve)
- Customer portal: matcha (primary), pomegranate (claim), ube (inquiry)

## Commit & Contribution Standards

Standar pesan commit, format PR, dan checklist kontribusi ada di
[`CONTRIBUTING.md`](./document/contributing/CONTRIBUTING.md). Repo ini mengikuti
[Conventional Commits 1.0](https://www.conventionalcommits.org/) —
wajib untuk PR title, commit subject, dan changelog otomatis.

Ringkas tipe yang paling sering dipakai:

- `feat(<scope>):` — fitur baru
- `fix(<scope>):` — perbaikan bug
- `refactor(<scope>):` — restrukturisasi tanpa ubah behavior
- `chore(deps):` / `build(docker):` — tooling, dependency, build
- `docs:` — markdown saja
- `!` setelah scope = breaking change

Cantumkan `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` di
footer saat commit dihasilkan/diubah oleh AI assistant.
- Login pages: each role's brand color for primary button

## Code Comment Standard

Komentar ada untuk menjelaskan **WHY**, bukan WHAT (code sudah jelas).
Standar:

| Prefix | Dipakai untuk | Contoh |
| --- | --- | --- |
| `//!` (module-level) | Block di atas file. Jelaskan intent modul, key dependency, dan constraint penting. Bukan tutorial. | Lihat `services/email_template.rs` |
| `///` (doc) | `pub` function/struct/field. One-liner wajib; paragraf tambahan hanya kalau non-obvious. | `/// Render template → (text, html) siap kirim ke Resend.` |
| `//` (inline) | **Hanya** untuk hal genuinely non-obvious. Kalau iya, lebih baik rename variable atau extract function. | `// WAJIB aman untuk attribute — caller sanitize URL` |
| `// TODO(name):` | Known limitation/follow-up dengan author tag. | `// TODO(claude): ganti ke typed-error` |
| `// FIXME:` | Bug yang diketahui tapi belum fix. | `// FIXME: race condition pada concurrent login` |

**JANGAN** tulis komentar yang:
- Menduplikasi code (`// increment counter` sebelum `i++`)
- Mendeskripsikan hal obvious (`// loop through items` sebelum `for`)
- Changelog-style (info sudah di git log)
- Berisi signature function yang sudah di-IDE-hover

Saat refactor, **hapus** komentar yang sudah tidak relevan (mis. comment yang describe struktur lama).

## File organization (Rust + TS)

- Backend Rust modules: `apps/backend/src/{services,routes,domain,dto,auth,repo,error,config}.rs`
- Frontend TS app: `apps/{portal,admin}/app/<route>/page.tsx`
- Shared: `packages/{ui,forms,api-client}/src/`
- Re-export pattern: setiap package punya `src/index.ts` yang re-export API publik; file internal pakai underscore prefix atau taruh di `internal/` subfolder.