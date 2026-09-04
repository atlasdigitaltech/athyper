# G6 compatibility recovery rehearsal

This runbook produces rollback/reconstruction evidence for all six G6 compatibility surfaces. It must run only against an isolated NEON clone restored from a recent production backup. Every database retirement candidate is enclosed in a forced-rollback transaction; this procedure is prohibited against production.

## Preconditions

1. Restore a production backup into a separately isolated PostgreSQL cluster and a database whose name matches `g6.*recovery.*rehearsal`.
2. Prevent application traffic, replication back to production, scheduled jobs, outbox dispatch, and external provider access from the clone.
3. Copy `config/governance/governed-lifecycle-g6-recovery-backup.example.json` outside the example path and replace every placeholder with immutable backup/restore evidence. The PostgreSQL system identifiers for source and clone must differ.
4. Connect with a clone-only database administrator capable of reading `pg_control_system()` and the tenant-protected data. The runner emits counts and hashes only; it never writes source rows to report files.
5. Confirm the backup is no more than seven days old and that the recorded RTO/RPO targets are approved for this rehearsal.

## Execute

```bash
pnpm --filter @athyper/server-db db:rehearse:g6-compatibility-recovery -- \
  --database-url="$G6_RECOVERY_CLONE_DATABASE_URL" \
  --backup-manifest=config/governance/governed-lifecycle-g6-recovery-backup.v1.json \
  --operator=operator-immutable-id \
  --output-dir=docs/architecture/reports/g6/recovery \
  --confirm=REHEARSE-G6-RECOVERY-ON-ISOLATED-CLONE
```

The runner refuses a source/clone database-name or PostgreSQL-system-identifier match. It also refuses a non-NEON plane, an old backup, an output outside the G6 recovery directory, malformed timestamps, and missing explicit confirmation.

Six surface reports and one index are created with exclusive file creation. Each surface report records the source backup identity, backup-manifest hash, its surface-specific retirement migration hash, row/hash comparisons, RTO/RPO, operator, timestamps, forced rollback, and pass/fail outcome. The runner loads and executes the same ordered migration artifact it hashes from `governed-lifecycle-g6-retirement-sequence.v1.json`, preventing evidence from referring to different SQL.

## Pass semantics

- Request-family data is copied to a compatibility schema, the root retirement candidate is applied, and every immutable table copy must retain its count and canonical hash.
- The aliases cache must equal an effective-date-aware regeneration from `master.business_partner_alias` before its column is removed.
- Flattened decision coordinates must exactly equal the reconstructable group-1 include coordinates in `control.business_partner_decision_scope` before the flattened columns are removed. Richer normalized cardinality that cannot flatten cleanly fails the rehearsal.
- Every retained workforce projection must map to employment authority and the latest hash-linked canonical command/outbox intent. Active, suspended, and deprovisioned replay evidence must all be present before the compatibility table is removed.
- Historical person/group coordinates are exported, and the Person, employee, employment, and work-assignment authorities must remain byte-canonically unchanged after removing the legacy link.
- Every implementation-inventory row must carry an implemented, ADR, backlog/deferred, retired, or other accepted disposition marker. The report records both its Git object and repository revision for recovery.

A failed report is durable negative evidence and does not set `rollbackRehearsalPassed`. A successful index must be reviewed and hash-bound into the production observation/approval record through the separate G6 evidence approval step. It does not by itself authorize retirement, satisfy zero-use observation, or substitute for clean/supported-upgrade pre/post catalog and privilege parity.
