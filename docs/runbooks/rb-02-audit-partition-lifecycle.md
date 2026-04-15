# RB-02 — Audit Partition Lifecycle

**System:** AUD — `log.audit_log` monthly partitions / BullMQ `jobs-partition-archive` queue  
**Severity:** P1 — missed archives cause tablespace bloat; blocked archives can indicate compliance holds  
**Owner:** Platform Engineering / Database Administrator  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

`log.audit_log` is range-partitioned by `created_at` with one child table per month
(e.g. `log.audit_log_2026_01`). On the 1st of each month at 02:00 UTC a **sweep** job runs,
identifies partitions older than the retention window, checks for active legal holds, and
archives (detaches + drops) eligible partitions.

### Key components

| Component | Value |
|-----------|-------|
| DB table (partitioned) | `log.audit_log` |
| Also partitioned | `log.permission_decision_log` |
| BullMQ queue | `jobs-partition-archive` |
| BullMQ jobs | `sweep` (monthly sweep), `archive-partition` (per partition) |
| Worker file | `server/framework/runtime/services/jobs/workers/partition-archive.worker.ts` |
| Sweep cron | `0 2 1 * *` (02:00 UTC, 1st of month) |
| Scheduler ID | `sched:partition-archive-sweep` |
| Retention env var | `PARTITION_RETENTION_MONTHS` (default **13 months**) |
| Hold guard tables | `governance.legal_hold`, `governance.legal_hold_manifest` |

### Partition naming convention

```
log.audit_log_YYYY_MM          (e.g. log.audit_log_2026_01)
log.audit_log_YYYY_MM_hi       upper bound exclusive = YYYY-(MM+1)-01
```

---

## 2. Monthly Archive Procedure

This section describes what the automation does and how to run it manually if the automated job missed.

### 2.1 Automated flow (reference)

1. **SWEEP job** fires at 02:00 UTC on the 1st.
2. Queries `pg_inherits` + `pg_class` to find partitions whose upper bound is older than `NOW() - PARTITION_RETENTION_MONTHS months`.
3. For each candidate partition:
   a. Calls `findBlockingHolds()` — queries `governance.legal_hold` for date-range overlaps.
   b. **Blocked by hold:** records a row in `governance.legal_hold_manifest` and skips.
   c. **No hold:** enqueues an `archive-partition` job with `{ schema, table }` payload.
4. **ARCHIVE-PARTITION job** re-checks hold, then executes:
   ```sql
   ALTER TABLE log.audit_log DETACH PARTITION log.audit_log_YYYY_MM CONCURRENTLY;
   DROP TABLE log.audit_log_YYYY_MM;
   ```

### 2.2 Manual sweep trigger (if cron missed)

```bash
# Trigger a one-off sweep job via the jobs admin API
POST /api/jobs/admin/queues/jobs-partition-archive/jobs
Authorization: Bearer {ops_token}
Content-Type: application/json
{"name": "sweep", "data": {}}
```

Monitor progress in Bull Board `/admin/jobs` under the `jobs-partition-archive` queue.

### 2.3 Manual single-partition archive

If you need to archive one specific partition immediately:

```bash
POST /api/jobs/admin/queues/jobs-partition-archive/jobs
Authorization: Bearer {ops_token}
Content-Type: application/json
{"name": "archive-partition", "data": {"schema": "log", "table": "audit_log_2025_02"}}
```

---

## 3. Verifying Partition Health

### 3.1 List all current audit partitions

```sql
SELECT
  c.relname                                      AS partition_name,
  pg_get_expr(c.relpartbound, c.oid, true)       AS partition_bound,
  pg_size_pretty(pg_total_relation_size(c.oid))  AS size
FROM pg_inherits i
JOIN pg_class p ON p.oid = i.inhparent
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_namespace n ON n.oid = p.relnamespace
WHERE n.nspname = 'log'
  AND p.relname = 'audit_log'
ORDER BY c.relname;
```

### 3.2 Check for overdue partitions (should have been archived)

```sql
-- Shows partitions older than retention window that have NOT been archived
-- Replace 13 with PARTITION_RETENTION_MONTHS env value
SELECT c.relname AS partition_name
FROM pg_inherits i
JOIN pg_class p ON p.oid = i.inhparent
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_namespace n ON n.oid = p.relnamespace
WHERE n.nspname = 'log'
  AND p.relname = 'audit_log'
  AND c.relname < 'audit_log_' ||
      to_char(NOW() - INTERVAL '13 months', 'YYYY_MM')
ORDER BY c.relname;
```

Any rows returned are overdue for archival. Cross-check `governance.legal_hold_manifest` to confirm whether they are held.

### 3.3 Check legal hold manifest for blocked partitions

```sql
SELECT
  m.partition_table,
  m.partition_range_lo,
  m.partition_range_hi,
  h.hold_name,
  h.status           AS hold_status,
  m.is_released
FROM governance.legal_hold_manifest m
JOIN governance.legal_hold h ON h.id = m.legal_hold_id
WHERE m.tenant_id = :tenant_id
  AND m.is_released = false
ORDER BY m.partition_range_lo;
```

### 3.4 Verify audit log row integrity (hash chain)

The audit export endpoint validates the SHA-256 hash chain. Run a spot check:

```bash
GET /api/audit/events/export?format=json&from=2026-01-01&to=2026-01-31
Authorization: Bearer {ops_token}
```

The response includes `integrity.valid: true` when the hash chain is unbroken. A `false` value indicates row tampering or data loss in that partition.

---

## 4. Recovery Procedures

### 4.1 Sweep job failed / did not run

Check Bull Board for failed `sweep` jobs. Inspect error message. Common causes:

| Error | Remedy |
|-------|--------|
| `DB connection refused` | Restore DB connectivity; re-enqueue sweep (§2.2) |
| `permission denied for table pg_inherits` | Grant `pg_monitor` role to the app DB user |
| `DETACH PARTITION CONCURRENTLY requires PG 14+` | Confirm PostgreSQL version ≥ 14 |
| Job not present in queue at all | Check `sched:partition-archive-sweep` scheduler entry (§4.3) |

### 4.2 Partition archive blocked by unexpected hold

If a partition you expect to archive is blocked:

1. Identify the blocking hold:
   ```sql
   SELECT h.id, h.hold_name, h.hold_code, h.status,
          h.scope_date_from, h.scope_date_to, h.custodian_id
   FROM governance.legal_hold h
   JOIN governance.legal_hold_manifest m ON m.legal_hold_id = h.id
   WHERE m.partition_table = 'audit_log_YYYY_MM'
     AND m.tenant_id = :tenant_id;
   ```
2. If the hold is erroneous or already resolved, release it via the API (see [RB-03](rb-03-legal-hold.md)).
3. After release, re-enqueue the `archive-partition` job (§2.3).

### 4.3 Scheduler not registered (sweep never fires)

```sql
-- Check scheduler entry exists in control.cron_schedule
SELECT id, schedule_cron, queue_name, job_name, enabled
FROM control.cron_schedule
WHERE id = 'sched:partition-archive-sweep';
```

If missing, the sweep was never registered during startup. Restart `svc-jobs` — it re-registers all schedulers on boot. If it persists:

```sql
INSERT INTO control.cron_schedule
  (id, schedule_cron, queue_name, job_name, payload, enabled)
VALUES
  ('sched:partition-archive-sweep', '0 2 1 * *', 'jobs-partition-archive',
   'sweep', '{}', true);
```

Then restart `svc-jobs`.

### 4.4 Table bloat — partition not dropped after detach

If `DETACH` succeeded but `DROP TABLE` failed, the partition becomes an orphan standalone table. Detect and clean up:

```sql
-- Find orphan tables (detached partitions) in the log schema
SELECT relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'log'
  AND c.relkind = 'r'
  AND c.relname ~ '^audit_log_\d{4}_\d{2}$'
  AND NOT EXISTS (
    SELECT 1 FROM pg_inherits WHERE inhrelid = c.oid
  );
```

Drop each orphan after confirming no active hold:

```sql
DROP TABLE log.audit_log_YYYY_MM;
```

---

## 5. Escalation

| Condition | Action |
|-----------|--------|
| Hash-chain integrity failure | Engage security team; do not archive the affected partition until investigation is complete |
| Partition older than 24 months still present | Check for long-running holds; escalate to legal/compliance |
| DB tablespace > 80% full | Emergency purge of delivered outbox rows AND expedite partition archive; page DBA |
| Sweep job taking > 30 min | Suspect large number of partitions or lock contention; check `pg_stat_activity` for blocking queries |
