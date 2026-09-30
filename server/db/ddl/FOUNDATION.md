# Three-database DDL foundation

The application-plane database names are:

- `athyper_studio` — Studio control/platform plane
- `athyper_neon` — Neon ERP plane
- `athyper_mesh` — Mesh network plane

`athyper_iam` remains reserved for Keycloak and is not an application plane.

The manifests describe fresh, empty-database builds. They do not upgrade an
existing database and do not execute files from `_migration/`.

## Manual review

Objects move into this tree table by table. Review the table definition and its
constraints, indexes, functions, triggers, RLS, grants, and reference data
together before treating it as locked.

The foundation contains `public.schema_provisions`, the Common reference
catalog, a common plane-local master core, and plane-owned extensions.
Ownership is locked as:

- `<plane>.master.workspace` and `<plane>.master.module`, defined once by
  `common/master/03_platform_tables.sql`
- `<plane>.control.subscription_plan`
- `<plane>.control.policy_definition` for common policy consumers, including Atlas AI
- subscription history in each plane's `snapshot` schema

Here, `<plane>` means the matching Studio, Neon, or Mesh database; the SQL
schema names inside each database are `master`, `control`, and `snapshot`.
There is intentionally no `shared.subscription_plan_version` or plane-local
`subscription_plan_version` table.

Shared UOM quantity families are sealed by
`shared.uom_quantity_type_d`. Commodity and industry domain ownership is held
by the seed-owned `shared.classification_scheme` register; Common reference
data no longer depends on plane-local `control.lookup_domain`.

`common/shared/12_reference_seed.sql` is the reviewed SQL seed entrypoint for
ISO references, UOMs, taxonomies, and crosswalks. It uses relative psql
includes so it remains manually executable. For Docker builds, the foundation
runner expands those includes on the host before streaming one transaction to
PostgreSQL. Bulk taxonomy loading defers recursive row checks and finishes with
`shared.validate_reference_seed()` plus immediate FK validation.

The common master table file is installed by all three manifests before the
plane-specific master table file. It defines the same table contract in each
physical database, but it does not imply cross-database foreign keys or shared
rows. Studio then adds canonical-party authority tables, Neon adds ERP master
data, and Mesh currently adds no master-table extension. Cross-plane visibility
must use explicit identifiers, projections, or service contracts.

## Runner

The runner validates every manifest path, refuses a live run when the
connected database name does not match the selected plane, and runs a
read-only fresh-database preflight before executing the first manifest file.
The preflight rejects application schemas and relations left by an earlier
foundation build, so a rerun fails before making any partial change. Reset the
selected plane before applying its desired-state manifest again.

```powershell
pnpm --dir server/db run db:foundation:plan
pnpm --dir server/db run db:foundation:create:athyper
pnpm --dir server/db run db:foundation:create:neon
pnpm --dir server/db run db:foundation:create:mesh
pnpm --dir server/db run db:foundation:athyper:docker
pnpm --dir server/db run db:foundation:neon:docker
pnpm --dir server/db run db:foundation:mesh:docker
pnpm --dir server/db run db:foundation:athyper
pnpm --dir server/db run db:foundation:neon
pnpm --dir server/db run db:foundation:mesh
```

For the current local Docker stack, run the matching `create` and `docker`
commands for one plane at a time. Each creation command is idempotent, never
drops a database, and does not modify either of the other planes. The matching
Docker command applies that plane's manifest one file and one transaction at a
time by using `psql` inside the running `athyper-db-1` container.

Connection variables:

- `ATHYPER_PLATFORM_DATABASE_URL` — runtime traffic through PgBouncer on 6432
- `ATHYPER_PLATFORM_DATABASE_ADMIN_URL` — direct DDL traffic on 5432
- `ATHYPER_NEON_DATABASE_ADMIN_URL` (falls back to `DATABASE_ADMIN_URL`)
- `ATHYPER_MESH_DATABASE_ADMIN_URL` (falls back to `MESH_DATABASE_ADMIN_URL`)

The foundation runner accepts only direct/admin URLs. It never executes DDL
through PgBouncer.

The shared reference-seed phase loads approximately 84,000 classification
codes and 74,000 crosswalk mappings. It is intentionally visible as its own
manifest step and may take about one minute on the local Docker database.

## Development baseline policy

The DDL manifests are the canonical baseline for all three application planes.
The pre-baseline migration lineage was retired after its final state was folded
into this tree. Fresh local databases must be created from these manifests;
existing local databases must be reset instead of replaying retired migrations.

Migration manifests intentionally start empty at the baseline boundary. Add a
new immutable forward migration only for a schema change made after this
baseline, and apply the same final definition to the appropriate canonical DDL
file. Shared definitions belong under `common`; plane-specific definitions
belong under the matching `planes/<plane>` directory.
