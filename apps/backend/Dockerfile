# syntax=docker/dockerfile:1.7

# ----- Stage 1: build -----
# edition2024 stabil di Rust 1.85. Beberapa dependency (time 0.3.47,
# idna_adapter 1.2.2, dll.) membutuhkan rustc ≥ 1.88. AWS SDK crates
# (aws-config, aws-sdk-s3, aws-smithy-*) versi terbaru di-resolve dari
# crates.io butuh rustc ≥ 1.91.1. Kita pin ke 1.92 untuk margin — setiap
# kali `cargo update` menarik AWS SDK lebih baru, naikin tag ini.
FROM rust:1.92-slim-bookworm AS builder

WORKDIR /app

# Cache deps terpisah dari source agar build ulang cepat saat code berubah.
# BuildKit cache mount: registry + git di-cache ANTAR build (diperlukan
# `DOCKER_BUILDKIT=1` env, default aktif di Docker 23+). Tanpa mount,
# setiap fresh build download ~500MB crates dari crates.io ulang.
#
# PENTING: jangan mount `/app/target` ke cache — output `cargo build`
# (termasuk binary final) jadi tidak ada di image layer, dan stage
# berikutnya tidak bisa COPY. Cache registry sudah cukup karena yang
# paling lama itu download + extract crates, bukan compile.
COPY Cargo.toml Cargo.lock* ./
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked,id=cargo-git \
    mkdir -p src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/deps/insuretrack_backend*

COPY src ./src
COPY migrations ./migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked,id=cargo-git \
    cargo build --release

# ----- Stage 2: runtime -----
# Base image di-pin ke date-tag untuk reproducible build. Update tag ini
# setiap ~3-6 bulan untuk pickup security patches dari Debian (bookworm-LTS).
# Untuk cek image yang lebih baru: https://hub.docker.com/_/debian/tags
FROM debian:bookworm-20250515-slim AS runtime

# `wget` dipakai oleh healthcheck di docker-compose.yml untuk hit /health.
# Image base debian-slim tidak include util jaringan — tanpa ini healthcheck
# fail dan servis dependent (portal/admin) tidak start.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# Non-root user. Match dengan `user: "1000:1000"` di docker-compose.yml.
# UID 1000+ untuk hindari konflik dengan system users (0-999 reserved).
# `-s /sbin/nologin` = user tidak bisa login shell — service account only.
# `-r` tidak dipakai karena UID eksplisit kita pakai 1000 (bukan system range).
RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid 1000 --home /app --shell /sbin/nologin app

WORKDIR /app

COPY --from=builder /app/target/release/insuretrack-backend /usr/local/bin/insuretrack-backend
# sqlx::migrate!() resolve path "./migrations" terhadap cwd runtime.
COPY --from=builder /app/migrations ./migrations

# Direktori upload (KTP, claim files, e-policy PDF). Di-mount sebagai volume
# di docker-compose agar data persist antar restart container. Ownership
# diset ke `app` agar backend non-root bisa write.
RUN mkdir -p /var/uploads \
    && chown -R app:app /app /var/uploads
VOLUME ["/var/uploads"]

ENV PORT=8080 \
    RUST_LOG=info,insuretrack_backend=debug

EXPOSE 8080

# Metadata OCI standar — supaya image bisa di-trace via `docker inspect`
# dan terintegrasi dengan GHCR/Docker Hub UI.
LABEL org.opencontainers.image.title="insuretrack-backend" \
      org.opencontainers.image.description="InsureTrack backend API (Rust + Axum) — issuance, claims, inquiries, admin" \
      org.opencontainers.image.source="https://github.com/syahaltastari/insuretrack" \
      org.opencontainers.image.licenses="Proprietary"

# Explicit stop signal — Rust binary handle SIGTERM dengan graceful shutdown
# (drop conns, flush log). Default sudah SIGTERM, tapi eksplisit lebih jelas
# untuk orchestrator (Kubernetes, Nomad) yang respect field ini.
STOPSIGNAL SIGTERM

# HEALTHCHECK di Dockerfile adalah defense in depth — kalau image dipakai
# di luar compose (mis. `docker run` standalone), tetap ada probe.
# Compose override dengan `wget -qO-` yang sama (lihat docker-compose.yml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1 || exit 1

# Switch ke non-root user. Setelah ini, semua proses di container jalan
# sebagai uid 1000 (app), bukan root. Backend binary akan refuse operasi
# yang butuh privilege lebih tinggi (kebanyakan syscall di Rust std tidak).
USER app

CMD ["insuretrack-backend"]
