# Governance and control plane readiness

Governance and common control persistence is selected only from the verified request plane. Studio, Neon, and Mesh use separate PostgreSQL adapters even when tenant and record identifiers are identical. A missing or unhealthy adapter is never replaced by another plane.

## Readiness checks

The platform host publishes independent contributions for every plane:

| Contribution | Verifies |
| --- | --- |
| `governance.studio`, `governance.neon`, `governance.mesh` | The exact plane can query `governance.channel_consent`. |
| `control.studio.cycle-config`, `control.neon.cycle-config`, `control.mesh.cycle-config` | The exact plane can query `control.cycle_template_revision`. |

A missing adapter is reported as unhealthy with an unavailable message for that contribution. A failed probe marks only its own contribution unhealthy; healthy plane contributions remain healthy and traffic is not redirected.

## Request and worker errors

- A missing exact-plane repository throws `GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE` or `CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE` with HTTP status metadata `503` and the requested `planeKey`.
- A transaction supplied to consent or moderation must carry the same exact-plane brand as the request. Missing or mismatched brands fail before repository SQL.
- Report-pack jobs require `execution.planeKey`; jobs without it fail with `GOVERNANCE_EXACT_PLANE_REQUIRED` instead of selecting a default database.
- Finance close readiness is evaluated only for Neon. A Studio or Mesh governance cycle with a finance coordinate reports `finance_readiness_source_unavailable` and is not routed to Neon.

## Qualification

Run the static and unit gates:

```text
pnpm test:policy
pnpm --filter @athyper/server-platform-governance test
pnpm --filter @athyper/server-platform-control-admin test
pnpm --filter @athyper/server-platform-host test
```

Run all three live PostgreSQL plane suites with the required application roles and database URLs:

```text
pnpm test:service-postgres
```

Local environments may use `pnpm test:service-postgres:local`; required CI must use the non-skipping command.
