# Meta-Entity System — Overview

The meta-entity system is the foundational layer of Athyper's data model. It defines what entities exist, how they are classified, what lifecycles govern them, what workflows gate state changes, and what policies control field access and operations. All configuration lives in the `control` schema of the primary database (`athyper_neon`).

---

## Entity Class Taxonomy

Every entity in the system is assigned one of 11 canonical class keys via `control.entity_class_profile`. The class determines default mutability, governance level, expected system columns, and field-flag auto-rules.

| Class Key | Label | Typical Use |
|---|---|---|
| `REFERENCE` | Reference Data | Country, currency, UOM — platform-managed, rarely mutated |
| `MASTER` | Master Data | Supplier, customer, employee — tenant-owned, high governance |
| `CONTROL` | Control / Config | Lifecycle definitions, workflow templates, policy rules |
| `DOCUMENT` | Transaction Document | Invoice, purchase order, journal entry — full lifecycle + workflow |
| `DOCUMENT_RELATION` | Document Relation | Line items, invoice lines — children of DOCUMENTs |
| `LEDGER` | Ledger Entry | GL postings, account moves — append-only after posting |
| `LOG` | Immutable Log | Audit trail, event log — insert-only, no update/delete |
| `AGGREGATE` | Aggregate / Summary | Trial balance, aging buckets — computed, no direct mutations |
| `DIMENSION` | Analytical Dimension | Cost center, department, project — used in postings |
| `RELATION` | Many-to-Many Relation | Group memberships, tag assignments |
| `*` | Wildcard / Uncategorized | Catch-all for new entity types |

### `control.entity_class_profile` Key Columns

| Column | Type | Purpose |
|---|---|---|
| `class_key` | `text PK` | One of the 11 values above |
| `valid_governance_levels` | `text[]` | Allowed governance values for entities of this class |
| `default_governance_level` | `text` | Applied when a tenant does not override |
| `valid_mutability` | `text[]` | Allowed mutability options (`mutable`, `append_only`, `immutable`) |
| `default_mutability` | `text` | Default when not overridden |
| `default_security_tier` | `text` | `platform_critical` / `tenant_critical` / `operational` / `config` |
| `expected_system_columns` | `text[]` | Columns every entity of this class must expose |
| `field_flag_rules` | `jsonb[]` | Auto-apply field flags based on column name patterns |
| `security_tiers` | `jsonb` | Per-tier requirements for audit, PII masking, retention |
| `compliance_profile` | `jsonb` | Linting rules, required field patterns, audit disposition per category |

---

## Entity Registry

The entity registry maps runtime `entity_name` codes (e.g. `journal_entry`, `supplier`, `purchase_invoice`) to their class profiles. Registration occurs in the seed layer (`server/db/seed/platform/003_control/`).

### Registration Seed Files (excerpt)

| Seed File | Coverage |
|---|---|
| `010_entity_class_profile.sql` | 11 class profiles with field_flag_rules and compliance_profile |
| `020_entity.sql` | All ~111 entity registrations with class_key and governance level |
| `030_lifecycle.sql` | 21 lifecycle definitions and their state/transition bindings |
| `040_entity_lifecycle.sql` | ~55 entity ↔ lifecycle bindings |
| `050_relations.sql` | ~75 inter-entity relations (parent_of, child_of, linked_to) |
| `060_workflow_template.sql` | Platform-global workflow templates + stage definitions |
| `070_policy.sql` | Platform-global policy definitions + rules |
| `080_entity_policy.sql` | Per-entity access policy (default_deny, audit_mode) |
| `090_field_security.sql` | PII field masking rules across MASTER/DOCUMENT entities |

---

## Entity Lifecycle Binding (`control.entity_lifecycle`)

Associates an entity name with one or more lifecycle definitions. The engine resolves the active lifecycle at runtime by evaluating `conditions` (JSONLogic) ordered by `priority`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global binding |
| `entity_name` | `text` | FK to entity registry |
| `lifecycle_id` | `uuid FK` | → `control.lifecycle` |
| `conditions` | `jsonb` | JSONLogic expression; NULL = always applies |
| `priority` | `smallint` | Lower = evaluated first; first match wins |

**Multiple lifecycles per entity** are supported — e.g. a `purchase_invoice` can follow `lc_draft_submitted_approved` under normal conditions, but switch to `lc_expedited_approval` when `amount > 50000`.

---

## System Column Contract

Every entity class has an `expected_system_columns` list. These columns must be present in the underlying table and are automatically mapped by the metadata service:

| Class | Required System Columns |
|---|---|
| DOCUMENT | `id`, `tenant_id`, `company_code_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by` |
| MASTER | `id`, `tenant_id`, `code`, `name`, `is_active`, `created_at`, `updated_at` |
| LEDGER | `id`, `tenant_id`, `posting_date`, `account_id`, `debit`, `credit`, `created_at` |
| LOG | `id`, `tenant_id`, `event_type`, `entity_type`, `entity_id`, `created_at` |
| CONTROL | `id`, `tenant_id`, `code`, `name`, `is_active` |

---

## Data Flow Summary

```
Entity Record (e.g. purchase_invoice row)
        │
        ▼
entity_lifecycle binding (entity_name → lifecycle_id, conditions, priority)
        │
        ▼
control.lifecycle → control.lifecycle_state + control.lifecycle_transition
        │
        ├── lifecycle_transition_gate ──→ control.workflow_definition (optional pre-transition workflow)
        │
        └── lifecycle_transition.operation_code ──→ shared.permission (authz check)
                │
                ▼
        control.entity_operation (surface, placement, handler_type per permission_code)
                │
                ▼
        control.policy_definition + control.policy_rule (evaluate before commit)
                │
                ▼
        control.field_security_policy (mask/redact PII fields in response)
```

---

## Related Docs

- [Entity Definition](./entity.md)
- [Entity Field Definition](./entity-field.md)
- [Lifecycle Engine](./lifecycle.md)
- [Workflow Engine](./workflow.md)
- [Policy Engine](./policy.md)
- [Entity Operations](./entity-operations.md)
