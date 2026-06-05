# syntax=docker/dockerfile:1.7

# ----- Stage 1: deps (workspace-aware) -----
# Build context must be the monorepo root (see docker-compose.yml).
FROM node:22-alpine AS deps
WORKDIR /repo

# Enable pnpm via corepack so `pnpm install` understands the `workspace:*`
# protocol used in this monorepo's package.json files.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Copy the full monorepo files needed for `pnpm install` to resolve
# workspace deps: root package.json, lockfile, workspace yaml, and the
# individual package.json's + .npmrc.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY frontend/package.json frontend/.npmrc ./frontend/
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
COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
COPY --from=deps /repo/packages ./packages

# Copy the frontend source to a temp dir, then move the contents
# (excluding node_modules + .next) into /repo/frontend. This avoids
# the COPY trying to overwrite the symlinked node_modules from the
# deps stage.
COPY frontend /tmp/frontend-src
WORKDIR /tmp/frontend-src
RUN find . -maxdepth 1 -mindepth 1 ! -name node_modules ! -name .next -exec cp -r {} /repo/frontend/ \;
WORKDIR /repo/frontend

# Build-time env (NEXT_PUBLIC_* disuntikkan saat build).
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
COPY --from=builder /repo/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/static ./.next/static

# The standalone output contains symlinks under node_modules/ that point
# into the builder's filesystem (e.g. /repo/frontend/node_modules/...).
# Those don't exist in the runtime image, so the symlinks dangle and
# `Cannot find module 'next'` at boot. Fix: blow away the symlink dir
# and replace with the resolved packages from the deps stage — both
# the root (root devDeps) and the frontend workspace (its specific deps
# like next, react, @insuretrack/*).
USER root
RUN rm -rf /app/node_modules
COPY --from=deps --chown=nextjs:nodejs /repo/node_modules /app/node_modules
COPY --from=deps --chown=nextjs:nodejs /repo/frontend/node_modules /app/node_modules_tmp
# Merge frontend-specific packages into the runtime node_modules. We use
# `cp -al` (archive + hardlink) so we don't blow up image size; if a
# package exists in both, the workspace one wins.
RUN cp -al /app/node_modules_tmp/. /app/node_modules/ && rm -rf /app/node_modules_tmp
USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
