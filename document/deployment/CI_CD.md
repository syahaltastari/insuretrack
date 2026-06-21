# InsureTrack — CI/CD dengan GitHub Actions + Dokploy

**Dokumen ini**: referensi lengkap untuk pipeline CI/CD InsureTrack — dari push code sampai production-ready image ter-deploy di VPS.

**Tanggal**: 2026-06-18
**Versi**: 1.0 (GH Actions + GHCR + Dokploy, decoupled build)
**Audience**: developer/maintainer InsureTrack (solo atau tim kecil)

> **TL;DR**: Push ke `main` → CI jalan tests → kalau pass, build 3 Docker image di GitHub Actions → push ke GHCR → VPS Dokploy pull image → container restart. **VPS tidak compile apa-apa**, CPU tetap idle, panel Dokploy selalu responsif.

---

## Daftar Isi

### Bagian A — Overview & arsitektur
1. [Konteks: kenapa migrasi ke GH Actions](#1-konteks-kenapa-migrasi-ke-gh-actions)
2. [Arsitektur pipeline](#2-arsitektur-pipeline)
3. [3 workflow + 1 registry](#3-3-workflow--1-registry)

### Bagian B — Setup awal (sekali)
4. [Setup GitHub Secrets](#4-setup-github-secrets)
5. [Setup GHCR packages](#5-setup-ghcr-packages)
6. [Setup Dokploy](#6-setup-dokploy)

### Bagian C — Reference (deep dive)
7. [CI workflow (`ci.yml`)](#7-ci-workflow-ciyml)
8. [Build workflow (`build.yml`)](#8-build-workflow-buildyml)
9. [Deploy workflow (`deploy-demo.yml`)](#9-deploy-workflow-deploy-demoyml)
10. [GHCR (image registry)](#10-ghcr-image-registry)

### Bagian D — Operasi harian
11. [Daily workflow: push ke deploy](#11-daily-workflow-push-ke-deploy)
12. [Monitoring & verifikasi](#12-monitoring--verifikasi)
13. [Rollback](#13-rollback)
14. [Manual redeploy dari Dokploy UI](#14-manual-redeploy-dari-dokploy-ui)

### Bagian E — Referensi
15. [Troubleshooting](#15-troubleshooting)
16. [FAQ](#16-faq)
17. [Referensi terkait](#17-referensi-terkait)

---

# Bagian A — Overview & arsitektur

## 1. Konteks: kenapa migrasi ke GH Actions

### Masalah sebelumnya (build di VPS)

VPS B1ms (1 vCPU, 2 GB RAM) menjalankan Docker build untuk 3 image paralel:
- **Rust backend**: 1.5 GB RAM + 100% CPU × 5 menit (sqlx + aws-sdk compile)
- **Next.js portal**: 500 MB RAM + 70% CPU × 3 menit
- **Next.js admin**: 500 MB RAM + 70% CPU × 3 menit

Total demand: **~3.5 GB RAM + 4 CPU cores** — padahal VPS cuma punya **1 CPU + 2 GB**.

**Gejala yang Anda alami:**
- ❌ CPU 100% saat deploy/build
- ❌ Dokploy panel timeout (tidak bisa dibuka via web)
- ❌ SSH kadang hang
- ❌ Build gagal "No space left on device" (disk penuh dari Docker cache)
- ❌ OOM kill (memory habis)

### Solusi: decouple build dari deploy

Build jalan di **GitHub-hosted runner** (4 vCPU, 16 GB RAM) — VPS cuma `docker pull` image jadi → restart container. **CPU VPS tetap idle**.

| Aspek | Sebelum (VPS build) | Sesudah (GH Actions) |
|---|---|---|
| VPS CPU saat deploy | 100% | **0%** |
| VPS RAM saat deploy | ~3.5 GB | **~200 MB** (cuma docker pull) |
| Dokploy panel | Timeout 5-10 menit | **Selalu responsif** |
| Build time | 8-12 menit | Sama (cold) atau 2-3 menit (warm cache) |
| Build cost | Gratis (pakai VPS) | **Gratis untuk public repo** |
| VPS requirement | 2 vCPU / 4 GB minimum | 1 vCPU / 2 GB cukup |

### Kapan TIDAK perlu migrasi

Migrasi ini overkill kalau:
- VPS Anda sudah 4+ vCPU / 8 GB dan build lancar
- Anda deploy < 1× per minggu
- Repo benar-benar private dan tidak mau push ke GH sama sekali

Untuk kasus Anda (VPS B1ms + sering deploy), GH Actions jelas lebih cocok.

---

## 2. Arsitektur pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Developer (lokal)                                          │
│  • Edit code di VS Code                                    │
│  • Test lokal: pnpm test, cargo test, pnpm dev              │
│  • git commit + git push origin main                        │
└─────────────────────────────────────────────────────────────┘
                       │ git push
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub                                                       │
│                                                              │
│  ① CI workflow (.github/workflows/ci.yml)                   │
│     Trigger: push to main + PR to main                       │
│     Jobs:                                                     │
│     • backend-tests: cargo test --lib                        │
│     • backend-integration: cargo test --tests                │
│     • frontend-tests: pnpm test (vitest)                     │
│     • frontend-e2e: pnpm exec playwright test                 │
│     • frontend-build: pnpm build                              │
│     • backend-lint: cargo fmt --check + clippy               │
│     Duration: 3-5 menit                                       │
│     Output: ✅ hijau jika semua test pass                     │
│                                                              │
│  ② Build workflow (.github/workflows/build.yml)             │
│     Trigger: workflow_run (CI selesai + success)             │
│     Jobs:                                                     │
│     • Build & push 3 image ke GHCR (matrix paralel)         │
│     Output: 3 image di ghcr.io/syahaltastari/insuretrack-*  │
│     Duration: 3-8 menit (cold), 1-3 menit (warm)            │
│                                                              │
│  ③ Deploy workflow (.github/workflows/deploy-demo.yml)      │
│     Trigger: workflow_run (build selesai + success)           │
│     Jobs:                                                     │
│     • ci-gate: verify build sukses                           │
│     • deploy: call Dokploy API → trigger redeploy           │
│     • verify: health check post-deploy                        │
│     Duration: 30 detik                                       │
│                                                              │
│  Total push → deploy: 7-15 menit (cold) atau 5-8 menit (warm) │
└─────────────────────────────────────────────────────────────┘
                       │ docker pull (zero CPU)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GHCR (GitHub Container Registry) — image storage            │
│                                                              │
│  Image yang tersedia:                                        │
│  • ghcr.io/syahaltastari/insuretrack-backend:latest          │
│  • ghcr.io/syahaltastari/insuretrack-portal:latest           │
│  • ghcr.io/syahaltastari/insuretrack-admin:latest            │
│                                                              │
│  Tag strategy:                                                │
│  • :latest → rolling (di-pull Dokploy saat deploy)           │
│  • :git-<short-sha> → immutable per commit (untuk rollback)  │
└─────────────────────────────────────────────────────────────┘
                       │ HTTPS pull
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  VPS Dokploy (panel di :3000) — runtime only                │
│                                                              │
│  Service: insuretrack-stack (Compose)                       │
│  Source: docker-compose.ghcr.yml (referensi image GHCR)    │
│                                                              │
│  Containers:                                                  │
│  ├── db        (postgres:15-alpine, dari Docker Hub)         │
│  ├── backend   (ghcr.io/.../insuretrack-backend:latest)     │
│  ├── portal    (ghcr.io/.../insuretrack-portal:latest)      │
│  └── admin     (ghcr.io/.../insuretrack-admin:latest)       │
│                                                              │
│  Traefik (built-in Dokploy) route by Host header              │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
   http://api.<IP-VPS>.sslip.io      → backend
   http://portal.<IP-VPS>.sslip.io   → portal
   http://admin.<IP-VPS>.sslip.io    → admin
```

---

## 3. 3 workflow + 1 registry

### 3.1 File layout

```
.github/
├── workflows/
│   ├── ci.yml             # ① CI — tests + lint + build
│   ├── build.yml          # ② Build & Push — image ke GHCR
│   └── deploy-demo.yml    # ③ Deploy — call Dokploy API

docker-compose.ghcr.yml    # Production compose (referensi image GHCR, no build)
```

### 3.2 Trigger chain

```
git push origin main
        ↓
   ┌────────────────┐
   │  CI workflow   │ (push trigger)
   └────────────────┘
        ↓ (on success)
   ┌────────────────────┐
   │  Build workflow    │ (workflow_run trigger)
   └────────────────────┘
        ↓ (on success)
   ┌─────────────────────┐
   │  Deploy workflow   │ (workflow_run trigger)
   └─────────────────────┘
        ↓
   Dokploy API call
        ↓
   Container restart
```

Kalau salah satu gagal → chain berhenti. Image tidak di-push, deployment tidak terjadi.

### 3.3 Branch behavior

| Trigger | CI | Build | Deploy |
|---|---|---|---|
| Push ke `main` | ✅ | ✅ (kalau CI pass) | ✅ (kalau Build pass) |
| PR ke `main` | ✅ | ❌ | ❌ |
| Push ke branch lain | ❌ | ❌ | ❌ |
| Manual `workflow_dispatch` | (any) | (any) | ✅ (manual redeploy) |

---

# Bagian B — Setup awal (sekali)

## 4. Setup GitHub Secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value | Sumber |
|---|---|---|
| `DOKPLOY_URL` | `http://203.0.113.42:3000` | URL panel Dokploy VPS Anda |
| `DOKPLOY_API_KEY` | (lihat step berikut) | Generate di Dokploy panel |
| `DOKPLOY_COMPOSE_ID` | `c-xyz123abc` | Copy dari URL service di Dokploy |
| `DEPLOY_HEALTH_URL` | `http://api.203-0-113-42.sslip.io/health` | Backend health URL |
| `API_URL` | `http://api.203-0-113-42.sslip.io` | Untuk smoke test |
| `PORTAL_URL` | `http://portal.203-0-113-42.sslip.io` | Untuk smoke test |
| `ADMIN_URL` | `http://admin.203-0-113-42.sslip.io` | Untuk smoke test |

> ⚠️ Ganti `203-0-113-42` dengan IP VPS Anda yang sebenarnya.

### Cara dapat Dokploy API key

1. SSH tunnel ke Dokploy panel: `ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>`
2. Browser → `http://localhost:3000`
3. **Settings → Profile → API → Create API Key**
4. Copy value → paste ke GitHub Secret `DOKPLOY_API_KEY`

### Cara dapat Compose ID

1. Di Dokploy panel, klik service `insuretrack-stack` di env `development`
2. Lihat URL browser — format: `/project/insuretrack/environment/development/services/c-xyz123`
3. Copy bagian `c-xyz123` → paste ke GitHub Secret `DOKPLOY_COMPOSE_ID`

---

## 5. Setup GHCR packages

### 5.1 Visibility (public vs private)

Default GitHub package visibility = **inherit from repo**:
- **Public repo** → image public otomatis (siap dishare)
- **Private repo** → image private (perlu `docker login ghcr.io` di VPS)

Untuk demo, **public** OK. Kalau Anda介意 (privacy concern), ubah per-package:

1. GitHub repo → **Packages** (sidebar kanan)
2. Klik package (mis. `insuretrack-backend`)
3. **Package settings** → **Change visibility** → **Private**

### 5.2 Tidak perlu setup manual

Workflow `build.yml` sudah otomatis:
- Login ke GHCR pakai `GITHUB_TOKEN` (auto-provided)
- Push image dengan permission `packages: write`
- Tag `:latest` dan `:git-<sha>` otomatis

Anda **tidak perlu** generate API key GHCR manual. GitHub handle semua.

### 5.3 Permissions workflow

Pastikan workflow permissions di repo sudah benar:

**Settings → Actions → General → Workflow permissions:**
- ✅ **"Read and write permissions"** ← WAJIB untuk push image ke GHCR
- ✅ "Allow GitHub Actions to create and approve pull requests"

> ⚠️ Kalau permissions set ke "Read repository contents only" (default untuk beberapa org), image push ke GHCR akan **gagal diam-diam** dengan error 403 di log Actions.

---

## 6. Setup Dokploy

### 6.1 Create project + environment + service

```
Dokploy panel
├── Projects → + Create Project
│   Name: insuretrack
│
└── Project: insuretrack
    ├── Environments
    │   ├── production (auto-created, kosong — biarin)
    │   └── development ← Anda pakai ini
    │       └── Services
    │           └── + Create Service → Compose
    │               Name: insuretrack-stack
```

### 6.2 Configure Source tab

| Field | Value |
|---|---|
| Provider | **GitHub** |
| Repository | `syahaltastari/insuretrack` (atau fork Anda) |
| Branch | `main` |
| **Docker Compose File Location** | **`docker-compose.ghcr.yml`** ← penting! |
| **Base Directory** | `.` (titik — WAJIB, jangan kosong) |

> ⚠️ **KRITIS**: Docker Compose File Location harus **`docker-compose.ghcr.yml`** (bukan `docker-compose.yml`).
>
> - `docker-compose.yml` → ada `build:` keys → VPS akan compile (kembali ke masalah awal)
> - `docker-compose.ghcr.yml` → semua `image:` dari GHCR → VPS cuma pull

Save (jangan Deploy dulu — set env dulu).

### 6.3 Setup domains (HTTP only)

Tab **Domains** → **+ Add Domain** untuk tiap service:

| Domain | Container Port | HTTPS |
|---|---|---|
| `api.<IP-VPS-DASH>.sslip.io` | 8080 | ❌ Uncheck |
| `portal.<IP-VPS-DASH>.sslip.io` | 3000 | ❌ Uncheck |
| `admin.<IP-VPS-DASH>.sslip.io` | 3001 | ❌ Uncheck |

> ⚠️ sslip.io **tidak support HTTPS**. Pakai `http://` (bukan `https://`). Untuk HTTPS perlu real domain + DNS A record.
>
> Service Name (dropdown) harus match: `api.*` → `backend`, `portal.*` → `portal`, `admin.*` → `admin`.

### 6.4 Setup environment variables

Tab **Environment** → **General**:

```env
# Identitas deployment
DOMAIN=<IP-VPS-DASH>             # Mis. 203-0-113-42 (tanpa .sslip.io)
NEXT_PUBLIC_API_URL=http://api.${DOMAIN}.sslip.io

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generate: openssl rand -hex 24>
POSTGRES_DB=insuretrack
DATABASE_URL=postgres://postgres:<sama-password>@db:5432/insuretrack

# Auth
JWT_SECRET=<generate: openssl rand -hex 64>
PAYMENT_WEBHOOK_SECRET=<generate: openssl rand -hex 32>

# Public URLs
APP_BASE_URL=http://portal.${DOMAIN}.sslip.io
MEDIA_BASE_URL=http://api.${DOMAIN}.sslip.io

# WAJIB untuk Next.js SSR
BACKEND_URL=http://backend:8080

# Email (kosong = OK untuk demo)
RESEND_API_KEY=
RESEND_FROM_EMAIL=demo@insuretrack.local
RESEND_FROM_NAME=InsureTrack Demo

# Storage
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=<dari apps/backend/.env lokal>
R2_ACCESS_KEY_ID=<dari apps/backend/.env lokal>
R2_SECRET_ACCESS_KEY=<dari apps/backend/.env lokal>
R2_BUCKET=<dari apps/backend/.env lokal>
R2_ENDPOINT=<dari apps/backend/.env lokal>
R2_PUBLIC_BASE_URL=<dari apps/backend/.env lokal>

# Misc
INQUIRY_AUTO_CLOSE_DAYS=0
RUST_LOG=info,insuretrack_backend=debug
PORT=8080
```

> ⚠️ R2 credentials sensitif — masukkan via tab **Secrets** (encrypted), bukan General.

### 6.5 First deploy (manual, untuk verify setup)

Klik **Deploy** di service `insuretrack-stack`. Build pertama:
- VPS pull image dari GHCR (~30-60 detik per image, total ~2-3 menit)
- Start container, apply migrations
- Traefik route by Host

Pantau di tab **Logs** atau SSH ke VPS:
```bash
ssh ubuntu@<IP-VPS>
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs -f insuretrack_backend
```

Verify dari browser:
```bash
curl http://api.<IP>.sslip.io/health
# → {"service":"insuretrack-backend","status":"ok","version":"0.1.0"}
```

---

# Bagian C — Reference (deep dive)

## 7. CI workflow (`ci.yml`)

### 7.1 Tujuan

Menjalankan **semua test + lint + typecheck + build** sebelum code boleh lanjut ke tahap build image.

### 7.2 Jobs

| Job | Perintah | Durasi | Kegagalan blokir deploy? |
|---|---|---|---|
| `backend-tests` | `cargo test --lib` | 1-2 menit | ✅ Ya |
| `backend-integration` | `cargo test --tests` (perlu Postgres service) | 2-3 menit | ✅ Ya |
| `frontend-tests` | `pnpm install && pnpm test` | 1 menit | ✅ Ya |
| `frontend-e2e` | `pnpm exec playwright test` | 2-4 menit | ✅ Ya |
| `frontend-build` | `pnpm build` (verify TS compile) | 2-3 menit | ✅ Ya |
| `backend-lint` | `cargo fmt --check && cargo clippy` | 1 menit | ✅ Ya |

Semua job **paralel** (matrix tidak, tapi `jobs.<name>` tanpa `needs:`).

### 7.3 Trigger

- `push` ke `main` atau `dev` → full CI run
- `pull_request` ke `main` → full CI run (PR validation)
- `push` ke branch lain → no CI (saving compute)

### 7.4 File lengkap

Lokasi: `.github/workflows/ci.yml`. Lihat file untuk detail. (~80 baris)

---

## 8. Build workflow (`build.yml`)

### 8.1 Tujuan

Build 3 Docker image (backend + portal + admin) di GitHub Actions runner, push ke GHCR dengan tag `:latest` + `:git-<sha>`.

### 8.2 Trigger

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
```

Artinya:
- Trigger **setelah** workflow CI selesai di branch `main`
- Hanya lanjut kalau CI sukses (`conclusion == 'success'`)
- Bisa juga di-trigger manual via GitHub Actions UI (workflow_dispatch)

### 8.3 Matrix strategy

3 image di-build **paralel** sebagai matrix job:

```yaml
strategy:
  matrix:
    include:
      - service: backend
        context: ./apps/backend
        dockerfile: ./apps/backend/Dockerfile
      - service: portal
        context: .
        dockerfile: ./apps/portal/Dockerfile
      - service: admin
        context: .
        dockerfile: ./apps/admin/Dockerfile
```

Total time: waktu image **terlama** (biasanya backend Rust ~5 menit), bukan jumlah.

### 8.4 Cache strategy

```yaml
cache-from: type=gha,scope=${{ matrix.service }}
cache-to: type=gha,mode=max,scope=${{ matrix.service }}
```

- `cache-from` → pakai cache layer dari build sebelumnya (kalau ada)
- `cache-to` → push layer baru ke GitHub Actions cache
- `scope` per-service → cache backend tidak tercampur dengan cache portal

**Hasil:** first build 8 menit, subsequent build 2-3 menit (cache hit 80%+).

### 8.5 Image tags

| Tag | Kapan di-push | Digunakan untuk |
|---|---|---|
| `:latest` | Setiap push ke main | Production deploy (Dokploy pull ini) |
| `:git-<short-sha>` | Setiap push ke main | Rollback ke commit tertentu |

Cara lihat available tags:
```bash
docker pull ghcr.io/syahaltastari/insuretrack-backend --list-tags
# Output:
# latest
# git-a1b2c3d
# git-e4f5g6h
```

### 8.6 File lengkap

Lokasi: `.github/workflows/build.yml`. Lihat file untuk detail. (~80 baris)

---

## 9. Deploy workflow (`deploy-demo.yml`)

### 9.1 Tujuan

Trigger Dokploy API untuk redeploy setelah build sukses. Dokploy pull image baru dari GHCR, restart container.

### 9.2 Trigger

```yaml
on:
  workflow_run:
    workflows: ["Build & Push Images"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
```

Trigger via `workflow_run` setelah build sukses. Manual trigger juga bisa untuk rollback/redeploy.

### 9.3 Jobs

| Job | Apa yang dilakukan | Durasi |
|---|---|---|
| `ci-gate` | Verify build workflow sukses | 5 detik |
| `deploy` | Call Dokploy API `POST /api/compose.redeploy` | 5 detik |
| `verify` | Health check + smoke test 3 URL | 30 detik |

### 9.4 Dokploy API call detail

```yaml
- name: Trigger Dokploy redeploy
  env:
    DOKPLOY_URL: ${{ secrets.DOKPLOY_URL }}
    DOKPLOY_API_KEY: ${{ secrets.DOKPLOY_API_KEY }}
    DOKPLOY_COMPOSE_ID: ${{ secrets.DOKPLOY_COMPOSE_ID }}
  run: |
    curl -X POST "$DOKPLOY_URL/api/compose.redeploy" \
      -H "Content-Type: application/json" \
      -H "x-api-key: $DOKPLOY_API_KEY" \
      -d "{\"composeId\": \"$DOKPLOY_COMPOSE_ID\", \"title\": \"Deploy ${{ github.sha }}\"}"
```

Endpoint: `POST /api/compose.redeploy` (per [Dokploy API docs](https://docs.dokploy.com/docs/api/reference-compose))

### 9.5 Health check post-deploy

```yaml
- name: Health check
  run: |
    for i in {1..30}; do
      code=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_HEALTH_URL")
      [ "$code" = "200" ] && exit 0
      sleep 10
    done
    exit 1
```

Polling 30× setiap 10 detik (max 5 menit). Kalau `DEPLOY_HEALTH_URL` return 200 → success.

### 9.6 File lengkap

Lokasi: `.github/workflows/deploy-demo.yml`. Lihat file untuk detail. (~120 baris)

---

## 10. GHCR (image registry)

### 10.1 Apa itu GHCR

GitHub Container Registry — Docker registry bawaan GitHub, gratis untuk public repo. Alternative: Docker Hub, AWS ECR, Quay.

### 10.2 Image yang di-push

```
ghcr.io/syahaltastari/
├── insuretrack-backend    (Rust + Axum, ~150-200 MB compressed)
├── insuretrack-portal     (Next.js, ~80-120 MB compressed)
└── insuretrack-admin      (Next.js, ~80-120 MB compressed)
```

### 10.3 Auth dari Dokploy VPS

Default: image **public** (dari repo public) → VPS bisa pull tanpa login.

Untuk image **private**:
- Generate Personal Access Token di GitHub (Settings → Developer settings)
- Di VPS, `echo $TOKEN | docker login ghcr.io -u USERNAME --password-stdin`
- Simpan di `/root/.docker/config.json` (persistent)

### 10.4 Cleanup image lama (optional)

```bash
# Via GitHub CLI
gh auth login
gh api -X DELETE /user/packages/container/insuretrack-backend/versions/<version-id>
```

Atau via GitHub Packages UI → klik package → delete versions.

---

# Bagian D — Operasi harian

## 11. Daily workflow: push ke deploy

### 11.1 Happy path

```bash
# 1. Edit code di lokal
# 2. Test lokal (opsional)
pnpm test
cd apps/backend && cargo test --lib && cd ../..

# 3. Commit + push
git add .
git commit -m "feat: customer registration form validation"
git push origin main

# 4. Pantau di GitHub Actions tab (~7-15 menit)
#    CI → Build & Push → Deploy Demo
```

### 11.2 Setelah deploy sukses

Notifikasi email dari GitHub (kalau diaktifkan). Cek:
- Tab **Actions** → status hijau
- Browser ke `http://portal.<IP>.sslip.io` → running
- `http://api.<IP>.sslip.io/health` → 200

### 11.3 Kalau deploy gagal

Cek tab **Actions** → klik workflow yang merah → expand job yang gagal.

Common failure:
- **CI fail**: test/lint error → fix code → push lagi
- **Build fail**: Dockerfile error atau dependency issue → fix → push
- **Deploy fail**: Dokploy API return non-200 → cek `DOKPLOY_*` secrets → push fix

---

## 12. Monitoring & verifikasi

### 12.1 GitHub Actions monitoring

GitHub repo → tab **Actions**:
- Lihat run history (warna hijau/merah)
- Klik run → lihat log per step
- Set **notifications**: Settings → Notifications → pilih event "Workflow runs"

### 12.2 Dokploy monitoring

SSH tunnel:
```bash
ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>
# Browser → http://localhost:3000 → service → tab Logs
```

Atau langsung SSH:
```bash
ssh ubuntu@<IP-VPS>
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs -f insuretrack_backend
```

### 12.3 Smoke test (setiap deploy)

Workflow `deploy-demo.yml` otomatis smoke test via job `verify`:

```yaml
- name: Smoke test
  run: |
    for label in "Portal:$PORTAL_URL" "Admin:$ADMIN_URL" "API:$API_URL"; do
      name="${label%%:*}"; url="${label##*:}"
      code=$(curl -sS -o /dev/null -w "%{http_code}" "$url")
      [ "$code" = "200" ] && echo "✓ $name OK" || echo "::warning::$name FAILED"
    done
```

Kalau gagal, workflow exit dengan warning (tidak block) supaya tahu ada masalah tanpa halt pipeline.

---

## 13. Rollback

### 13.1 Rollback ke commit sebelumnya (cara paling cepat)

GHCR sudah punya image `:git-<short-sha>` untuk semua commit historis. Rollback = redeploy pakai image lama.

**Cara 1: Trigger redeploy pakai image lama (manual)**

```bash
# 1. Cari SHA commit yang working
git log --oneline

# 2. Update Dokploy Compose service untuk pakai tag lama
#    Edit docker-compose.ghcr.yml di repo:
#    image: ghcr.io/syahaltastari/insuretrack-backend:git-a1b2c3d  # ← sha lama
#    (sama untuk portal + admin)

# 3. Push + redeploy
git add docker-compose.ghcr.yml
git commit -m "rollback: revert to commit a1b2c3d"
git push origin main

# 4. CI → Build → Deploy jalan dengan image tag lama
```

**Cara 2: Dokploy UI manual** (kalau tidak mau commit)

1. SSH tunnel ke Dokploy panel
2. Service `insuretrack-stack` → tab **Deployments**
3. Pilih deployment history yang working → **Redeploy**

### 13.2 Rollback DB schema (jika migration baru bermasalah)

⚠️ **Destructive** — hanya untuk demo. Production harus backup dulu.

```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/insuretrack-stack

# Backup DB sebelum rollback
docker compose exec db pg_dump -U postgres insuretrack > backup-$(date +%Y%m%d).sql

# Rollback schema (drop + recreate dari backup)
docker compose exec db psql -U postgres -c "DROP DATABASE insuretrack;"
docker compose exec db psql -U postgres -c "CREATE DATABASE insuretrack;"
cat backup-*.sql | docker compose exec -T db psql -U postgres insuretrack

# Restart backend → auto-apply migrations sesuai backup
docker compose restart backend
```

---

## 14. Manual redeploy dari Dokploy UI

Kadang perlu trigger deploy tanpa push (mis. setelah ubah env vars di Dokploy):

1. SSH tunnel ke Dokploy panel
2. Service `insuretrack-stack` → klik **Redeploy**
3. Container restart dengan config baru

Atau via GitHub Actions UI (manual trigger):
1. GitHub repo → tab **Actions**
2. Pilih **Deploy Demo**
3. **Run workflow** → branch main → **Run**

---

# Bagian E — Referensi

## 15. Troubleshooting

Lihat **[TROUBLESHOOTING.md](./../operations/TROUBLESHOOTING.md)** untuk detail lengkap. Highlights khusus untuk GH Actions flow:

### 15.1 Build workflow gagal di GH Actions

**Gejala:** Tab Actions → Build & Push Images → job merah.

**Quick check:**
1. Klik job yang merah → expand step yang error
2. Lihat log error spesifik

**Common fixes:**

| Error di log | Fix |
|---|---|
| `failed to compute cache key` | Dockerfile reference path salah. Verify di lokal: `docker build -f apps/backend/Dockerfile ./apps/backend` |
| `npm error EACCES` atau permission denied | `pnpm-lock.yaml` corrupt. Hapus + `pnpm install` ulang |
| `cargo: error: linking with `cc` failed` | Rust toolchain issue. Verify di lokal: `rustc --version` ≥ 1.75 |
| `denied: permission_denied` di GHCR push | Permissions workflow belum "Read and write". Settings → Actions → General |
| `Image not found` setelah push | Tunggu 1-2 menit untuk propagation. Refresh tab Packages |

### 15.2 Deploy workflow gagal (Dokploy API error)

**Gejala:** Tab Actions → Deploy Demo → job `deploy` merah, error `HTTP 401` atau `HTTP 404`.

**Fix:**

| Error | Fix |
|---|---|
| `HTTP 401 Unauthorized` | `DOKPLOY_API_KEY` expired/salah. Generate baru di Dokploy panel → update GitHub Secret |
| `HTTP 404 Not Found` | `DOKPLOY_COMPOSE_ID` salah. Cek URL service di Dokploy |
| `Connection refused` | `DOKPLOY_URL` tidak reachable dari GH. Pakai `http://<IP>:3000` (bukan hostname kalau private) |
| `compose redeploy failed` | Dokploy panel error. Cek Dokploy logs manual |

### 15.3 Image GHCR ada tapi Dokploy tidak pull yang baru

**Gejala:** Deploy sukses tapi app tidak update. Image di GHCR `latest` sudah baru, tapi container running image lama.

**Penyebab:** Dokploy cache image pull. Image `latest` di GHCR di-overwrite, tapi Dokploy Docker daemon tidak notice.

**Fix:**
1. SSH ke VPS
2. Pull manual: `docker pull ghcr.io/syahaltastari/insuretrack-backend:latest`
3. Restart container: `docker compose restart backend` (atau trigger redeploy dari Dokploy UI)

### 15.4 Health check timeout setelah deploy

**Gejala:** Workflow `verify` timeout setelah 5 menit, padahal app sebenarnya running.

**Fix:**
1. Cek apakah `DEPLOY_HEALTH_URL` benar (literal hostname)
2. Cek apakah VPS firewall block outbound/inbound untuk health check (jarang)
3. Cek apakah Traefik route benar (cek Dokploy panel → Domains)

---

## 16. FAQ

### Kenapa pakai GHCR bukan Docker Hub?

- ✅ Gratis untuk public repo (Docker Hub juga)
- ✅ Terintegrasi GitHub Actions (no setup extra)
- ✅ GITHUB_TOKEN auto-rotate (no manual secret)
- ⚠️ Rate limit lebih ketat dari Docker Hub untuk free tier (tapi cukup untuk project kecil)

### Kenapa 3 image terpisah, bukan 1 monorepo image?

- ✅ Independent scaling (kalau nanti perlu)
- ✅ Cache lebih efisien (FE change tidak rebuild backend)
- ✅ Smaller image (FE tidak perlu Rust toolchain)
- ✅ Build paralel lebih cepat (3 GitHub runner vs 1)

### Apakah image private aman di GHCR?

✅ Ya, selama repo private. Visibility default = inherit from repo. Ganti per-package kalau perlu.

### Bagaimana kalau GitHub Actions down?

Jarang (< 99.9% uptime = < 9 jam downtime/tahun). Workaround kalau down:
- Build manual di lokal + push image ke GHCR: `docker build ... && docker push ...`
- Atau build di VPS langsung (revert ke `docker-compose.yml`)

### Apakah lebih mahal dari build lokal?

| Skenario | Biaya/bulan |
|---|---|
| Public repo, deploy < 200 menit | **$0** (free tier) |
| Public repo, deploy sering | **$0** (free tier generous) |
| Private repo, deploy < 200 menit | **$0** (free tier) |
| Private repo, deploy 500 menit | ~$2-5 (GH free tier 2000 min/bulan) |

### Berapa lama build pertama vs berikutnya?

- **First build (cold)**: 8-12 menit total (backend 5 min + FE paralel 3 min)
- **Subsequent (warm)**: 2-3 menit (GitHub Actions cache Docker layers)

### Kenapa backend lambat di build?

Rust compile semua dependency dari scratch setiap kali. Tanpa cache: 5 menit. Dengan cache: 1-2 menit. Dependency: `sqlx`, `aws-sdk-s3`, `tokio`, `reqwest`, `chrono`, dll — total ~300 crate.

### Apakah bisa pakai Docker Hub kalau mau?

✅ Bisa. Edit `.github/workflows/build.yml`:
```yaml
- name: Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}
```

Dan update `docker-compose.ghcr.yml` image prefix dari `ghcr.io/...` ke `<username>/...`.

### Apakah production perlu setup berbeda?

Ya, untuk production:
- Multi-env (staging + production)
- HTTPS (real domain + Let's Encrypt)
- Backup DB harian
- Monitoring (Sentry, Prometheus, etc)
- Rate limiting (DDoS protection)

Lihat **[DEPLOYMENT.md](./DEPLOYMENT.md)** untuk production-grade.

---

## 17. Referensi terkait

| Topik | File |
|---|---|
| Quickstart (ringkas, untuk yang sudah paham) | [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md) |
| Production deployment (HTTPS, HA, backup) | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Deep dive VPS + Dokploy + HTTP-only | [RUNBOOK_VPS_DEV.md](./RUNBOOK_VPS_DEV.md) |
| Error reference by symptom | [TROUBLESHOOTING.md](./../operations/TROUBLESHOOTING.md) |
| Docker setup detail | [DOCKER_SETUP.md](./../operations/DOCKER_SETUP.md) |
| Cloudflare R2 storage | [R2_SETUP.md](./R2_SETUP.md) |
| Application spec | `Technical Specification Document Digital Insurance v1.2.pdf` |
| OpenAPI | [openapi.yaml](./../api/openapi.yaml) |
| GitHub Actions docs | https://docs.github.com/actions |
| GHCR docs | https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry |
| Dokploy API docs | https://docs.dokploy.com/docs/api/reference-compose |

---

**Maintainer**: tim InsureTrack · **Update terakhir**: 2026-06-18
