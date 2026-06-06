# syntax=docker/dockerfile:1.7

# ----- Stage 1: deps (workspace-aware) -----
# Build context harus monorepo root (lihat docker-compose.yml).
FROM node:22-alpine AS deps
WORKDIR /repo

# Enable pnpm via corepack supaya `pnpm install` paham `workspace:*`
# protocol yang dipakai di package.json monorepo ini.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Copy monorepo files yang diperlukan `pnpm install` untuk resolve
# workspace deps: root package.json, lockfile, workspace yaml, dan
# individual package.json's + .npmrc.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/portal/package.json ./apps/portal/
COPY packages ./packages

RUN pnpm install --recursive --frozen-lockfile

# ----- Stage 2: build -----
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Bring in the installed node_modules from the deps stage. pnpm with
# `node-linker=hoisted` puts everything at the root, so we mirror it
# into the workspace package's own node_modules so the framework's
# CLI scripts (`next build`) can find their binaries via local lookup.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/portal/node_modules ./apps/portal/node_modules
COPY --from=deps /repo/packages ./packages

# Copy the portal source to a temp dir, lalu move isinya
# (excluding node_modules + .next) ke /repo/apps/portal. Menghindari
# COPY yang menimpa symlinked node_modules dari deps stage.
COPY apps/portal /tmp/portal-src
WORKDIR /tmp/portal-src
RUN find . -maxdepth 1 -mindepth 1 ! -name node_modules ! -name .next -exec cp -r {} /repo/apps/portal/ \;
WORKDIR /repo/apps/portal

# Build-time env (NEXT_PUBLIC_* disuntik saat build).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm run build

# ----- Stage 3: runtime -----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_PUBLIC_API_URL=http://localhost:8080/api

# nextjs user untuk run app sebagai non-root.
RUN adduser --system --uid 1001 --ingroup node nextjs

# Salin hasil standalone build Next.js.
COPY --from=builder /repo/apps/portal/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/static ./.next/static

# The standalone output contains symlinks under node_modules/ that point
# into the builder's filesystem. Those don't exist in the runtime image,
# so the symlinks dangle and `Cannot find module 'next'` at boot. Fix:
# blow away the symlink dir and replace with the resolved packages.
USER root
RUN rm -rf /app/node_modules
COPY --from=deps --chown=nextjs:nodejs /repo/node_modules /app/node_modules
COPY --from=deps --chown=nextjs:nodejs /repo/apps/portal/node_modules /app/node_modules_tmp
RUN cp -al /app/node_modules_tmp/. /app/node_modules/ && rm -rf /app/node_modules_tmp
USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
