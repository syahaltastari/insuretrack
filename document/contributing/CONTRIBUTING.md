# Contributing — InsureTrack

Panduan kontribusi untuk repository **InsureTrack** (Digital Insurance Platform).
Sebelum mengirim pull request, baca dokumen spesifikasi teknis
(`Technical Specification Document Digital Insurance v1.2.pdf`) dan
`document/product/DESIGN.md` untuk konsistensi API, status state machine, dan design system.

---

## Commit Message Standard (Conventional Commits)

Project ini mengikuti [**Conventional Commits 1.0**](https://www.conventionalcommits.org/).
Standard ini memungkinkan changelog otomatis, semantic versioning, dan
riwayat commit yang mudah ditelusuri.

### Format

```
<type>(<scope>): <deskripsi singkat>

<body — paragraf penjelasan (opsional)>

<footer — referensi issue, breaking change, co-author>
```

### Panjang baris

- Subject line: **maks 72 karakter** (di luar prefix `type(scope):`)
- Body: maksimal 100 karakter per baris (bisa di-wrap)
- Gunakan tense **imperatif present** ("tambah", "perbaiki"), bukan past tense

---

## Tipe Commit (`<type>`)

| Tipe | Dipakai untuk | Contoh |
| --- | --- | --- |
| `feat` | Fitur baru yang **ditambah** ke aplikasi | `feat(admin): tambah CRUD klien & testimoni` |
| `fix` | **Perbaikan bug** (bukan sekadar rapikan kode) | `fix(public): logo_url kembali 404 saat path absolut` |
| `refactor` | Restrukturisasi kode **tanpa ubah behavior** | `refactor(repo): pisahkan query builder` |
| `perf` | Peningkatan **performa** | `perf(policy): cache lookup product` |
| `docs` | Perubahan **dokumentasi saja** (README, CLAUDE.md, dsb) | `docs: tambah commit guidelines` |
| `test` | Tambah/ubah **test saja** (no production code change) | `test(claim): uji state machine` |
| `chore` | Tooling, dependency, config yang **tidak memengaruhi runtime** | `chore(deps): bump axum ke 0.8` |
| `build` | Perubahan **build system** / Docker / CI | `build(ci): tambah cache cargo registry` |
| `ci` | Perubahan khusus pipeline CI | `ci: jalankan cargo clippy di PR` |
| `style` | **Formatting** saja (whitespace, semicolon) — no logic change | `style: format dengan rustfmt` |
| `revert` | Revert commit sebelumnya | `revert: feat(admin) tambah klien` |

### Scope (opsional tapi direkomendasikan)

Gunakan nama modul/area agar langsung jelas. Disarankan dari daftar ini:

| Scope | Area |
| --- | --- |
| `auth` | Login, JWT, role, password reset |
| `admin` | Admin back office (registrations, invoices, policies, klaim, inquiry) |
| `customer` | Customer portal |
| `public` | Public landing page, registration, payment webhook |
| `clients` | Marketing: klien korporat (B2B) |
| `testimonials` | Marketing: testimoni customer |
| `marketing` | Marketing service shared logic |
| `db` / `migration` | Skema database, sqlx migration |
| `pdf` | E-policy PDF renderer |
| `email` | Email service, email_logs |
| `ui` | Frontend komponen/layout |
| `api` | Backend umum (config, error, state) |
| `docker` | docker-compose, Dockerfile |
| `docs` | Markdown documentation |
| `deps` | Dependency update |

Boleh tambahkan scope lain jika masuk akal; **scope harus singkat, lowercase, tanpa spasi.**

---

## Subject (judul)

- **Imperatif, present tense**: "tambah", "perbaiki", "hapus" (bukan "ditambah", "added", "fixes")
- **Huruf kecil di awal** (kecuali nama proper, mis. "InsureTrack", "PostgreSQL")
- **Tanpa titik di akhir**
- Jelaskan **apa** yang berubah, bukan **bagaimana**
- Gunakan bahasa Indonesia untuk konsistensi dengan komentar kode dan seed

**Baik:**
```
feat(clients): tambah upload logo via admin UI
fix(public): kurangi duplikasi path di logo_url
```

**Buruk:**
```
feat(clients): Added a new feature for uploading logos to the admin UI. 
fix: fixed the bug.
```

---

## Body (opsional)

Sertakan body jika perlu menjelaskan **mengapa** (why), bukan **apa** (what — sudah
dijelaskan di subject). Wrap body di ~72 karakter per baris.

```
feat(clients): tambah upload logo via admin UI

Logo disimpan di ${UPLOAD_DIR}/clients/{uuid}/{filename} dengan
validasi mime (jpg/png/webp/svg) dan batas 2 MB. Path relatif agar
URL publik portabel antar environment.
```

Pisahkan paragraf dengan baris kosong. Bullet `-` diizinkan untuk poin-poin.

---

## Footer

### Referensi issue

```
fix(public): kurangi duplikasi path di logo_url

Closes #42
Refs #18
```

### Breaking change

Jika commit **mengganti behavior** atau **menghapus API**, pakai `BREAKING CHANGE:`
di footer (atau `!` setelah type/scope — lihat di bawah).

```
refactor(api)!: ganti response shape invoice

BREAKING CHANGE: field `invoice.due_at` diganti jadi `due_date`.
Frontend harus update dalam 1 rilis.
```

Atau shorthand `!` di subject:

```
refactor(api)!: ganti response shape invoice
```

### Co-author

Cantumkan kontributor lain (termasuk AI assistant) di footer:

```
feat(clients): tambah carousel auto-slide

Co-Authored-By: Syahal Tastari <syahal@example.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

> **AI-assisted commit**: repo ini kadang dikembangkan dengan bantuan AI.
> Cantumkan co-author AI di footer (lihat `Claude Code` /
> `Anthropic SDK` convention) — **jangan disembunyikan**.

---

## Contoh Lengkap

### Fitur baru (feat)
```
feat(testimonials): tambah form CRUD dengan rating bintang

- Form input mencakup rating interaktif 1-5, policy_type, featured
  toggle, dan upload foto opsional.
- Halaman admin baru di /admin/testimonials.
- Endpoint publik /api/public/testimonials mengirim photo_url absolut.

Refs: spec §15 (Marketing collateral)
```

### Bug fix
```
fix(public): logo_url duplikasi path untuk seed absolut

Seed migration 0005 menulis logo_path dengan prefix `/var/uploads/...`
(host-specific). Helper `to_public_upload_url` sekarang menstrip prefix
`UPLOAD_DIR` absolut maupun relatif agar URL jadi portabel.

Tambah migration 0006 untuk hapus baris seed klien (file placeholder
tidak ada di disk; admin input data asli via UI).
```

### Refactor
```
refactor(config): pisahkan media_base_url dari app_base_url

`APP_BASE_URL` sebelumnya dipakai untuk link email (perlu ke frontend
port 3000) dan URL aset (perlu ke backend port 8080). Tambah
`MEDIA_BASE_URL` env var dengan fallback ke `APP_BASE_URL` agar
deployment production tidak konflik.
```

### Docs
```
docs: tambah CONTRIBUTING.md dengan standar Conventional Commits
```

---

## PR Title & Body

PR title **wajib** mengikuti format conventional commit yang sama dengan
commit pertama. PR body harus menyertakan:

1. **Ringkasan** — 1-3 kalimat tentang apa & mengapa
2. **Perubahan utama** — bullet list
3. **Cara test** — langkah reproduksi / smoke test
4. **Screenshot / curl** (jika UI atau endpoint berubah)
5. **Breaking change** (jika ada)
6. **Issue reference** — `Closes #XX` / `Refs #XX`

---

## Sanity Check Sebelum Commit

- [ ] Subject ≤ 72 karakter, lowercase, imperatif, tanpa titik akhir
- [ ] Type benar (`feat` / `fix` / `refactor` / `chore` / dst)
- [ ] Scope dari daftar di atas (atau jelaskan jika baru)
- [ ] Body menjelaskan **mengapa**, bukan **apa**
- [ ] Breaking change ditandai `!` atau footer `BREAKING CHANGE:`
- [ ] Issue direferensikan (`Closes #X` / `Refs #X`)
- [ ] Co-author AI (jika applicable) dicantumkan
- [ ] `cargo check` / `npm run build` lulus (lihat CLAUDE.md §*Verifikasi*)
- [ ] Tidak ada secret / credential di-commit (lihat `.env.example`)

---

## Tools Pendukung

- **commitlint** + **husky** (Node) — validasi format commit hook lokal
- **release-please** / **standard-version** — generate changelog otomatis
  dari conventional commits
- **commitizen** (`npx cz`) — wizard interaktif untuk commit message

Setup commitlint di repo (opsional, di luar scope PR ini):

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky
npx husky init
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```
