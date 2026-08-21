# Authorization Wave 0 delivery status

Date: 2026-07-27  
Status: repository foundation built; production certification gate closed

Wave 0 freezes the target architecture and supplies the controls needed to
measure the legacy system before any authorization backfill or cutover. It does
not switch a runtime evaluator, install DDL in a live database, approve a
retention decision, or authorize a production cutover.

## Delivered controls

| Requirement | Canonical artifact |
| --- | --- |
| Ownership, evaluator precedence, Admin-plan semantics, and the zero-Mesh-data Neon boundary | `docs/architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md` |
| Authorization source, reader, writer, route, contract, UI, Keycloak, seed, database, and generated-artifact inventory | `config/governance/authorization-inventory.v1.json`, `config/governance/authorization-source-registry.v1.json`, and `docs/architecture/authorization-source-inventory.md` |
| Golden-corpus contract, identity reconciliation, and source-bound supplemental Mesh/context evidence | `config/governance/authorization-high-risk-action-catalog.v1.json`, the three authorization evidence schemas, `docs/architecture/authorization-golden-decision-corpus-contract.md`, and the capture/verification scripts |
| Legacy-write telemetry and cross-tenant/account-boundary data-quality reporting | The Neon and Mesh `report-*-authorization-legacy-writes.ts` and `report-*-authorization-data-quality.ts` scripts |
| Atomic plane/cohort shadow and enforcement controls | `config/governance/authorization-rollout-contract.json` and `server/packages/services/iam/authorization-rollout/` |
| Independent transactional change capture and durable source watermarks | Neon `control`/`event` DDL plus its atomic installer, and Mesh `mesh_control`/`mesh_log` DDL plus `provision-mesh.ts --capture-only` |
| Table/object disposition and retention inventory | `config/governance/authorization-data-disposition-policy.v1.json`, `config/governance/authorization-data-disposition-inventory.v1.json`, and `docs/architecture/authorization-data-disposition-inventory.md` |
| Synchronization, cutover, rollback, RPO, and RTO contract | `config/governance/authorization-migration-recovery-contract.v1.json` and `docs/runbooks/authorization-v2-synchronization-cutover-and-rollback.md` |
| Unified certification gate | `scripts/policy/verify-authorization-wave0.mjs` |

The rollout selector defaults to `legacy`. Missing, invalid, stale, or
cross-plane configuration also resolves to `legacy`; `shadow` returns the exact
legacy decision; `enforce` is fail-closed and has no legacy fallback. A named
rule also cannot match without the approved golden-corpus hash, exact
plane-local source UUID, and an applied watermark at or above its approved
minimum.

## Current gate result

The repository-only gate currently reports 7 passing checks, 9 pending checks,
and 2 failing checks. Production readiness is false.

| Gate | State | Evidence or blocker |
| --- | --- | --- |
| No unknown authorization source or static writer | Pass | Fresh recomputation catalogs 151 objects, 74 capture inputs (66 Neon + 8 Mesh), and 11 Keycloak REST writer paths; every structural unknown/stale/duplicate/cross-plane gate is zero |
| Every declared table/object has one disposition | Pass | 682 cataloged stateful relations and 12 external systems/stores; zero statically unclassified objects |
| Architecture, rollout, capture, and high-risk-action baselines | Pass | Focused policy tests and independent Neon/Mesh static capture verifiers pass |
| Known authorization anomalies removed or retired | Fail | 29 owned findings across 18 unique permission/persona sources remain |
| Zero-Mesh-specific-data Neon boundary implemented | Fail | 16 owned findings across 9 unique legacy table/seed/reader/configuration or RLS-bypass identities remain |
| Every disposition approved | Pending | Data, retention, security, and operations sign-off plus an approval bound to the generated policy hash is absent |
| Every active user represented in the identity corpus | Pending live evidence | Requires matching Keycloak authority evidence and read-only Neon/Mesh captures |
| Every cross-tenant anomaly classified | Pending live evidence | Requires the data-quality report and an approved disposition for each finding fingerprint |
| No unknown live writer | Pending live evidence | Requires installed capture plus an observation window |
| Rollback owner, RTO, triggers, and observation window | Pending approval | Recovery-contract fields remain deliberately null/pending |
| Mesh corpus and boundary acceptance | Pending live evidence | Requires an approved identity mapping, supplemental Mesh evaluator evidence, and an independent Mesh capture |

The 18 unique known source anomalies are:

`AP.INVOICE.APPROVE`, `IAM.DELEGATION.MANAGE`, `IAM.GRANT.MANAGE`,
`IAM.GROUP.MANAGE`, `IAM.PRINCIPAL.READ`, `INVOICE.LINE.ADD_FROM_CATALOG`,
`INVOICE.LINE.ADD_FROM_PO`, `INVOICE.LINE.ADD_FROM_RECEIPT`,
`INVOICE.LINE.ADD_FROM_SERVICE_SHEET`, `master.persona`, `PPL.PII.EDIT`,
`PPL.PII.VIEW`, `SALES.OPPORTUNITY.CREATE`, `SALES.ORDER.CREATE`,
`SALES.QUOTATION.CREATE`, `SOURCE.DEMAND.AGGREGATE`,
`SOURCE.EVENT.CREATE`, and `SOURCE.EVENT.EVALUATE`.

The 9 unique zero-boundary identities are:

`master.business_network`, `master.business_network_membership`,
`master.business_network_membership_role`,
`mesh.runtime.athyperadmin_app_pool`,
`mesh.runtime.postgres_superuser_app_pool`,
`neon.runtime.derived_mesh_database_url`,
`neon.runtime.direct_mesh_database_config`,
`neon.runtime.mesh_reader_fallback`, and
`neon.seed.legacy_mesh_network_authorization`.

## Required live evidence sequence

1. Approve the target environment, evidence directory, authoritative deployed
   object-store export/evidence manifest, and named owners. Keep all rollout
   entries in `legacy`.
2. Use the atomic Neon and Mesh installers before taking the first snapshot.
   Each installer requires an exact database name and change ticket, locks the
   complete plane-local source set, verifies `ENABLE ALWAYS` triggers, and
   emits a separate source UUID/watermark receipt.
3. Start the legacy-write observation window and record its start watermark.
4. In read-only repeatable-read sessions, capture the golden corpus with
   external identity and supplemental decision evidence, then run the
   data-quality and live disposition reports for each plane.
5. Classify every deterministic anomaly fingerprint. Re-run reports until no
   skipped check, unknown writer, unclassified anomaly, or disposition gap
   remains.
6. Fill and approve every recovery-contract owner, RPO/RTO, freeze limit,
   rollback trigger/deadline, observation window, strategy, and ticket.
7. Run the strict unified gate. It independently recomputes repository
   inventory, disposition, capture, and corpus checks and correlates every
   plane artifact to one source UUID/watermark. Shadow or enforcement work may
   start only after it reports `productionReady: true`.

Suggested evidence commands, run from the repository root:

```powershell
pnpm.cmd exec tsx scripts/policy/verify-authorization-inventory.ts --check --json --structural-only
node scripts/policy/authorization-data-disposition.mjs --check
pnpm.cmd --dir server/db exec tsx scripts/verify/verify-authorization-change-capture.ts
pnpm.cmd --dir server/db exec tsx scripts/verify/verify-mesh-authorization-change-capture.ts

pnpm.cmd --dir server/db exec tsx scripts/reports/capture-authorization-golden-corpus.ts `
  --identity-evidence=artifacts/authorization-wave0/external-identity-evidence.json `
  --supplemental-decision-evidence=artifacts/authorization-wave0/mesh-decision-evidence.json `
  --output=artifacts/authorization-wave0/golden-decision-corpus.json --strict
pnpm.cmd --dir server/db exec tsx scripts/verify/verify-authorization-golden-corpus.ts `
  --corpus=artifacts/authorization-wave0/golden-decision-corpus.json --strict

pnpm.cmd --dir server/db exec tsx scripts/reports/report-neon-authorization-legacy-writes.ts `
  --output=artifacts/authorization-wave0/neon-authorization-legacy-writes.json --strict
pnpm.cmd --dir server/db exec tsx scripts/reports/report-mesh-authorization-legacy-writes.ts `
  --output=artifacts/authorization-wave0/mesh-authorization-legacy-writes.json --strict
pnpm.cmd --dir server/db exec tsx scripts/reports/neon-authorization-quality.ts `
  --output=artifacts/authorization-wave0/neon-authorization-data-quality.json --strict
pnpm.cmd --dir server/db exec tsx scripts/reports/mesh-authorization-quality.ts `
  --output=artifacts/authorization-wave0/mesh-authorization-data-quality.json --strict

pnpm.cmd --dir server/db exec tsx scripts/reports/report-authorization-data-disposition-coverage.ts `
  --plane=neon `
  --external-evidence=artifacts/authorization-wave0/external-object-evidence.json `
  --output=artifacts/authorization-wave0/data-disposition-coverage-neon.json --strict
pnpm.cmd --dir server/db exec tsx scripts/reports/report-authorization-data-disposition-coverage.ts `
  --plane=mesh `
  --external-evidence=artifacts/authorization-wave0/external-object-evidence.json `
  --output=artifacts/authorization-wave0/data-disposition-coverage-mesh.json --strict

node scripts/policy/verify-authorization-wave0.mjs --strict
```

`DATABASE_URL` is required for Neon reports and `MESH_DATABASE_URL` for Mesh
reports; there is no cross-plane fallback. The atomic installers instead use
their explicit admin connection variables and require the arguments documented
in the synchronization runbook. Credentials and evidence artifacts must follow
the project secret-handling and retention policy; they must not be committed.

The rollout package is a fail-safe selector/router foundation. Wiring approved
plane-local policy providers into production consumers belongs to the later
shadow/cutover wave; this Wave 0 build does not change any authoritative runtime
decision.
