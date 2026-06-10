# syntax=docker/dockerfile:1.7
# =============================================================================
# Portal Next.js (customer surface) — production image.
#
# Build context = monorepo root (lihat docker-compose.yml).
# Root .dockerignore exclude node_modules/target/.next/dokumen — tanpa ini,
# build context ratusan MB dan Next.js standalone hang di "Collecting build
# traces" karena harus scan symlink pnpm yang rumit.
#
# Tahapan:
#   1. deps    — `pnpm install` semua workspace deps (source-free → cacheable)
#   2. builder — copy source + run `next build` (output: "standalone")
#   3. runner  — image runtime minimal, non-root, hanya artifact yang dibutuhkan
# =============================================================================

ARG NODE_VERSION=22.22.3-alpine
ARG PNPM_VERSION=10.15.0


# ----- 1. deps ---------------------------------------------------------------
# Layer tanpa source app: hanya manifest + lockfile. Cache hit selama
# dependensi tidak berubah → rebuild cepat saat code Next.js berubah.
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

# corepack mengaktifkan pnpm sesuai `packageManager` di root package.json
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy SEMUA manifests. pnpm butuh semua package.json di workspace untuk
# resolve lockfile dan graph. .dockerignore root sudah exclude node_modules
# dan folder berat lain.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY apps/portal/package.json ./apps/portal/
COPY apps/admin/package.json ./apps/admin/
COPY packages ./packages

# `--frozen-lockfile`: fail kalau lockfile drift (bukan silent update). Paksa
# dev regenerate via `pnpm install` di host.
# BuildKit cache mount untuk pnpm store — speed up re-build saat deps berubah.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# pnpm dengan `node-linker=hoisted` menaruh third-party deps di root
# `node_modules` (flat), tapi TIDAK otomatis symlink workspace packages
# (`@insuretrack/*`) ke sana. Tanpa symlink ini, pnpm sub-command & Next.js
# tidak bisa resolve `@insuretrack/api-client`, `@insuretrack/forms`,
# `@insuretrack/ui`. Bikin manual dari `/repo/packages/*/`.
RUN mkdir -p /repo/node_modules/@insuretrack && \
    for pkg in /repo/packages/*/; do \
      name=$(basename "$pkg"); \
      ln -s "$pkg" "/repo/node_modules/@insuretrack/$name"; \
    done


# ----- 2. builder ------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# node_modules & packages source dari deps stage (pakai cache — tidak di-bake
# permanen ke image layer).
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages

# Workspace manifest + npm config HARUS ada di builder — pnpm detect workspace
# root via `pnpm-workspace.yaml` di cwd ancestor. Tanpa ini, `pnpm run build`
# error `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.
COPY package.json pnpm-workspace.yaml .npmrc ./

# Copy source app yang relevan. .dockerignore root sudah exclude node_modules
# dan .next, jadi COPY langsung aman (tidak ada overwrite symlink).
COPY apps/portal ./apps/portal
COPY apps/admin ./apps/admin

# Build-time env (NEXT_PUBLIC_* di-bake ke bundle client).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo/apps/portal
RUN pnpm run build


# ----- 3. runner -------------------------------------------------------------
# Image runtime seminimal mungkin, non-root, hanya files yang Next.js
# standalone butuhkan. Standalone preserve project path
# (`.next/standalone/apps/portal/server.js`).
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs || true \
    && adduser --system --uid 1001 --ingroup nodejs nextjs || true

# Standalone output — copy subtree agar `node server.js` dari WORKDIR /app
# menemukan /app/server.js (bukan /app/apps/portal/server.js).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/standalone/apps/portal ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/public ./public

# Replace partial node_modules di standalone dengan full set dari deps stage.
# `cp -aL` dereferences symlinks pnpm (`pkg -> .pnpm/...`) menjadi real
# files di /app/node_modules — symlink path yang asalnya di build stage jadi
# dangling di runtime tanpa langkah ini.
COPY --from=deps --chown=nextjs:nodejs /repo/packages /app/packages
COPY --from=deps /repo/node_modules /tmp/deps-node_modules
# Hapus symlink workspace package dari deps stage (point ke /repo/packages/*
# yang tidak ada di runner). Akan kita re-create di bawah, menunjuk ke
# /app/packages/* yang sudah di-copy di atas.
RUN rm -rf /tmp/deps-node_modules/@insuretrack \
    && cp -aL /tmp/deps-node_modules/. /app/node_modules/ \
    && rm -rf /tmp/deps-node_modules \
    && mkdir -p /app/node_modules/@insuretrack \
    && for pkg in /app/packages/*/; do \
         name=$(basename "$pkg"); \
         ln -s "$pkg" "/app/node_modules/@insuretrack/$name"; \
       done

USER nextjs
EXPOSE 3000

# Metadata OCI standar — supaya image bisa di-trace via `docker inspect`
# dan terintegrasi dengan GHCR/Docker Hub UI.
LABEL org.opencontainers.image.title="insuretrack-portal" \
      org.opencontainers.image.description="InsureTrack customer self-service portal (Next.js 15)" \
      org.opencontainers.image.source="https://github.com/syahaltastari/insuretrack" \
      org.opencontainers.image.licenses="Proprietary"

# Explicit stop signal — Next.js standalone handle SIGTERM dengan graceful
# shutdown. Default sudah SIGTERM, tapi eksplisit lebih jelas untuk
# orchestrator (Kubernetes, Nomad) yang respect field ini.
STOPSIGNAL SIGTERM

# HEALTHCHECK pakai threshold < 400 (2xx & 3xx pass, 4xx & 5xx fail).
# Threshold lama < 500 PASSED pada 404 — artinya container dianggap healthy
# walau app broken. Sekarang fail pada client error & server error.
# Compose override dengan check yang sama (lihat docker-compose.yml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
