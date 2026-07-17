# Athyper deployment guide

## Profiles

Deployment is profile-driven. The source of truth is
[`config/deployment/profiles.json`](../../config/deployment/profiles.json):

- `athyper-neon` — end-user Neon application plus shared runtime server.
- `athyper-admin` — Admin Studio, tenant administration, diagnostics, and governance.
- `athyper-mesh` — integration, connector, and exchange operations.
- `athyper-server` — API, worker, and scheduler runtime.

## Linux/container deployment

Build on the target Linux host or inside the deployment container after installing dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm policy:release-boundaries
pnpm --filter @athyper/neon... build
pnpm --filter @athyper/admin... build
pnpm --filter @athyper/mesh... build
pnpm --filter @athyper/runtime-server... build
```

Run the selected profile's runtime command from `profiles.json`. Never copy `node_modules` from a
Windows workstation into Linux. Pnpm recreates dependency links for the target operating system.

## Configuration and health

Profiles declare environment-variable names only. Secret values come from the deployment secret
manager. Frontend profiles use `/` for application liveness and the server uses `/livez` and
`/readyz`; the server readiness check includes database, Redis, JWKS, and registered service
health contributors.
