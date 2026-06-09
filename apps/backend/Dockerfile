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
FROM debian:bookworm-slim AS runtime

# `wget` dipakai oleh healthcheck di docker-compose.yml untuk hit /health.
# Image base debian-slim tidak include util jaringan — tanpa ini healthcheck
# fail dan servis dependent (portal/admin) tidak start.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/insuretrack-backend /usr/local/bin/insuretrack-backend
# sqlx::migrate!() resolve path "./migrations" terhadap cwd runtime.
COPY --from=builder /app/migrations ./migrations

# Direktori upload (KTP, claim files, e-policy PDF). Di-mount sebagai volume
# di docker-compose agar data persist antar restart container.
RUN mkdir -p /var/uploads
VOLUME ["/var/uploads"]

ENV PORT=8080 \
    RUST_LOG=info,insuretrack_backend=debug

EXPOSE 8080

CMD ["insuretrack-backend"]
