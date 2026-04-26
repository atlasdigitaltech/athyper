# syntax=docker/dockerfile:1.7
#
# F8 Phase 3 — containerised Next.js for staging/production.
# Option B (host for local dev; this image is for the stack). See
# docs/guides/stack-port-hardening.md and the infra review F8 entry.
#
# Multi-stage:
#   deps    — pnpm install across the full workspace (monorepo build needs
#             every workspace package.json resolved)
#   build   — `pnpm --filter @athyper/web build` → .next/standalone + .next/static
#   runner  — minimal node:alpine image, just the standalone server.js + static
#
# Image size target: < 200 MB. Achieved by using Next.js `output: "standalone"`
# in next.config.mjs — the standalone bundle includes only the node_modules
# actually imported at runtime (traced), not the full monorepo install.
#
# Build:  docker build -f apps/web/Dockerfile -t athyper-neon-web:local .
#         (context = monorepo root — Next's file tracing needs the workspace)
# Run:    via stack/compose/apps/athyper-apps.yml → service athyper-neon-web
#
# Note on cache: COPY . . invalidates the deps layer whenever any source file
# changes. An install-layer-optimised variant would pre-copy only package.json
# files and the lockfile — deferred, since build speed is not a current pain
# point and the simple path is easier to maintain across workspace layout churn.

# ── Base ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
# libc6-compat: some native deps (sharp, etc.) expect glibc symbols
RUN apk add --no-cache libc6-compat
# pnpm via corepack — pinned to match packageManager in root package.json
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# ── Stage: deps + build ──────────────────────────────────────────────────
FROM base AS build
WORKDIR /repo

# Copy the full workspace. .dockerignore excludes node_modules, .next, dist,
# and other build artefacts so the layer is only the committed source.
COPY . .

RUN pnpm install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @athyper/web build

# ── Stage: runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

# wget for the compose healthcheck; libc6-compat mirrors the build stage so
# native deps load at runtime too.
RUN apk add --no-cache libc6-compat wget

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone bundle structure:
#   /repo/apps/web/.next/standalone/apps/web/server.js     ← entrypoint
#   /repo/apps/web/.next/standalone/node_modules/...        ← traced deps
# Static assets + public/ are NOT in standalone; copy them alongside.
# The `node` user (uid 1000) ships with node:alpine.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public           ./apps/web/public

USER node
EXPOSE 3000

# Compose healthcheck is the authoritative liveness probe (see
# stack/compose/apps/athyper-apps.yml). A Dockerfile HEALTHCHECK would be
# silently overridden by any compose healthcheck stanza, so we do not
# declare one here — keeps the liveness contract in one place.

CMD ["node", "apps/web/server.js"]
