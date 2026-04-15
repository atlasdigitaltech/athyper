# RB-04 — IdP / Keycloak Sync Troubleshooting

**System:** IAM — `master.principal` / Keycloak Admin API / BullMQ `jobs-iam-kc-sync`  
**Severity:** P1 — sync failure leaves suspended/revived users in wrong state  
**Owner:** IAM / Security Engineering  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

The KC sync worker polls Keycloak every **15 minutes** and reconciles the `master.principal` table.
Keycloak is the **source of truth**: if KC says a user is disabled, the local record is suspended.

### Key components

| Component | Value |
|-----------|-------|
| DB table | `master.principal` |
| BullMQ queue | `jobs-iam-kc-sync` |
| BullMQ job | `kc-sync` |
| Worker file | `server/framework/runtime/services/jobs/workers/kc-sync.worker.ts` |
| Sync interval | 900 000 ms (15 min), overridable via `IAM_KC_SYNC_MS` env var |
| Scheduler ID | `sched:iam-kc-sync` |
| Batch size | 100 KC users per page |
| Principal match key | `master.principal.external_sub` = Keycloak `user.id` |

### Circuit breaker settings

| Setting | Value |
|---------|-------|
| Failure threshold to open | 3 consecutive KC API failures |
| Open duration | 600 000 ms (10 min) |
| Reset | Automatic after open duration; next job attempt re-tests KC |

### Status mapping

| Keycloak `enabled` | `master.principal.status` |
|--------------------|--------------------------|
| `true` | `ACTIVE` |
| `false` | `SUSPENDED` |

---

## 2. Checking Sync Health

### 2.1 Bull Board UI

Navigate to `/admin/jobs` → `jobs-iam-kc-sync`.
- Last completed job should be < 15 min ago.
- Check job result payload for `{ total, synced, skipped, errors }` summary.

### 2.2 Scheduler registration check

```sql
SELECT id, schedule_cron, queue_name, job_name, enabled, last_run_at, last_run_status
FROM control.cron_schedule
WHERE id = 'sched:iam-kc-sync';
```

`enabled = true` and `last_run_at` within the last 15 minutes = healthy.

### 2.3 Check for principal status divergence

Run this to find users whose local status may be stale:

```sql
-- Principals that have not been updated in > 30 min (may be stale if sync is lagging)
SELECT id, external_sub, email, status, updated_at
FROM master.principal
WHERE tenant_id = :tenant_id
  AND updated_at < NOW() - INTERVAL '30 minutes'
ORDER BY updated_at ASC
LIMIT 20;
```

### 2.4 Check KC admin API reachability

```bash
# From within the cluster / jump host
KC_BASE=$(kubectl get secret iam-kc-config -o jsonpath='{.data.baseUrl}' | base64 -d)
curl -fs "${KC_BASE}/realms/{realm}/.well-known/openid-configuration" > /dev/null \
  && echo "KC reachable" || echo "KC UNREACHABLE"
```

### 2.5 Check circuit breaker state in worker logs

```bash
kubectl logs -l app=svc-jobs --tail=500 | grep -E "circuit|kc-sync|IAM"
```

Look for:
- `"circuit open until"` — circuit is open; no sync happening
- `"KC API error"` — count consecutive occurrences
- `"synced N users"` — healthy completion

---

## 3. Troubleshooting Specific Issues

### 3.1 Circuit breaker open — sync paused for 10 min

The circuit opens after 3 consecutive KC API failures and stays open for 10 minutes.

1. Identify the root cause from logs (network partition, KC maintenance, credential rotation).
2. If KC is healthy and credentials are correct, force a sync after the 10-min window passes by triggering a manual job:
   ```bash
   POST /api/jobs/admin/queues/jobs-iam-kc-sync/jobs
   Authorization: Bearer {ops_token}
   Content-Type: application/json
   {"name": "kc-sync", "data": {}}
   ```
3. If credentials were rotated, update the `IAM_KC_SYNC_*` environment variables and restart `svc-jobs`.

### 3.2 Users not being suspended after KC disable

Symptom: You disabled a user in Keycloak but they remain `ACTIVE` in `master.principal`.

1. Confirm the KC user is actually disabled:
   ```bash
   # Requires KC admin token
   GET {KC_BASE}/admin/realms/{realm}/users/{keycloak_user_id}
   # Check: "enabled": false
   ```
2. Check that `external_sub` in `master.principal` matches the Keycloak user `id`:
   ```sql
   SELECT id, external_sub, status
   FROM master.principal
   WHERE email = 'user@example.com' AND tenant_id = :tenant_id;
   ```
3. If `external_sub` is null or wrong, the record was created without JIT provisioning or via a different IdP. Update manually:
   ```sql
   UPDATE master.principal
   SET external_sub = :keycloak_user_id
   WHERE id = :principal_id AND tenant_id = :tenant_id;
   ```
   Then trigger a manual sync (see §3.1).

### 3.3 KC user suspended locally but active in KC (false suspension)

Symptom: User is `SUSPENDED` in `master.principal` but `enabled: true` in KC.

This can happen if:
- A previous sync ran with a bad KC response (e.g. partial page, network glitch).
- A manual status update was made in the DB bypassing KC.

Force the sync worker to correct the record:
```bash
# Trigger manual sync
POST /api/jobs/admin/queues/jobs-iam-kc-sync/jobs
Authorization: Bearer {ops_token}
{"name": "kc-sync", "data": {}}
```

The worker only updates when status differs, so if KC says `enabled: true` it will set `ACTIVE`.

Verify:
```sql
SELECT status FROM master.principal
WHERE external_sub = :keycloak_user_id AND tenant_id = :tenant_id;
-- Expected: ACTIVE
```

### 3.4 User exists in KC but has no principal record (JIT miss)

JIT provisioning creates the `master.principal` row on **first login**. If the user has never logged in, they will not appear locally.

The KC sync worker does **not** create new principal records — it only updates existing ones. To pre-provision:

```bash
POST /api/iam/principals/jit-provision
Authorization: Bearer {ops_token}
Content-Type: application/json
{"externalSub": "{keycloak_user_id}", "email": "user@example.com"}
```

Or instruct the user to log in once to trigger JIT.

### 3.5 Force a full re-sync

There is no "reset all" endpoint. The sync is incremental — each KC user page is processed in order.
For a targeted re-sync of all users:

```bash
# 1. Trigger a manual kc-sync job (processes all pages automatically)
POST /api/jobs/admin/queues/jobs-iam-kc-sync/jobs
Authorization: Bearer {ops_token}
{"name": "kc-sync", "data": {}}
```

This will sync all KC users against `master.principal` in one run. For 10 000 users this takes ~2 min.

### 3.6 Resolve conflicts — principal has multiple external_sub values

If the same email appears with two different `external_sub` values (duplicate KC users):

```sql
SELECT id, external_sub, email, status, created_at
FROM master.principal
WHERE email = 'user@example.com' AND tenant_id = :tenant_id;
```

Identify the canonical record (usually oldest or the one with active sessions). Merge downstream references if needed, then set the old record to `SUSPENDED` and mark `external_sub = NULL` on the duplicate to prevent further sync conflicts.

---

## 4. Verification

After any recovery action:

```sql
-- Spot-check 10 recently-updated principals
SELECT id, external_sub, email, status, updated_at
FROM master.principal
WHERE tenant_id = :tenant_id
ORDER BY updated_at DESC
LIMIT 10;
```

Trigger a manual sync (§3.5) and confirm the Bull Board job completes with `errors: 0`.

---

## 5. Configuration Reference

| Env var | Default | Description |
|---------|---------|-------------|
| `IAM_KC_SYNC_MS` | `900000` | Sync interval in ms |
| `IAM_KC_BASE_URL` | — | Keycloak base URL |
| `IAM_KC_REALM` | — | Realm name |
| `IAM_KC_CLIENT_ID` | — | Admin service client ID |
| `IAM_KC_CLIENT_SECRET` | — | Admin service client secret |

---

## 6. Escalation

| Condition | Action |
|-----------|--------|
| KC completely unreachable > 1 hour | Escalate to infrastructure; consider emergency manual status freeze |
| `errors > 0` in sync summary consistently | Inspect individual user payloads in worker logs; may indicate schema mismatch |
| Circuit breaker cycling open/close every 10 min | Intermittent KC instability; file KC infrastructure ticket |
| Suspended user able to obtain access token | KC session not invalidated; call `POST /api/iam/sessions/{sessionId}/invalidate` or revoke all sessions in KC admin console |
