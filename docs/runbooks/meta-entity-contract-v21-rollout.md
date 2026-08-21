# Meta Entity Contract v2.1 rollout

## Purpose

This runbook governs migration from legacy metadata reads to the immutable
Contract v2.1 artifact. Admin remains the authoring plane; Neon and Mesh consume
only the published compiled descriptor.

## Evidence required before each stage

Run the eight `meta-entity-contract` CI jobs. A stage may advance only when the
contract audit has no `CRITICAL` or `HIGH` rows, the migration report has no
unreviewed quarantine, and legacy/v2 shadow comparison differences are either
zero or explicitly approved.

Generate evidence against a provisioned database:

```powershell
pnpm --filter @athyper/db run db:verify:meta-contract-audit
pnpm --filter @athyper/db run db:report:meta-contract-migration -- --output=../../artifacts/meta-entity-contract-migration-report.json --fail-on-quarantine
pnpm policy:meta-entity-contract
```

The migration report is read-only. It exports complete versioned graphs, treats
tenant overlays separately, counts numbering counters without exporting their
values, and quarantines any graph that cannot be upgraded without guessing.

## Promotion sequence

Promote in this exact order:

1. Shadow compile every entity.
2. Internal `company_code` pilot.
3. Internal complex-document pilot covering lifecycle, numbering, relations,
   action rules and flows.
4. One or two canary tenants.
5. Cohorts at 10%, 25%, 50% and 100%.

At every stage, copy
`config/governance/meta-entity-rollout-snapshot.example.json`, fill it with
observed values, and run:

```powershell
pnpm verify:meta-entity-rollout -- --snapshot=path/to/snapshot.json
```

A `STOP` result blocks promotion. Keep the monitored legacy read fallback until
100% has completed two stable release windows. Then disable legacy metadata
writers before retiring the fallback.

## Automatic stop conditions

Stop immediately for any cross-tenant access, partial publication, hash
mismatch, unexplained descriptor drift, cache invalidation failure, route error
regression or descriptor/bootstrap/list/detail SLO breach. Preserve the failed
artifact, audit rows, outbox event and affected cohort identifiers.

## Rollback

1. Disable v2 reads only for the affected cohort.
2. In one transaction, publish/repoint to the previous immutable Contract
   version according to the publication service's rollback operation.
3. Commit, then invalidate and warm descriptor, bootstrap, list and detail
   caches from the committed outbox event.
4. Verify published pointers and compiled hashes with the audit view.
5. Preserve failed artifacts and diagnostics for remediation.

Do not reverse additive DDL during an incident. Do not edit an effective
Contract or restore metadata using direct table updates.
