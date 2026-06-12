# syntax=docker/dockerfile:1.7
# =============================================================================
# Portal Next.js (customer surface) — production image.
# Build context = monorepo root (lihat docker-compose.yml). Root .dockerignore
# exclude node_modules/target/.next/document — tanpa ini, build context
# ratusan MB dan Next.js standalone hang di "Collecting build traces".
# =============================================================================

ARG NODE_VERSION=22.22.3-alpine
ARG PNPM_VERSION=10.15.0


# Stage 1 — deps (install workspace deps, source-free → cacheable).
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# pnpm butuh SEMUA package.json di workspace untuk resolve lockfile.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY apps/portal/package.json ./apps/portal/
COPY apps/admin/package.json ./apps/admin/
COPY packages ./packages

# --frozen-lockfile: fail kalau lockfile drift (bukan silent update).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# pnpm `node-linker=hoisted` tidak auto-symlink workspace packages ke
# `node_modules/@insuretrack/*`. Tanpa symlink, Next.js tidak bisa resolve
# `@insuretrack/api-client`, `@insuretrack/forms`, `@insuretrack/ui`.
RUN mkdir -p /repo/node_modules/@insuretrack && \
    for pkg in /repo/packages/*/; do \
      name=$(basename "$pkg"); \
      ln -s "$pkg" "/repo/node_modules/@insuretrack/$name"; \
    done


# Stage 2 — builder (copy source + `next build` dengan output: "standalone").
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages

# Workspace manifest HARUS di-COPY — pnpm detect workspace root via
# `pnpm-workspace.yaml` di cwd ancestor. Tanpa ini, `pnpm run build`
# error `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/portal ./apps/portal
COPY apps/admin ./apps/admin

# Build-time env — NEXT_PUBLIC_* di-bake ke client bundle.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo/apps/portal
RUN pnpm run build


# Stage 3 — runner (image runtime minimal, non-root, hanya file yang
# Next.js standalone butuhkan. Standalone preserve project path:
# `.next/standalone/apps/portal/server.js`).
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs || true \
    && adduser --system --uid 1001 --ingroup nodejs nextjs || true

# Standalone output di-copy ke /app agar `node server.js` resolve relatif.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/standalone/apps/portal ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/public ./public

# Replace partial node_modules standalone dengan full set dari deps stage.
# `cp -aL` dereferences symlink pnpm (`pkg -> .pnpm/.../pkg`) jadi real
# files — symlink path yang ada di build stage jadi dangling di runtime
# tanpa langkah ini. Symlink workspace package di-recreate point ke
# /app/packages/* (bukan /repo/packages/* yang tidak ada di runner).
COPY --from=deps --chown=nextjs:nodejs /repo/packages /app/packages
COPY --from=deps /repo/node_modules /tmp/deps-node_modules
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
STOPSIGNAL SIGTERM

LABEL org.opencontainers.image.title="insuretrack-portal" \
      org.opencontainers.image.source="https://github.com/syahaltastari/insuretrack" \
      org.opencontainers.image.licenses="Proprietary"

# Threshold < 400 (2xx & 3xx pass). Threshold lama < 500 meloloskan 404
# sehingga container dianggap healthy walau app broken.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
