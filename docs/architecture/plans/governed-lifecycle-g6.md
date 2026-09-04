# G6 governed compatibility retirement plan

Status: executable, awaiting authentic production observation, recovery, approval, and release evidence.

G6 retires one compatibility surface per reviewed release. Every surface must complete the same ordered lifecycle: production observation, isolated recovery rehearsal, independent approval, controlled retirement, behavioral probes, and post-retirement certification. Missing or mismatched evidence fails closed.

## 1. Production compatibility observation

The observation uses two checkpoints. Application activity comes from Prometheus and database activity comes from start/end `pg_stat_statements` snapshots. Operator-supplied usage counts are never accepted. A reset, database identity change, missing metric series, changed release/source reference, or changed consumer inventory invalidates the window.

Prerequisites:

1. Deploy the release containing `athyper_governed_compatibility_access_total` and verify every API replica is scraped.
2. Enable `pg_stat_statements` on the production NEON database without resetting it during the observation window.
3. Obtain the immutable production database identity SHA-256 from the database owner.
4. Capture the active source inventory:

```sh
pnpm --dir server/db run db:inventory:governed-lifecycle-g6-consumers -- \
  --output=docs/architecture/reports/g6/current-consumer-inventory.json \
  --confirm=RECORD-G6-CONSUMER-INVENTORY
```

Capture the start checkpoint:

```sh
pnpm --dir server/db run db:record:g6-production-compatibility-observation -- \
  --phase=start \
  --environment=production \
  --deployment-release=<immutable-release-id> \
  --metrics-source-reference=<immutable-prometheus-source-id> \
  --database-activity-source-reference=<immutable-db-monitoring-source-id> \
  --production-database-identity=<approved-sha256> \
  --database-url=<production-neon-admin-url> \
  --prometheus-url=<production-prometheus-url> \
  --consumer-inventory=docs/architecture/reports/g6/current-consumer-inventory.json \
  --output=docs/architecture/reports/g6/production-observation-start.json \
  --confirm=CAPTURE-G6-PRODUCTION-COMPATIBILITY-START
```

After at least 14 consecutive days without an evidence gap, capture the end checkpoint. `--started-at` must equal `capturedAt` in the start artifact.

```sh
pnpm --dir server/db run db:record:g6-production-compatibility-observation -- \
  --environment=production \
  --started-at=<start-checkpoint-capturedAt> \
  --ended-at=<offset-aware-end-time> \
  --deployment-release=<same-immutable-release-id> \
  --metrics-source-reference=<same-prometheus-source-id> \
  --database-activity-source-reference=<same-db-monitoring-source-id> \
  --production-database-identity=<same-approved-sha256> \
  --database-url=<production-neon-admin-url> \
  --prometheus-url=<production-prometheus-url> \
  --consumer-inventory=docs/architecture/reports/g6/current-consumer-inventory.json \
  --database-start-checkpoint=docs/architecture/reports/g6/production-observation-start.json \
  --output=config/governance/governed-lifecycle-g6-retirement-observations.v1.json \
  --confirm=RECORD-G6-PRODUCTION-COMPATIBILITY-OBSERVATION
```

The recorder binds release, source, database, inventory, query, result, and time-window identities. Zero is valid only when every required metric series exists and both database checkpoints form one uninterrupted interval. The evaluator independently requires `authenticProductionEvidence`.

## 2. Isolated recovery rehearsal

Run recovery only against an isolated NEON clone restored from a production backup no more than seven days old. The clone must not receive application traffic, scheduled jobs, outbox delivery, external-provider access, or replication back to production. Its database name must match `g6.*recovery.*rehearsal`, and its PostgreSQL system identifier must differ from production.

Complete `config/governance/governed-lifecycle-g6-recovery-backup.v1.json` with immutable backup, restore, RTO, and RPO evidence, then run:

```bash
pnpm --filter @athyper/server-db db:rehearse:g6-compatibility-recovery -- \
  --database-url="$G6_RECOVERY_CLONE_DATABASE_URL" \
  --backup-manifest=config/governance/governed-lifecycle-g6-recovery-backup.v1.json \
  --operator=operator-immutable-id \
  --output-dir=docs/architecture/reports/g6/recovery \
  --confirm=REHEARSE-G6-RECOVERY-ON-ISOLATED-CLONE
```

Every retirement candidate runs in a forced-rollback transaction. Reports must prove reconstruction for request-family data, the aliases cache, normalized decision coordinates, workforce identity projections, historical person/group coordinates, and the temporary implementation inventory. Counts and canonical hashes must match, and retained authorities must remain unchanged.

A failed report is durable negative evidence. A successful rehearsal establishes recovery readiness only; it does not replace production observation, approval, or catalog and privilege parity.

## 3. Independent approval packets

Each surface requires separate substantive attestations from the surface owner, database owner, and release owner. Each approver must use a distinct Ed25519 key and immutable authority-record reference. Names, checkboxes, role labels, `yes`, `true`, `approved`, and `ok` are not valid attestations.

Packet preparation requires zero active consumers, qualifying production observation, a passing recovery report bound to the candidate hash, and matching clean/supported-upgrade pre-retirement catalog and privilege captures.

Prepare a packet:

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=prepare \
  --surface=flattened_decision_scope \
  --consumer-inventory=docs/architecture/reports/g6/current-consumer-inventory.json \
  --observation-ledger=config/governance/governed-lifecycle-g6-retirement-observations.v1.json \
  --recovery-report=docs/architecture/reports/g6/recovery/REPLACE-surface.json \
  --clean-pre=docs/architecture/reports/g6/clean-pre-retirement.json \
  --upgrade-pre=docs/architecture/reports/g6/supported-upgrade-pre-retirement.json \
  --output=docs/architecture/reports/g6/approvals/flattened_decision_scope.draft.json \
  --confirm=PREPARE-G6-APPROVAL-PACKET
```

Canonicalize each completed attestation before signing:

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=canonicalize \
  --surface=flattened_decision_scope \
  --attestation=docs/architecture/reports/g6/approvals/surface-owner.attestation.json \
  --output=docs/architecture/reports/g6/approvals/surface-owner.canonical \
  --confirm=CANONICALIZE-G6-ATTESTATION
```

Set `attestationHash` to the printed SHA-256 and add the detached base64 signature, public key, and SHA-256 SPKI key ID. Private keys must never enter the repository.

Assemble the packet:

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=assemble \
  --surface=flattened_decision_scope \
  --draft=docs/architecture/reports/g6/approvals/flattened_decision_scope.draft.json \
  --surface-owner-attestation=docs/architecture/reports/g6/approvals/surface-owner.attestation.json \
  --database-owner-attestation=docs/architecture/reports/g6/approvals/database-owner.attestation.json \
  --release-owner-attestation=docs/architecture/reports/g6/approvals/release-owner.attestation.json \
  --output=docs/architecture/reports/g6/approvals/flattened_decision_scope.json \
  --confirm=ASSEMBLE-G6-APPROVAL-PACKET
```

Pass `--approval-dir=docs/architecture/reports/g6/approvals` to the retirement evaluator. It re-hashes evidence, verifies signatures and independence, and binds approval to the exact production observation. Approval alone never authorizes DDL execution.

## 4. Incremental retirement and certification

The sequence in `config/governance/governed-lifecycle-g6-retirement-sequence.v1.json` is authoritative. Retire exactly one surface per reviewed release. A batch, skipped predecessor, changed candidate hash, missing packet, or mismatched database identity fails closed.

For each surface:

1. Refresh the consumer inventory and verify zero runtime references.
2. Complete the production observation checkpoint against that inventory and database identity.
3. Capture immediate clean and supported-upgrade `pre_retirement` catalog and privilege evidence.
4. Complete recovery rehearsal and three-owner approval; the evaluator must report `eligible_to_schedule_retirement`.
5. Apply the exact signed retirement candidate separately to production, a clean database, and a restored supported-upgrade database with `db:apply:g6-compatibility-retirement`.
6. Run rollback-contained negative, replay, tenant-isolation, audit, and privilege probes.
7. Capture `post_retirement` parity from both disposable databases.
8. Run `db:certify:g6-compatibility-retirement` with application receipts, behavioral evidence, and both post-retirement captures.
9. Publish a reviewed sequence-state revision that advances `certifiedThroughOrder` by exactly one.

Any migration, probe, build, or parity failure stops the release. Retirement is forward-only: recover through the rehearsed reconstruction procedure before traffic resumes, or deploy a separately reviewed forward fix. Never edit or silently retry a failed signed candidate.

No current production surface is eligible, so this plan does not authorize execution. The 2026-09-04 local-development exception retired all six local surfaces but does not alter production state or waive production controls.
