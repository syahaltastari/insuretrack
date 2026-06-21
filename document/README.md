# InsureTrack — Documentation

Folder ini berisi semua dokumentasi InsureTrack, dikelompokkan per domain
agar mudah dinavigasi. README ini adalah **entry point** — baca dulu sebelum
loncat ke dokumen spesifik.

> **Catatan jalur (path convention):** Semua path di bawah **relatif terhadap
> repo root** (`./document/...`). Saat membaca di GitHub dari file mana pun
> dalam folder ini, klik link akan resolve ke file target dengan benar.

---

## Struktur Folder

```
document/
├── README.md                                       ← kamu di sini
├── spec/
│   └── Technical Specification Document Digital Insurance v1.2.pdf
├── product/
│   ├── DESIGN.md
│   └── USER_JOURNEYS.md
├── contributing/
│   └── CONTRIBUTING.md
├── api/
│   ├── openapi.yaml
│   └── InsureTrack_API.postman_collection.json
├── deployment/
│   ├── DEPLOY_QUICKSTART.md
│   ├── DEPLOYMENT.md
│   ├── RUNBOOK_VPS_DEV.md
│   ├── CI_CD.md
│   └── R2_SETUP.md
└── operations/
    ├── DOCKER_SETUP.md
    └── TROUBLESHOOTING.md
```

| Folder | Isi | Untuk siapa |
| --- | --- | --- |
| `spec/` | PDF spec FS-01..FS-20 (sumber kebenaran) | Semua orang — baca dulu untuk konteks produk |
| `product/` | Design system + user journey maps | Frontend, UI/UX, QA, product manager |
| `contributing/` | Conventional commits, PR checklist | Kontributor baru, reviewer |
| `api/` | OpenAPI 3 spec + Postman collection | Backend dev, frontend integrasi API, tester API |
| `deployment/` | Deploy guide (quickstart → production → CI/CD → storage) | DevOps, maintainer VPS |
| `operations/` | Docker local + troubleshooting by symptom | Developer harian, first-responder saat ada error |

---

## "Saya ingin X → baca Y"

| Kalau kamu ingin… | Mulai dari sini |
| --- | --- |
| Memahami requirement produk (FS-01..FS-20, state machine, identifier) | [`spec/Technical Specification Document Digital Insurance v1.2.pdf`](./spec/Technical%20Specification%20Document%20Digital%20Insurance%20v1.2.pdf) |
| Tahu design system (warna, font, komponen) | [`product/DESIGN.md`](./product/DESIGN.md) |
| Memahami alur customer / admin end-to-end | [`product/USER_JOURNEYS.md`](./product/USER_JOURNEYS.md) |
| Tahu cara kontribusi & standar commit | [`contributing/CONTRIBUTING.md`](./contributing/CONTRIBUTING.md) |
| Eksplorasi API contract | [`api/openapi.yaml`](./api/openapi.yaml) atau [`api/InsureTrack_API.postman_collection.json`](./api/InsureTrack_API.postman_collection.json) |
| Deploy cepat untuk demo (IP/sslip.io) | [`deployment/DEPLOY_QUICKSTART.md`](./deployment/DEPLOY_QUICKSTART.md) |
| Deploy production-grade (HTTPS, HA, backup) | [`deployment/DEPLOYMENT.md`](./deployment/DEPLOYMENT.md) |
| Setup VPS Dev (Dokploy + HTTP-only) | [`deployment/RUNBOOK_VPS_DEV.md`](./deployment/RUNBOOK_VPS_DEV.md) |
| Tahu pipeline CI/CD (GH Actions + Dokploy) | [`deployment/CI_CD.md`](./deployment/CI_CD.md) |
| Setup Cloudflare R2 untuk storage | [`deployment/R2_SETUP.md`](./deployment/R2_SETUP.md) |
| Setup Docker di laptop lokal | [`operations/DOCKER_SETUP.md`](./operations/DOCKER_SETUP.md) |
| Debug error "ini kenapa ya?" | [`operations/TROUBLESHOOTING.md`](./operations/TROUBLESHOOTING.md) |

---

## Onboarding Path (urutan baca untuk kontributor baru)

1. [`spec/...pdf`](./spec/Technical%20Specification%20Document%20Digital%20Insurance%20v1.2.pdf) — pahami requirement produk
2. [`product/USER_JOURNEYS.md`](./product/USER_JOURNEYS.md) — pahami alur dari sisi user
3. [`product/DESIGN.md`](./product/DESIGN.md) — pahami look-and-feel + komponen UI
4. [`contributing/CONTRIBUTING.md`](./contributing/CONTRIBUTING.md) — pahami standar commit & PR
5. [`api/openapi.yaml`](./api/openapi.yaml) — pahami kontrak API
6. [`operations/DOCKER_SETUP.md`](./operations/DOCKER_SETUP.md) — setup lokal
7. Sesuai peran: deployment/* (kalau DevOps) atau product/* (kalau UI dev)

---

## Lokasi Penting di Luar `document/`

- `CLAUDE.md` (root) — code comment standard, monorepo structure, project conventions untuk AI assistant.
- `README.md` (root) — quick start Docker Compose.
- `MIGRATION.md` (root) — changelog applied migrations + monorepo refactor notes.

---

## Maintenance

Saat menambah dokumen baru:

1. Pilih **domain folder** yang sesuai (lihat tabel di atas).
2. Pakai **nama UPPER_CASE** untuk `.md` (sesuai konvensi existing).
3. Update link rujukan dari dokumen lain.
4. Update tabel "Saya ingin X → baca Y" di README ini.
