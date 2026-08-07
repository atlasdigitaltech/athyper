# Audit and reason-code three-plane verification

Date: 2026-08-01

## Verified conclusion

At repository-manifest level, the new common audit contract is aligned across
Athyper Platform, Neon, and Mesh. Each database receives the same audit schema,
domains, evidence tables, partitions, constraints, indexes, functions,
triggers, RLS, and grants from `common/audit` exactly once.

The audit contract itself passed all 38 available repository checks, and the
three foundation manifests resolved in a dry run. This verifies desired-state
file alignment. It does not substitute for a clean build or live catalog diff.

The reason-code migration is **not aligned with the running application yet**.
The new common contract creates `master.audit_reason_code`, while active
runtime code still reads and writes `master.change_reason_code`. This is a
cutover blocker.

## Retirement disposition

`master.change_reason_code` is already absent from the new desired-state DDL:

- no `CREATE TABLE master.change_reason_code` exists under `common`;
- no such table exists under `planes/athyper`, `planes/neon`, or
  `planes/mesh`;
- none of the common or three plane manifests references it;
- all three manifests install `master.audit_reason_code` through the common
  audit pack instead.

The similarly named `change_reason_code` text column in Neon's HR compensation
DDL is a business field, not the legacy reason-code catalog, and must not be
removed as part of this retirement.

The legacy catalog still exists in the top-level legacy DDL, its constraints,
its platform seed, and active runtime consumers. Therefore the approved
disposition is:

1. **New DDL layer:** keep `master.change_reason_code` excluded in all three
   planes. Do not copy it into a common or plane folder.
2. **Migration period:** retain the legacy physical table and seed wherever
   the legacy database build/runtime still requires them.
3. **After migration:** retire the legacy physical table through an explicit
   migration after data, foreign keys, runtime consumers, and retention reads
   have moved to `master.audit_reason_code` and `audit.audit_log`.

No table was dropped by this assessment. The required migration gates have not
yet passed.

## Three-plane audit alignment

| Contract | Athyper Platform | Neon | Mesh | Result |
|---|---|---|---|---|
| `audit` schema and sealed domains | Common manifest files | Same common files | Same common files | Aligned |
| `audit.audit_log` and default partition | Common | Common | Common | Aligned |
| `audit.authorization_decision_evidence` and default partition | Common | Common | Common | Aligned |
| `audit.security_event` and default partition | Common | Common | Common | Aligned |
| `audit.hash_anchor` | Common | Common | Common | Aligned |
| `master.audit_reason_code` | Common audit pack | Same common pack | Same common pack | Structurally aligned |
| Plane-local row isolation | `plane_code='athyper'` | `plane_code='neon'` | `plane_code='mesh'` | Aligned by database-plane guard |
| Runtime reason-code consumer | Legacy table name | Legacy table name | Legacy table name | Not migrated |

The audit tables are correctly local to each database. The common DDL defines
one contract; it does not centralize evidence rows or create cross-database
foreign keys.

## `master.audit_reason_code` design review

### What is correct

- Tenant scoping is mandatory and backed by `(tenant_id, id)` and
  `(tenant_id, code)` uniqueness.
- `code`, `category`, `severity`, `requires_comment`, and `origin` become
  immutable after activation, protecting the meaning of historical evidence.
- The `draft -> active -> retired` lifecycle prevents an active reason from
  being silently redefined or reactivated after retirement.
- `audit.audit_log` stores both the reason UUID and an immutable code snapshot.
  Historical reporting therefore survives later catalog retirement.
- The insert trigger accepts only active reasons from the same tenant and
  enforces required comments.
- Platform-seeded and tenant-defined rows are distinguishable through `origin`
  without a redundant `is_system` boolean.
- RLS isolates tenant rows, while plane spoofing is rejected by the audit
  evidence preparation functions.

### Why the table should remain in `master`

Keep the canonical table name **`master.audit_reason_code`**.

Although its only authoritative consumer is the audit domain, a reason code is
mutable, business-visible tenant configuration. Users select it in application
workflows, tenant administrators can extend the catalog, and labels and
descriptions are presentation data. That makes `master` a better home than the
append-only `audit` evidence schema.

Do not retain `master.change_reason_code` as the final canonical name. "Change"
is too narrow for security, authorization, integration, export, denial, and
other audited events that are not record changes. `audit_reason_code` expresses
the durable meaning of the catalog.

The folder/schema mismatch is acceptable if documented: `common/audit` owns
the contract, while PostgreSQL schema `master` owns its business-visible
catalog table.

## Legacy/new incompatibilities

| Area | Legacy `master.change_reason_code` | New `master.audit_reason_code` | Required action |
|---|---|---|---|
| Platform rows | Global rows use `tenant_id IS NULL` | Every row is tenant-local | Materialize platform seeds per tenant |
| System marker | `is_system boolean` | `origin` is `platform_seed` or `tenant` | Derive `is_system` in compatibility responses |
| Lifecycle | `active`, `inactive`, `archived` | `draft`, `active`, `retired` | Map inactive/archived to retired |
| Categories | Four values | Nine values | Expand API and UI validation |
| Comment enforcement | Service convention | First-class `requires_comment` plus trigger | Preserve the new behavior |
| Tags | Separate JSON array | No separate column | Preserve under `metadata.legacy_tags` if needed |
| Evidence link | Legacy `log.audit_log.reason_code` UUID | `audit.audit_log.audit_reason_code_id` plus code snapshot | Migrate or archive with an explicit mapping |
| API shape | Returns `is_system` | Stores `origin` | Project `origin = 'platform_seed' AS is_system` |

Nine active source files still reference `master.change_reason_code`, including
the reason-code lookup route, record audit route, high-risk record mutation
paths, snapshot restore, AP restore, shared audit writer, API contracts, and the
reason-code picker.

## Stable-code blocker

The legacy seed contains six codes that are referenced by specific runtime
paths:

- `request_revision`
- `approver_correction`
- `manual_account_override`
- `tax_recalculation`
- `posting_adjustment`
- `restore_snapshot`

None is present in the new `master.seed_audit_reason_catalog` seed set. The new
generic codes such as `manual_correction` and `data_restoration` are not safe
automatic replacements. Stable reason codes are audit semantics and may be
used in reports, policy conditions, error handling, and tests; silently mapping
them changes historical meaning.

### Recommendation for the seed catalog

Add the six legacy codes to the new common tenant-local seed pack with their
existing names, categories, severity, and descriptions. Mark them
`origin='platform_seed'`, `status='active'`, and set `requires_comment=true`
for the high-risk user-driven paths. Keep the broader new codes as additional
choices rather than aliases.

Recommended values:

| Code | Category | Severity | Requires comment |
|---|---|---|---|
| `request_revision` | `workflow` | `normal` | Yes |
| `approver_correction` | `workflow` | `elevated` | Yes |
| `manual_account_override` | `accounting` | `elevated` | Yes |
| `tax_recalculation` | `accounting` | `normal` | Yes |
| `posting_adjustment` | `financial` | `critical` | Yes |
| `restore_snapshot` | `snapshot` | `elevated` | Yes |

Use a new seed-pack version; do not edit the meaning of already activated
codes in place.

## Recommended migration sequence

1. Add the six required stable codes to
   `master.seed_audit_reason_catalog` and bump the embedded pack version.
2. Provision the complete reason catalog for every existing tenant in each of
   the three databases.
3. Migrate tenant-defined legacy rows:
   - preserve `code`, `name`, `description`, `category`, `severity`, and
     `sort_order`;
   - map `is_system` to `origin`;
   - map inactive/archived status to `retired`;
   - preserve tags under versioned metadata if consumers still need them.
4. Create an explicit old-ID/tenant/new-ID mapping for legacy global rows.
   Global reason UUIDs cannot be reused as multiple tenant-local primary keys.
5. Migrate evidence references transactionally, or retain the legacy audit log
   behind a read-only compatibility view until its retention period expires.
6. Change runtime SQL to `master.audit_reason_code` and new audit writes to
   `audit.audit_log`. Update the lookup response to derive `is_system` from
   `origin` during API compatibility.
7. Expand the API category enum from four categories to the full sealed common
   taxonomy, or publish a versioned API if existing clients cannot accept new
   values.
8. In the legacy database migration, rename the old physical table to
   `master.change_reason_code_legacy` and optionally expose a temporary
   read-only `master.change_reason_code` compatibility view. Do not add either
   object to the new three-plane desired-state manifests.
9. Add a verifier that fails when production runtime source still references
   the legacy table or when any required stable seed code is absent.
10. Remove the compatibility view only after all runtime, migration, catalog,
    and retention checks pass in Athyper Platform, Neon, and Mesh.

## Additional controls recommended

- Restrict reason-catalog mutation to an authorized tenant administration
  service. Tenant RLS alone does not distinguish ordinary application users
  when they share the same database role.
- Keep direct updates and deletes of active/retired semantics blocked by the
  existing guard trigger.
- Add an index supporting active lookup by tenant, category, and sort order if
  the UI endpoint becomes frequent:
  `(tenant_id, category, sort_order, code) WHERE status = 'active'`.
- Add contract tests for cross-tenant reason rejection, required comments,
  activation immutability, retirement, platform-seed protection, and API
  compatibility projection.
- Record a data-disposition decision for legacy `log.audit_log`; do not assume
  it is structurally interchangeable with the new partitioned
  `audit.audit_log`.

## Verification performed

- `pnpm --filter @athyper/db run db:verify:common-audit-contract`
  - 38 checks passed.
- `pnpm --filter @athyper/db run db:foundation:plan`
  - all three manifests resolved;
  - dry run only, no SQL executed.
- Static table and manifest inventory
  - the common audit phases occur exactly once in each plane manifest.
- Runtime reference scan
  - nine active source files still reference `master.change_reason_code`.
- Seed parity scan
  - zero of the six runtime-required legacy codes occur in the new common seed.

## Final approval status

| Decision | Status |
|---|---|
| Common audit DDL alignment across three databases | Approved at repository-manifest level |
| `master.audit_reason_code` target name and ownership | Recommended |
| Exclusion of `master.change_reason_code` from new three-plane DDL | Approved and already satisfied |
| Legacy reason-code runtime cutover | Blocked pending migration |
| Legacy `master.change_reason_code` removal | Not approved |
| Clean-build/live-catalog parity | Still required |

## Primary evidence

- [`common/audit/02_domains.sql`](common/audit/02_domains.sql)
- [`common/audit/03_tables.sql`](common/audit/03_tables.sql)
- [`common/audit/05_constraints.sql`](common/audit/05_constraints.sql)
- [`common/audit/07_functions.sql`](common/audit/07_functions.sql)
- [`common/audit/08_triggers.sql`](common/audit/08_triggers.sql)
- [`common/audit/10_rls.sql`](common/audit/10_rls.sql)
- [`common/audit/11_grants.sql`](common/audit/11_grants.sql)
- [`master/01_tables.sql`](master/01_tables.sql)
- [`../seed/platform/003_master/005_change_reason_code.sql`](../seed/platform/003_master/005_change_reason_code.sql)
- [`reports/neon-live-table-crosscheck.md`](reports/neon-live-table-crosscheck.md)
