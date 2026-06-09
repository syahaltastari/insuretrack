# syntax=docker/dockerfile:1.7
# =============================================================================
# Admin Next.js (backoffice surface) — production image.
#
# Pattern identik dengan apps/portal/Dockerfile — port 3001, otherwise sama.
# Lihat portal Dockerfile untuk komentar mendetail per stage.
# =============================================================================

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=10.15.0


# ----- 1. deps ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY apps/portal/package.json ./apps/portal/
COPY apps/admin/package.json ./apps/admin/
COPY packages ./packages

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# pnpm `node-linker=hoisted` tidak auto-symlink workspace packages — buat
# manual. Lihat apps/portal/Dockerfile untuk penjelasan.
RUN mkdir -p /repo/node_modules/@insuretrack && \
    for pkg in /repo/packages/*/; do \
      name=$(basename "$pkg"); \
      ln -s "$pkg" "/repo/node_modules/@insuretrack/$name"; \
    done


# ----- 2. builder ------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages

# Workspace root files — wajib untuk pnpm detect workspace di subdir.
COPY package.json pnpm-workspace.yaml .npmrc ./

COPY apps/portal ./apps/portal
COPY apps/admin ./apps/admin

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo/apps/admin
RUN pnpm run build


# ----- 3. runner -------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs || true \
    && adduser --system --uid 1001 --ingroup nodejs nextjs || true

# Standalone output preserve project path
# (`.next/standalone/apps/admin/server.js`).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/standalone/apps/admin ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/public ./public

# Replace partial node_modules di standalone dengan full set, deref symlinks.
# Hapus symlink @insuretrack/* dari deps (point ke /repo/packages/* yang
# tidak ada di runner), re-create yang point ke /app/packages/*.
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
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3001/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
