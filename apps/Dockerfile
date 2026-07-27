# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS pruner
ARG APP_NAME
ARG APP_PACKAGE
WORKDIR /repo
COPY . .
RUN case "${APP_NAME}:${APP_PACKAGE}" in \
      "neon:@athyper/neon"|"mesh:@athyper/mesh"|"admin:@athyper/admin") ;; \
      *) echo "Unsupported app selection: ${APP_NAME}:${APP_PACKAGE}" >&2; exit 64 ;; \
    esac
RUN --mount=type=cache,id=athyper-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm dlx turbo@2.9.6 prune "${APP_PACKAGE}" --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=athyper-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM base AS builder
ARG APP_PACKAGE
ARG NEXT_PUBLIC_ATHYPER_DASHBOARD_PREFETCH_ENTITIES=""
ARG NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS="30"
ARG NEXT_PUBLIC_ENVIRONMENT="production"
ARG NEXT_PUBLIC_GITHUB_LOGIN_ENABLED="false"
ARG NEXT_PUBLIC_GLITCHTIP_DSN=""
ARG NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED="false"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0"
ARG NEXT_PUBLIC_SERVICE_VERSION=""
WORKDIR /repo
COPY --from=installer /repo/ ./
COPY --from=pruner /repo/out/full/ ./
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_ATHYPER_DASHBOARD_PREFETCH_ENTITIES="${NEXT_PUBLIC_ATHYPER_DASHBOARD_PREFETCH_ENTITIES}" \
    NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS="${NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS}" \
    NEXT_PUBLIC_ENVIRONMENT="${NEXT_PUBLIC_ENVIRONMENT}" \
    NEXT_PUBLIC_GITHUB_LOGIN_ENABLED="${NEXT_PUBLIC_GITHUB_LOGIN_ENABLED}" \
    NEXT_PUBLIC_GLITCHTIP_DSN="${NEXT_PUBLIC_GLITCHTIP_DSN}" \
    NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED="${NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED}" \
    NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN}" \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE}" \
    NEXT_PUBLIC_SERVICE_VERSION="${NEXT_PUBLIC_SERVICE_VERSION}"
RUN pnpm --filter "${APP_PACKAGE}" build

FROM node:24-alpine AS runner
ARG APP_NAME
ENV APP_NAME="${APP_NAME}" \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat wget
WORKDIR /app

COPY --from=builder --chown=node:node /repo/apps/${APP_NAME}/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=builder --chown=node:node /repo/apps/${APP_NAME}/public ./apps/${APP_NAME}/public
COPY --chmod=755 apps/docker-entrypoint.sh /usr/local/bin/athyper-web-entrypoint

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/livez || exit 1

USER node
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/athyper-web-entrypoint"]
