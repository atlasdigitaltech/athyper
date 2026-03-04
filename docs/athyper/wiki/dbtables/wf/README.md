# WF Schema -- Workflow & Approval Engine

> **Source DDL**: `framework/adapters/db/src/sql/060_wf.sql`
> **PostgreSQL 16+**

The `wf` schema implements a complete workflow and approval engine consisting of two major subsystems:

1. **Lifecycle Engine** -- A generic state machine runtime that tracks entity progression through defined states and transitions.
2. **Approval Engine** -- A multi-stage, multi-approver approval workflow system with SLA escalation, assignment auditing, and threaded discussion.

Both subsystems are tenant-isolated (every table carries a `tenant_id` foreign key to `core.tenant`).

---

## Table of Contents

- [wf.lifecycle](#wflifecycle)
- [wf.lifecycle_version](#wflifecycle_version)
- [wf.workflow_instance](#wfworkflow_instance)
- [wf.workflow_transition](#wfworkflow_transition)
- [wf.approval_definition](#wfapproval_definition)
- [wf.approval_instance](#wfapproval_instance)
- [wf.approval_task](#wfapproval_task)
- [wf.approval_comment](#wfapproval_comment)
- [wf.approval_stage](#wfapproval_stage)
- [wf.approval_assignment_snapshot](#wfapproval_assignment_snapshot)
- [wf.approval_escalation](#wfapproval_escalation)
- [wf.approval_event](#wfapproval_event)
- [wf.lifecycle_timer_schedule](#wflifecycle_timer_schedule)
- [Entity Relationship Diagram](#entity-relationship-diagram)

---

## wf.lifecycle

State machine definitions. Each lifecycle defines an ordered set of states and the transition rules between them. Lifecycles are scoped to a tenant and an entity type (e.g., "purchase_order", "invoice"), and can be activated or deactivated without deletion. The `definition` JSONB column holds the full state/transition graph used by the lifecycle engine at runtime.

### Columns

| Column        | Type          | Nullable | Default                               | Description                                                      |
| ------------- | ------------- | -------- | ------------------------------------- | ---------------------------------------------------------------- |
| `id`          | `uuid`        | NOT NULL | `gen_random_uuid()`                   | Primary key.                                                     |
| `tenant_id`   | `uuid`        | NOT NULL | --                                    | FK to `core.tenant(id)`. Tenant scope.                           |
| `code`        | `text`        | NOT NULL | --                                    | Unique machine-readable lifecycle code within tenant.            |
| `name`        | `text`        | NOT NULL | --                                    | Human-readable display name.                                     |
| `description` | `text`        | NULL     | --                                    | Optional long description of the lifecycle purpose.              |
| `entity_type` | `text`        | NOT NULL | --                                    | The entity type this lifecycle governs (e.g., "invoice").        |
| `definition`  | `jsonb`       | NOT NULL | `'{"states": [], "transitions": []}'` | Full state machine graph: states array and transition rules.     |
| `is_active`   | `boolean`     | NOT NULL | `true`                                | Whether this lifecycle is currently available for new instances. |
| `created_at`  | `timestamptz` | NOT NULL | `now()`                               | Row creation timestamp.                                          |
| `created_by`  | `text`        | NOT NULL | --                                    | Identity of the creator.                                         |
| `updated_at`  | `timestamptz` | NULL     | --                                    | Last modification timestamp.                                     |
| `updated_by`  | `text`        | NULL     | --                                    | Identity of last modifier.                                       |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Constraints

| Name                         | Type   | Details                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------- |
| `lifecycle_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` -- Lifecycle codes are unique per tenant. |

### Indexes

| Name                        | Columns                    | Notes                                  |
| --------------------------- | -------------------------- | -------------------------------------- |
| `idx_lifecycle_tenant`      | `(tenant_id)`              | Tenant-scoped queries.                 |
| `idx_lifecycle_entity_type` | `(tenant_id, entity_type)` | Lookup by entity type within a tenant. |

### Relationships

- **Has many** `wf.lifecycle_version` -- Immutable version snapshots.
- **Has many** `wf.workflow_instance` -- Runtime executions of this lifecycle.

---

## wf.lifecycle_version

Immutable version snapshots of a lifecycle definition. Every time a lifecycle's state machine is modified, a new version row is created with the complete `definition` JSONB frozen at that point. Versions are monotonically numbered per lifecycle. This provides an audit trail of how a lifecycle evolved and ensures running workflow instances continue to use the definition version they were started with.

### Columns

| Column         | Type          | Nullable | Default             | Description                                                   |
| -------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------- |
| `id`           | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                  |
| `tenant_id`    | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                      |
| `lifecycle_id` | `uuid`        | NOT NULL | --                  | FK to `wf.lifecycle(id)`. Parent lifecycle.                   |
| `version`      | `int`         | NOT NULL | --                  | Monotonically increasing version number within the lifecycle. |
| `definition`   | `jsonb`       | NOT NULL | --                  | Frozen copy of the lifecycle definition at this version.      |
| `created_at`   | `timestamptz` | NOT NULL | `now()`             | Snapshot creation timestamp.                                  |
| `created_by`   | `text`        | NOT NULL | --                  | Identity of the version creator.                              |

### Primary Key

- `id`

### Foreign Keys

| Column         | References         | On Delete |
| -------------- | ------------------ | --------- |
| `tenant_id`    | `core.tenant(id)`  | CASCADE   |
| `lifecycle_id` | `wf.lifecycle(id)` | CASCADE   |

### Constraints

| Name                            | Type   | Details                                                        |
| ------------------------------- | ------ | -------------------------------------------------------------- |
| `lifecycle_version_lc_ver_uniq` | UNIQUE | `(lifecycle_id, version)` -- One version number per lifecycle. |

### Indexes

| Name                              | Columns                        | Notes                         |
| --------------------------------- | ------------------------------ | ----------------------------- |
| `idx_lifecycle_version_lifecycle` | `(lifecycle_id, version DESC)` | Latest-version-first queries. |

### Relationships

- **Belongs to** `wf.lifecycle` via `lifecycle_id`.
- **Has many** `wf.workflow_instance` -- Instances reference a specific version.

---

## wf.workflow_instance

Runtime execution of a lifecycle state machine for a specific entity. Each row represents a single entity progressing through its lifecycle states. The instance tracks the current and previous state, overall execution status, and which principal initiated or completed the workflow. Only one active workflow instance is allowed per tenant+entity_type+entity_id combination.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                                                              |
| ---------------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                             |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                 |
| `entity_type`          | `text`        | NOT NULL | --                  | Type of entity being governed (e.g., "purchase_order").                                  |
| `entity_id`            | `uuid`        | NOT NULL | --                  | ID of the governed entity.                                                               |
| `entity_version_id`    | `uuid`        | NULL     | --                  | Optional: specific version of the entity at workflow start.                              |
| `lifecycle_id`         | `uuid`        | NOT NULL | --                  | FK to `wf.lifecycle(id)`. Which lifecycle is being executed.                             |
| `lifecycle_version_id` | `uuid`        | NOT NULL | --                  | FK to `wf.lifecycle_version(id)`. Pinned version snapshot.                               |
| `current_state`        | `text`        | NOT NULL | --                  | Current state in the lifecycle state machine.                                            |
| `previous_state`       | `text`        | NULL     | --                  | Previous state (null at initial state).                                                  |
| `status`               | `text`        | NOT NULL | `'active'`          | Execution status. Constrained to: `active`, `paused`, `completed`, `failed`, `canceled`. |
| `data`                 | `jsonb`       | NULL     | --                  | Arbitrary workflow execution data.                                                       |
| `context`              | `jsonb`       | NULL     | --                  | Contextual information for transition evaluation.                                        |
| `initiated_by`         | `uuid`        | NULL     | --                  | FK to `core.principal(id)`. Who started the workflow.                                    |
| `initiated_at`         | `timestamptz` | NOT NULL | `now()`             | When the workflow was initiated.                                                         |
| `completed_by`         | `uuid`        | NULL     | --                  | FK to `core.principal(id)`. Who completed/terminated the workflow.                       |
| `completed_at`         | `timestamptz` | NULL     | --                  | When the workflow completed or was terminated.                                           |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                  |
| `created_by`           | `text`        | NOT NULL | --                  | Identity of the creator.                                                                 |
| `updated_at`           | `timestamptz` | NULL     | --                  | Last modification timestamp.                                                             |
| `updated_by`           | `text`        | NULL     | --                  | Identity of last modifier.                                                               |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `lifecycle_id`         | `wf.lifecycle(id)`         | RESTRICT  |
| `lifecycle_version_id` | `wf.lifecycle_version(id)` | RESTRICT  |
| `initiated_by`         | `core.principal(id)`       | SET NULL  |
| `completed_by`         | `core.principal(id)`       | SET NULL  |

### Constraints

| Name                            | Type   | Details                                                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------ |
| `workflow_instance_entity_uniq` | UNIQUE | `(tenant_id, entity_type, entity_id)` -- One active workflow per entity. |
| `workflow_instance_status_chk`  | CHECK  | `status IN ('active','paused','completed','failed','canceled')`          |

### Indexes

| Name                                  | Columns                               | Notes                                 |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| `idx_workflow_instance_tenant_status` | `(tenant_id, status)`                 | Filter by status within tenant.       |
| `idx_workflow_instance_entity`        | `(tenant_id, entity_type, entity_id)` | Entity lookup.                        |
| `idx_workflow_instance_current_state` | `(tenant_id, current_state)`          | Dashboard: entities in a given state. |

### Relationships

- **Belongs to** `wf.lifecycle` via `lifecycle_id`.
- **Belongs to** `wf.lifecycle_version` via `lifecycle_version_id`.
- **Has many** `wf.workflow_transition` -- Audit trail of state changes.

---

## wf.workflow_transition

Append-only audit log of every state transition that occurs within a workflow instance. Each row records the from-state, to-state, the transition name (matching the lifecycle definition), optional transition data, and which principal triggered it. This table is never updated or deleted -- it serves as a complete, immutable history of an entity's lifecycle progression.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                                           |
| ---------------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                          |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                              |
| `workflow_instance_id` | `uuid`        | NOT NULL | --                  | FK to `wf.workflow_instance(id)`. Parent workflow.                    |
| `from_state`           | `text`        | NOT NULL | --                  | State before the transition.                                          |
| `to_state`             | `text`        | NOT NULL | --                  | State after the transition.                                           |
| `transition_name`      | `text`        | NULL     | --                  | Named transition from the lifecycle definition.                       |
| `transition_data`      | `jsonb`       | NULL     | --                  | Optional data associated with the transition (e.g., form submission). |
| `triggered_by`         | `uuid`        | NOT NULL | --                  | FK to `core.principal(id)`. Who triggered the transition.             |
| `triggered_at`         | `timestamptz` | NOT NULL | `now()`             | When the transition occurred.                                         |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                               |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `workflow_instance_id` | `wf.workflow_instance(id)` | CASCADE   |
| `triggered_by`         | `core.principal(id)`       | SET NULL  |

### Indexes

| Name                                  | Columns                                     | Notes                                            |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `idx_workflow_transition_instance`    | `(workflow_instance_id, triggered_at DESC)` | Transition history for a workflow, newest first. |
| `idx_workflow_transition_tenant_time` | `(tenant_id, triggered_at DESC)`            | Tenant-wide activity feed.                       |

### Relationships

- **Belongs to** `wf.workflow_instance` via `workflow_instance_id`.

---

## wf.approval_definition

Approval workflow template definitions. Each definition encodes the rules for who must approve, under what conditions, and what approval paths are available. Definitions are scoped to a tenant and an entity type, and contain a `rules` JSONB column that specifies approvers, conditions, and routing logic. Like lifecycles, definitions can be activated or deactivated.

### Columns

| Column        | Type          | Nullable | Default                                 | Description                                                      |
| ------------- | ------------- | -------- | --------------------------------------- | ---------------------------------------------------------------- |
| `id`          | `uuid`        | NOT NULL | `gen_random_uuid()`                     | Primary key.                                                     |
| `tenant_id`   | `uuid`        | NOT NULL | --                                      | FK to `core.tenant(id)`. Tenant scope.                           |
| `code`        | `text`        | NOT NULL | --                                      | Unique machine-readable code within tenant.                      |
| `name`        | `text`        | NOT NULL | --                                      | Human-readable name.                                             |
| `description` | `text`        | NULL     | --                                      | Optional long description.                                       |
| `entity_type` | `text`        | NOT NULL | --                                      | Entity type this definition applies to.                          |
| `rules`       | `jsonb`       | NOT NULL | `'{"approvers": [], "conditions": []}'` | Approval routing rules: approvers list and condition predicates. |
| `is_active`   | `boolean`     | NOT NULL | `true`                                  | Whether this definition is available for new approval requests.  |
| `created_at`  | `timestamptz` | NOT NULL | `now()`                                 | Row creation timestamp.                                          |
| `created_by`  | `text`        | NOT NULL | --                                      | Identity of the creator.                                         |
| `updated_at`  | `timestamptz` | NULL     | --                                      | Last modification timestamp.                                     |
| `updated_by`  | `text`        | NULL     | --                                      | Identity of last modifier.                                       |

### Primary Key

- `id`

### Foreign Keys

| Column      | References        | On Delete |
| ----------- | ----------------- | --------- |
| `tenant_id` | `core.tenant(id)` | CASCADE   |

### Constraints

| Name                                   | Type   | Details                                                        |
| -------------------------------------- | ------ | -------------------------------------------------------------- |
| `approval_definition_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` -- Definition codes are unique per tenant. |

### Indexes

| Name                                  | Columns                    | Notes                                  |
| ------------------------------------- | -------------------------- | -------------------------------------- |
| `idx_approval_definition_tenant`      | `(tenant_id)`              | Tenant-scoped queries.                 |
| `idx_approval_definition_entity_type` | `(tenant_id, entity_type)` | Lookup by entity type within a tenant. |

### Relationships

- **Has many** `wf.approval_instance` -- Runtime approval sessions created from this definition.

---

## wf.approval_instance

Runtime approval session representing a single decision point. When an entity requires approval, an instance is created referencing the approval definition. The instance captures a snapshot of the entity at request time (`entity_snapshot`), tracks the overall approval status and final decision, and records who requested the approval and who made the final decision. Multiple approval instances can exist for the same entity over time (e.g., resubmissions after rejection).

### Columns

| Column                   | Type          | Nullable | Default             | Description                                                                                          |
| ------------------------ | ------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                         |
| `tenant_id`              | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                             |
| `approval_definition_id` | `uuid`        | NOT NULL | --                  | FK to `wf.approval_definition(id)`. Source definition.                                               |
| `entity_type`            | `text`        | NOT NULL | --                  | Type of entity under approval.                                                                       |
| `entity_id`              | `uuid`        | NOT NULL | --                  | ID of the entity under approval.                                                                     |
| `entity_version_id`      | `uuid`        | NULL     | --                  | Optional: version of entity at approval time.                                                        |
| `entity_snapshot`        | `jsonb`       | NULL     | --                  | Frozen snapshot of entity data at request time for audit.                                            |
| `status`                 | `text`        | NOT NULL | `'pending'`         | Overall approval status. Constrained to: `pending`, `approved`, `rejected`, `escalated`, `canceled`. |
| `decision`               | `text`        | NULL     | --                  | Final decision. Constrained to: `approve`, `reject`, `escalate`, or NULL (undecided).                |
| `requested_by`           | `uuid`        | NOT NULL | --                  | FK to `core.principal(id)`. Who submitted the approval request.                                      |
| `requested_at`           | `timestamptz` | NOT NULL | `now()`             | When the approval was requested.                                                                     |
| `decided_by`             | `uuid`        | NULL     | --                  | FK to `core.principal(id)`. Who made the final decision.                                             |
| `decided_at`             | `timestamptz` | NULL     | --                  | When the final decision was made.                                                                    |
| `reason`                 | `text`        | NULL     | --                  | Reason for the final decision.                                                                       |
| `metadata`               | `jsonb`       | NULL     | --                  | Arbitrary metadata (e.g., urgency, category).                                                        |
| `created_at`             | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                              |
| `created_by`             | `text`        | NOT NULL | --                  | Identity of the creator.                                                                             |
| `updated_at`             | `timestamptz` | NULL     | --                  | Last modification timestamp.                                                                         |
| `updated_by`             | `text`        | NULL     | --                  | Identity of last modifier.                                                                           |

### Primary Key

- `id`

### Foreign Keys

| Column                   | References                   | On Delete |
| ------------------------ | ---------------------------- | --------- |
| `tenant_id`              | `core.tenant(id)`            | CASCADE   |
| `approval_definition_id` | `wf.approval_definition(id)` | RESTRICT  |
| `requested_by`           | `core.principal(id)`         | SET NULL  |
| `decided_by`             | `core.principal(id)`         | SET NULL  |

### Constraints

| Name                             | Type  | Details                                                              |
| -------------------------------- | ----- | -------------------------------------------------------------------- |
| `approval_instance_status_chk`   | CHECK | `status IN ('pending','approved','rejected','escalated','canceled')` |
| `approval_instance_decision_chk` | CHECK | `decision IS NULL OR decision IN ('approve','reject','escalate')`    |

### Indexes

| Name                                 | Columns                               | Notes                               |
| ------------------------------------ | ------------------------------------- | ----------------------------------- |
| `idx_approval_instance_status`       | `(tenant_id, status)`                 | Filter by approval status.          |
| `idx_approval_instance_entity`       | `(tenant_id, entity_type, entity_id)` | Entity approval history.            |
| `idx_approval_instance_requested_by` | `(requested_by, requested_at DESC)`   | Approvals submitted by a principal. |

### Relationships

- **Belongs to** `wf.approval_definition` via `approval_definition_id`.
- **Has many** `wf.approval_task` -- Individual approver tasks.
- **Has many** `wf.approval_comment` -- Discussion thread.
- **Has many** `wf.approval_stage` -- Runtime stages.
- **Has many** `wf.approval_assignment_snapshot` -- Assignment audit trail.
- **Has many** `wf.approval_escalation` -- SLA escalation events.
- **Has many** `wf.approval_event` -- Lifecycle event log.

---

## wf.approval_task

Individual approval task assigned to a single approver within an approval instance. Tasks are ordered (`order_index`) and progress through their own status lifecycle. Each task records when it was assigned, started, and completed, along with the approver's decision and reasoning. Tasks can optionally be bound to a specific approval stage and carry SLA information via a due date.

### Columns

| Column                  | Type          | Nullable | Default             | Description                                                                                                        |
| ----------------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                    | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                                                       |
| `tenant_id`             | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                                           |
| `approval_instance_id`  | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval.                                                                 |
| `approver_id`           | `uuid`        | NOT NULL | --                  | FK to `core.principal(id)`. The assigned approver.                                                                 |
| `order_index`           | `int`         | NOT NULL | --                  | Position in the approval sequence (0-based).                                                                       |
| `status`                | `text`        | NOT NULL | `'pending'`         | Task status. Constrained to: `pending`, `assigned`, `in_progress`, `approved`, `rejected`, `skipped`, `escalated`. |
| `assigned_at`           | `timestamptz` | NOT NULL | `now()`             | When the task was assigned.                                                                                        |
| `started_at`            | `timestamptz` | NULL     | --                  | When the approver began review.                                                                                    |
| `completed_at`          | `timestamptz` | NULL     | --                  | When the approver completed their action.                                                                          |
| `decision`              | `text`        | NULL     | --                  | Approver's decision. Constrained to: `approve`, `reject`, `escalate`, or NULL.                                     |
| `reason`                | `text`        | NULL     | --                  | Approver's rationale for their decision.                                                                           |
| `metadata`              | `jsonb`       | NULL     | --                  | Arbitrary task metadata.                                                                                           |
| `created_at`            | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                                            |
| `created_by`            | `text`        | NOT NULL | --                  | Identity of the creator.                                                                                           |
| `updated_at`            | `timestamptz` | NULL     | --                  | Last modification timestamp.                                                                                       |
| `updated_by`            | `text`        | NULL     | --                  | Identity of last modifier.                                                                                         |
| `approval_stage_id`     | `uuid`        | NULL     | --                  | FK to `wf.approval_stage(id)`. Stage this task belongs to (added via ALTER).                                       |
| `assignee_principal_id` | `uuid`        | NULL     | --                  | Resolved principal ID for assignment audit (added via ALTER).                                                      |
| `assignee_group_id`     | `uuid`        | NULL     | --                  | Group-based assignment source (added via ALTER).                                                                   |
| `due_at`                | `timestamptz` | NULL     | --                  | SLA deadline for this task (added via ALTER).                                                                      |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |
| `approver_id`          | `core.principal(id)`       | CASCADE   |
| `approval_stage_id`    | `wf.approval_stage(id)`    | CASCADE   |

### Constraints

| Name                         | Type  | Details                                                                                      |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `approval_task_status_chk`   | CHECK | `status IN ('pending','assigned','in_progress','approved','rejected','skipped','escalated')` |
| `approval_task_decision_chk` | CHECK | `decision IS NULL OR decision IN ('approve','reject','escalate')`                            |

### Indexes

| Name                         | Columns                               | Notes                               |
| ---------------------------- | ------------------------------------- | ----------------------------------- |
| `idx_approval_task_instance` | `(approval_instance_id, order_index)` | Tasks in order within an approval.  |
| `idx_approval_task_approver` | `(approver_id, status)`               | An approver's pending/active tasks. |
| `idx_approval_task_status`   | `(tenant_id, status)`                 | Dashboard: tasks by status.         |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.
- **Belongs to** `wf.approval_stage` via `approval_stage_id` (optional).
- **Has many** `wf.approval_comment` -- Comments optionally linked to a task.

---

## wf.approval_comment

Comments and discussion on an approval request. Comments can be attached to the overall approval instance or to a specific approval task. This provides a threaded discussion capability during the approval process, enabling approvers and requesters to exchange information, ask questions, or provide context for their decisions.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                                         |
| ---------------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                        |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                            |
| `approval_instance_id` | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval.                  |
| `approval_task_id`     | `uuid`        | NULL     | --                  | FK to `wf.approval_task(id)`. Optionally scoped to a specific task. |
| `commenter_id`         | `uuid`        | NOT NULL | --                  | FK to `core.principal(id)`. Who wrote the comment.                  |
| `comment_text`         | `text`        | NOT NULL | --                  | Comment body text.                                                  |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Comment timestamp.                                                  |
| `created_by`           | `text`        | NOT NULL | --                  | Identity of the commenter.                                          |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |
| `approval_task_id`     | `wf.approval_task(id)`     | SET NULL  |
| `commenter_id`         | `core.principal(id)`       | SET NULL  |

### Indexes

| Name                             | Columns                                  | Notes                         |
| -------------------------------- | ---------------------------------------- | ----------------------------- |
| `idx_approval_comment_instance`  | `(approval_instance_id, created_at ASC)` | Chronological comment thread. |
| `idx_approval_comment_commenter` | `(commenter_id, created_at DESC)`        | A user's comment history.     |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.
- **Optionally belongs to** `wf.approval_task` via `approval_task_id`.

---

## wf.approval_stage

Runtime stage within an approval instance. Stages divide an approval workflow into sequential phases, each of which can operate in serial or parallel mode. A quorum JSONB column defines how many approvals are needed to clear the stage (e.g., "all", "majority", or a specific count). Stages are numbered (`stage_no`) and progressed through in order.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                                                            |
| ---------------------- | ------------- | -------- | ------------------- | -------------------------------------------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                           |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                               |
| `approval_instance_id` | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval.                                     |
| `stage_no`             | `int`         | NOT NULL | --                  | Ordinal position within the approval (1-based).                                        |
| `name`                 | `text`        | NULL     | --                  | Optional human-readable stage label.                                                   |
| `mode`                 | `text`        | NOT NULL | `'serial'`          | Execution mode. Constrained to: `serial`, `parallel`.                                  |
| `quorum`               | `jsonb`       | NULL     | --                  | Quorum rule (e.g., `{"type": "all"}` or `{"type": "count", "value": 2}`).              |
| `status`               | `text`        | NOT NULL | `'pending'`         | Stage status. Constrained to: `pending`, `active`, `completed`, `skipped`, `canceled`. |
| `started_at`           | `timestamptz` | NULL     | --                  | When the stage became active.                                                          |
| `completed_at`         | `timestamptz` | NULL     | --                  | When the stage completed.                                                              |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                |
| `created_by`           | `text`        | NOT NULL | --                  | Identity of the creator.                                                               |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |

### Constraints

| Name                                 | Type   | Details                                                                          |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `approval_stage_mode_chk`            | CHECK  | `mode IN ('serial','parallel')`                                                  |
| `approval_stage_status_chk`          | CHECK  | `status IN ('pending','active','completed','skipped','canceled')`                |
| `approval_stage_instance_order_uniq` | UNIQUE | `(approval_instance_id, stage_no)` -- One stage per position within an approval. |

### Indexes

| Name                          | Columns                            | Notes                 |
| ----------------------------- | ---------------------------------- | --------------------- |
| `idx_approval_stage_instance` | `(approval_instance_id, stage_no)` | Ordered stage lookup. |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.
- **Has many** `wf.approval_task` -- Tasks bound to this stage (via `approval_stage_id`).
- **Has many** `wf.approval_assignment_snapshot` -- Assignment audit for this stage.

---

## wf.approval_assignment_snapshot

Point-in-time snapshot of approver assignments for audit trail purposes. When approvers are assigned to an approval instance (potentially at a specific stage), a snapshot is recorded capturing who was assigned, whether by principal or group, and how the assignment was resolved. This provides a tamper-resistant record of "who was supposed to approve" even if organizational structures change later.

### Columns

| Column                  | Type          | Nullable | Default             | Description                                                            |
| ----------------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------------- |
| `id`                    | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                           |
| `tenant_id`             | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                               |
| `approval_instance_id`  | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval.                     |
| `stage_id`              | `uuid`        | NULL     | --                  | FK to `wf.approval_stage(id)`. Optional stage scope.                   |
| `assignee_principal_id` | `uuid`        | NULL     | --                  | The resolved principal ID who was assigned.                            |
| `assignee_group_id`     | `uuid`        | NULL     | --                  | Group from which the assignee was resolved.                            |
| `resolution_strategy`   | `text`        | NULL     | --                  | How the assignee was determined (e.g., "role_based", "manager_chain"). |
| `resolved_at`           | `timestamptz` | NULL     | --                  | When the assignment was resolved.                                      |
| `snapshot_data`         | `jsonb`       | NULL     | --                  | Full snapshot of assignment context (org hierarchy, rules applied).    |
| `created_at`            | `timestamptz` | NOT NULL | `now()`             | Snapshot creation timestamp.                                           |
| `created_by`            | `text`        | NOT NULL | --                  | Identity of the snapshot creator.                                      |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |
| `stage_id`             | `wf.approval_stage(id)`    | CASCADE   |

### Indexes

| Name                               | Columns                  | Notes                          |
| ---------------------------------- | ------------------------ | ------------------------------ |
| `idx_approval_assignment_instance` | `(approval_instance_id)` | Assignment lookup by approval. |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.
- **Optionally belongs to** `wf.approval_stage` via `stage_id`.

---

## wf.approval_escalation

Records SLA escalation events during approval processing. When an approval task or stage exceeds its SLA deadline, an escalation event is created. The `kind` column defaults to `sla_breach` but can represent other escalation types. The `payload` JSONB captures escalation context such as breach duration, affected tasks, and notification details.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                        |
| ---------------------- | ------------- | -------- | ------------------- | -------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                       |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                           |
| `approval_instance_id` | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval. |
| `kind`                 | `text`        | NOT NULL | `'sla_breach'`      | Escalation type (e.g., "sla_breach").              |
| `payload`              | `jsonb`       | NULL     | --                  | Escalation context and details.                    |
| `occurred_at`          | `timestamptz` | NOT NULL | `now()`             | When the escalation occurred.                      |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                            |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |

### Indexes

| Name                               | Columns                               | Notes                               |
| ---------------------------------- | ------------------------------------- | ----------------------------------- |
| `idx_approval_escalation_instance` | `(approval_instance_id, occurred_at)` | Escalation history for an approval. |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.

---

## wf.approval_event

Append-only audit log of all lifecycle events within an approval instance. Every significant action -- task assignment, decision, escalation, cancellation, status change -- is recorded as an event. This provides a complete, immutable timeline of everything that happened during an approval, independent of the current state of tasks and stages.

### Columns

| Column                 | Type          | Nullable | Default             | Description                                                          |
| ---------------------- | ------------- | -------- | ------------------- | -------------------------------------------------------------------- |
| `id`                   | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                         |
| `tenant_id`            | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                             |
| `approval_instance_id` | `uuid`        | NOT NULL | --                  | FK to `wf.approval_instance(id)`. Parent approval.                   |
| `event_type`           | `text`        | NOT NULL | --                  | Type of event (e.g., "task_assigned", "decision_made", "escalated"). |
| `actor_id`             | `text`        | NULL     | --                  | Identity of the actor who caused the event (may be system).          |
| `payload`              | `jsonb`       | NULL     | --                  | Event-specific data.                                                 |
| `created_at`           | `timestamptz` | NOT NULL | `now()`             | Event timestamp.                                                     |

### Primary Key

- `id`

### Foreign Keys

| Column                 | References                 | On Delete |
| ---------------------- | -------------------------- | --------- |
| `tenant_id`            | `core.tenant(id)`          | CASCADE   |
| `approval_instance_id` | `wf.approval_instance(id)` | CASCADE   |

### Indexes

| Name                          | Columns                              | Notes                                 |
| ----------------------------- | ------------------------------------ | ------------------------------------- |
| `idx_approval_event_instance` | `(approval_instance_id, created_at)` | Chronological event log per approval. |
| `idx_approval_event_type`     | `(tenant_id, event_type)`            | Filter by event type across tenant.   |

### Relationships

- **Belongs to** `wf.approval_instance` via `approval_instance_id`.

---

## wf.lifecycle_timer_schedule

Tracks active lifecycle timer jobs for automated state transitions, auto-close, auto-cancel, and reminder notifications. When a lifecycle state has a timer policy, a scheduled timer row is created with a reference to the BullMQ job. If the entity transitions manually before the timer fires, the timer can be canceled via its `job_id`. The `policy_snapshot` JSONB is immutable -- changes to the timer policy do not retroactively affect already-scheduled timers.

### Columns

| Column            | Type          | Nullable | Default             | Description                                                                             |
| ----------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key.                                                                            |
| `tenant_id`       | `uuid`        | NOT NULL | --                  | FK to `core.tenant(id)`.                                                                |
| `entity_name`     | `text`        | NOT NULL | --                  | Entity type name (e.g., "purchase_order").                                              |
| `entity_id`       | `text`        | NOT NULL | --                  | Entity instance ID.                                                                     |
| `lifecycle_id`    | `uuid`        | NOT NULL | --                  | FK to `meta.lifecycle(id)`. Lifecycle definition.                                       |
| `state_id`        | `uuid`        | NOT NULL | --                  | FK to `meta.lifecycle_state(id)`. State that triggered the timer.                       |
| `timer_type`      | `text`        | NOT NULL | --                  | Timer kind. Constrained to: `auto_close`, `auto_cancel`, `reminder`, `auto_transition`. |
| `transition_id`   | `uuid`        | NULL     | --                  | FK to `meta.lifecycle_transition(id)`. Optional: transition to fire.                    |
| `scheduled_at`    | `timestamptz` | NOT NULL | `now()`             | When the timer was scheduled.                                                           |
| `fire_at`         | `timestamptz` | NOT NULL | --                  | When the timer should fire.                                                             |
| `job_id`          | `text`        | NOT NULL | --                  | BullMQ job ID for cancellation and tracking.                                            |
| `policy_id`       | `uuid`        | NULL     | --                  | FK to `meta.lifecycle_timer_policy(id)`. Source policy (may be null if policy deleted). |
| `policy_snapshot` | `jsonb`       | NOT NULL | --                  | Immutable snapshot of timer policy rules at scheduling time.                            |
| `status`          | `text`        | NOT NULL | `'scheduled'`       | Timer status. Constrained to: `scheduled`, `fired`, `canceled`.                         |
| `created_at`      | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp.                                                                 |
| `created_by`      | `text`        | NOT NULL | --                  | Identity of the creator.                                                                |

### Primary Key

- `id`

### Foreign Keys

| Column          | References                        | On Delete |
| --------------- | --------------------------------- | --------- |
| `tenant_id`     | `core.tenant(id)`                 | CASCADE   |
| `lifecycle_id`  | `meta.lifecycle(id)`              | CASCADE   |
| `state_id`      | `meta.lifecycle_state(id)`        | CASCADE   |
| `transition_id` | `meta.lifecycle_transition(id)`   | CASCADE   |
| `policy_id`     | `meta.lifecycle_timer_policy(id)` | SET NULL  |

### Constraints

| Name                                  | Type  | Details                                                                   |
| ------------------------------------- | ----- | ------------------------------------------------------------------------- |
| `lifecycle_timer_schedule_status_chk` | CHECK | `status IN ('scheduled','fired','canceled')`                              |
| `lifecycle_timer_schedule_type_chk`   | CHECK | `timer_type IN ('auto_close','auto_cancel','reminder','auto_transition')` |

### Indexes

| Name                                   | Columns                               | Notes                                                            |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `idx_lifecycle_timer_schedule_entity`  | `(tenant_id, entity_name, entity_id)` | Lookup timers for an entity (cancellation on manual transition). |
| `idx_lifecycle_timer_schedule_fire_at` | `(tenant_id, status, fire_at)`        | Upcoming timers for rehydration and monitoring.                  |
| `idx_lifecycle_timer_schedule_job_id`  | `(job_id)`                            | Job completion tracking by BullMQ job ID.                        |
| `idx_lifecycle_timer_schedule_state`   | `(tenant_id, state_id, status)`       | Impact analysis: timers for a given state.                       |

### Relationships

- **References** `meta.lifecycle` via `lifecycle_id` (note: references meta schema, not wf schema).
- **References** `meta.lifecycle_state` via `state_id`.
- **Optionally references** `meta.lifecycle_transition` via `transition_id`.
- **Optionally references** `meta.lifecycle_timer_policy` via `policy_id`.

---

## Entity Relationship Diagram

```
                        core.tenant
                            |
        +-------------------+-------------------+
        |                                       |
  wf.lifecycle                        wf.approval_definition
        |                                       |
  wf.lifecycle_version              wf.approval_instance
        |                           /   |   |   \    \     \
  wf.workflow_instance             /    |    |    \    \     \
        |                        /     |     |     \    \     \
  wf.workflow_transition        /      |     |      \    \     \
                               /       |     |       \    \     \
                approval_task  stage  comment  event  escal. snapshot
                     |           |
                     +-----------+
                     (stage binding)


  wf.lifecycle_timer_schedule ---> meta.lifecycle
                              ---> meta.lifecycle_state
                              ---> meta.lifecycle_transition
                              ---> meta.lifecycle_timer_policy
```

### Key Design Decisions

1. **Immutable versioning**: `lifecycle_version` ensures running workflows are never affected by lifecycle edits.
2. **Append-only audit**: `workflow_transition`, `approval_event`, and `approval_escalation` are write-once tables.
3. **RESTRICT on delete**: Workflow instances and approval instances prevent deletion of their parent definitions.
4. **Tenant isolation**: Every table includes `tenant_id` with CASCADE delete from `core.tenant`.
5. **Timer policy snapshots**: `lifecycle_timer_schedule.policy_snapshot` is immutable -- policy changes do not retroactively affect already-scheduled timers.
6. **Stage-based approval**: The `approval_stage` + `approval_task` model supports both serial (sequential approver chains) and parallel (quorum-based) approval patterns.
