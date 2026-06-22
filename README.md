# InsureTrack — Digital Insurance Platform

End-to-end online insurance issuance: customer registers → invoice is generated →
payment webhook fires → policy (e-policy PDF) is issued and emailed automatically.
No manual underwriting — every product is auto-accept. Beyond issuance, there's a
self-service portal for customers (view policies, file claims, send inquiries) and
a back office for admins.

Full requirements (FS-01..FS-20, API contracts, identifier formats, state machines)
live in `document/spec/Technical Specification Document Digital Insurance v1.2.pdf`.
For everything else, start at [`document/README.md`](./document/README.md).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router, React 19, TypeScript) — `apps/portal` (customer, :3000) & `apps/admin` (back office, :3001) |
| Backend | Rust + Axum, Tokio async runtime — `apps/backend` (:8080) |
| Database | PostgreSQL (15 on Docker/VPS, 18 native for local dev) |
| Migrations | sqlx, auto-applied on backend startup (`apps/backend/migrations/`) |
| Auth | JWT (HS256) + Argon2id, role-scoped (admin / customer) |
| PDF | Server-side rendering for e-policy & payment receipts |
| Shared packages | `packages/ui` (design system), `packages/forms`, `packages/api-client` |

## Running locally

Local dev runs **without Docker** — backend via `cargo run`, frontend via `pnpm dev`,
database on native PostgreSQL at `localhost:5432`. Rationale and full details are in
`document/operations/`.

One-time setup (if you don't have the database & `.env` files yet):

```bat
scripts\setup-db-native.bat
```

This creates the `digital_insurance` database and `insurance_admin` role, and writes
`apps/backend/.env` pointing at `localhost:5432`. Also make sure `apps/portal/.env`
and `apps/admin/.env` are copied from their respective `.env.example`.

Day-to-day:

```bat
dev.bat
```

This opens two windows: one for the backend (`cargo run`, port 8080), one for the
frontend (`pnpm dev` via turbo, ports 3000 + 3001). sqlx migrations apply automatically
on backend startup. To stop, close the windows or run `scripts\stop.bat`.

Open:
- `http://localhost:3000` — public landing page + registration form
- `http://localhost:3000/portal` — customer login/portal
- `http://localhost:3001/admin` — admin login

## Deploying to a VPS

Deployment uses the full Docker Compose stack (4 services: db, backend, portal, admin)
behind Traefik via Dokploy. See `docker-compose.yml` and
`document/deployment/RUNBOOK_VPS_DEV.md` (or `DEPLOY_QUICKSTART.md` for a quick demo
setup). Local and VPS setups are deliberately different — don't use
`docker compose up` for daily dev, that's the deployment path.

## Repo Layout

```
.
├── apps/
│   ├── backend/     Rust + Axum, migrations/, src/{auth,domain,routes,services,repo,dto}
│   ├── portal/       Next.js — public landing, registration, customer portal
│   └── admin/        Next.js — admin login, dashboard, registration/invoice/policy/claim management
├── packages/
│   ├── ui/           Design system (Clay.com-inspired), globals.css, shared components
│   ├── forms/         React Hook Form + zod, shared across apps
│   └── api-client/    Fetch wrapper for the backend
├── document/         Docs (spec, design, API, deployment, operations) — see document/README.md
├── scripts/          Native DB setup, backup, deploy, healthcheck
├── docker-compose.yml  For VPS/Dokploy, not local dev
├── dev.bat / scripts/stop.bat   Local dev launcher
└── CLAUDE.md         Conventions & architecture notes for contributors (human & AI)
```

## Further reading

All non-code documentation lives in `document/`, grouped by domain (spec, design,
API contract, deployment, operations). Start at
[`document/README.md`](./document/README.md) for the full map — including the
OpenAPI spec, Postman collection, troubleshooting guide, and contribution guidelines.
