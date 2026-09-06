**Audited Jobs execution duplicate repair**

This is a conservative operator migration for the historical enqueue/worker key mismatch. It repairs only an explicitly fingerprinted pair consisting of an untouched queued row and a terminal row for the same physical database, tenant, queue, and BullMQ job ID. It refuses rows with evidence or inbound references, changed rows, groups larger than two, mismatched identities/payloads, and unreviewed foreign keys.

`audit.sql` runs in a repeatable-read, read-only transaction. It reports duplicate identities, statuses, attempts, command references, inbound parent/replacement references, timestamps, and payload fingerprints. It does not output payloads or command reasons.

```bash
docker exec -i athyper-dev-db-1 psql -XqAt -U postgres -d athyper_studio \
  -v ON_ERROR_STOP=1 < server/db/scripts/operations/repair/jobs-execution-duplicates/audit.sql
```

A reviewed plan is JSON with `database`, `plane`, `repair_id`, and `rows`. Each row must contain `duplicate_id`, `canonical_id`, `duplicate_fingerprint`, and `canonical_fingerprint`. Fingerprints are PostgreSQL `md5(to_jsonb(row)::text)` values captured read-only after selecting the exact pair. They detect intervening changes, not malicious plan tampering. Use the same PostgreSQL session timezone when fingerprinting and applying; the completed development run used UTC throughout. Do not regenerate a fingerprint merely to bypass a refused repair.

`run-repair.py` defaults to a transaction rollback. Only `--apply` commits. It requires the expected database name from the plan and complete administrator visibility through RLS. The migration obtains a transaction advisory lock and short-lived write-excluding locks on executions, attempts, and commands. The five-second lock timeout fails instead of indefinitely blocking application traffic.

```bash
python3 server/db/scripts/operations/repair/jobs-execution-duplicates/run-repair.py \
  --container athyper-jobs-repair-copy-20260906 \
  --plan /path/to/studio-plan.json

# Commit only the same plan after rehearsal on the disposable database copy.
python3 server/db/scripts/operations/repair/jobs-execution-duplicates/run-repair.py \
  --container athyper-dev-db-1 --plan /path/to/studio-plan.json --apply
```

Before deleting an eligible queued row, the migration writes its complete JSON representation, the complete retained terminal row, the ID mapping, repair ID, source database, time, administrator, and reason to `ops.job_execution_duplicate_archive`. This archive is administrator-only, has forced RLS, and is protected by an append-only trigger. No attempt or command is edited, moved, or deleted; no foreign key or immutable-evidence trigger is disabled. Terminal execution IDs and rows remain unchanged. Whole-table evidence fingerprints and execution row counts are checked before commit. Repeating the same plan is a no-op while the archived canonical snapshots still match; a later canonical change causes a conservative refusal.

`verify-copy.py` refuses to operate unless its container name starts with `athyper-jobs-repair-copy-` and its Docker network mode is `none`. It expects freshly restored, unrepaired copies of all three application databases and their matching plans. It runs eight checks per plane: refusal of referenced duplicates, refusal of changed canonical rows, refusal of new inbound foreign keys, dry-run rollback, commit/idempotence, archive immutability, exact original-row reconstruction followed by rollback, and a final zero-duplicate audit.

```bash
python3 server/db/scripts/operations/repair/jobs-execution-duplicates/verify-copy.py \
  --container athyper-jobs-repair-copy-20260906 --plan-directory /path/to/plans
```

The completed repair's plans, logical database snapshots, before/after audits, and receipts are stored outside Git in the private evidence directory documented in the runbook. The logical snapshots include all database schema/data, constraints, policies, and triggers; original ownership and grants were intentionally not restored on the isolated test copies. They are rehearsal/data-recovery artifacts, not a replacement for normal disaster-recovery backups.

Exact original rows can be reconstructed using `jsonb_populate_record(NULL::ops.job_execution, original_row)` from the archive. This was tested inside rolled-back transactions on the copies. A committed restoration deliberately reintroduces the duplicate rows, so it requires its own reviewed plan and must not be used as a routine rerun of the repair. The archive remains as immutable evidence.
