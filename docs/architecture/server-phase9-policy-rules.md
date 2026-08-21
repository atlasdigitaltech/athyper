# Phase 9: Policy and Rules

## Outcome

Policy evaluation is a shared platform capability for Athyper, Neon, and Mesh. The implementation is rebuilt against the current control and Entity Meta DDL; it does not copy the retired policy engine.

## Canonical ownership

| Concern | Canonical owner | Notes |
| --- | --- | --- |
| Policy wire types and ports | `@athyper/server-contract-policy` | Capability boundary with no database, HTTP, or framework implementation. |
| Policy definitions, ordered rules, and test cases | Each plane's local `control` schema | `control.policy_definition`, `control.policy_rule`, and `control.policy_test_case` are installed from common DDL in all three databases. |
| Entity/operation policy composition | Athyper `metadata` schema | `metadata.entity_policy_binding` and `metadata.entity_field_policy_binding` refer to policies; they never duplicate policy bodies. |
| Published runtime composition | Each plane's `runtime_meta.entity_descriptor` | A descriptor contains revision-pinned bindings needed by that plane. |
| Deterministic evaluation and policy reads | `@athyper/server-platform-policy` | Safe JSON rules, local transaction, bounded read cache, and audit recording. |
| Authentication and authorization | IAM contracts/platform | The policy route requires `policy.evaluate`; policy decisions do not replace route authorization. |
| Concrete registration | `@athyper/server-platform-host` | The host wires local repositories and plane transactions. |

The execution path is:

`Entity Meta release -> runtime descriptor with binding ID/version -> local control policy read -> deterministic evaluation -> capability action + audit`

## First production slice

- `POST /api/policy/evaluate` authenticates the caller, resolves the requested plane, requires `policy.evaluate`, and evaluates only local/global active definitions visible under that plane's tenant transaction.
- Active definitions are filtered by entity type, effective dates, tenant scope, and optional exact definition IDs.
- Supported DDL evaluation modes are `first_match`, `accumulate`, and `all`; all matching outcomes remain visible and the most restrictive matched action determines the decision.
- Supported actions are `allow`, `deny`, `warn`, `require_workflow`, and `escalate`.
- The JSON-rule evaluator does not execute code. It has depth, node, collection, and string limits and rejects prototype traversal and unsupported operators.
- Empty condition objects are unconditional rules, matching the DDL default.
- Every evaluation writes `policy.evaluation.completed` through the Audit port.
- Cache entries are bounded and short-lived. They contain read-only policy definitions and are keyed by tenant, entity, date, and exact bound IDs.

## Entity Meta and Workflow integration

Published policy bindings include the definition ID and version, stage, enforcement mode, priority, optional operation/field coordinate, and input mapping. Metadata parsing rejects invalid stages, enforcement modes, UUIDs, priorities, and unpinned revisions.

Workflow consumes authorization, precondition, and validation bindings during work-item creation. It evaluates them inside the same local transaction, fails closed if the Policy service or pinned revision is unavailable, prevents persistence for an enforced denial, and stores bounded evaluation evidence for accepted work items. `warn` and `observe` bindings remain non-blocking. Field masking and postcondition execution belong to their respective consumer slices.

## Legacy disposition

| Legacy area | Disposition | Reason |
| --- | --- | --- |
| JSON rule evaluation | Rebuilt | Retained behavior with bounded deterministic operators and no dynamic execution. |
| Definition/rule reads and evaluation | Rebuilt | Uses current `policy_definition_id`, `condition_expr`, `action_code`, and definition-owned `version_no`. |
| Direct policy CRUD/import/export routes | Deferred | These are Athyper authoring concerns and require governed draft/publish flows, not runtime evaluation routes. |
| `policy_rule_version` | Retired | Current DDL explicitly owns revisions on `control.policy_definition.version_no`. |
| Policy evaluation log table | Retired | Audit is the canonical durable observation boundary. |
| Decision-grid evaluation mode | Retired pending a new contract | `grid` is not an allowed current DDL evaluation mode. |
| Shared direct-database facts provider | Retired | Consumers must provide known facts or inject explicitly owned fact ports; Policy must not reach into arbitrary capabilities. |
| Legacy field-security engine | Deferred | It will consume `entity_field_policy_binding` in the Records field projection/mutation slice. |
| Finance and AI policy callers | Deferred | Migrate one consumer at a time after their fact and action contracts are explicit. |
| Policy test-case execution/history UI | Deferred | `control.policy_test_case` is the fixture authority; a governed authoring/test runner is a separate slice. |

No policy-specific background job was found that belongs in this first runtime slice.

## Verification and remaining gates

The contract, Metadata, Policy, Workflow, and host packages have compile-time/API tests. Unit tests cover evaluator limits and operators, all-three-plane behavior, repository caching, revision pinning, enforced Workflow denial, and an authenticated host request.

Before enabling production authoring, add PostgreSQL integration tests against each plane's real RLS roles, publish cache invalidation from the governed authoring transaction, and build the `control.policy_test_case` runner. These additions do not change the runtime package ownership above.
