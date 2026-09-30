# Lookup domain reference protection

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

Publication now checks all affected values before retiring a domain or disabling its
tenant extensions. This includes references owned by other tenants.

The repository calls `control.admin_lookup_domain_change_allowed` while holding the
domain lock and returns HTTP 409 with `CONTROL_ADMIN_REFERENCE_IN_USE` when blocked.
A database trigger applies the same check to direct domain updates. All changes,
publication receipts, revision snapshots, audit and outbox writes remain in the original
publication transaction; rejection rolls everything back.

A narrow SECURITY DEFINER function checks references across RLS boundaries. It returns
only a boolean. The underlying inspection function is private and is not executable by
ordinary application roles. Checks include foreign-key references, the document/JSON
reference ledger and native cycle-domain references.

Reference insertion locks the domain before checking and locking the value. Publication
holds an incompatible domain lock while inspecting affected values. Therefore:
- If reference insertion wins, publication waits and then rejects the domain change.
- If publication wins, the new reference waits and then rejects the unavailable value.
- Disabling extensions leaves valid global references unaffected.
- Once blocking references are removed, publication can succeed.

JSON/document consumers must still maintain `control.lookup_value_reference`; arbitrary
references hidden inside application JSON are not automatically discoverable.

## Deployment

Apply `20260920_lookup_domain_reference_guard.sql` after its predecessors in the plane
migration manifest, then deploy the application. Fresh installations include
`common/control/15_lookup_reference_governance.sql` before final security-definer hardening.
Lookup repository health now rejects a missing guard function or EXECUTE grant.

No live migration or deployment was performed for this fix. The migration does not
silently repair previously invalid reference data.

## Verification

- 766 control-admin unit tests passed.
- 67 PostgreSQL test executions passed: Neon 17, Studio 17, Mesh 16, and 17 with the
  fresh-install SQL fragment plus final hardening applied separately to a populated clone.
- Eight new regression cases cover own/foreign tenant references for both domain changes,
  rollback, direct SQL enforcement, both concurrency orders with observed lock contention,
  unaffected global references, private-function ACLs and native cycle references.
- Control-admin source/test and host typechecks passed.
- Databases were disposable restores; development and QA were unchanged.

The migration and fresh-install SQL share the same function/trigger definitions.
The other second-review findings, including lookup read snapshot consistency, are
separate changes.
