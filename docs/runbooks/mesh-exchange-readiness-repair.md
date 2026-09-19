# MESH exchange readiness repair — 2026-09-06

## Confirmed cause and outcome

Inspected development container `athyper-dev-db-1`, database `athyper_mesh`, and checked effective privileges using `SET LOCAL ROLE athyper_runtime`.

Before repair:

- `mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid)` existed; schema USAGE and function EXECUTE were available to the application role.
- `mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid)` was absent.
- The G3 relationship-kind, capability and registration-exchange tables were absent.
- `mesh.business_partner_exchange.read`, `.relationship`, and `.registration` were all absent from the permission catalog.

This was confirmed schema/seed drift, not merely an incorrect permission count.

Applied `server/db/migrations/20260906_mesh_exchange_readiness.sql` to development after transaction-rollback rehearsals and PostgreSQL regression tests. The migration preserves existing relationship kinds, creates the missing G3 foundation with its constraints, command enforcement, RLS and application grants, and publishes the three required permissions and tenant scopes. Existing relationship rows were not rewritten or deleted. No principal-role assignments or user permission grants were added.

The repair and migration-ledger entry committed together. SHA256:

```text
116b4d4a28d46b83a67c5e11a65c6e3b24f4aa4073cfeaccf46f5182ff8f7692
```

All five requirements now report `ready` under `athyper_runtime`. The deployed `/readyz` response reports `business-partner-network-exchange.mesh: {status: "healthy"}`. Overall readiness remains unhealthy because the deployed version still has the tenantless `business-partner-case-age.neon` collector; that separate application fix has not been deployed.

## Application changes

`mesh-exchange-readiness.ts` checks exact function signatures, schema USAGE, effective-role EXECUTE, and each of the three published permission codes. Additional permission codes do not affect readiness. Failure messages identify fixed requirement names and states (`missing`, `execute_denied`, `unpublished`); unexpected database errors return a sanitized inspection-failure message.

Permission catalog RLS hides unpublished permissions from the application role. In that case an unpublished permission is reported as `missing`, meaning missing from the role's visible catalog. It still correctly fails readiness. An administrator can distinguish absence from lifecycle status through a direct catalog inspection.

The canonical reference seed assertion also uses exact permission requirements rather than requiring exactly three prefix matches. Application changes are local and require the next API build/deployment.

## Migration behavior

The MESH forward-migration manifest includes the repair. A baseline with all three G3 tables and the registration command already present skips the schema creation block and reconciles the three permission seeds. A partially present G3 schema is rejected for explicit reconciliation; the migration does not guess how to repair it. Lock/statement timeouts and a transaction prevent partial application. The standard checksum ledger prevents a previously applied migration from being silently changed or rerun.

Existing development acceptance fixtures had non-commercial relationship kinds. The initial rehearsal caught these before commit; the migration preserves their existing kind values in the new reference catalog before adding foreign keys. Constraint conflicts on other environments fail atomically instead of deleting or rewriting data.

## Validation

- Nine unit cases cover every missing requirement, execution denial, unpublished status, extra permissions, and sanitized query failures.
- One opt-in PostgreSQL regression rehearses the real migration inside a rolled-back transaction and runs the actual generated requirement query as `athyper_runtime`. It verifies success with an additional **published** permission, failure with a suspended required permission, failure with a revoked execution grant, and failure with a missing function.
- The PostgreSQL regression passed both before repair and after repair, exercising both the creation and already-present schema paths. Temporary status, grant and function-name changes were rolled back.
- Platform-host TypeScript check passed.

Run the targeted suites:

```sh
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/mesh-exchange-readiness.test.ts
MESH_READINESS_TEST_DOCKER=athyper-dev-db-1 pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/mesh-exchange-readiness.postgres.test.ts
```

The PostgreSQL test is explicitly opt-in because it temporarily locks and modifies database objects before rolling everything back. It uses the database container's existing administrative access without printing credentials.
