# RB-01 — Outbox Drain Monitoring + Recovery

**System:** INT — `event.outbox` table / BullMQ `jobs-domain-outbox` queue  
**Severity:** P1 — stuck events delay financial postings, workflow triggers, and audit fan-out  
**Owner:** Platform Engineering / On-Call  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

The **domain outbox** pattern ensures reliable event delivery across topics (`fin`, `wf`, `audit`). Every service writes rows to `event.outbox`; the drain worker claims batches via `FOR UPDATE SKIP LOCKED`, delivers them, and marks them `delivered`. Failed rows are retried up to `max_attempts` (5) before moving to `dead_letter` status.

### Key components

| Component | Value |
|-----------|-------|
| DB table | `event.outbox` |
| BullMQ queue | `jobs-domain-outbox` |
| BullMQ jobs | `drain:fin`, `drain:wf`, `drain:audit` |
| Worker file | `server/framework/runtime/services/jobs/workers/domain-outbox.worker.ts` |
| Drain interval | 30 s (`DEFAULT_INTERVALS.DOMAIN_OUTBOX_DRAIN_MS`) |
| Batch size | 50 events per drain cycle |
| Retry delay | 30 000 ms after each failure |
| Max attempts | 5 (configurable per row at insert time) |
| Lock owner format | `domain-outbox-{pid}-{topic}` |

### Outbox event statuses

```
pending → processing → delivered
                    ↘ pending  (retry, attempts < max_attempts)
                    ↘ dead_letter  (attempts >= max_attempts)
```

---

## 2. Detection — How to Spot a Problem

### 2.1 Bull Board UI

Navigate to `/admin/jobs` (internal network only).  
Look for `jobs-domain-outbox` — check:
- **Failed** count > 0 and growing
- **Delayed** count high (drain jobs waiting, not draining)
- **Active** jobs stalled (age > 2 min without completing)

### 2.2 DB health query — pending event backlog

```sql
-- Run as app_role; replace :tenant_id
SELECT
  topic,
  status,
  COUNT(*)                         AS cnt,
  MIN(created_at)                  AS oldest,
  MAX(attempts)                    AS max_attempts_seen
FROM event.outbox
WHERE tenant_id = :tenant_id
GROUP BY topic, status
ORDER BY topic, status;
```

**Healthy:** `pending` count stays low (< 200 between drain cycles). `dead_letter` count should be 0.

**Unhealthy signals:**
- `pending` rows older than 5 minutes
- Any `dead_letter` rows
- `processing` rows with `locked_at` older than 5 minutes (orphaned lock)

### 2.3 Orphaned lock detection

```sql
SELECT id, topic, locked_by, locked_at, attempts, last_error
FROM event.outbox
WHERE tenant_id = :tenant_id
  AND status = 'processing'
  AND locked_at < NOW() - INTERVAL '5 minutes';
```

### 2.4 Dead-letter query

```sql
SELECT id, topic, attempts, last_error, created_at, updated_at
FROM event.outbox
WHERE tenant_id = :tenant_id
  AND status = 'dead_letter'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 3. Recovery Procedures

### 3.1 Force-drain a stuck topic

If the BullMQ worker is alive but a specific topic is not draining:

```bash
# 1. Check worker logs for the stuck topic
kubectl logs -l app=svc-jobs --tail=200 | grep "domain-outbox"

# 2. Restart the jobs service pod (triggers fresh drain immediately)
kubectl rollout restart deployment/svc-jobs
```

After restart the worker re-connects and claims the next batch within 30 s.

### 3.2 Release an orphaned processing lock

Rows stuck in `processing` with a stale `locked_at` will never be retried automatically (the lock prevents re-claim). Release them manually:

```sql
-- Release orphaned locks for a specific topic
UPDATE event.outbox
SET
  status    = 'pending',
  locked_at = NULL,
  locked_by = NULL
WHERE tenant_id = :tenant_id
  AND status    = 'processing'
  AND locked_at < NOW() - INTERVAL '5 minutes'
  -- Optional: scope to one topic
  AND topic = 'fin';
```

Verify the update count and confirm rows move back to `pending` and are picked up within one drain cycle (30 s).

### 3.3 Replay a single dead-letter event via API

Use the jobs admin API (requires `ops-admin` or `jobs:admin` permission):

```bash
# List dead-letter events for inspection
GET /api/jobs/admin/outbox/dead
Authorization: Bearer {ops_token}

# Replay a specific event (resets status to pending, attempts to 0)
POST /api/jobs/admin/outbox/{id}/replay
Authorization: Bearer {ops_token}
```

Or use the integration route directly:

```bash
POST /api/integration/outbox/{id}/retry
Authorization: Bearer {ops_token}
```

### 3.4 Bulk-replay dead-letter events from DB

When a downstream service was temporarily down and caused mass dead-letter accumulation:

```sql
-- Step 1: Inspect payloads before replaying
SELECT id, topic, payload->'eventType' AS event_type, last_error, created_at
FROM event.outbox
WHERE tenant_id = :tenant_id
  AND status = 'dead_letter'
  AND topic  = 'fin'
ORDER BY created_at;

-- Step 2: Reset to pending (replay all for a topic)
UPDATE event.outbox
SET
  status    = 'pending',
  attempts  = 0,
  locked_at = NULL,
  locked_by = NULL,
  last_error = NULL,
  available_at = NOW()
WHERE tenant_id = :tenant_id
  AND status = 'dead_letter'
  AND topic  = :topic;
```

> **Caution:** Replaying `fin` events re-triggers financial postings. Verify idempotency of downstream consumers before bulk-replaying. Check if the target table already has the expected record.

### 3.5 Discard an event that should not be retried

```bash
POST /api/integration/outbox/{id}/discard
Authorization: Bearer {ops_token}
```

This sets `status = 'dead_letter'` with `last_error = 'manually_discarded'` and prevents further automatic retry.

---

## 4. Verification

After recovery, confirm the drain is healthy:

```sql
-- Should return no rows within 2 minutes of recovery action
SELECT COUNT(*)
FROM event.outbox
WHERE tenant_id = :tenant_id
  AND status IN ('pending', 'dead_letter')
  AND created_at < NOW() - INTERVAL '5 minutes';
```

Also verify downstream effects:
- `fin` events: check that corresponding ledger entries or journal postings have been created.
- `wf` events: check `event.work_item` for newly created items.
- `audit` events: check `log.audit_log` for expected rows.

---

## 5. Escalation

| Condition | Action |
|-----------|--------|
| Worker pod crash-looping | Page on-call SRE; check `svc-jobs` container logs for OOM or DB connection errors |
| Dead-letter backlog > 500 rows | Engage application engineer; inspect `last_error` for systemic downstream failure |
| Orphaned locks after pod restart | Run release query (§3.2) and monitor for re-lock within 5 min; if it recurs, suspect DB-level lock conflict |
| `event.outbox` table bloat (> 1M rows) | Run `VACUUM ANALYZE event.outbox`; consider archiving old `delivered` rows to cold storage |
