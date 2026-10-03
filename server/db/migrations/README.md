# Canonical development baseline and future upgrades

Fresh databases install `../ddl/planes/<plane>/_manifest.txt`. Existing databases
apply only the reviewed forward upgrades listed in `manifests/<plane>.txt` through
the startup runner, which verifies checksums and records receipts. Keep all three
manifests and `runner-transactions.sha256` in Git.
Maintain final tables, constraints, indexes, functions, triggers, RLS, grants and
reference seeds in their owning canonical DDL files. Do not replay foundation DDL
on populated DEV/QA databases or reset their migration receipts.

The inventory in `inventory.json` records:

| Disposition                     | Count | Purpose                                              |
| ------------------------------- | ----: | ---------------------------------------------------- |
| Canonical retirement            |     8 | Removed copies mapped to canonical sources.          |
| Legacy upgrade                  |    43 | Preserved legacy upgrade/rehearsal SQL.              |
| Operational upgrade             |    11 | Explicit installation; not automatic startup replay. |
| Historical fixture              |     6 | Staged test schemas.                                 |
| Operational repair              |     2 | Explicit reference-permission repairs.               |
| Automatic post-baseline upgrade |    35 | Reviewed entries in applicable plane manifests.      |

Compiled runtime publication source and capability-profile authoring upgrades remain
operational because they are absent from the automatic manifests. Their original
SQL checksums are preserved. Removed callers are recorded as historical callers,
not executable entrypoints. The record-mutation audit contract upgrade has a
three-plane disposable-schema rehearsal via `pnpm qualify:entity-audit-upgrade`;
this proves that specific upgrade, not all historical upgrade combinations.

`inventory.json` maps original filenames/checksums to current locations, original
planes, canonical files and callers. Historical receipts retain their original
paths and hashes. Dynamic installers resolve source locations through
`tooling/scripts/verification/migration-source.mjs`, preserving ledger names.

Experience-foundation and Atlas-learning verification now validate canonical blocks
and foundation manifest coverage. Their `db:generate:*` commands write unapplied
`.candidate.sql` files beneath `~/.athyper/candidates/sql-upgrade-<id>/` (or the
configured `ATHYPER_RUNTIME_ROOT`). They never regenerate archived or active SQL.
Review a candidate's target baseline, behavior and prerequisites before assigning
a new migration name, adding an inventory entry and applicable plane manifests.
Preserve every previously applied SQL checksum.

Run `pnpm --dir server/db db:verify:migration-layout` after organization changes.
This checks file retention, checksums, canonical paths and manifest ownership;
it does not prove database compatibility. Validate fresh foundation plus startup
runner, and test actual upgrades separately with disposable legacy fixtures.

Existing databases needing pre-baseline changes require a reviewed legacy upgrade
plan. A successful automatic upgrade sequence is not proof that an existing database
has every canonical schema capability. The archive is not a standalone alphabetical upgrade sequence.
See [consolidation and recovery](../../../docs/runbooks/sql-ddl-consolidation.md).

The `20261001_publication_rollback_retry.sql` upgrade adds exact durable-job retry
handling to the existing rollback routine. Run
`node --test scripts/tests/integration/publication-rollback-retry.test.mjs` for a
network-isolated PostgreSQL rehearsal of canonical and upgraded function behavior
on all three plane names. It covers concurrent retries, tenant substitution and
changed-head rejection using minimal publication tables and stub projection-owner
functions; it does not qualify the full foundation or deployment authorization.

The `20261001_atlas_learning_attempts.sql` Studio upgrade installs immutable,
tenant-scoped evaluation starts and terminal results. A committed start survives
rolled-back authoring drafts; a missing terminal result remains `started` and is
not represented as a passing or failing evaluation. Run
`node --test scripts/tests/integration/atlas-learning-attempts.test.mjs` for the
network-isolated canonical/upgrade rehearsal of rollback survival, RLS, tenant
foreign keys, append-only enforcement, and bounded content-free evidence.

Principal-family prerequisite registration includes the Studio UUID key-reference
validator extension, Neon Principal–Person source authority, and Studio/Mesh
projected Profile source authority. Their existing SQL bytes and checksum-ledger
identities are preserved. Inventory/manifests identify their intended planes;
layout verification does not substitute for supported-baseline upgrade rehearsals
or deployment receipts.

The Neon Principal target reader `20261002_principal_person_link_target.sql` is
registered without changing its installed checksum. Run
`pnpm qualify:principal-link-target-upgrade` for a populated bounded dependency
fixture through the actual forward runner, including retry-ledger preservation,
gate substitution denial, other-plane isolation and checksum-drift rejection.
The fixture does not replace full domain-authorization acceptance.

Run `pnpm qualify:principal-source-foundation` for fresh canonical installation on
all three disposable planes, or add `--upgrade` to build the canonical schema
without the Principal source additions and apply their exact forward upgrades.
The latter baseline is identified by its captured manifests and DDL contents;
it does not qualify every archived historical baseline. Both commands refuse a
deployed database target and preserve source and qualification evidence outside
the repository. Fresh-install manifests include Neon source/target authority and
Studio/Mesh projected source authority after their existing prerequisites.

## D7 compatibility assessment

`compatibility-baselines.json` declares two reconstructed qualification paths and
the unresolved historical/installation paths. It does not declare all existing
DEV/QA schemas supported. Archived migration manifests establish order and ledger
identities; they do not identify a complete starting database schema.

Run `pnpm qualify:entity-upgrade-compatibility` from the repository root. The command
accepts no database target. It captures canonical DDL, active migrations/manifests,
the inventory, runners and dependency lockfile with per-file SHA-256 hashes, then
creates network-isolated disposable PostgreSQL 16 containers. Each baseline is
installed once on fresh databases through the existing foundation runner. Only the
existing forward runner executes SQL after those databases are populated.

The command exercises every active migration on each plane independently, checks
unchanged Country and Principal-family row contents, verifies applied migration
checksums and compares complete durable receipts after an exact retry. Nonempty
Country and Principal tables are required; reported counts identify empty Profile
or binding coverage. Logs and failures remain in the private instance artifact
directory alongside captured inputs and `qualification.json`. Containers are
removed after each path. No serving database, publication or activation is changed.

`passed` describes only the executed reconstructed paths. `d7Complete` remains
false: historical starting schemas and reviewed upgrade plans, populated domain
journeys, and intended deployment qualification remain required before claiming
the broader gate. These checks do not prove canonical function equivalence or
full Entity runtime authorization. A failed path exits nonzero and remains
unqualified; migration classification never substitutes for that outcome.

### Verified canonical equivalents

The forward runner consults `manifests/foundation-equivalents.sha256` for five
reviewed overlaps: execution bindings, root history, owner access, key-reference
validation and the learning-attempt ledger. It verifies the unchanged migration
checksum and the validator checksum. A canonical provisioning receipt selects
validation; it is not sufficient to establish equivalence. Each validator also
checks exact canonical source receipts and a SHA-256 of the relevant live catalog.
Adjacent `equivalence/*.catalog.json` files show the expected catalog for review.
Missing or altered columns, constraints, indexes, policies, grants, triggers or
functions reject adoption. Owner-access validation additionally checks the exact
permission seed invariants, without inserting or modifying permissions.

The admitted supersets are explicit: canonical history includes its existing
administrator grants, key-reference validation includes the later UUID extension,
and owner access retains unrelated UI-profile and source-authority extensions.
Owner validation compares this migration's columns/policies/triggers/functions,
not unrelated fields added by later owner capabilities. These are bounded
compatibility assertions, not a claim of full-database schema equivalence.

Validation locks the affected tables and commits with the migration receipt in one
transaction, using bounded lock and statement timeouts. Adopted receipts retain the
original SQL hash and identify the validator hash in `runner_id` as
`foundation-equivalent:<validator-sha256>:<runner-id>`. Existing applied receipts
are unchanged; failed or foreign applying receipts still require operator review.
Without the canonical sentinel, the original migration executes normally. Never
add an equivalence merely because a relation already exists, or regenerate an
expected catalog to conceal drift. New baselines require reviewed source/catalog
bindings and positive and negative rehearsal evidence.

The new Studio role prerequisite appears before the retained table-publication
migration because that historical SQL grants to `athyper_runtime`. Fresh databases
receive a NOLOGIN, NOINHERIT role with no memberships or administrative attributes.
It does not enroll application principals or qualify a serving role. Existing roles
are not rewritten, and administrative privilege conflicts fail for review.

On 2 October 2026, both reconstructed baselines passed their complete Studio, Neon
and Mesh manifests, preserved populated Country/Principal rows and exact retries,
and passed 72 positive/negative equivalence probes. Historical/DEV/QA baselines,
nonempty Profile/binding preservation and serving authorization remain unqualified.


Entity Framework security correction (3 October 2026) uses the successor
`20261003_entity_framework_security.sql` through the existing operational
ownership-upgrade path, after deployed-signature qualification; previously installed migration bytes
and ledger hashes remain unchanged. Canonical onboarding guest capabilities are
read-only and bound to one tenant/case. The service has enumerated reads and
existing scoped commands, without direct onboarding writes or guest-token-table access.
The shared ownership generator pins `pg_catalog` first and `pg_temp` last and
rejects untrusted or runtime-writable schemas without expanding publication
ownership or independent human-review permissions.

The three retained unwrapped 26 September migrations are checksum-bound in
`manifests/runner-transactions.sha256`. The runner commits their SQL and success
receipt together. Explicitly wrapped historical migrations retain their existing
transaction boundaries and separate success receipt; a crash after their commit
still requires operator reconciliation. Plane identity is checked independently
before a migration can set its own plane context. The installed Workforce catalog
snapshot is immutable; its canonical DDL and operational entrypoint also verify
the Neon database independently.

Authorization clean-slate reset remains restricted to marked disposable-local
databases. Truncation, epoch changes, seed application, seed receipts and verified
postconditions share one connection, transaction and provisioning lock. Seed
execution receipts remain append-only evidence; new source paths are relative to
`server/db`, while historical paths do not alter immutable content-hash identity.
Authorization rollout tooling requires an explicit `--manifest=<path>` containing
reviewed source operation IDs and release/artifact hashes. It creates no approval
or human authorship evidence.

On 3 October 2026, the security successor was deployed to the owned shared DEV
Neon, Studio and Mesh databases after full database/role backups and successful
rollback rehearsals. SQL and each plane's applied migration receipt committed
together. All three deployed catalog checks passed with zero errors. Deployed
Country reads, service token-material/no-context denial, invalid guest-token
denial and worker no-context/mutation restrictions passed; API readiness and all
six source workspace services remained healthy. The ordinary runtime has no
onboarding-service membership, so these checks do not qualify a guest HTTP journey.
No entity metadata changed or new metadata release was published; no human review
evidence was created. QA and production remain undeployed. Private backups and
receipts are under `~/.athyper/instances/dev/artifacts/entity-framework-security/2026-10-03T00-06-35.649Z/`.
