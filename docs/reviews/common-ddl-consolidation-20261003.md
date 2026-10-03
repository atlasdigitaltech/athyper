# Common DDL consolidation — corrected audit and qualification

Reviewed and corrected on 3 October 2026. The column consolidation is retained,
with a correction for a view projection regression found by actual PostgreSQL
comparison. The final fresh schemas match the pre-cleanup schemas on Studio,
Neon and Mesh for all compared catalog definitions. This is implementation and
isolated qualification evidence; this cleanup was not deployed or published.

## Scope and implementation

The eight original cleanup files remain the source of the unified definitions:

| Area | Result |
| --- | --- |
| `common/ops/03_tables.sql` | Removed the redundant import-operation addition/duplicate-constraint handler; purge timestamps live in their table definitions. |
| `common/authz/03_tables.sql` and `13_management.sql` | Twelve existing version columns live in their table definitions; management triggers, receipts and controls remain. |
| `common/control/03_tables.sql` and `14_admin_integrations.sql` | Existing administration fields and the final endpoint-code regex live in the initial definitions. The administration file is explicitly for empty-database foundation installation. |
| `common/document/03_foundation_tables.sql`, `05_constraints.sql` and `12_collaboration_integrity.sql` | Existing collaboration/admission fields live in the canonical tables. The attachment-to-draft FK is installed after both tables exist; collaboration integrity controls remain. |

The first PostgreSQL comparison rejected equivalence on all three planes.
`document.active_attachment` was created with `SELECT *` before collaboration
columns were added. Moving those additions into `CREATE TABLE` caused the view to
include `admitted_release_hash`, `admitted_policy_hash` and `draft_id`. The three
existing plane `document/09_views.sql` files now explicitly select the established
36 columns in their original order. Their filters, invoker/barrier settings,
ownership and grants remain unchanged. This correction adds no application route,
entity dispatch, permission requirement or provider stack.

## Table inventory and grouping

The current source scan finds **256 unique named table declarations across 14
schemas, including `public`**. This replaces the unscoped “232 tables across 14
schemas + public” claim. The inventory counts schema-qualified `CREATE TABLE`
declarations with parenthesized definitions under `ddl/common/**/*.sql`; it
excludes `PARTITION OF` declarations and tables generated at runtime. The
machine-readable report records every counted name and source path.

| Schema | Named declarations |
| --- | ---: |
| ai | 26 |
| audit | 10 |
| authz | 21 |
| control | 52 |
| document | 21 |
| event | 21 |
| governance | 14 |
| log | 4 |
| master | 35 |
| ops | 19 |
| public | 1 |
| runtime_meta | 12 |
| shared | 15 |
| snapshot | 5 |
| **Total** | **256** |

Intersecting these names with the saved post-correction PostgreSQL catalogs finds
254 instantiated tables on Studio and 256 on each of Neon and Mesh. Every table
in those intersections has a primary key. Studio does not instantiate the two
common source declarations `master.contact_person` and `master.contact_person_role`.
These are scoped inventory/primary-key checks, not a count of every plane-specific
table or partition. The report records the missing-primary-key lists (all empty),
the non-instantiated declarations and the saved catalog fingerprints.

Keep both existing organization patterns: the numbered tables/constraints/indexes/
functions/triggers/views/RLS/grants phases, and capability modules that colocate
their storage and controls. The phase split is a convention, not a rule requiring
every key or CHECK to reside in `05_constraints.sql`; many are already inline.
No further table relocation or cosmetic restyling is justified by this cleanup.

## PostgreSQL equivalence

The reproducible [checker](../../server/db/scripts/checks/ddl/common-ddl-equivalence.ts)
creates two disposable, network-isolated PostgreSQL 16.15 containers and installs
all six complete before/after plane manifests. The baseline is commit
`9c681afe060ff5ea9c2ec08499ec15cfd6046211`. Only the eight cleanup files and three
corrected view files use baseline bytes on the before side; other foundation
inputs use the same current source. This isolates the cleanup from unrelated work.

The final comparison passes for all three planes, with identical per-plane hashes.
Compared catalogs include schema ownership/ACLs; relations and views; ordered
columns, types, defaults and nullability; constraints and FK deferral/validation;
indexes; triggers; RLS flags and policies; routine definitions and ACLs; domains
and enums; sequence definitions; roles/memberships; and default privileges.
The initial failure establishes that the checker detects the projection regression.

Reproduce from the repository root:

```sh
pnpm --dir server/db run db:verify:common-ddl-equivalence \
  --before-ref=9c681afe060ff5ea9c2ec08499ec15cfd6046211 \
  --output=/tmp/athyper-common-ddl-equivalence
```

The [machine-readable report](../reports/common-ddl-consolidation-20261003.json)
contains the source hashes, initial failure, final hashes/counts, retained-SQL
hashes, generated-column checks and scoped table inventory. The eleven cleanup
and corrected-view files were rechecked against the saved post-correction source
hashes when this audit was updated; all match. Full raw snapshots from this run are under
`/tmp/athyper-common-ddl-equivalence-final/` and are temporary local evidence.
Object OIDs, seed-row identities/timestamps, sequence counters and physical
storage are outside this structural comparison. It does not qualify a serving
database, browser flow or arbitrary historical baseline.

## Upgrade paths and fresh rounding backfill

All 112 retained SQL files match their immutable inventory hashes and baseline
tracked bytes. Migration-layout verification passes. The original control
administration upgrade remains in
`scripts/operations/upgrades/legacy-baseline-20260914/20260912_control_admin_foundation.sql`;
its column additions, populated-data backfill and guards are unchanged. The
retained document integration upgrade at
`scripts/operations/upgrades/bp-integration-20260921/neon.sql` also retains its
original column additions. Their inventory mappings continue to identify the
canonical foundation sources. No active script caller was found that reads the
three edited management/integrity files as an incremental upgrade; they remain
foundation manifest inputs. Do not replay foundation DDL on existing databases.

Fresh installs on all three planes contain zero rounding rules and zero rounding
contexts. The fresh foundation therefore no longer disables/re-enables the update
trigger or updates every rounding row to reconstruct `configured_contexts`.
New rows receive the declared `[]` default; later authored context definitions
continue through the existing owning service and publication controls. The legacy
upgrade retains its backfill for existing data. This decision does not claim that
the old update was inherently harmless: it would write rows and derive context
values on a populated database.

The upgrade confirmation here establishes retained bytes, mappings and caller
separation. It does not constitute a new execution rehearsal of every historical
upgrade or permission to rewrite old migration hashes/provisioning receipts.

## Corrections to the original report

- The original “final schema is identical” claim was premature and initially
  false because of the view projection. It is supported by the final catalog
  comparison after the explicit-projection correction.
- The unscoped table count is replaced by the 256-declaration inventory and the
  per-plane installed-table/primary-key checks above.
- All reviewed columns already exist in all three Prisma schemas and all three
  generated Kysely files. Declaration relocation does not itself make these
  types stale; no code generation is required for this cleanup. The recorded
  presence check is not a general audit of every generated type.
- `sync-document-foundation.mjs` checks canonical table presence and removes
  duplicate plane definitions. It does not propagate canonical definitions into
  plane files; manifests install the common foundation directly.
- Use “dependency-ordered FK installation” for `attachment_draft_fk`: both tables
  exist before the FK is installed, and it is not declared `DEFERRABLE`.
- `CREATE TABLE IF NOT EXISTS` in `master.saved_view_default` and
  `master.reference_choice_recent` is compatible with fresh installation, but
  does not validate the structure of a pre-existing table. It is not sufficient
  qualification for an arbitrary partially populated database or incremental
  upgrade. This audit does not request removing it or changing the associated
  policies/grants.
- `ALTER TABLE ADD COLUMN` is valid for retained upgrades. Avoiding it in the
  fresh table definitions is a consolidation convention, not a universal bug fix.
- The established tables/constraints/indexes convention is preserved. No further
  primary-key consolidation or cosmetic rewriting is needed.

The successful before/after PostgreSQL catalog comparison is the equivalence
evidence. Supporting checks pass: three-plane DDL model, canonical document foundation,
generated security-definer artifacts, migration layout and database TypeScript
compilation. Permissions, MFA, tenant/record scope, publication ownership and
independent human-review controls were not changed.
