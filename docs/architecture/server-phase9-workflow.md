# Phase 9 capability 1: Workflow

## Decision

Workflow is split by DDL ownership instead of treating the three planes as identical.

- The universal slice is descriptor-governed work-item orchestration. `document.work_item` is installed from common DDL in Athyper, Neon, and Mesh.
- Entity applicability and action validity come from the activated local `athyper.entity-runtime-descriptor/1.0` projection. Athyper remains the authoring authority; each app executes against its local projection.
- Neon approval stages are a later specialization because only Neon currently owns `document.workflow_request` and `document.workflow_stage`.
- A completed work item emits a durable event. It does not directly mutate an entity in a nested transaction. The event consumer or a future transaction-sharing completion port invokes the published Records transition.

## DDL findings

| DDL concept | Plane | Disposition |
| --- | --- | --- |
| `metadata.entity_lifecycle_binding` | Athyper | Retained as the portable entity-to-lifecycle revision coordinate |
| `metadata.entity_lifecycle_operation_binding` | Athyper | Retained as the canonical operation-to-transition mapping |
| `runtime_meta.entity_descriptor` | All | Retained as the local runtime artifact containing compiled transitions |
| `document.work_item` | All | Canonical universal Workflow persistence |
| `document.workflow_request`, `document.workflow_stage` | Neon only | Deferred to the Neon approval specialization |
| `control.workflow_sla_policy` | Athyper, projected by Snapshot | Deferred to timer/SLA specialization |
| `event.command_execution` | All | Reserved for the command-idempotency specialization |

The Workflow permission seed adds `workflow.work_item.read`, `create`, `claim`, `complete`, and `cancel` to Athyper authority under module `wfl`. Normal authorization publication distributes effective permission state to runtime planes.

## Legacy classification

| Legacy behavior | Classification | Reason |
| --- | --- | --- |
| `event.work_item` reads and writes | Retired | Current DDL owner is `document.work_item` with a different shape |
| `control.workflow_definition/template/template_stage/template_rule` | Retired pending redesign | These tables do not exist in the current DDL |
| Direct feature flags `workflow_runtime.*` | Retired | Entity applicability is published in Entity Metadata |
| Direct source-table mutation adapters | Retired | Records owns descriptor-validated entity mutation |
| Generic work-item inbox/actions | Rebuilt | Implemented against common DDL and explicit ports |
| JSONLogic gate evaluation | Deferred to Policy/Rules | Rules are the next capability and must own expression evaluation |
| Neon request/stage/quorum engine | Deferred | Requires a separate Neon-only bounded slice |
| SLA reminder/escalation worker | Deferred to Jobs | Depends on the approval-stage and SLA-policy slices |
| Admin definition/template routes | Retired pending revised authoring model | They target absent legacy tables |
| Workflow recovery job | Deferred | It targets the legacy request/stage/work-item relationship |

## Package ownership

- `@athyper/server-contract-workflow` owns work-item commands, results, service, and persistence ports.
- `@athyper/server-platform-workflow` owns work-item orchestration, validation, HTTP routes, and the DDL-backed repository.
- Foundation owns the reusable plane transaction coordinator contract.
- Metadata owns descriptor resolution; Workflow consumes only its public reader.
- IAM owns permission decisions and verified request context.
- Audit and Events own their existing ports.
- The platform host selects Athyper, Neon, or Mesh adapters and registers concrete routes.

## Runtime flow

1. IAM authenticates the app-specific request and establishes plane, tenant, and principal.
2. Workflow authorizes the canonical work-item operation.
3. On create, Workflow resolves the source Entity descriptor locally and rejects unpublished actions.
4. The host opens the selected plane's tenant transaction, including Athyper tenant mode for common tenant-owned tables.
5. The repository applies tenant, assignment, availability, and state predicates to `document.work_item`.
6. The state change, `event.outbox` append, and Audit call occur before commit. Outbox failure rolls the work-item write back.

## Routes

- `GET /api/workflow/inbox`
- `POST /api/workflow/work-items`
- `POST /api/workflow/work-items/:workItemId/claim`
- `POST /api/workflow/work-items/:workItemId/complete`
- `POST /api/workflow/work-items/:workItemId/cancel`

## Next Workflow slices

1. Add live DDL integration tests for `document.work_item` and RLS on all three planes.
2. Build event command idempotency on `event.command_execution`.
3. Build the Neon approval request/stage/quorum specialization.
4. Build Policy/Rules and inject gate evaluation rather than embedding JSONLogic in Workflow.
5. Recover SLA timers and repair jobs only after the approval specialization is stable.
