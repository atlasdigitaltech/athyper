# Database scripts

## Atlas AI DDL

`ddl/common/ai/` and `ddl/planes/studio/ai/` are maintained canonical foundation
definitions. Their initial extraction provenance does not imply that the old
`scripts/catalog/build-common-ai-ddl.mjs` generator is still available; that entry
point is retired and must not be used to regenerate or overwrite these files.

For an AI schema change, maintain the applicable canonical tables, constraints,
indexes, functions, triggers, RLS and grants together, and add an explicit forward
migration to each affected plane's migration manifest for installed databases.
Validate fresh-install and upgraded catalogs; do not replay foundation DDL against
a populated database. Use supported package commands such as
`pnpm --dir server/db run db:verify:ddl-model` and the applicable schema/security
checks listed in `server/db/package.json`. These commands do not replace live
catalog parity or migration integration tests.

Capture the read-only Atlas foundation inventory from the repository root with
`pnpm atlas:baseline dev <report.json>` (or `qa`). It records source/deployment
hashes, active release-head descriptors, live catalog structure, policy/profile
metadata and recent aggregate outcomes. Table-presence comparison is explicitly
separate from full SQL parity and runtime qualification. See
`docs/runbooks/atlas-foundation-baseline.md` for scope and interpretation.

The recovered Atlas experience-release and runtime surface-projection tables are
covered by `db:verify:experience-foundation` and
`test:integration:experience-foundation`. Their pending forward migration is
generated from the marked canonical blocks with
`db:generate:experience-foundation`; shipped migrations remain immutable.
See `docs/runbooks/atlas-experience-foundation-reconciliation.md` for behavior,
preflight differences and isolated PostgreSQL verification.

Scripts are grouped by the responsibility they own. Invoke supported entry
points through `server/db/package.json`; direct paths are implementation
details and may move during cleanup.

- `business-partner-360/`: BP360 evidence, approval, rollout, and fixture tools.
- `provisioning/`: database creation, disposable-target marking, and seed-pack application.
- `operations/`: state-changing runtime and repair operations.
- `checks/`: read-only DDL, contract, and release checks.
- `seed/`: deterministic seed and authorization-inventory compilers.
- `reports/`: read-only database quality reports.
- `tools/`: lower-level introspection and migration utilities.
- `tests/integration/`: explicitly invoked live-database integration checks.
- `__tests__/`: hermetic Node test suites grouped by domain.

New state-changing commands must validate their database target and require an
explicit confirmation token. Reuse the helpers in `lib/` for CLI parsing,
entry-point detection, and local database target validation.

The legacy Neon-to-Mesh shared-reference sync is retired. All three foundation
manifests install `ddl/common/shared/12_reference_seed.sql` from the same reviewed
reference pack. Ship updates to existing databases through explicit forward
migrations for each affected plane. Validate pack parity with
`pnpm --dir server/db run db:verify:shared-reference`.

Ledger hash repair derives `seed/` from its script location, or accepts
`--seed-root=<directory>`. Missing roots or unresolved source files fail the scan
before any repair. Trigger suspension and hash updates commit atomically.

## Atlas AI DDL

The common/plane AI files are canonical foundation DDL. Do not use the retired
live-catalog generator named in older file headers. For the experience tables,
run `db:verify:experience-foundation` to check the marked canonical blocks against
the pending upgrade. `db:generate:experience-foundation` regenerates that pending
migration only; never rewrite a migration after deployment.

The experience upgrade accepts either the complete current catalog or the exact
pinned legacy catalog. It upgrades the known JSON/local-plane checks atomically
and refuses invalid existing data or unrelated drift. The integration command
`test:integration:experience-foundation` builds its own PostgreSQL databases and
uses a pinned legacy schema; it no longer depends on a running development DB.

Forward-migration runners use random identities because timestamps and process
IDs can collide across container PID namespaces. Failed migration receipts still
require operator review; the change does not enable automatic retry of failed SQL.

## Foundation resume and catalog drift

Foundation `--resume-from` requires every skipped file to have an existing receipt
matching the current plane, manifest checksum, ordinal, and file checksum. Resume
does not create missing prefix receipts. Failures before the provisioning ledger
is installed require a fresh database; `--no-receipts` cannot bypass resume
validation. Explicitly selecting the first file still requires a fresh target.

The database drift report compares view/materialized-view definitions, relation
options (including view security settings), relation/function owners and ACLs,
and column ACLs alongside its other catalog categories. ACL entries are sorted
and use role names rather than database-local OIDs. SQL definitions are preserved
verbatim because whitespace inside literals and function bodies is significant;
formatting-only SQL changes may therefore also appear as drift. This is a catalog
comparison, not an audit of cluster role memberships or external authorization.

`pnpm --dir server/db run test:integration:database-tooling` tests resume failures
and recovery plus catalog security/literal changes in its own PostgreSQL 16.13
container with networking disabled and temporary database storage. It does not
connect to development or QA databases.
