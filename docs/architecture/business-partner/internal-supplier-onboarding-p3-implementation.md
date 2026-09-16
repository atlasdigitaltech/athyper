# Internal supplier onboarding — P3 task-owned reviews and approvals

Date: 2026-09-14  
Status: Implemented and deployed in local DEV. Task execution is qualified with the plan's permitted controlled document-ready fixture; live document jobs remain pending P4.

## Execution and authority

The [task adapter](../../../server/apps/platform-host/src/composition/supplier-process-tasks.ts) executes the already-published Simple, Standard and Enhanced catalogs. It reads the accepted attempt and exact workflow/reviewer-policy revisions, without selecting policy again. It serializes commands with the canonical case lock and verifies the submitted snapshot and review-pack gate before starting or deciding work.

The [shared workflow runner](../../../server/packages/platform/workflow/src/task-approval-runner.ts) reuses the workflow owner's approval service and quorum evaluator. It validates every configured level, excludes both the case creator and submitter, and reports empty or impossible quorums. Each level resolves its own named role selectors against current organization/company-scoped memberships and decision permission. Resolution is refreshed when a later level activates and rechecked for the acting reviewer at decision time. The pilot intentionally rejects unsupported selector kinds and conditional levels rather than silently substituting candidates.

Each human task receives its own `document.workflow_request` with `entity_type=cycle_task`, pinned definition and attempt coordinates. Stages retain resolved candidates, chosen assignees, reviewer-policy revision, quorum threshold, due policy, deadlines and escalation selectors. Work items use the actual `cycle_task_id` and separately bind workflow request, workflow stage, task template, case, attempt, selection, manifest and snapshot. Each item is eligible only to its named assignee; the full candidate roster remains stage evidence. Only the active level receives work items. Completing a count quorum cancels its remaining open items and activates the next level.

The existing case-view API exposes `taskExecutions` selected by the accepted attempt, with separate workflow/task IDs, outcome scope, levels, quorum counts, deadlines and work items. Task workflows do not enter the legacy case-wide "latest workflow" projection. P8 owns the corresponding dynamic UI and client presentation.

## Commands and outcomes

Authenticated routes are mounted in the source API and NEON relay:

- `GET /api/governance/process-tasks/cases/:caseId/view`
- `POST /api/governance/process-tasks/cases/:caseId/start`
- `POST /api/governance/process-tasks/cases/:caseId/decide`

Start uses existing case-submit authority and returns the current task execution on replay. Decision uses case-decision authority plus current scoped reviewer eligibility, exact work-item assignment, active level, maker-checker, document readiness, attempt binding and expected work-item version. Its strict body distinguishes `attemptId`, `cycleTaskId`, `workflowRequestId`, `workflowStageId` and `workItemId`; the idempotency header must agree with the body. A repeated accepted vote returns its saved receipt without voting again.

Reviews accept `accept_review`; approvals accept `approve`. Successful intermediate review or approval completes only its task and starts the next task. Only the published `case_final_decision` task invokes the canonical case lifecycle approval command. Final approval records a decision snapshot and completes that task while leaving the cycle running for P4/P6 document, materialization and readiness gates.

Work-item creation and completion emit established committed workflow events. Votes and receipts persist with their work items and workflow state. Generic workflow completion/cancellation is rejected for process-owned items; callers must use the task owner. Return, rejection and correction commands remain P5 scope and are not silently translated into an approval.

## Database enforcement

Canonical DDL adds two unique indexes and three triggers, without new tables or migration scripts:

- One workflow execution per tenant/task/attempt; one accepted vote key per tenant.
- Workflow bindings must match the accepted attempt, manifest and exact published workflow. Creation requires document readiness and completed predecessors.
- Work-item bindings must match the task workflow, stage and resolved assignee. Bindings cannot be stripped or retargeted, and process workflow/work-item records cannot be deleted.
- Completing a human cycle task requires its task workflow and all stage quorums, so a generic cycle-task command cannot skip a review.
- The canonical case-decision command requires the selected final task, ready review pack and completed final workflow quorums. Intermediate task IDs and premature final decisions are rejected.

Task-specific case associations supplement the existing primary run association. The original run remains the owner of materialization/readiness completion; approval does not close it.

## Qualification

Real PostgreSQL qualification executes the pinned catalogs, scoped directory resolver, shared runner, work-item persistence and canonical final lifecycle command. The document-ready result and command authorizer are explicit test controls, permitted for P3 by the plan. All fixture changes and votes roll back; they do not turn pending live document jobs into fabricated ready artifacts.

| Profile | Human tasks | Levels | Accepted votes | Final result |
| --- | ---: | ---: | ---: | --- |
| Simple / Basic | 1 | 1 | 1 independent reviewer | Case approved; cycle running |
| Standard | 2 | 2 | 2 | Combined review leaves case submitted; final approval decides case |
| Enhanced | 5 | 10 | 15 | Each first level requires both assigned reviewers; second level uses count 1 |

Enhanced temporarily adds an existing synthetic principal to the existing scoped reviewer group inside the rollback transaction. Definitions contain named roles, not principal UUIDs. The smaller profiles use the existing independent reviewer.

Qualification also verifies blocked starts before documents, stable execution/vote replay, maker and stale-coordinate rejection, empty-role failure, revoked-membership rejection, immutable work-item bindings, rejected premature case approval and rejected generic task completion. The owning case projection reports the correct attempt, quorum and deadlines.

Authenticated live API and browser checks cover all three existing P2 cases: task views return their exact attempt, start returns the document-gate conflict, invalid decision bodies are rejected, and no premature work is created. This live evidence does not claim actual rendered case packs or live reviewer decisions before P4.

Validation: 75 workflow tests, 79 case service/view tests and one HTTP route test passed. Workflow, master-data, platform-host and relay typechecks passed. Affected server packages and NEON built; API and NEON source containers were deployed.

Reproduce in the configured local DEV environment:

```sh
node tooling/scripts/verification/install-supplier-process-task-storage.mjs
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-tasks-db.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-tasks-live.mts
```

[Combined P3 evidence](internal-supplier-onboarding-p3-evidence.json) records database, live API/browser, storage and deployment receipts. P4 connects real document processing and readiness callbacks; final Increment A qualification must repeat the route journeys with real rendered, stored and scanned case documents. P5–P9 and follow-ups B/C keep their separate scopes.
