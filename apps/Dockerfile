FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY server ./server
COPY tools ./tools
COPY tsconfig.json ./

ARG APP_PACKAGE
ARG APP_NAME
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "${APP_PACKAGE}" build

FROM node:24-alpine AS runtime
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
