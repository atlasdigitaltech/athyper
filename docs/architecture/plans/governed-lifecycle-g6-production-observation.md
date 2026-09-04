# G6 production compatibility observation

Status: executable, awaiting an authentic production deployment and observation window.

The observation is a two-checkpoint procedure. It never accepts operator-supplied usage counts. Application activity is read from Prometheus and database activity is calculated from start/end `pg_stat_statements` snapshots. A reset, database identity change, missing metric series, changed release/source reference, or changed consumer inventory invalidates the window.

Prerequisites:

- Deploy the release containing `athyper_governed_compatibility_access_total` before the start checkpoint and verify every API replica is scraped.
- Enable `pg_stat_statements` on the production NEON database. Its statistics must not be reset during the window.
- Obtain the immutable production database identity SHA-256 from the database owner and record the metrics and database-activity source references in the release record.
- Capture the active source inventory immediately before starting:

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

After at least 14 consecutive days with no reset or evidence gap, record the end checkpoint. `--started-at` must exactly equal `capturedAt` in the start artifact.

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

The recorder stores release and source identities, the hashed production database identity, start-artifact and consumer-inventory hashes, Prometheus query/result hashes, database query/result hashes, per-operation application counters, database activity deltas, and current workforce/person compatibility counts. It records zero only when all required metric series exist and both database checkpoints form an uninterrupted interval.

The retirement evaluator independently requires `authenticProductionEvidence`. Editing a ledger row to declare zero without this evidence remains fail-closed.
