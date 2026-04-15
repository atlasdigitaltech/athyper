# RB-05 — Workflow Recovery: Stuck Instances

**System:** WFL — `event.work_item` / `WorkflowEngine` / BullMQ `jobs-sla-check`  
**Severity:** P1 — stuck approvals block financial postings and business-critical operations  
**Owner:** Platform Engineering / Application Support  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

Each approval in the system maps to one or more **work items** (`event.work_item`). A work item is
"stuck" when it remains in `pending` or `in_progress` status for > 24 hours with no activity in
`log.workflow_event_log`. This typically means the assignee missed a notification, SLA timers
misfired, or the workflow engine encountered an unhandled error.

### Key components

| Component | Value |
|-----------|-------|
| Request table | `document.workflow_request` |
| Work item table | `event.work_item` |
| Event log table | `log.workflow_event_log` |
| BullMQ queue (SLA check) | `jobs-sla-check` |
| SLA check job | `check` |
| SLA check interval | 300 000 ms (5 min) |
| SLA scheduler ID | `sched:sla-breach-check` |
| Engine file | `server/framework/runtime/services/workflow/engine.ts` |
| Admin routes | `server/framework/runtime/services/workflow/routes/admin.route.ts` |

### Work item status flow

```
pending → in_progress → completed
        ↘ escalated  → completed
        ↘ skipped
```

### Stuck-item definition (from compliance report query)

A work item is "stuck" when:
- `status IN ('pending', 'in_progress')`
- `started_at IS NOT NULL` AND `started_at < NOW() - INTERVAL '24 hours'`
- No `log.workflow_event_log` entry with `created_at > NOW() - INTERVAL '24 hours'`

---

## 2. Detecting Stuck Instances

### 2.1 Compliance report KPI (quick check)

```bash
GET /api/workflow/reports/compliance
Authorization: Bearer {ops_token}
```

Response includes `summary.stuckItemCount`. Any value > 0 requires investigation.

### 2.2 Direct DB query — list all stuck work items

```sql
SELECT
  wi.id              AS work_item_id,
  wi.status,
  wi.started_at,
  wi.due_at,
  wi.assigned_to,
  wr.id              AS request_id,
  wr.entity_type,
  wr.status          AS request_status,
  wt.name            AS template_name
FROM event.work_item wi
JOIN document.workflow_request wr ON wr.id = wi.workflow_request_id
JOIN control.workflow_template wt ON wt.id = wr.workflow_template_id
WHERE wi.tenant_id = :tenant_id
  AND wi.status IN ('pending', 'in_progress')
  AND wi.started_at IS NOT NULL
  AND wi.started_at < NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM log.workflow_event_log el
    WHERE el.work_item_id = wi.id
      AND el.created_at > NOW() - INTERVAL '24 hours'
  )
ORDER BY wi.started_at ASC;
```

### 2.3 Inspect a specific stuck request

```bash
GET /api/workflow/requests/{requestId}
Authorization: Bearer {ops_token}
```

Response includes all stages, work items, their statuses, and the full approval context. Also check activity:

```bash
GET /api/workflow/requests/{requestId}/activity
Authorization: Bearer {ops_token}
```

Look for the last event and its timestamp. Anything > 24 h old with no subsequent action is stuck.

### 2.4 Check SLA timer worker health

```bash
# Bull Board: jobs-sla-check queue — last completed should be < 5 min ago
# Or check logs:
kubectl logs -l app=svc-jobs --tail=200 | grep "sla-check"
```

If SLA check jobs are failing, timers are not firing. Stuck items may accumulate faster than usual.

---

## 3. Recovery Procedures

### 3.1 Manual advance (approve/reject) via API

The operations team can take an action on a stuck work item directly using the admin action endpoint:

```bash
POST /api/workflow/items/{workItemId}/action
Authorization: Bearer {ops_token}
Content-Type: application/json

{
  "action": "approve",
  "comment": "Manual advance by ops team — original assignee unresponsive (stuck >24h)"
}
```

Valid actions: `approve`, `reject`, `escalate`, `delegate`, `acknowledge`, `flag`, `request_info`.

After approval, the workflow engine automatically advances to the next stage or closes the request if it was the final stage.

### 3.2 Escalate to a different approver

If the original approver is unavailable and you do not want to approve on their behalf:

```bash
POST /api/workflow/items/{workItemId}/action
Authorization: Bearer {ops_token}
Content-Type: application/json

{
  "action": "escalate",
  "comment": "Original approver unreachable; escalating to supervisor per SLA policy"
}
```

The engine calls `ApproverResolverService` to re-assign based on the SLA policy's escalation rules.

### 3.3 Cancel / reject an entire workflow request

If the business need has passed and the request should not proceed:

```bash
POST /api/workflow/items/{workItemId}/action
Authorization: Bearer {ops_token}
Content-Type: application/json

{
  "action": "reject",
  "comment": "Request voided — superseded by [new request ID]. Cancelled by ops."
}
```

### 3.4 Bulk-cancel stuck items (DB — use with caution)

Only use this when many requests are stuck due to a systemic issue (e.g. notification service outage that prevented all approvals):

```sql
-- Step 1: Preview affected items
SELECT wi.id, wr.entity_type, wi.assigned_to, wi.started_at
FROM event.work_item wi
JOIN document.workflow_request wr ON wr.id = wi.workflow_request_id
WHERE wi.tenant_id = :tenant_id
  AND wi.status IN ('pending', 'in_progress')
  AND wi.started_at < NOW() - INTERVAL '24 hours'
  AND wr.entity_type = :entity_type;  -- scope to one entity type

-- Step 2: After review and approval from business stakeholders, cancel:
UPDATE event.work_item
SET status = 'skipped',
    updated_at = NOW()
WHERE id IN (<comma-separated list from Step 1>)
  AND tenant_id = :tenant_id;

-- Step 3: Close corresponding requests if all items are terminal
UPDATE document.workflow_request
SET status = 'completed', decision = 'rejected', updated_at = NOW()
WHERE id IN (
  SELECT workflow_request_id FROM event.work_item
  WHERE id IN (<same list>)
)
AND NOT EXISTS (
  SELECT 1 FROM event.work_item
  WHERE workflow_request_id = document.workflow_request.id
    AND status IN ('pending', 'in_progress')
);
```

> **Important:** Bulk DB updates bypass the workflow engine and do not emit events to `log.workflow_event_log`. Add manual audit log entries or open an incident record to explain the bulk action.

### 3.5 Re-trigger SLA check to fire overdue timers

If SLA timers failed to fire (e.g. `jobs-sla-check` was down):

```bash
POST /api/jobs/admin/queues/jobs-sla-check/jobs
Authorization: Bearer {ops_token}
Content-Type: application/json
{"name": "check", "data": {}}
```

This immediately processes all work items with overdue SLA thresholds and triggers `reminder`, `escalate`, or `auto_approve`/`auto_reject` actions as configured in `control.workflow_sla_policy`.

---

## 4. Verification

After taking recovery action:

```sql
-- Confirm no stuck items remain
SELECT COUNT(*)
FROM event.work_item wi
WHERE wi.tenant_id = :tenant_id
  AND wi.status IN ('pending', 'in_progress')
  AND wi.started_at < NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM log.workflow_event_log el
    WHERE el.work_item_id = wi.id
      AND el.created_at > NOW() - INTERVAL '24 hours'
  );
-- Expected: 0
```

Also verify that the parent `document.workflow_request` reached a terminal state:

```sql
SELECT id, status, decision, updated_at
FROM document.workflow_request
WHERE id = :request_id AND tenant_id = :tenant_id;
-- Expected: status = 'completed'
```

---

## 5. SLA Policy Reference

SLA policies are configured in `control.workflow_sla_policy`. Timer actions fire when
`NOW() > work_item.assigned_at + timer.after_minutes`:

| Timer action | Effect |
|-------------|--------|
| `reminder` | Sends notification to assignee; no status change |
| `escalate` | Calls escalation logic; re-assigns to supervisor |
| `auto_approve` | Approves without human action (use with caution) |
| `auto_reject` | Rejects without human action (use with caution) |

Idempotency key: `sla:action:{work_item_id}:{after_minutes}` in `event.outbox` — prevents double-firing even if the SLA check job runs twice.

---

## 6. Escalation

| Condition | Action |
|-----------|--------|
| Stuck count growing continuously despite SLA check running | Investigate `WorkflowEngine.processAction()` for unhandled exceptions; check `svc-core` logs |
| Manual advance via API returns 403 | Confirm `ops_token` has `workflow:admin` permission |
| Parent request stuck in `pending` even after all work items complete | Suspect engine state machine bug; escalate to application engineering with request ID |
| SLA auto-approve fired on incorrect items | Check SLA policy `after_minutes` configuration; potentially need a policy correction + rollback of auto-approved items |
