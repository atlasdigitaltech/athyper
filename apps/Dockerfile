# syntax=docker/dockerfile:1.7
FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS build

WORKDIR /workspace
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY server ./server
COPY tooling ./tooling
COPY tsconfig.json ./

RUN --mount=type=cache,id=athyper-app-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

ARG APP_PACKAGE
ARG APP_NAME
COPY governance/config ./governance/config
RUN pnpm --filter "${APP_PACKAGE}" build

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Package managers are build-time tools and otherwise add avoidable runtime CVEs.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/public ./apps/${APP_NAME}/public

USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP_NAME}/server.js"]
