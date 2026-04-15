# RB-03 — Legal Hold Activation + Release

**System:** AUD/GOV — `governance.legal_hold` + `governance.legal_hold_manifest`  
**Severity:** P1 — incorrect activation or premature release is a compliance violation  
**Owner:** Compliance Officer + Platform Engineering  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

A **legal hold** freezes one or more audit-log partitions, preventing archival (and therefore deletion) until
the hold is explicitly released. The hold is scoped by entity type, date range, and/or log schema.
The partition-archive worker checks every candidate partition against active holds before detaching.

### Key components

| Component | Value |
|-----------|-------|
| Hold table | `governance.legal_hold` |
| Manifest table | `governance.legal_hold_manifest` |
| Routes file | `server/framework/runtime/services/audit/routes/legal-hold.route.ts` |
| Hold code format | `^[a-z0-9-]{1,60}$` (lowercase alphanumeric + hyphens) |
| Hold status values | `active`, `released` |
| Scope dimensions | `scopeEntityType`, `scopeDateFrom`, `scopeLogSchemas[]` |

### Legal hold status flow

```
POST /api/audit/legal-holds  →  active
                              ↓
PATCH /:id/release            →  released  (immutable after this)
```

---

## 2. Activating a Legal Hold

### 2.1 Required fields

| Field | Required | Notes |
|-------|----------|-------|
| `holdName` | yes | Human-readable label |
| `holdCode` | yes | Unique slug, `^[a-z0-9-]{1,60}$` |
| `custodianId` | yes | Principal ID responsible for this hold |
| Scope (at least one) | yes | `scopeEntityType`, `scopeDateFrom`, or `scopeLogSchemas` |
| `scopeDateFrom` | conditional | ISO 8601; inclusive start of date range to freeze |
| `scopeDateTo` | conditional | ISO 8601; inclusive end of date range to freeze |
| `description` | no | Free-text reason; recommended for audit trail |

### 2.2 Create hold API call

```bash
POST /api/audit/legal-holds
Authorization: Bearer {compliance_token}
Content-Type: application/json

{
  "holdName": "SEC Investigation Q1 2026",
  "holdCode": "sec-inv-q1-2026",
  "custodianId": "usr_xxxxxxxxxx",
  "description": "Freeze all financial audit records for SEC subpoena 2026-04-01",
  "scopeEntityType": "journal_entry",
  "scopeDateFrom": "2026-01-01",
  "scopeDateTo":   "2026-03-31",
  "scopeLogSchemas": ["log"]
}
```

Expected response: `201 Created` with the hold object including `id` and `status: "active"`.

### 2.3 Immediate post-activation verification

```bash
# Confirm hold is active
GET /api/audit/legal-holds/{id}
Authorization: Bearer {compliance_token}
```

Check `status = "active"` and that `scopeDateFrom`/`scopeDateTo` match the intended range.

Trigger a manifest refresh to populate blocked partitions immediately (the sweep runs monthly, but manifest refresh is instant):

```bash
POST /api/audit/legal-holds/{id}/manifest/refresh
Authorization: Bearer {compliance_token}
```

### 2.4 Verify manifest — confirm which partitions are frozen

```bash
GET /api/audit/legal-holds/{id}
Authorization: Bearer {compliance_token}
```

The response includes the hold detail plus manifest rows. Each row lists:
- `partitionTable` — e.g. `audit_log_2026_01`
- `partitionRangeLo` / `partitionRangeHi` — the actual date bounds
- `isReleased` — must be `false` for all rows on an active hold

Also verify directly in DB:

```sql
SELECT
  m.partition_table,
  m.partition_range_lo,
  m.partition_range_hi,
  m.is_released
FROM governance.legal_hold_manifest m
WHERE m.legal_hold_id = :hold_id
  AND m.tenant_id     = :tenant_id
ORDER BY m.partition_range_lo;
```

---

## 3. Releasing a Legal Hold

> **Warning:** Release is irreversible. Once released, partitions within the date range are eligible for archival on the next monthly sweep. Confirm with legal/compliance before proceeding.

### 3.1 Pre-release checklist

- [ ] Written authorisation from the Compliance Officer received
- [ ] Case or matter is formally closed
- [ ] Replacement hold created if only part of the scope should be released
- [ ] Export / snapshot taken for permanent record (optional but recommended)

### 3.2 Export records before release (recommended)

```bash
# Export the held date range as JSON with integrity hash chain
GET /api/audit/events/export?format=json&from=2026-01-01&to=2026-03-31
Authorization: Bearer {compliance_token}
```

Save the response body and the `X-Integrity-Hash` header value for permanent archival.

### 3.3 Release the hold

```bash
PATCH /api/audit/legal-holds/{id}/release
Authorization: Bearer {compliance_token}
Content-Type: application/json

{
  "releaseReason": "SEC case 2026-SEC-01234 closed 2026-04-14; authorised by J. Smith"
}
```

Expected response: `200 OK` with `status: "released"`, `releaseDate`, and `releasedBy` fields populated.

### 3.4 Verify release + manifest clearance

```sql
-- Confirm hold is released
SELECT status, release_date, release_reason, released_by
FROM governance.legal_hold
WHERE id = :hold_id AND tenant_id = :tenant_id;

-- Confirm manifest rows are marked released
SELECT COUNT(*) FILTER (WHERE is_released = false) AS still_blocked,
       COUNT(*) FILTER (WHERE is_released = true)  AS released
FROM governance.legal_hold_manifest
WHERE legal_hold_id = :hold_id AND tenant_id = :tenant_id;
-- Expected: still_blocked = 0
```

After the next monthly sweep (cron `0 2 1 * *`), previously blocked partitions within the hold's date range will be archived if they are also past the retention window.

---

## 4. Troubleshooting

### 4.1 Hold creation fails — duplicate hold_code

```
400 Bad Request: hold_code already exists
```

Either use a unique code or check if the existing hold covers the same scope:

```bash
GET /api/audit/legal-holds?status=active
Authorization: Bearer {compliance_token}
```

If the prior hold was erroneously created, release it (§3.3) and recreate.

### 4.2 Manifest refresh returns empty manifest

The manifest is empty when:
- No partitions exist within the hold's date range (all already archived before hold was created — data loss risk!)
- `scopeLogSchemas` does not include `'log'`
- Hold's `scopeDateFrom`/`scopeDateTo` does not overlap any partition boundary

Diagnose:

```sql
-- Check which partitions fall in the hold's date range
SELECT c.relname,
       pg_get_expr(c.relpartbound, c.oid, true) AS bound
FROM pg_inherits i
JOIN pg_class p ON p.oid = i.inhparent
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_namespace n ON n.oid = p.relnamespace
WHERE n.nspname = 'log' AND p.relname = 'audit_log'
ORDER BY c.relname;
```

If the expected partitions are missing, they were already archived. Escalate to compliance immediately.

### 4.3 Partition archived despite active hold

This indicates the hold guard logic failed to find the hold during the sweep. Steps:

1. Confirm the hold `status = 'active'` at time of archive.
2. Check `governance.legal_hold_manifest` for the missing partition row.
3. If no manifest row exists, the date-range overlap check did not match — verify `scope_date_from`/`scope_date_to` vs. partition bounds.
4. If the partition was dropped, engage the DBA to restore from backup.

---

## 5. Escalation

| Condition | Action |
|-----------|--------|
| Partition archived under active hold | Treat as data-loss incident; restore from backup; notify legal |
| Hold creation blocked by DB constraint | Engage DBA to check for `governance.legal_hold` unique-index conflicts |
| Release authorisation unclear | Do not release; escalate to Compliance Officer |
| Manifest refresh returns wrong partitions | Cross-check scope dates; if systematically wrong, file a bug against `partition-archive.worker.ts` |
