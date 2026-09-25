# Disposable DDL execution and local DEV audit — 24 September 2026

## Follow-up: DEV/QA readiness

A subsequent read-only check confirmed the active QA ownership receipt selects
`athyper-qa-candidate-1789163256545`. Its database is separate from
`athyper-dev-db-1`. DEV source/container mode reuses DEV infrastructure rather
than maintaining another application database copy.

- Both IAM instances run the repository-pinned Keycloak 26.7.3 image. Their
  210 Liquibase changelog entries match by ID, author, filename, checksum and
  execution type. Neither reports a held changelog lock. This establishes
  alignment between their installed migration states, not realm/client/user
  configuration parity or a claim about the latest upstream Keycloak release.
- QA Neon and Mesh lack `document.comment_revision`; QA Studio contains an
  older version. All three QA planes lack the inspected attachment admission
  hash and comment revision-number columns.
- QA has no September 20–29 forward-migration receipts and no non-applied
  migration ledger entries. This is not proof that all earlier upgrades ran.
- No application or IAM database was mutated during this follow-up.

The existing reviewed Business Partner upgrade README explicitly excludes
Studio/Mesh collaboration storage upgrades. The source/container switch also
guards against changed schema snapshots in `tooling/scripts/local-dev/dev-workspace.mjs`:
compatible images must be qualified before switching back to container mode.
Consequently, completing DEV/QA currency requires a coordinated, data-preserving
upgrade rehearsal and runtime compatibility qualification, not a blanket replay
of the foundation or legacy archive. No database is certified fully current by
this follow-up.

## Result and scope

All three canonical foundation builds passed on PostgreSQL 16.15 in a newly
created container, `athyper-ddl-audit-20260924`. The container had no network
connectivity or published ports, and used disposable tmpfs database storage.
No local DEV database was modified. Prisma/Kysely generation was not requested
in this execution and was not performed.

| Plane | Applied, checksum-verified foundation receipts | Baseline catalog assertions | Application-role read smoke check |
| --- | ---: | --- | --- |
| Neon | 257 | Passed | Passed |
| Studio | 245 | Passed | Passed |
| Mesh | 218 | Passed | Passed |

Execution used `server/db/scripts/provisioning/foundation-runner.ts` with an
explicit `--plane` and `--container`, following each plane's canonical manifest.
These manifests install schemas, extensions, tables, constraints, indexes,
functions, triggers, roles/grants, RLS policies and foundation reference data.
No legacy upgrade bundle was replayed over the fresh foundation.

`server/db/scripts/tests/integration/canonical-development-baseline.sql` passed
on each database. Read-only transactions with `SET LOCAL ROLE athyperapp`
successfully queried `document.attachment`, `document.comment` and
`document.comment_revision`. These empty-table smoke checks are not multi-tenant
behavioral tests or full Comments/Attachments integration tests.

## Local DEV: actual gaps, not simply missing receipts

Read-only inspection targeted the existing `athyper-dev-db-1` container
(Compose project `athyper-dev`) and its three application databases. The audit
compared all non-system, non-public schemas in the fresh foundations with DEV,
using the repository's `database-catalog.ts` queries for columns, constraints,
indexes, functions, triggers, views, ACLs, RLS flags and policies.

All three DEV `public.schema_provisions` tables contain zero receipts. Therefore,
absence of a foundation receipt cannot establish that a script was never run.
The findings below are based on database catalogs, not that assumption.

### Comments and attachments — priority remediation

- **Studio and Mesh:** missing attachment admission hashes and draft link,
  series display name/revision, link category, comment revision number,
  draft expiry, and derivative scan columns. Both lack the canonical comment
  revision capture/immutability and attachment byte/folder integrity triggers.
- **Mesh:** `document.comment_revision` is absent entirely.
- **Studio:** a comment revision table exists, but lacks canonical status and
  visibility columns and differs in constraints/read policies.
- **Studio and Mesh:** mention/reaction read policies differ from the canonical
  policies that require a visible parent comment; attachment processing grants
  also differ.
- **All three:** `document.active_comment` lacks the canonical `revision_no`
  column. Other policy/ACL differences require review rather than blind replay.
- **Neon:** the main collaboration tables and integrity functions are present,
  but the comment revision audit trigger and canonical administrator grants
  differ from the fresh baseline.

Canonical sources to use when preparing a data-preserving upgrade include:

- `server/db/ddl/common/document/03_foundation_tables.sql`
- `server/db/ddl/common/document/12_collaboration_integrity.sql`
- `server/db/ddl/common/document/13_processing_grants.sql`
- Per-plane document tables, domains, constraints, RLS and views, plus shared
  audit-trigger/grant installation.

**Do not execute the entire foundation or these mixed CREATE/ALTER files directly
against populated DEV.** Studio already contains part of the revision schema;
Mesh does not. Each needs an explicit, reviewed forward upgrade with appropriate
existing-row handling.

### Additional repository-wide DEV drift

- Neon lacks `master.bank_account_house_payment_method` and four bank-account
  views, plus related constraints/indexes/triggers. See Neon master DDL files
  `03_tables.sql` through `11_grants.sql`.
- Studio and Mesh lack process-selection/task-rule publication and governance
  process tables/functions found in the common control/governance foundation.
- Studio lacks the canonical authorization-successor publication tables and
  functions, and `publication.fn_prepare_document_collection_release`.
- Runtime release functions and some ACLs/policies differ on all planes. Some
  DEV-only permissions or objects may be intentional; drift is not automatic
  permission to overwrite them.

| Catalog comparison | Neon | Studio | Mesh |
| --- | ---: | ---: | ---: |
| Missing relations, including views | 5 | 10 | 9 |
| Missing functions | 2 | 16 | 13 |
| Missing triggers | 10 | 24 | 23 |
| Missing indexes | 7 | 35 | 37 |

Counts overlap by object dependency and must not be added into a migration count.
This was a catalog audit, not a comparison of all reference/business data, schema
ACLs, default privileges, role memberships, or a full upgrade rehearsal.

## Forward migration tracking

`pnpm --dir server/db db:verify:migration-layout` **failed**:

- Four September 23 manifest entries incorrectly contain the `migrations/`
  prefix, while the checker expects filenames relative to that directory.
- All five September 23 SQL files are unclassified in the migration inventory.
- `20260923_collection_configuration.sql` is not listed in an active manifest.

| Script | DEV evidence | Interpretation |
| --- | --- | --- |
| `20260922_workforce_as_of_projection.sql` | Neon applied receipt; exact SHA-256 matches | Already applied |
| `20260923_entity_notification_discovery.sql` | No receipt; Neon function matches fresh canonical definition and dedup index exists | Tracking gap; do not assume pending execution |
| `20260923_notification_operations_permissions.sql` | No receipt; both permissions are published in Neon | Tracking gap; complete seed parity not established |
| `20260923_notification_configuration.sql` | No receipt; Studio function and function ACL match canonical baseline | Tracking gap |
| `20260923_notification_compilation_source.sql` | No receipt; Studio function and function ACL match canonical baseline | Tracking gap |
| `20260923_collection_configuration.sql` | Unmanifested; both Studio functions and function ACLs match canonical baseline | Inventory/manifest/receipt reconciliation needed |

The September 23 definitions are included in canonical foundation SQL, so their
unregistered forward wrappers did not block the disposable foundation builds.

## Recommendation

1. Prepare and rehearse data-preserving collaboration upgrades for Studio/Mesh,
   plus the smaller Neon/all-plane view, audit and permission differences.
2. Correct migration paths and inventory registration. Reconcile existing DEV
   objects with their reviewed migration definitions before recording receipts;
   do not manufacture an execution history or blindly rerun scripts.
3. Handle bank, process/governance and publication drift as separately scoped
   upgrades. Preserve intentional DEV-only objects and permissions.
4. After authorized DEV upgrades, regenerate Prisma/Kysely from the intended
   database and run seeded, application-role integration tests.

## Evidence and cleanup

Local evidence is retained at `/tmp/athyper-ddl-audit-20260924/`:
`neon-foundation.json`, `studio-foundation.json`, `mesh-foundation.json`,
their stderr logs, `dev-comparison.json`, and the read-only comparison script
`compare.mts`. This is temporary local evidence, not committed release evidence.
The JSON comparison includes object-level target/live definitions for review.
The disposable container is removed after validation; only its freshly generated
test databases are discarded. Existing DEV/QA containers and data are untouched.
