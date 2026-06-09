# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @athyper/mesh build

FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat wget

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /repo/apps/mesh/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/mesh/.next/static ./apps/mesh/.next/static
COPY --from=build --chown=node:node /repo/apps/mesh/public ./apps/mesh/public

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/livez || exit 1

USER node
EXPOSE 3000

CMD ["node", "apps/mesh/server.js"]
