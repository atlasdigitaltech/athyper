FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY server ./server
COPY tools ./tools
COPY tooling ./tooling
COPY tsconfig.json ./

ARG APP_PACKAGE
ARG APP_NAME
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "${APP_PACKAGE}" build

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ARG APP_NAME
ENV APP_NAME=${APP_NAME}

COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=build --chown=node:node /workspace/apps/${APP_NAME}/public ./apps/${APP_NAME}/public

USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP_NAME}/server.js"]
