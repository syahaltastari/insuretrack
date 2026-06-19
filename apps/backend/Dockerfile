# syntax=docker/dockerfile:1.7

# Stage 1 — build (cache deps terpisah dari source; mount registry + git
# agar re-build cepat, TAPI JANGAN mount target/ — binary jadi tidak ada
# di image layer dan stage berikutnya tidak bisa COPY).
FROM rust:1.92-slim-bookworm AS builder
WORKDIR /app

# Rust 1.92: AWS SDK crates terbaru butuh rustc ≥ 1.91.1. Naikkan tag ini
# kalau `cargo update` menarik deps yang lebih baru.
COPY Cargo.toml Cargo.lock* ./
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked,id=cargo-git \
    mkdir -p src/bin \
    && echo "fn main() {}" > src/main.rs \
    && echo "// stub for dep pre-build" > src/lib.rs \
    && echo "fn main() {}" > src/bin/seed.rs \
    && cargo build --release \
    # Hapus SEMUA artifact lib + bin biar re-build pake source asli,
    # bukan metadata dari stub. `libinsuretrack_backend*` prefix `lib`
    # berbeda dari `insuretrack_backend*` jadi keduanya harus disebut.
    && rm -rf src target/release/deps/libinsuretrack_backend* target/release/deps/insuretrack_backend*

COPY src ./src
COPY migrations ./migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked,id=cargo-git \
    cargo build --release


# Stage 2 — runtime (debian slim base, date-tag untuk reproducible).
# `wget` WAJIB di-install — healthcheck di docker-compose pakai `wget` ke
# /health, dan image debian-slim tidak include util jaringan.
FROM debian:bookworm-20260518-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# Non-root uid 1000, match dengan volume ownership di docker-compose.
RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid 1000 --home /app --shell /sbin/nologin app

WORKDIR /app
COPY --from=builder /app/target/release/insuretrack-backend /usr/local/bin/insuretrack-backend
COPY --from=builder /app/migrations ./migrations

# /var/uploads di-mount sebagai volume di compose (KTP, claim docs, e-policy).
RUN mkdir -p /var/uploads && chown -R app:app /app /var/uploads
VOLUME ["/var/uploads"]

ENV PORT=8080 RUST_LOG=info,insuretrack_backend=debug
EXPOSE 8080
STOPSIGNAL SIGTERM

LABEL org.opencontainers.image.title="insuretrack-backend" \
      org.opencontainers.image.source="https://github.com/syahaltastari/insuretrack" \
      org.opencontainers.image.licenses="Proprietary"

# Defense in depth: healthcheck di Dockerfile untuk `docker run` standalone.
# Compose override dengan check yang sama.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1 || exit 1

USER app
CMD ["insuretrack-backend"]
