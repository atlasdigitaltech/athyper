# Phase 7 — Deployment profiles

Deployment profiles are defined in `config/deployment/profiles.json`:

- `athyper-neon`
- `athyper-studio`
- `athyper-mesh`
- `athyper-server`

Each profile declares its entry package, product packages, shared package requirements, server
services, environment-variable contract, Linux/container build command, runtime command, and
health checks.

Builds must run after `pnpm install` in the target Linux environment or deployment container:

```text
pnpm --filter @athyper/neon... build
pnpm --filter @athyper/studio... build
pnpm --filter @athyper/mesh... build
pnpm --filter @athyper/runtime-server... build
```

The profile file is declarative. It contains variable names, not secret values. Secrets are
provided by the deployment environment or secret manager.

Profile validation is available through:

```text
pnpm policy:deployment-profiles
```

Server endpoint registration and profile availability are recorded separately
in `config/deployment/server-capabilities.json`. Every capability must publish a
boolean assertion for every deployment profile. A `false` assertion means the
profile alone does not guarantee the capability's runtime prerequisites; it
does not override the capability's registration state.

Capability validation is available through:

```text
pnpm policy:server-capabilities
```
