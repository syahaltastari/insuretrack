# InsureTrack — Docker Setup & Troubleshooting Guide

**Tanggal:** 2026-06-08
**Status:** ✅ Verified — `docker compose up -d` jalan, 3 servis (db, backend, portal, admin) semua **healthy**.

Dokumen ini menjelaskan kenapa setup Docker sempat error ("portal & admin tidak bisa diakses, hanya backend jalan") dan apa yang diperbaiki. Juga jadi acuan kalau ada masalah serupa di masa depan.

---

## TL;DR — Apa yang rusak

| Gejala | Root cause | Fix |
| --- | --- | --- |
| `localhost:3000` & `localhost:3001` tidak merespons | Build image Next.js **hang** di "Collecting build traces" — tidak ada container portal/admin yang jadi | Tambah root `.dockerignore` + fix Dockerfile agar build context turun dari ~300MB ke ~10MB |
| `docker compose up -d` exit dengan `dependency failed to start: insurance_backend is unhealthy` | Backend healthcheck pakai `wget`, tapi image `debian:bookworm-slim` tidak include util jaringan | Tambah `wget` ke `apps/backend/Dockerfile` runtime stage |
| Standalone Next.js output di Docker beda struktur dengan di host | `outputFileTracingRoot` di-detect otomatis oleh Next.js, hasilnya beda antara host & Docker | Set `outputFileTracingRoot: path.join(__dirname, "../..")` di kedua `next.config.ts` |
| `pnpm run build` di Docker gagal: `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | Builder stage tidak punya `pnpm-workspace.yaml` & root `package.json` di cwd | COPY workspace manifest di builder stage + symlink workspace packages di deps & runner stage |

---

## 1. Anatomi Docker Stack

```
┌────────────────────────────────────────────────────────────┐
│  monorepo root                                             │
│  ├── .dockerignore           ← BARU, exclude node_modules  │
│  ├── docker-compose.yml      ← refactored (anchor + env)   │
│  ├── .env                    ← secrets (POSTGRES_*, JWT,    │
│  │                             RESEND, R2)                  │
│  ├── apps/                                                │
│  │   ├── backend/  (Rust + Axum, port 8080)               │
│  │   │   ├── Dockerfile    ← +wget di runtime              │
│  │   │   ├── Cargo.toml                                    │
│  │   │   ├── migrations/                                   │
│  │   │   └── src/                                          │
│  │   ├── portal/   (Next.js customer, port 3000)           │
│  │   │   ├── Dockerfile    ← refactored                   │
│  │   │   ├── next.config.ts ← +outputFileTracingRoot      │
│  │   │   └── app/                                          │
│  │   └── admin/    (Next.js backoffice, port 3001)         │
│  │       ├── Dockerfile    ← refactored                   │
│  │       ├── next.config.ts ← +outputFileTracingRoot      │
│  │       └── app/                                          │
│  ├── packages/           (shared @insuretrack/*)           │
│  │   ├── api-client/                                      │
│  │   ├── forms/                                           │
│  │   └── ui/                                              │
│  ├── pnpm-workspace.yaml                                   │
│  ├── pnpm-lock.yaml                                       │
│  ├── package.json                                          │
│  └── .npmrc             (node-linker=hoisted)             │
└────────────────────────────────────────────────────────────┘
```

**4 servis di docker-compose:**

| Servis | Image | Port host | Port container | Volume |
| --- | --- | --- | --- | --- |
| `db` | `postgres:15-alpine` | 5433 | 5432 | `pgdata:/var/lib/postgresql/data` |
| `backend` | `insuretrack-backend` | 8080 | 8080 | `backend_uploads:/var/uploads` |
| `portal` | `insuretrack-portal` | 3000 | 3000 | (stateless) |
| `admin` | `insuretrack-admin` | 3001 | 3001 | (stateless) |

---

## 2. Root Cause #1 — Build Context Membengkak

### Gejala

`docker build` untuk portal/admin HANG di "Collecting build traces" selamanya. Build context balloon ke ~300MB.

### Kenapa

`apps/portal/Dockerfile` & `apps/admin/Dockerfile` dipanggil dengan `context: .` (monorepo root) oleh `docker-compose.yml`. Docker baca `.dockerignore` **dari build-context root** — bukan dari folder Dockerfile. Yang ada di root hanya gitignored stuff, tidak ada `.dockerignore`.

Akibatnya Docker kirim SELURUH monorepo ke build context:
- `node_modules/` (root + apps) → ratusan MB
- `apps/backend/target/` (Rust) → 1-2GB
- `apps/portal/.next/`, `apps/admin/.next/` (build cache)
- `document/` (PDF, screenshots)
- `apps/backend/.env`, `.env` root (secrets bocor ke image!)

Worse: `output: "standalone"` Next.js scan semua file di build context untuk trace dependency. Dengan symlink pnpm `node-linker=hoisted` (`pkg -> .pnpm/.../pkg`), ada banyak symlink yang circular → hang selamanya.

### Fix

**Tambah `.dockerignore` di root** yang exclude semua artifact & file yang tidak dibutuhkan build Next.js (lihat file di root). Build context portal/admin sekarang ~5-10MB.

**File yang TETAP masuk build context** (dibutuhkan `pnpm install` & `next build`):
- `package.json` (root)
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `.npmrc`
- `apps/portal/package.json` & `apps/admin/package.json`
- `packages/*/` (source TypeScript workspace packages)
- `apps/portal/` & `apps/admin/` (source)

**Note keamanan:** `.env` root TIDAK masuk image (wajar, tapi worth noting karena ada secrets R2/Resend di sana).

---

## 3. Root Cause #2 — `outputFileTracingRoot` Inkonsisten

### Gejala

Setelah fix `.dockerignore`, `next build` sukses. Tapi `COPY --from=builder /repo/apps/portal/.next/standalone/apps/portal ./` gagal: "not found".

### Kenapa

Next.js auto-detect `outputFileTracingRoot` dengan cari `pnpm-workspace.yaml` / `turbo.json` di ancestor. Hasilnya beda antara host vs Docker:

- **Host** (project di `D:\...\insuretrack\apps\portal`): detected monorepo root, output di `apps/portal/.next/standalone/apps/portal/server.js` (path preserved).
- **Docker** (project di `/repo/apps/portal`, monorepo root di `/repo`): detected project dir itu sendiri sebagai root, output di `/repo/apps/portal/.next/standalone/server.js` (TANPA path preservation).

### Fix

Set `outputFileTracingRoot` eksplisit di `next.config.ts`:

```ts
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),  // apps/portal → ../../ = monorepo root
  // ...
};
```

Path relatif `../../` resolve ke monorepo root di mana pun build berjalan. Output standalone sekarang konsisten: `apps/portal/.next/standalone/apps/portal/server.js` (di host & Docker).

---

## 4. Root Cause #3 — Workspace Packages Symlink

### Gejala

Setelah fix #1, `pnpm run build` di Docker fail:

```
[ERR_PNPM_WORKSPACE_PKG_NOT_FOUND] In : "@insuretrack/api-client@workspace:*" is in the dependencies but no package named "@insuretrack/api-client" is present in the workspace
```

### Kenapa

`pnpm-workspace.yaml` di root menentukan workspace. `pnpm install` resolve workspace packages via itu. Tapi di `.npmrc` ada `node-linker=hoisted` — pnpm TIDAK auto-symlink workspace packages ke `node_modules/@insuretrack/*`. Tanpa symlink, Next.js / pnpm sub-command tidak resolve `@insuretrack/*` imports.

Di host, pnpm cache lokal di `~/.local/share/pnpm/store` punya info symlink. Di Docker, store fresh + pnpm sub-command (bukan `pnpm install`) tidak detect workspace.

### Fix

**Di `deps` stage**, setelah `pnpm install`, tambah symlink manual:

```dockerfile
RUN mkdir -p /repo/node_modules/@insuretrack && \
    for pkg in /repo/packages/*/; do \
      name=$(basename "$pkg"); \
      ln -s "$pkg" "/repo/node_modules/@insuretrack/$name"; \
    done
```

**Di `runner` stage**, symlink yang di-copy dari deps point ke `/repo/packages/*` yang tidak ada di runner. Re-create symlink menunjuk ke `/app/packages/*`:

```dockerfile
RUN rm -rf /tmp/deps-node_modules/@insuretrack \
    && cp -aL /tmp/deps-node_modules/. /app/node_modules/ \
    && rm -rf /tmp/deps-node_modules \
    && mkdir -p /app/node_modules/@insuretrack \
    && for pkg in /app/packages/*/; do \
         name=$(basename "$pkg"); \
         ln -s "$pkg" "/app/node_modules/@insuretrack/$name"; \
       done
```

`cp -aL` dereferences symlink pnpm `pkg -> .pnpm/...` jadi real files. Symlink workspace kita re-create manual di akhir.

---

## 5. Root Cause #4 — Backend Healthcheck `wget` Hilang

### Gejala

`docker compose up -d` exit dengan:

```
dependency failed to start: container insurance_backend is unhealthy
```

Backend log normal (running, listening on 8080). Tapi `docker compose ps` mark `unhealthy`.

### Kenapa

docker-compose healthcheck:
```yaml
test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/health"]
```

Backend image base `debian:bookworm-slim` — **tidak** include `wget`, `curl`, atau `nc` (hanya `ca-certificates`). Healthcheck selalu fail → servis dependent (portal, admin) tidak start.

### Fix

Tambah `wget` ke runtime stage di `apps/backend/Dockerfile`:

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
```

`wget` cuma ~700KB, reasonable cost untuk healthcheck reliability. Alternatif: pakai image `node:alpine` dengan `wget` built-in — tapi itu change besar, skip dulu.

---

## 6. Refactor Lain (Quality Improvements)

Selain fix bug, sekalian saya refactor:

### `docker-compose.yml` — YAML anchors

Pakai YAML anchor untuk reduce duplication:

```yaml
x-pnpm-base: &pnpm-base
  NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:${BACKEND_PORT:-8080}/api}

x-backend-env: &backend-env
  DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
  JWT_SECRET: ${JWT_SECRET:?...}
  # ...
```

Portal & admin pakai `args: { <<: *pnpm-base }`. Backend pakai `environment: { <<: *backend-env }`. Kalau env var perlu diubah, edit satu tempat.

### Healthcheck di semua servis

| Servis | Healthcheck | Alasan |
| --- | --- | --- |
| `db` | `pg_isready` (sudah ada) | Standar Postgres |
| `backend` | `wget /health` | Endpoint backend health check |
| `portal` | `node http.get /` | Next.js root respond |
| `admin` | `node http.get /` | Next.js root respond |

`depends_on: backend: { condition: service_healthy }` di portal/admin — startup deterministik (tidak race condition dengan backend).

### Dockerfile portal/admin — clear stages

Pisah jadi 3 stage eksplisit dengan komentar:

1. **`deps`** — install deps, source-free (cache hit saat code app berubah)
2. **`builder`** — copy source + run `next build`
3. **`runner`** — image runtime minimal, non-root user `nextjs` (uid 1001), `HEALTHCHECK` built-in

Plus: `NEXT_TELEMETRY_DISABLED=1` di build & runtime (suppress Next.js analytics prompt di logs).

### Image size

| Image | Size | Catatan |
| --- | --- | --- |
| `insuretrack-portal` | 407MB | Standalone Next.js + node_modules deref |
| `insuretrack-admin` | 407MB | Sama |
| `insuretrack-backend` | 44.5MB | Rust release binary (sangat kecil) |
| `postgres:15-alpine` | 109MB | Base image |

Frontend Next.js + node_modules memang besar. Untuk turunin lagi, bisa pakai `output: "export"` (full static, no server) — tapi next.js app ini pakai dynamic routes (FS-09..20), tidak bisa static-only. **Skip dulu**.

---

## 7. Cara Pakai (Daily Workflow)

### First-time setup

```bash
# Clone, lalu copy env
cp .env.example .env
# Edit .env: set JWT_SECRET, PAYMENT_WEBHOOK_SECRET (dev values sudah ada)
# Edit .env: atur POSTGRES_* kalau perlu

# Start stack
docker compose up -d --build

# Verifikasi
docker compose ps
# Semua harus (healthy) dalam ~30-60 detik
```

### Daily commands

```bash
# Start
docker compose up -d

# Stop (volume tetap ada)
docker compose down

# Lihat logs (tail semua servis)
docker compose logs -f

# Lihat logs satu servis
docker compose logs -f backend

# Restart satu servis
docker compose restart portal

# Rebuild satu servis (kalau code berubah)
docker compose up -d --build portal

# Reset TOTAL (hapus volume DB + uploads)
docker compose down -v
```

### Verifikasi cepat

```bash
# Backend health
curl http://localhost:8080/health
# → {"service":"insuretrack-backend","status":"ok","version":"0.1.0"}

# Portal root
curl -I http://localhost:3000/
# → HTTP/1.1 200

# Admin login page
curl -I http://localhost:3001/admin/login
# → HTTP/1.1 200

# Admin root (akan redirect ke login)
curl -I http://localhost:3001/
# → HTTP/1.1 307 (Location: /admin/login)
```

### Database access

```bash
# Dari host
psql "postgres://insurance_admin:insurance_password@localhost:5433/digital_insurance"

# Dari dalam container db
docker compose exec db psql -U insurance_admin -d digital_insurance
```

---

## 8. Troubleshooting

### Symptom: "portal/admin image tidak ter-build"

```bash
# Cek log build
docker compose build portal 2>&1 | tail -50
```

Kemungkinan:
- `.dockerignore` corrupt → cek `cat .dockerignore` di root
- Lockfile drift → `pnpm install` di host, commit `pnpm-lock.yaml`

### Symptom: "portal container restart loop"

```bash
docker compose logs portal
```

Look for:
- `Error: Cannot find module '@insuretrack/...'` → symlink workspace packages missing, rebuild
- `Error: listen EADDRINUSE` → port 3000 sudah dipakai, `lsof -i :3000`

### Symptom: "backend unhealthy"

```bash
docker compose logs backend
docker compose exec backend wget -qO- http://127.0.0.1:8080/health
```

- Kalau `wget: not found` → image backend perlu rebuild dengan wget (lihat §5)
- Kalau backend log error `connection refused` ke db → cek `docker compose ps db` harus `healthy`

### Symptom: "Build context sangat besar (ratusan MB)"

`.dockerignore` di root tidak ada atau corrupt. Verifikasi:

```bash
# Seharusnya kecil (5-15MB)
docker compose build --no-cache --progress=plain portal 2>&1 | grep "transferring context"
```

### Symptom: "ERR_PNPM_WORKSPACE_PKG_NOT_FOUND"

`pnpm-workspace.yaml` tidak ter-COPY ke builder stage. Cek Dockerfile portal/admin stage `builder` — harus ada:

```dockerfile
COPY package.json pnpm-workspace.yaml .npmrc ./
```

### Symptom: "next: not found" saat build

Biasanya setelah pnpm update. `node-linker=hoisted` di `.npmrc` harus tetap ada. Verifikasi:

```bash
grep node-linker .npmrc
# → node-linker=hoisted
```

---

## 9. File-file yang Berubah di Sesi Ini

| File | Perubahan | Alasan |
| --- | --- | --- |
| `.dockerignore` (root) | **NEW** | Exclude `node_modules`, `target/`, `.next/`, `apps/backend/`, `document/` dari build context portal/admin |
| `docker-compose.yml` | Refactor: YAML anchors, healthcheck di semua servis, comment Bahasa Indonesia konsisten | High-quality, single-source env |
| `apps/portal/Dockerfile` | Refactor: 3 stage clean (deps/builder/runner), BuildKit cache mount pnpm store, workspace symlink fix, healthcheck | Reliability + reproducibility |
| `apps/admin/Dockerfile` | Sama seperti portal (port 3001) | Konsistensi |
| `apps/portal/next.config.ts` | Tambah `outputFileTracingRoot: path.join(__dirname, "../..")` | Standalone output konsisten host↔Docker |
| `apps/admin/next.config.ts` | Sama | Konsistensi |
| `apps/backend/Dockerfile` | Tambah `wget` ke runtime stage | Healthcheck reliability |
| `document/operations/DOCKER_SETUP.md` | **NEW** — dokumen ini | Onboarding + troubleshooting |

---

## 10. Out-of-Scope (Untuk Sesi Lanjutan)

- **Dev mode hot-reload**: Saat ini Dockerfile hanya production. Untuk dev (volume mount + `pnpm dev`), butuh Dockerfile.dev terpisah atau override di compose. Bisa ditambahkan sebagai `target: dev` di multi-stage build.
- **CI/CD pipeline**: `docker compose build` di GitHub Actions / GitLab CI belum disetup. Hanya verified di local.
- **HTTPS + reverse proxy**: Caddy/nginx di depan belum ditambah. Sekarang langsung expose port 3000/3001/8080 (dev only).
- **Image size optimization**: Portal/admin 407MB. Bisa turun ke ~150MB dengan multi-stage lebih agresif atau distroless base — tapi skip dulu (working).
- **Read-only root filesystem**: Container masih writable. Production hardening berikutnya.
- **Resource limits (cpu/mem)**: Compose tidak set `deploy.resources` — OK untuk single-host dev, perlu ditambah untuk production swarm/k8s.

---

## 11. Verifikasi Akhir (2026-06-08)

```bash
$ docker compose ps
NAME                IMAGE                 COMMAND                  SERVICE   STATUS                    PORTS
insurance_admin     insuretrack-admin     "docker-entrypoint.s…"   admin     Up 39 seconds (healthy)   0.0.0.0:3001->3001/tcp
insurance_backend   insuretrack-backend   "insuretrack-backend"    backend   Up 45 seconds (healthy)   0.0.0.0:8080->8080/tcp
insurance_db        postgres:15-alpine    "docker-entrypoint.s…"   db        Up 52 seconds (healthy)   0.0.0.0:5433->5432/tcp
insurance_portal    insuretrack-portal    "docker-entrypoint.s…"   portal    Up 39 seconds (healthy)   0.0.0.0:3000->3000/tcp

$ curl -s -o /dev/null -w "Backend: HTTP %{http_code}\n" http://localhost:8080/health
Backend: HTTP 200

$ curl -s -o /dev/null -w "Portal:  HTTP %{http_code}\n" http://localhost:3000/
Portal:  HTTP 200

$ curl -s -o /dev/null -w "Admin:   HTTP %{http_code}\n" http://localhost:3001/admin/login
Admin:   HTTP 200
```

✅ Semua servis merespons. Stack siap dipakai.

---

## 12. Referensi Cepat

- **Spec full project:** `Technical Specification Document Digital Insurance v1.2.pdf`
- **Monorepo migration notes:** `MIGRATION.md`
- **Design system:** `document/product/DESIGN.md`
- **OpenAPI spec:** `document/api/openapi.yaml`
- **Project memory:** `~/.claude/projects/.../memory/MEMORY.md` (per-session context)
