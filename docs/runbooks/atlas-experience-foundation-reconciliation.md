# Atlas experience foundation reconciliation

F0-01 is reconciled in source: canonical definitions now include
`ai.atlas_experience_release` and `runtime_meta.experience_surface_projection`.
Their definitions were recovered from read-only schema extraction of DEV and
compared with all three DEV planes in isolated PostgreSQL tests.

The canonical blocks reside in the existing common `ai` and `runtime_meta`
`03_tables`, `05_constraints`, `06_indexes`, `10_rls` and `11_grants` files.
All three foundation manifests already load those files. There are no custom
triggers or table-specific routines in the recovered definitions; none was added.
Existing shared UUID/context functions remain prerequisites.

Preserved contracts include positive revisions, versioned JSON envelopes and
size limits, hash formats, publication/retirement coherence, unique release
coordinates, one draft/published Atlas release per tenant/scope, and one active
surface projection per tenant/surface/layer. RLS is enabled and forced on both
tables, using the existing tenant context functions. Surface projections retain
their local-plane check.

Direct grants match the observed live schema: `athyperapp` has SELECT on Atlas
releases and SELECT/INSERT/UPDATE on surface projections; `athyperadmin` has all
table privileges. PUBLIC receives none. This reconciliation does not change the
application's authoring-role selection or install a published agent profile.

## Forward migration

`20260910_experience_foundation.sql` is registered once in each plane's migration
manifest. It runs atomically and serializes concurrent executions with a
transaction advisory lock. It constructs temporary expected tables from the
canonical blocks, then compares existing tables before creating anything
persistent.

The comparison checks ordered columns/types/nullability/defaults, identity and
generated flags, constraints and validation state, index definitions/validity,
RLS flags and policies, noninternal triggers, and direct grants/grant options.
Owner identities, OIDs and temporary-table persistence are excluded. Comments,
inherited role membership, and a full database security audit are outside this
comparison.

- Missing tables are created with their complete canonical objects.
- Compatible existing tables and their rows remain unchanged.
- Differences stop with `EXPERIENCE_SCHEMA_DRIFT` and identify the table.
- A failed preflight rolls back temporary work and any transaction changes.
- Repeated execution produces the same catalog and preserves existing rows.

The migration deliberately does not drop or rebuild an incompatible live table.
Investigate the reported difference and prepare a separately reviewed migration
when an installation has diverged. Required schemas, shared functions and
application roles must already exist. The normal migration entrypoint must set
the correct database plane for later projection writes.

## Verification

```sh
pnpm --dir server/db run db:verify:experience-foundation
pnpm --dir server/db run test:integration:experience-foundation --report=docs/architecture/business-partner/evidence/atlas-f1-experience-foundation-20260910.json
pnpm --dir server/db run db:verify:ddl-model
```

The integration command creates its own randomly named, labelled PostgreSQL
container with no network and temporary database storage. It accepts no deployed
test target. It runs the full Studio, Neon and Mesh foundation manifests, tests
absent and partially installed schemas, restores schema-only DEV copies into the
isolated target, and exercises grants/RLS/lifecycle behavior with synthetic rows.
Cleanup removes only the container with the matching test label. DEV is accessed
only by schema-only `pg_dump`; no data is exported and no live migration is run.

For this pending migration, `db:generate:experience-foundation` regenerates it
from the marked canonical blocks and `db:verify:experience-foundation` detects
divergence. Once a migration has shipped, preserve it and deliver subsequent
changes through a new migration; do not regenerate a deployed migration to
silently alter its checksum.

See the [PostgreSQL verification receipt](../architecture/business-partner/evidence/atlas-f1-experience-foundation-20260910.json).
QA rollout remains part of its normal reviewed deployment/migration sequence;
this change does not bring its other F0 schema/build differences up to date.
The entity-level semantic-definition work can now build on the restored
canonical experience tables.
