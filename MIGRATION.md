# Migrasi Monorepo — `frontend/` + `backend/` → `apps/{portal,admin,backend}`

> Tracking doc untuk transisi dari monorepo datar (`backend/` + `frontend/`) ke monorepo workspace dengan apps ter-pisah. Mulai branch `refactor-infra`.

## Tujuan

Pisahkan codebase menjadi 3 service surface yang jelas (portal customer, backoffice admin, Rust API) dengan shared design system + API client + form infra di `packages/`, supaya:

- Deploy independent (portal & admin bisa scale beda).
- Boundary ownership jelas (siapa yang boleh ubah apa).
- Tiap app bisa punya `package.json`, `next.config`, dan Dockerfile sendiri.
- Rust backend tetap di luar pnpm workspace (tooling beda).

## Sebelum & sesudah

### Sebelum

```
backend/         # Rust + Axum
frontend/        # Next.js (admin + portal + landing dalam satu app)
db/
document/
docker-compose.yml
```

### Sesudah

```
apps/
├── admin/       # Next.js, port 3001, /admin/* (backoffice)
├── backend/     # Rust + Axum, port 8080 (DI LUAR pnpm workspace)
└── portal/      # Next.js, port 3000, / + /register + /portal/* (customer)
packages/
├── api-client/  # @insuretrack/api-client
├── forms/       # @insuretrack/forms (RHF + zod)
└── ui/          # @insuretrack/ui (design system + globals.css)
db/
document/
docker-compose.yml    # services: db, backend, portal, admin
```

## Route → app mapping

| Route | App | Notes |
| --- | --- | --- |
| `/` (landing) | `apps/portal` | FS-01 public |
| `/register` | `apps/portal` | FS-02 public |
| `/portal/*` (login, activate, dashboard, policies, claims, claims/new, inquiries, reset) | `apps/portal` | Customer surface, FS-16..20 |
| `/admin/*` (login, dashboard, registrations, invoices, policies, claims, inquiries, clients, testimonials, email-logs, audit-logs, profile) | `apps/admin` | Admin surface, FS-09..15 + claim/inquiry review |

## Cara run

### Docker (semua service)

```bash
cp apps/backend/.env.example apps/backend/.env
cp .env.example .env
docker compose up -d --build
# → http://localhost:3000  (portal)
# → http://localhost:3001  (admin)
# → http://localhost:8080  (backend)
```

### Dev lokal (tanpa Docker)

```bash
pnpm install
# Terminal 1: backend
cd apps/backend && cargo run

# Terminal 2: portal (port 3000)
pnpm --filter @insuretrack/portal dev

# Terminal 3: admin (port 3001)
pnpm --filter @insuretrack/admin dev
```

atau via turbo dari root:

```bash
pnpm dev    # runs semua workspaces (parallel)
```

## Shared packages

- `@insuretrack/api-client` — `apiFetch`, `ApiError`, `API_BASE`, admin/customer token helpers, `cn` utility.
- `@insuretrack/forms` — RHF `Form`/`FormField`/`FormError` + zod schemas umum.
- `@insuretrack/ui` — shadcn primitives (Button, Dialog, AlertDialog, Confirm, Toaster) + design-specific (Chart, Icon, Pagination, SafeImage, StatusBadge) + `globals.css` design tokens (di-import via `@insuretrack/ui/styles/globals.css`).

Tiap app `transpilePackages` di `next.config.ts` agar Next.js compile workspace TS source langsung.

## Commit history (branch `refactor-infra`)

| Commit | Subject |
| --- | --- |
| `2c04104` | initiate migrate infra (shared packages + workspace skeleton) |
| `54efd8f` | refactor(ui): move globals.css to shared package and fix Confirm trigger type |
| `5be8c3f` | refactor(workspace): pindahkan backend/ ke apps/backend/ |
| `79226f8` | feat(apps/portal): scaffold Next.js app untuk customer surface |
| `610ec3b` | feat(apps/admin): scaffold Next.js app untuk backoffice surface |
| `cf14723` | feat(apps/portal): pindahkan portal code dari frontend/ |
| `0ed71d6` | feat(apps/admin): pindahkan admin code dari frontend/ |
| `5d9fb4c` | chore(workspace): align @types/react to exact 18.3.12 di semua package |
| `b043cd5` | build(docker): replace frontend service dengan portal + admin |
| `9a4905f` | refactor(workspace): hapus frontend/, cutover ke apps/portal + apps/admin |

## Known issues (out of scope untuk migrasi ini)

- **Next.js 15.0.3 + React 19 RC + App-Router-only**: `next build` gagal di `/404` prerender dengan error `<Html> should not be imported outside of pages/_document`. Pre-existing di `main` (sebelum migrasi). Workaround: `next dev` jalan normal. Fix: upgrade Next.js ke 15.1+ atau downgrade React ke 18.3.
- **apps/backend di luar pnpm workspace** (Rust). Kalau di kemudian hari mau integrate (mis. monorepo-wide build scripts), perlu setup Cargo workspace yang parallel dengan pnpm workspace.

## Migration plan asal

Lihat `C:\Users\User\.claude\plans\parsed-doodling-finch.md` untuk plan lengkap dengan per-fase checklist, verifikasi command, dan risk assessment.
