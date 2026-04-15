# 44-11 — Runbook Validation Checklist

**Sprint:** 44  
**Task:** 44-11 — D2 Runbooks validation  
**Goal:** An ops team member (non-author) follows each of the 6 runbooks end-to-end in **staging**, documents gaps, and records fixes.  
**Environment:** Staging only — do NOT run destructive steps (bulk cancel, DROP TABLE, redis FLUSHALL) on production.  
**Last updated:** 2026-04-15

---

## Instructions for the Validator

1. Work through each runbook sequentially. Use a real staging tenant (`TENANT_ID` = staging org UUID).
2. For every checklist item: tick ✅ if it worked exactly as written, or flag ❌ with a note describing what was wrong.
3. Use the **Gap Log** table at the bottom of each section to capture issues.
4. After completing all 6 runbooks, file a PR that fixes any inaccurate commands or missing steps in the affected runbook files.
5. Update `Last reviewed` date in each fixed runbook after the PR merges.

### Prerequisites for validator

- Access to the staging cluster (`kubectl` context set to staging)
- `ops_token` with `ops-admin` role for the staging tenant
- `compliance_token` with `compliance` role for the staging tenant
- Redis CLI access to the staging Redis instance
- Direct DB access to the staging PostgreSQL instance (psql or DataGrip)
- k6 installed locally if running performance validations

---

## RB-01 — Outbox Drain Monitoring + Recovery

**Runbook:** [rb-01-outbox-drain.md](rb-01-outbox-drain.md)  
**Validator:** ___________________  
**Date validated:** ___________________

### Validation steps

**Section 2 — Detection**

- [ ] **2.1** Navigate to `/admin/jobs` in staging. Confirm `jobs-domain-outbox` queue is visible. Verify last completed job age < 2 min.
- [ ] **2.2** Run the pending event backlog query (with staging `tenant_id`). Confirm output columns match (`topic`, `status`, `cnt`, `oldest`, `max_attempts_seen`).
- [ ] **2.3** Run the orphaned lock detection query. Confirm it executes without error (zero rows expected in healthy system).
- [ ] **2.4** Run the dead-letter query. Confirm it executes without error.

**Section 3 — Recovery (simulate and verify)**

- [ ] **3.1** Insert a test `pending` row into `event.outbox` for topic `fin`. Confirm Bull Board shows `drain:fin` job picks it up within 60 s and marks it `delivered`. *(Roll back the test row if delivery succeeded but you need to verify DLQ: set `attempts = max_attempts` first.)*
- [ ] **3.2** Insert a row with `status = 'processing'`, `locked_at = NOW() - INTERVAL '10 minutes'`. Run the unlock UPDATE. Confirm row returns to `pending` and is picked up within 30 s.
- [ ] **3.3** Call `GET /api/jobs/admin/outbox/dead` and `POST /api/jobs/admin/outbox/{id}/replay`. Confirm API returns expected status codes (200/204).
- [ ] **3.4** Run the "Step 1: Inspect" SELECT query only — do NOT bulk-replay in staging unless coordinated with the team.
- [ ] **3.5** Call `POST /api/integration/outbox/{id}/discard` on a dead-letter test row. Confirm `last_error = 'manually_discarded'`.

**Section 4 — Verification**

- [ ] Run the post-recovery count query. Confirm it executes without error and returns 0 for the test rows you created.

**Section 5 — Escalation table**

- [ ] Review escalation table. Confirm contact paths (on-call SRE) are current and accurate for staging team.

### Gap log — RB-01

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## RB-02 — Audit Partition Lifecycle

**Runbook:** [rb-02-audit-partition-lifecycle.md](rb-02-audit-partition-lifecycle.md)  
**Validator:** ___________________  
**Date validated:** ___________________

### Validation steps

**Section 2 — Monthly Archive Procedure**

- [ ] **2.1** Read the automated flow description. Confirm `DEFAULT_INTERVALS` and worker file path match `server/framework/runtime/services/jobs/workers/partition-archive.worker.ts`.
- [ ] **2.2** Call `POST /api/jobs/admin/queues/jobs-partition-archive/jobs` with `{"name":"sweep","data":{}}`. Confirm job enqueues (201) and appears in Bull Board.
- [ ] **2.3** Call the same endpoint with `{"name":"archive-partition","data":{"schema":"log","table":"audit_log_XXXX_XX"}}` using a partition name that is well past the retention window AND has no active legal hold. Confirm job enqueues and completes without error.

**Section 3 — Verifying Partition Health**

- [ ] **3.1** Run the `pg_inherits` partition listing query. Confirm output includes at least one partition row.
- [ ] **3.2** Run the overdue partition check. Confirm query executes. Review results with the DBA if rows are returned unexpectedly.
- [ ] **3.3** Run the legal hold manifest query. Confirm query executes and columns match.
- [ ] **3.4** Call `GET /api/audit/events/export?format=json&from=<recent_from>&to=<recent_to>`. Confirm `integrity.valid: true` in response.

**Section 4 — Recovery Procedures**

- [ ] **4.1** Verify error table covers the errors you'd realistically encounter in staging (DB user, PG version).
- [ ] **4.2** Identify a partition that is held. Confirm legal hold manifest query from §3.3 shows it. Attempt to archive it — confirm it is skipped/blocked (not dropped).
- [ ] **4.3** Run the `control.cron_schedule` check query. Confirm `sched:partition-archive-sweep` row exists with `enabled = true`.
- [ ] **4.4** Run the orphan table detection query. Confirm it executes without error.

### Gap log — RB-02

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## RB-03 — Legal Hold Activation + Release

**Runbook:** [rb-03-legal-hold.md](rb-03-legal-hold.md)  
**Validator:** ___________________  
**Date validated:** ___________________

> **Caution:** Creating a real hold in staging will block partition archival for the hold's date range until released. Use a very narrow date range (e.g., one week two years ago) that has no active data.

### Validation steps

**Section 2 — Activating a Legal Hold**

- [ ] **2.1** Review the required fields table. Confirm all fields match the current API schema by checking `server/framework/runtime/services/audit/routes/legal-hold.route.ts`.
- [ ] **2.2** Call `POST /api/audit/legal-holds` with a test hold (narrow date range, test hold code). Confirm `201 Created` response with `status: "active"`.
- [ ] **2.3** Call `GET /api/audit/legal-holds/{id}`. Confirm `status = "active"` and scope fields match what was submitted.
- [ ]       Call `POST /api/audit/legal-holds/{id}/manifest/refresh`. Confirm `200` response.
- [ ] **2.4** Call `GET /api/audit/legal-holds/{id}` again. Confirm manifest rows appear with `isReleased = false`. Run the DB manifest query — confirm it returns the same partitions.

**Section 3 — Releasing a Legal Hold**

- [ ] **3.1** Walk through pre-release checklist items. Confirm each is actionable in staging context.
- [ ] **3.2** Call the export endpoint for the hold's date range. Confirm response body and `X-Integrity-Hash` header are present.
- [ ] **3.3** Call `PATCH /api/audit/legal-holds/{id}/release` with a test `releaseReason`. Confirm `200 OK` with `status: "released"`, `releaseDate`, and `releasedBy` populated.
- [ ] **3.4** Run both verification SQL queries. Confirm `status = 'released'` and `still_blocked = 0`.

**Section 4 — Troubleshooting**

- [ ] **4.1** Attempt to create a second hold with the same `holdCode`. Confirm `400 Bad Request`.
- [ ] **4.2** Create a hold with `scopeDateFrom` set to a date for which all partitions have already been archived. Confirm the manifest refresh returns an empty manifest. Verify the runbook's explanation of this scenario is accurate.

### Gap log — RB-03

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## RB-04 — IdP / Keycloak Sync Troubleshooting

**Runbook:** [rb-04-idp-kc-sync.md](rb-04-idp-kc-sync.md)  
**Validator:** ___________________  
**Date validated:** ___________________

### Validation steps

**Section 2 — Checking Sync Health**

- [ ] **2.1** Navigate to `/admin/jobs` → `jobs-iam-kc-sync`. Confirm last completed job age < 15 min. Check job result payload for `{ total, synced, skipped, errors }` summary.
- [ ] **2.2** Run the `control.cron_schedule` query for `sched:iam-kc-sync`. Confirm `enabled = true` and `last_run_at` within 15 min.
- [ ] **2.3** Run the principal staleness query (> 30 min). Note result; confirm query executes without error.
- [ ] **2.4** Run the KC admin API reachability check from within the cluster. Confirm `KC reachable` output.
- [ ] **2.5** Run the log grep for circuit/kc-sync patterns. Confirm log format matches (look for "synced N users").

**Section 3 — Troubleshooting Specific Issues**

- [ ] **3.1** Disable a test user in Keycloak staging console. Trigger a manual sync via `POST /api/jobs/admin/queues/jobs-iam-kc-sync/jobs`. Confirm `master.principal.status` updates to `SUSPENDED` within one sync cycle.
- [ ] **3.2** Find the suspended principal, confirm `external_sub` matches the Keycloak user ID. Re-enable in KC, trigger sync, confirm `status = 'ACTIVE'`.
- [ ] **3.3** Review §3.4 (JIT miss) — confirm `POST /api/iam/principals/jit-provision` endpoint exists and returns `201` for a known KC user that has never logged in.
- [ ] **3.5** Trigger a full sync via the manual job. Confirm job completes with `errors: 0`.

**Section 5 — Configuration Reference**

- [ ] Verify all env vars in the table are present in staging `svc-jobs` deployment env (check `kubectl describe deploy/svc-jobs`).

### Gap log — RB-04

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## RB-05 — Workflow Recovery: Stuck Instances

**Runbook:** [rb-05-workflow-recovery.md](rb-05-workflow-recovery.md)  
**Validator:** ___________________  
**Date validated:** ___________________

### Validation steps

**Section 2 — Detecting Stuck Instances**

- [ ] **2.1** Call `GET /api/workflow/reports/compliance`. Confirm response includes `summary.stuckItemCount`.
- [ ] **2.2** Run the stuck work items DB query (with staging `tenant_id`). Confirm query executes and columns match the runbook output (`work_item_id`, `status`, `started_at`, `due_at`, `assigned_to`, etc.).
- [ ] **2.3** Call `GET /api/workflow/requests/{requestId}` for a known request in staging. Confirm response structure. Call the activity endpoint — confirm it returns events.
- [ ] **2.4** Run the SLA log grep. Confirm log format includes `stuckItems: N` in the job result.

**Section 3 — Recovery Procedures (simulate)**

> To test §3.1–3.3: create a test workflow request in staging and let it sit without taking action. Then apply each recovery step.

- [ ] **3.1** Call `POST /api/workflow/items/{workItemId}/action` with `"action": "approve"`. Confirm `200` response. Verify `log.workflow_event_log` has a new entry.
- [ ] **3.2** Repeat with `"action": "escalate"`. Confirm `200` and that the work item's `assigned_to` changes.
- [ ] **3.3** Repeat with `"action": "reject"`. Confirm parent request moves to terminal status.
- [ ] **3.4** Review the bulk-cancel SQL. Confirm column names (`started_at`, `workflow_request_id`) match current schema by running `SELECT column_name FROM information_schema.columns WHERE table_name = 'work_item'`.
- [ ] **3.5** Call `POST /api/jobs/admin/queues/jobs-sla-check/jobs` with `{"name":"sla-check","data":{}}`. Confirm job enqueues and completes. Confirm updated `summary.stuckItemCount` via the compliance report.

**Section 4 — Verification queries**

- [ ] Run the zero-stuck-items count query. Confirm it returns 0 after recovery actions above.
- [ ] Run the parent request status query. Confirm terminal status.

**Section 5 — SLA Policy Reference**

- [ ] Verify `control.workflow_sla_policy` table exists and has at least one row in staging.

### Gap log — RB-05

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## RB-06 — Descriptor Cache Invalidation

**Runbook:** [rb-06-descriptor-cache.md](rb-06-descriptor-cache.md)  
**Validator:** ___________________  
**Date validated:** ___________________

### Validation steps

**Section 2 — When to Invalidate**

- [ ] Review the symptoms table. Confirm each symptom is reproducible by reading entity metadata via the UI and deliberately making a field change in Metadata Studio, then observing the 5-min self-heal.

**Section 3 — Force-Flush the Cache**

- [ ] **3.1** Run `redis-cli KEYS "desc:v2:{tenantId}:*:ptr"`. Confirm keys appear for entities with cached descriptors. Run `DEL` on one entity's pointer key. Call `GET /api/metadata/entities/{entityCode}/compiled`. Confirm `compiledAt` is now recent (fresh compile).
- [ ] **3.2** Run the tenant-wide flush (`KEYS desc:v2:{tenantId}:* | xargs DEL`). Confirm keys are deleted. Call the compiled endpoint for two different entities — both should return fresh compiles.
- [ ] **3.3** Run `kubectl rollout restart deployment/athyper-api` in staging. After rollout completes, call the compiled endpoint — confirm `compiledAt` is within the last 60 s.
- [ ] **3.4** Delete Redis pointer key (§3.1), then call the `GET /compiled` endpoint. Confirm response has `compiledAt` matching current time and that Redis pointer key is re-created: `redis-cli EXISTS "desc:v2:{tenantId}:{entityCode}:ptr"` returns `1`.

**Section 4 — Verifying Recompilation**

- [ ] **4.1** Run the `snapshot.entity_compiled` query. Confirm `compiled_at` updated after step 3.1. Confirm `field_count` matches the entity's actual field count.
- [ ] **4.2** Call `GET /api/metadata/entities/{entityCode}/compiled`. Inspect `compiledAt`, `fields`, `versionId`. Run the entity version query and confirm `versionId` matches.
- [ ] **4.3** Run the field count query. Confirm it matches `fields.length` from the API response.

**Section 5 — Recovery: Corrupt Warm-Start Snapshot**

- [ ] **5.1** Delete a test entity's snapshot row. Confirm the row is removed.
- [ ] **5.2** Call `GET /api/metadata/entities/{entityCode}/compiled` with `Cache-Control: no-cache`. Confirm fresh compile returned. Verify the snapshot row was re-created (`compiled_at` = now).

**Section 6 — DB Trigger Reference**

- [ ] Run the `pg_trigger` query. Confirm `trg_template_child_changed` exists and `tgenabled = 'O'` (enabled on origin).

### Gap log — RB-06

| Step | Observed issue | Fix applied |
|------|---------------|-------------|
| | | |

---

## Summary Sign-Off

| Runbook | Validator | Date | Status | Gaps found | Gaps fixed |
|---------|-----------|------|--------|-----------|-----------|
| RB-01 Outbox Drain | | | ☐ Pass / ☐ Gaps | | |
| RB-02 Audit Partition Lifecycle | | | ☐ Pass / ☐ Gaps | | |
| RB-03 Legal Hold | | | ☐ Pass / ☐ Gaps | | |
| RB-04 IdP / KC Sync | | | ☐ Pass / ☐ Gaps | | |
| RB-05 Workflow Recovery | | | ☐ Pass / ☐ Gaps | | |
| RB-06 Descriptor Cache | | | ☐ Pass / ☐ Gaps | | |

**Overall sign-off:** ___________________  
**Date:** ___________________

Once signed off, update the `Last reviewed` date in each runbook's header to the validation date.
