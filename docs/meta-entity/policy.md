# Policy Engine

The policy engine provides rule-based access control, budget enforcement, and field-level security for all entities. Policy definitions and rules live in the `control` schema. The engine is implemented in `server/packages/services/policy/engine.ts` and registered via `registerPolicyRoutes`.

---

## Overview

The policy system has three distinct responsibilities:

| Component | Table | Purpose |
|---|---|---|
| **Access Policy** | `control.policy_definition` + `control.policy_rule` | Evaluates conditions at runtime to allow, deny, warn, or escalate operations |
| **Entity Policy** | `control.entity_policy` | Per-entity tenant configuration (default access mode, audit mode, company scope) |
| **Field Security** | `control.field_security_policy` | PII masking, redaction, and read/write restrictions on specific fields |

---

## Access Policy Tables

### `control.policy_definition`

Container for a set of rules applied to a specific entity type and module.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `module_id` | `uuid FK` | → `shared.module`; NULL = cross-module |
| `entity_type` | `text` | e.g. `journal_entry`, `payment` |
| `name` | `text` | |
| `description` | `text` | |
| `priority` | `smallint` | Lower = evaluated first across definitions for same entity_type |
| `evaluation_mode` | `text` | `first_match` / `accumulate` / `all` |
| `effective_from` | `date` | Temporal activation; NULL = always active |
| `effective_until` | `date` | |
| `version_no` | `int` | |
| `status` | `text` | `active` / `inactive` / `deprecated` |
| `is_active` | `bool GENERATED` | `GENERATED ALWAYS AS (status = 'active')` |

**Evaluation modes:**
- `first_match` — stop at the first rule that matches; return its action
- `accumulate` — collect all matching rules; merge their outcomes
- `all` — evaluate every rule even after a match; return combined result

---

### `control.policy_rule`

Individual rules within a policy definition.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `policy_id` | `uuid FK` | → `control.policy_definition` |
| `priority` | `smallint` | Lower = evaluated first within the policy |
| `conditions` | `jsonb` | JSONLogic expression; NULL = always matches |
| `action` | `text` | `allow` / `deny` / `warn` / `require_workflow` / `escalate` / `budget_check` |
| `score` | `numeric(5,4)` | Confidence score 0.0–1.0 for ML-assisted rules |
| `confidence` | `numeric(5,4)` | |
| `explanation` | `text` | Human-readable explanation returned to the UI on deny/warn |
| `approvers` | `jsonb[]` | `[{type, value}]` — override approver list when action = `require_workflow` |
| `sla_hours` | `smallint` | Override SLA for triggered workflow |
| Budget-check policy | resolved reference | `control.resolve_budget_control_policy(...)` selects the typed policy when action = `budget_check`; no legacy config FK is stored |

**Actions:**

| Action | Behaviour |
|---|---|
| `allow` | Operation proceeds unconditionally |
| `deny` | HTTP 422 returned with `explanation` as the error message |
| `warn` | Operation proceeds but a warning is surfaced to the actor |
| `require_workflow` | Operation deferred; a workflow_request is created using `approvers` + `sla_hours` |
| `escalate` | Operation forwarded to escalation chain defined in the SLA policy |
| `budget_check` | Evaluates current spend against a budget envelope; deny if over |

---

## Policy Engine Service

**Location:** `server/packages/services/policy/engine.ts`

### Key Methods

```typescript
// Evaluate all matching policies for an operation
evaluate(params: {
  tenantId: string
  entityType: string
  entityId?: string
  payload: Record<string, unknown>    // entity fields for JSONLogic evaluation
  companyCodeId?: string
  legalEntityId?: string
  pipelineId?: string
  txnId?: string
  requestedBy: string
}): Promise<{
  action: PolicyAction
  permitted: boolean
  outcomes: PolicyOutcome[]
  winning?: PolicyOutcome            // first match (for first_match mode)
  evaluationMs: number
}>

// CRUD operations
listDefinitions(tenantId: string): Promise<PolicyDefinition[]>
getDefinition(id: string): Promise<PolicyDefinition>
createDefinition(tenantId: string, data: CreatePolicyInput): Promise<PolicyDefinition>
updateDefinition(id: string, data: UpdatePolicyInput): Promise<PolicyDefinition>

listRules(policyId: string): Promise<PolicyRule[]>
createRule(policyId: string, data: CreateRuleInput): Promise<PolicyRule>
updateRule(id: string, data: UpdateRuleInput): Promise<PolicyRule>
deleteRule(id: string): Promise<void>

// Policy evaluation audit
queryLog(tenantId: string, filters?: LogFilters): Promise<PolicyEvaluationLog[]>
```

---

## Entity Policy Table

### `control.entity_policy`

Per-entity tenant configuration. One row per (tenant, entity).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | Always tenant-scoped |
| `entity_id` | `uuid` | FK to entity registry |
| `entity_version_id` | `uuid` | NULL = applies to all versions |
| `access_mode` | `text` | `default_deny` (default) — no access unless explicitly granted |
| `company_scope_mode` | `text` | `none` (default) / `strict` / `inherit` |
| `audit_mode` | `text` | `enabled` (default) / `disabled` / `minimal` |
| `retention_policy` | `jsonb` | `{days, action: archive|delete|anonymise}` |
| `default_filters` | `jsonb` | JSONLogic row-level filters applied to all queries |
| `cache_flags` | `jsonb` | `{allow_cache, ttl_seconds, vary_by: [company_code_id, ...]}` |
| `field_scope_eval_order` | `text` | `row_first` / `field_first` / `parallel` |
| `extended_scope` | `jsonb` | `{department_ids[], project_ids[], cost_center_ids[]}` |

**`access_mode = default_deny`:** A principal has NO access to an entity's data unless an explicit `master.access_grant` row exists for their role/group.

**`company_scope_mode`:**
- `none` — No company-code filtering applied; data across all company codes visible.
- `strict` — Only records matching the principal's active company codes are returned.
- `inherit` — Inherits from the parent entity's company scope setting.

---

## Field Security Policy

### `control.field_security_policy`

Controls read, write, masking, and PII handling at the field level.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `entity_id` | `uuid FK` | Target entity |
| `field_path` | `text` | Dot-notation path e.g. `tax_id`, `address.line1`, `bank_account.iban` |
| `policy_type` | `text` | `read` / `write` / `mask` / `redact` |
| `role_list` | `text[]` | Roles exempt from masking / granted write access |
| `abac_condition` | `jsonb` | JSONLogic ABAC condition (evaluated against principal + context) |
| `mask_strategy` | `text` | `null` / `partial` / `hash` / `encrypt` / `tokenise` |
| `mask_config` | `jsonb` | Strategy-specific config (e.g. `{visible_chars: 4}` for partial) |
| `scope` | `text` | `global` / `module` / `tenant` |
| `scope_ref` | `text` | Module code or tenant ID when scope is not global |
| `priority` | `smallint` | Lower fires first; first match governs |
| `pii_classification` | `text` | `none` / `quasi` / `direct` / `sensitive` / `special_category` |
| `version` | `int` | |
| `is_active` | `bool` | |
| `privacy_metadata` | `jsonb` | GDPR article reference, retention basis, DPO notes |

### Mask Strategies

| Strategy | Behaviour | Example |
|---|---|---|
| `null` | Field returned as `null` | `tax_id → null` |
| `partial` | Last N chars visible, rest replaced with `*` | `"1234567890" → "******7890"` |
| `hash` | SHA-256 hex digest | Consistent across requests; useful for de-identification |
| `encrypt` | AES-256-GCM with master key rotation | Reversible for privileged roles |
| `tokenise` | Replace with a stable opaque token | Vault-style tokenisation |

### PII Classification

| Level | Meaning | Examples |
|---|---|---|
| `none` | No personal information | SKU, amount |
| `quasi` | Indirectly identifying | Gender, age range, country |
| `direct` | Directly identifying | Name, email, phone |
| `sensitive` | Financial / health | IBAN, NI number, salary |
| `special_category` | GDPR special category | Religion, ethnicity, health conditions |

---

## Field Security Middleware

**Location:** `server/packages/services/policy/field-security.middleware.ts`

Applied to every GET response for entities that have active `field_security_policy` rows. The middleware:

1. Resolves all active field policies for `(tenant_id, entity_id)`
2. For each field in the response payload:
   - Checks if the requesting principal's roles are in `role_list` — if so, skip masking
   - Evaluates `abac_condition` against `{principal, context}` — if false, apply mask
3. Applies `mask_strategy` in priority order (lower priority = higher precedence)
4. Strips `pii_classification = special_category` fields entirely for external-plane requests (mesh/partner)

**Verification script:** `server/scripts/verify-field-security.ts` — audits all entities with `pii_classification IN ('direct', 'sensitive', 'special_category')` and confirms a field_security_policy row exists.

---

## Policy Evaluation Log

**Table:** `log.policy_evaluation_log`

All `evaluate()` calls are logged for audit:

| Column | Notes |
|---|---|
| `id` | |
| `tenant_id` | |
| `policy_id` | |
| `entity_type` | |
| `entity_id` | |
| `requested_by` | Actor principal |
| `action` | Final outcome action |
| `permitted` | Boolean |
| `winning_rule_id` | Rule that determined the outcome |
| `evaluation_ms` | Latency |
| `payload_hash` | SHA-256 of evaluation payload (no PII stored) |
| `evaluated_at` | |

---

## `control.policy_rule_version`

Append-only audit trail for policy rule changes. `ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY`.

A DB trigger (`trg_version_policy_rule`) auto-inserts a row **before** each `UPDATE` to `control.policy_rule`. `rule_snapshot` captures the full row state that was replaced — i.e. the version that is being superseded. Rows are immutable after insert.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `policy_rule_id` | `uuid NOT NULL` | FK → `control.policy_rule` |
| `policy_id` | `uuid NOT NULL` | Denormalized from the rule for fast policy-level history queries |
| `version_no` | `integer NOT NULL` | `> 0`; auto-incremented by trigger; unique per `(policy_rule_id, version_no)` |
| `rule_snapshot` | `jsonb NOT NULL` | Full `control.policy_rule` row as it existed **before** the superseding update |
| `effective_from` | `timestamptz NOT NULL DEFAULT now()` | When this version became active |
| `effective_until` | `timestamptz` | Set when superseded by next version; NULL = current version |
| `published_by` | `uuid` | Principal who triggered the UPDATE |
| `published_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Indexes:**
- `(policy_rule_id, version_no DESC)` — per-rule version history in order
- `(policy_id, published_at DESC)` — policy-level history feed

`effective_until` is set on the previous version row when a new edit is applied. To reconstruct the state of a rule at any point in time, find the version row where `effective_from <= target_time AND (effective_until IS NULL OR effective_until > target_time)`.

---

## `control.policy_test_case`

Persisted simulation test cases for a policy definition. `ARCHETYPE=C;SCOPE=T;DEVIATION` (manual `is_active` boolean, no `status`/`is_active GENERATED`).

Used by the simulation harness (`POST /api/policy/definitions/:id/test`) to run batch assertions. `last_run_*` columns are updated on each execution, enabling a "last run" status badge in the UI.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `policy_definition_id` | `uuid NOT NULL` | FK → `control.policy_definition` ON DELETE CASCADE |
| `test_name` | `varchar(150) NOT NULL` | Unique per `(tenant_id, policy_definition_id, test_name)` |
| `description` | `text` | |
| `input_payload` | `jsonb NOT NULL` | Entity data context to evaluate; shape must match `entity_type` of the parent definition |
| `expected_outcome` | `jsonb NOT NULL` | `{ action, score_min?, score_max?, confidence? }`; compared against actual outcome |
| `last_run_at` | `timestamptz` | Updated on each run |
| `last_run_passed` | `bool` | `true` = actual outcome matched expected |
| `last_run_result` | `jsonb` | Actual outcome from last run |
| `last_run_ms` | `integer` | Evaluation latency of last run |
| `is_active` | `bool NOT NULL DEFAULT true` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

`ON DELETE CASCADE` from `policy_definition` — test cases are deleted when their parent definition is deleted.

### `expected_outcome` Shape

```json
{
  "action": "deny",
  "score_min": 0.85,
  "score_max": 1.0
}
```

Minimum shape requires `action`. Add `score_min`/`score_max` bounds for scoring policies. The harness compares `actual.action === expected.action` and checks score falls within bounds if supplied.

---

## Policy API Routes

All registered via `registerPolicyRoutes`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/policy/definitions` | List all policy definitions |
| `POST` | `/api/policy/definitions` | Create definition |
| `PATCH` | `/api/policy/definitions/:id` | Update definition |
| `GET` | `/api/policy/definitions/:id/rules` | List rules |
| `POST` | `/api/policy/definitions/:id/rules` | Create rule |
| `PATCH` | `/api/policy/definitions/:id/rules/:ruleId` | Update rule |
| `DELETE` | `/api/policy/definitions/:id/rules/:ruleId` | Delete rule |
| `GET` | `/api/policy/definitions/:id/rules/:ruleId/versions` | Rule version history |
| `POST` | `/api/policy/definitions/:id/test` | Dry-run evaluate against test payload |
| `POST` | `/api/policy/definitions/:id/test-cases` | Create test case |
| `POST` | `/api/policy/definitions/:id/test-cases/run` | Run all test cases |
| `GET` | `/api/policy/definitions/:id/export` | Export policy bundle (JSON + rules) |
| `POST` | `/api/policy/import` | Import policy bundle |
| `GET` | `/api/policy/log` | Policy evaluation log |

---

## Related Docs

- [Overview](./overview.md)
- [Lifecycle Engine](./lifecycle.md)
- [Workflow Engine](./workflow.md)
- [Entity Operations](./entity-operations.md)
