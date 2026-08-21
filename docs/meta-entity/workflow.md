# Workflow Engine

The workflow engine provides multi-stage, multi-approver approval and review workflows for any entity type. It is composed of a definition layer (templates in `control` schema), a runtime layer (`document` schema), and a work-item layer (`event` schema).

---

## Architecture Layers

```
DEFINITION LAYER (control schema)
┌─────────────────────────────────────┐
│ control.workflow_definition          │  "When is a workflow required?"
│   └── rules[] (JSONLogic conditions) │
│                                      │
│ control.workflow_template            │  "What does the workflow look like?"
│   └── control.workflow_template_stage│
│         └── control.workflow_template_rule │  "Who gets assigned?"
│                                      │
│ control.workflow_sla_policy          │  "What are the time limits?"
└─────────────────────────────────────┘
              │ resolved at request creation (version-pinned snapshot)
              ▼
RUNTIME LAYER (document schema)
┌─────────────────────────────────────┐
│ document.workflow_request            │  One request per entity transition
│   └── document.workflow_stage        │  One row per stage in the template
└─────────────────────────────────────┘
              │ one work item per assignee per stage
              ▼
WORK ITEM LAYER (event schema)
┌─────────────────────────────────────┐
│ event.work_item                      │  Actor's inbox item (approve/reject/review)
└─────────────────────────────────────┘
```

---

## Definition Layer Tables

### `control.workflow_definition`

Determines WHEN a workflow is required for a given entity operation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | No platform-global definitions — always tenant-scoped |
| `code` | `text` | Unique per tenant |
| `name` | `text` | |
| `entity_type` | `text` | e.g. `journal_entry`, `payment`, `purchase_invoice` |
| `rules` | `jsonb[]` | Array of `{condition: jsonlogic, template_code, workflow_type, priority}` |
| `effective_from` | `timestamptz` | Temporal activation window (NULL = always active) |
| `effective_to` | `timestamptz` | |
| `is_active` | `bool` | |

**Rule evaluation:** The engine iterates `rules` sorted by `priority ASC`. First rule whose `condition` evaluates to `true` (JSONLogic) determines the `template_code` to use. If no rule matches, workflow is NOT required.

---

### `control.workflow_template`

Defines the structure of a workflow — how many stages, approval behaviors.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global template |
| `code` | `text` | Unique per tenant |
| `name` | `text` | |
| `behaviors` | `jsonb` | `{allow_self_approval, require_all_stages, allow_reassignment, capture_entity_snapshot, require_reason_on_reject, notify_requester, early_reject_on_quorum_fail}` |
| `sla_policy_id` | `uuid FK` | Default SLA; overridable per stage |
| `version_no` | `int` | |
| `compiled_json` | `jsonb` | Denormalized snapshot of all stages + rules at compile time |
| `compiled_hash` | `text` | SHA-256 of `compiled_json`; invalidated on stage/rule change |
| `is_active` | `bool` | |

---

### `control.workflow_template_stage`

Each stage within a template.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `workflow_template_id` | `uuid FK` | |
| `stage_no` | `smallint` | 1-based ordering |
| `name` | `text` | |
| `mode` | `text` | `serial` (one at a time) or `parallel` (all simultaneously) |
| `quorum` | `jsonb` | `{strategy: count|percent|unanimous, required: N}` — NULL = unanimous |
| `sla_policy_id` | `uuid FK` | Overrides template-level SLA for this stage |

**Quorum strategies:**
- `unanimous` — every assigned approver must approve
- `count` — N approvals required (e.g. `{strategy: "count", required: 2}`)
- `percent` — percentage of approvers must approve (e.g. `{strategy: "percent", required: 66}`)

---

### `control.workflow_template_rule`

Resolver rules that determine WHO gets assigned to each stage.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `workflow_template_id` | `uuid FK` | |
| `stage_no` | `smallint` | NULL = applies to all stages |
| `priority` | `smallint` | Lower = evaluated first; first match wins |
| `conditions` | `jsonb` | JSONLogic; NULL = always matches |
| `assign_to` | `jsonb` | `{type: principal|role|group|ou|requester_manager, value: uuid|code}` |

**ApproverResolverService** (`@athyper/svc-workflow`) handles resolution:
- `principal` → direct UUID assignment
- `role` → resolve all principals with that role in the tenant
- `group` → resolve all members of `master.auth_group`
- `ou` → resolve manager(s) of the OU the requester belongs to
- `requester_manager` → resolve `requested_by`'s line manager from `master.principal`

---

### `control.workflow_sla_policy`

Time-based SLA with escalation chains.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `code` | `text` | |
| `timers` | `jsonb[]` | `[{after_minutes, action: reminder|escalate|auto_approve|auto_reject, notify_roles[], message_template_key}]` |
| `escalation_chain` | `jsonb[]` | `[{type, value, notify}]` — ordered escalation targets |

---

## Runtime Layer Tables

### `document.workflow_request`

One request per entity + transition combination.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `workflow_type` | `text` | Default `approval`; supports `review`, `sign_off` |
| `workflow_definition_id` | `uuid FK` | Definition that triggered this request |
| `workflow_template_id` | `uuid FK` | Template used |
| `template_snapshot` | `jsonb` | Version-pinned copy of `compiled_json` at creation time |
| `entity_type` | `text` | e.g. `journal_entry` |
| `entity_id` | `text` | Polymorphic — string representation of the entity PK |
| `entity_version_id` | `uuid` | FK to entity version table (if versioned) |
| `entity_snapshot` | `jsonb` | Copy of entity fields at request creation time |
| `requested_by` | `uuid` | FK → `master.principal` |
| `requested_at` | `timestamptz` | |
| `status` | `text` | `pending` → `approved` / `rejected` / `escalated` / `canceled` |
| `decision` | `text` | Final outcome |
| `decided_by` | `uuid` | |
| `decided_at` | `timestamptz` | |
| `reason` | `text` | Rejection/escalation reason |
| `correlation_id` | `uuid` | Transaction correlation for saga patterns |

**Idempotency:** UNIQUE constraint on `(tenant_id, entity_type, entity_id)` with status IN (`pending`, `escalated`) prevents duplicate open requests for the same entity.

---

### `document.workflow_stage`

One row per stage instantiated from the template.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `workflow_request_id` | `uuid FK` | |
| `template_stage_id` | `uuid FK` | → `control.workflow_template_stage` (lineage tracing) |
| `stage_no` | `smallint` | |
| `name` | `text` | Version-pinned from template at creation |
| `mode` | `text` | `serial` / `parallel` — pinned at creation |
| `quorum` | `jsonb` | Pinned at creation |
| `sla_policy_id` | `uuid FK` | |
| `status` | `text` | `pending` → `active` → `completed` / `skipped` / `canceled` |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `outcome` | `text` | `approved` / `rejected` / `escalated` / `skipped` |

---

## Work Item Layer

### `event.work_item`

The actor-facing inbox item. One per assignee per stage.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `task_type` | `text` | `approval` / `review` / `watcher` |
| `workflow_request_id` | `uuid FK` | |
| `workflow_stage_id` | `uuid FK` | |
| `designated_id` | `uuid` | Original assignee captured at creation — IMMUTABLE after INSERT |
| `designated_group_id` | `uuid` | Group assignment — any member can claim |
| `assignee_id` | `uuid` | Current individual holder |
| `assignee_group_id` | `uuid` | Current group holder |
| `assignee_team_id` | `uuid` | Current team holder |
| `order_index` | `smallint` | Position within serial-mode stage |
| `status` | `text` | `pending` → `assigned` → `in_progress` → `completed` / `skipped` / `escalated` |
| `decision` | `text` | `approve` / `reject` / `escalate` (approval); `acknowledge` / `flag` (review); `read` (watcher) |
| `reason` | `text` | Comment on decision |
| `due_at` | `timestamptz` | SLA deadline |
| `metadata` | `jsonb` | Arbitrary context bag |

---

## Workflow Engine Service

**Location:** `server/packages/services/workflow/engine.ts`

### Key Methods

```typescript
// Determine if a workflow is required before a state transition
shouldRequireWorkflow(
  entityType: string,
  tenantId: string,
  evaluationPayload: Record<string, unknown>
): Promise<{ required: boolean; templateCode?: string; definitionId?: string }>

// Create a workflow request + stages + work items (transactional, idempotent)
createRequest(params: {
  tenantId: string
  entityType: string
  entityId: string
  requestedBy: string
  templateCode: string
  definitionId: string
  entitySnapshot?: Record<string, unknown>
  correlationId?: string
}): Promise<{ requestId: string; stageCount: number; workItemCount: number }>

// Process an actor action on a work item
processAction(params: {
  workItemId: string
  actorId: string
  tenantId: string
  action: 'approve' | 'reject' | 'escalate' | 'delegate'
  comment?: string
  delegateTo?: string
}): Promise<{ stageOutcome?: string; requestOutcome?: string }>

// Evaluate quorum after each action — advances or closes stages
evaluateQuorum(stageId: string, tenantId: string): Promise<void>

// Actor inbox
getInbox(tenantId: string, principalId: string): Promise<WorkItem[]>
getInboxCount(tenantId: string, principalId: string): Promise<number>

// Full request context (request + stages + work items)
getRequestDetail(requestId: string): Promise<WorkflowRequestDetail>

// Audit history for a request
getActivity(requestId: string): Promise<WorkflowEvent[]>
```

---

## Workflow API Routes

All routes registered via `registerWorkflowRoutes` in `server/src/runtimes/api.ts`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workflow/inbox` | Current actor's pending work items |
| `GET` | `/api/workflow/inbox/count` | Unread inbox count |
| `POST` | `/api/workflow/items/:workItemId/action` | Submit approve / reject / escalate decision |
| `GET` | `/api/workflow/requests/:requestId` | Full request detail (stages + work items) |
| `GET` | `/api/workflow/requests/:requestId/context` | Entity snapshot at request time |
| `POST` | `/api/workflow/requests` | Manually create a workflow request |
| `POST` | `/api/workflow/requests/:requestId/cancel` | Cancel a pending request (admin) |
| `GET` | `/api/workflow/templates` | List templates |
| `POST` | `/api/workflow/templates` | Create template |
| `PATCH` | `/api/workflow/templates/:id` | Update template |
| `GET` | `/api/workflow/templates/:id/stages` | List stages |
| `POST` | `/api/workflow/templates/:id/stages` | Create stage |
| `GET` | `/api/workflow/definitions` | List definitions |
| `POST` | `/api/workflow/definitions` | Create definition |

---

## Version Pinning

When a `workflow_request` is created, `template_snapshot` is populated from `control.workflow_template.compiled_json` at that moment. This means:

- A template can be updated mid-flight without affecting in-progress requests.
- The `entity_snapshot` captures the entity state at request time for audit + context display.
- `template_stage_id` on `document.workflow_stage` preserves lineage for reporting even after template changes.

---

## Serial vs Parallel Stage Execution

**Serial mode:**
- Work items are processed one by one (order_index determines sequence).
- Next assignee's work_item status changes from `pending` → `assigned` only when previous completes.
- Early reject: If `early_reject_on_quorum_fail = true` and one serial approver rejects, remaining work items are skipped.

**Parallel mode:**
- All work items for the stage become `assigned` simultaneously.
- Quorum logic determines when the stage completes (unanimous / count / percent).

---

## Related Docs

- [Overview](./overview.md)
- [Lifecycle Engine](./lifecycle.md)
- [Policy Engine](./policy.md)
- [Entity Operations](./entity-operations.md)
