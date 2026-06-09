# Platform Governance

Platform governance tables control tenant provisioning, runtime feature flags, metadata change approval, scheduled job management, integration connector types, runtime parameter configuration, and content quotas.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.blueprint_registry` | Catalogue of available blueprint packs (platform-global) |
| `control.tenant_blueprint_application` | Audit log of blueprints applied per tenant |
| `control.feature_flag` | Platform feature flag registry with rollout support |
| `control.metadata_change_request` | Metadata Studio change approval workflow |
| `control.metadata_change_application_log` | Append-only compiler run audit for applied changes |
| `control.cron_schedule` | DB-managed BullMQ scheduled jobs |
| `control.connector_type` | Integration connector type catalogue |
| `control.parameter_definition` | Product-owned runtime parameter catalogue |
| `control.content_quota` | Per-tenant per-kind content item and storage quotas |

---

## `control.blueprint_registry`

Catalogue of available blueprint packs selectable during tenant provisioning. Platform-global — no `tenant_id`. `ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | Stable identifier; e.g. `base`, `coa_ifrs`, `pack_utilities` |
| `name` | `text NOT NULL` | |
| `category` | `text NOT NULL` | See Tier Model below |
| `industry_vertical` | `text[]` | Industry taxonomy tags |
| `framework` | `text` | Accounting framework (e.g. `IFRS`, `US_GAAP`) |
| `base_version` | `text NOT NULL DEFAULT '1.0.0'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` |
| `dependencies` | `text[]` | Ordered blueprint codes that must be applied first |
| `seed_files` | `text[]` | Ordered relative file paths under `900_seed_data/` |
| `description` | `text` | |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | System sentinel `00000000-...` for platform-seeded rows |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

### Tier Model

| Category | Tier | Meaning |
|---|---|---|
| `base` | 1 | Universal prerequisite — always applied first |
| `foundation` | 1 | Always-apply data packs (tax, payments, assets, bank) |
| `coa_framework` | 2a | Select exactly one accounting framework |
| `industry_pack` | 2b | Select one or more industry vertical taxonomies |
| `module_pack` | 3 | Optional subscription-gated feature packs |

**Application order:** `base` → `foundation` → `coa_framework` → `industry_pack` → `module_pack`. The `dependencies` array enforces ordering — the runner must apply dependencies before the pack.

---

## `control.tenant_blueprint_application`

Audit log of blueprint packs applied to each tenant. Enables incremental pack additions and upgrade tracking. `ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `blueprint_code` | `text NOT NULL` | References `control.blueprint_registry.code` |
| `applied_version` | `text NOT NULL` | Snapshot of `base_version` at time of application |
| `applied_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `applied_by` | `uuid` | NULL when applied by automation |
| `status` | `text NOT NULL DEFAULT 'applied'` | `applied` / `rolled_back` / `failed` |
| `error_detail` | `text` | Failure reason when `status = 'failed'` |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | System sentinel for automated inserts |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, blueprint_code)` — one application record per tenant per blueprint.

`applied_version` is a snapshot: it survives future registry updates, so the history of what version was applied is preserved even if `base_version` in the registry changes.

---

## `control.feature_flag`

Platform feature flag registry. No `tenant_id` — platform-global. Redis cache-first (60s TTL); DB fallback. `ARCHETYPE=C;SCOPE=N;DEVIATION` (manual `is_enabled` boolean, no `status`/`is_active GENERATED`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | Snake_case; e.g. `notifications_v2`, `pdf_rendering_async` |
| `name` | `text NOT NULL` | |
| `description` | `text` | |
| `flag_type` | `text NOT NULL DEFAULT 'release_gate'` | `release_gate` / `capability_toggle` / `experiment` |
| `is_enabled` | `bool NOT NULL DEFAULT false` | Global default |
| `tenant_overrides` | `jsonb` | `{"<tenantId>": true|false}` map; overrides `is_enabled` per tenant |
| `rollout_pct` | `smallint` | 0–100; NULL = not in rollout mode |
| `expires_at` | `timestamptz` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Owner, jira_ticket, etc. |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

### Evaluation Logic

```
Is flag enabled for tenant T?

1. Check tenant_overrides[T]  → if present, return that value
2. Check rollout_pct          → if set, return djb2_hash(code + T) % 100 < rollout_pct
3. Fallback                   → return is_enabled (global default)
```

The djb2 hash is deterministic: the same tenant always gets the same yes/no for a given `rollout_pct`, ensuring a stable rollout experience (no flicker across requests).

### Flag Types

| Type | Purpose |
|---|---|
| `release_gate` | Temporary on/off for phased releases; set `expires_at` |
| `capability_toggle` | Permanent feature switch with no planned expiry |
| `experiment` | A/B test or percentage rollout via `rollout_pct` |

---

## `control.metadata_change_request`

Metadata Studio change request log. Tracks field/entity definition changes that require approval before becoming effective. `ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `entity_code` | `text NOT NULL` | Target entity |
| `change_type` | `text NOT NULL` | See Change Types below |
| `payload` | `jsonb NOT NULL` | `ChangeRequestPayload` — see below |
| `status` | `text NOT NULL DEFAULT 'submitted'` | `submitted` / `pending_review` / `approved` / `rejected` / `applied` |
| `submitted_by` | `uuid NOT NULL` | |
| `reviewed_by` | `uuid` | Paired with `reviewed_at` |
| `reviewed_at` | `timestamptz` | |
| `review_note` | `text` | |
| `applied_at` | `timestamptz` | Set when `EntityCompilerService.invalidate()` is called |
| `workflow_request_id` | `uuid` | Cross-schema FK to `document.workflow_request`; NULL in Phase 2 |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**CHECK:** `(reviewed_by IS NULL) = (reviewed_at IS NULL)` — review fields must be paired.

### Lifecycle

```
submitted → pending_review → approved → applied
                           → rejected
```

When `status = approved`, `MetadataApprovalBridge` calls `EntityCompilerService.invalidate()` to recompile the affected entity descriptor and sets `status = applied` + `applied_at`.

In Phase 2, changes are approved directly (no workflow). `workflow_request_id` is populated in Phase 3.4 when the `WorkflowEngine` is wired.

### Payload Structure

```json
{
  "entityCode": "invoice",
  "changeType": "add_field",
  "fieldName": "customs_declaration_ref",
  "before": null,
  "after": { "data_type": "text", "label": "Customs Ref" },
  "rationale": "Required for cross-border shipments per new compliance rule."
}
```

### Change Types

| Domain | Change Types |
|---|---|
| **Entity** | `update_entity_config` |
| **Fields** | `add_field`, `remove_field`, `update_field`, `reorder_fields` |
| **Overlays** | `add_overlay`, `remove_overlay` |
| **Flows** | `add_flow`, `update_flow`, `publish_flow`, `retire_flow` |
| **Flow Steps** | `add_flow_step`, `update_flow_step`, `remove_flow_step`, `reorder_flow_steps` |
| **Flow Fields** | `bind_flow_field`, `update_flow_field`, `unbind_flow_field` |

---

## `control.metadata_change_application_log`

Append-only audit of `EntityCompilerService.invalidate()` invocations from approved change requests. `ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY`. Immutable — no `updated_at`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `change_request_id` | `uuid NOT NULL` | FK → `control.metadata_change_request` |
| `entity_code` | `text NOT NULL` | Primary entity being changed |
| `applied_by` | `uuid NOT NULL` | |
| `applied_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `compiler_run_id` | `uuid` | Correlation ID; joins multiple rows from same batch recompile |
| `entities_recompiled` | `text[]` | All entity codes recompiled in this run (may cascade beyond `entity_code`) |
| `duration_ms` | `integer` | `>= 0`; NULL if not measured |
| `result` | `text NOT NULL DEFAULT 'success'` | `success` / `partial` / `failed` |
| `error_detail` | `jsonb` | NULL on success; required for `partial` / `failed` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |

**CHECK:** `result = 'success' OR error_detail IS NOT NULL`

`entities_recompiled` may contain more than the primary `entity_code` when cascading dependencies exist (e.g. a field change on a parent entity triggers recompile of child entities).

---

## `control.cron_schedule`

DB-managed complement to code-based `cron-registry.ts`. Runtime-configurable BullMQ scheduled jobs. `ARCHETYPE=C;SCOPE=G;DEVIATION` (manual `is_enabled` boolean, no `status`/`is_active GENERATED`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `code` | `text NOT NULL` | |
| `name` | `text NOT NULL` | |
| `description` | `text` | |
| `handler_type` | `text NOT NULL` | BullMQ job name / worker handler |
| `cron_expression` | `text NOT NULL` | 5 or 6-field cron expression |
| `timezone` | `text NOT NULL DEFAULT 'UTC'` | |
| `target_queue` | `text NOT NULL` | BullMQ queue name |
| `payload_template` | `jsonb NOT NULL DEFAULT '{}'` | Supports `{{tenant_id}}` and `{{now}}` interpolation at enqueue time |
| `priority` | `smallint NOT NULL DEFAULT 0` | `-10` to `10` |
| `max_retries` | `smallint NOT NULL DEFAULT 3` | `>= 0` |
| `concurrency_limit` | `smallint` | NULL = unlimited; `> 0` |
| `effective_from` | `timestamptz` | NULL = immediately |
| `effective_until` | `timestamptz` | NULL = no expiry; `> effective_from` if both set |
| `is_enabled` | `bool NOT NULL DEFAULT true` | |
| `lock_key` | `text` | Redis SETNX key for leader election; NULL = no lock (idempotent jobs only) |
| `last_run_at` | `timestamptz` | Updated by scheduler after each run |
| `next_run_at` | `timestamptz` | Computed by scheduler |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, code) NULLS NOT DISTINCT` — platform-global schedules share a namespace with their `tenant_id = NULL` key.

### Code-based vs DB Schedules

Code-based entries in `cron-registry.ts` **always win on conflict** — when both exist with the same `code`, the DB row is ignored and a warning is logged. The scheduler polls this table every 60 seconds, so runtime changes take effect without a service restart.

### Leader Election

`lock_key` maps to a Redis `SETNX` key. In multi-instance deployments, only the instance that successfully sets the key enqueues the job. Use only for non-idempotent jobs; idempotent jobs should leave `lock_key = NULL`.

---

## `control.connector_type`

Integration connector type catalogue. `config_schema` (JSON Schema) drives UI form generation automatically — no frontend changes needed when adding a new connector type. `ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | |
| `name` | `text NOT NULL` | |
| `category` | `text NOT NULL` | `api` / `file_transfer` / `messaging` / `erp` / `payment` / `custom` |
| `description` | `text` | |
| `icon_key` | `text` | UI icon reference |
| `config_schema` | `jsonb NOT NULL` | JSON Schema object — rendered as a dynamic form |
| `auth_types` | `text[] NOT NULL DEFAULT '{}'` | Supported auth methods (e.g. `oauth2`, `api_key`, `basic`) |
| `capabilities` | `text[] NOT NULL DEFAULT '{}'` | Declared capabilities (e.g. `inbound`, `outbound`, `bidirectional`) |
| `health_check_config` | `jsonb NOT NULL DEFAULT '{}'` | Probe configuration |
| `is_system` | `bool NOT NULL DEFAULT false` | `true` = platform-seeded; cannot be deleted by tenants |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

`config_schema` is a standard JSON Schema document. The integration UI reads it to render the connector configuration form, meaning adding a new connector type requires zero frontend code changes.

---

## `control.parameter_definition`

Product-owned runtime parameter catalogue. Tenants may view non-hidden parameters and override rows marked `tenant_visibility = configurable`. `ARCHETYPE=B;SCOPE=N`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | Dot-namespaced; e.g. `notifications.sms.max_retry_count` |
| `namespace` | `text NOT NULL` | Hierarchical grouping; e.g. `notifications.sms` |
| `display_name` | `text NOT NULL` | |
| `description` | `text` | |
| `owner_model` | `text NOT NULL DEFAULT 'product'` | `product` / `tenant` |
| `control_level` | `text NOT NULL DEFAULT 'system_controlled'` | See Control Levels below |
| `tenant_visibility` | `text NOT NULL DEFAULT 'readonly'` | `hidden` / `readonly` / `configurable` |
| `data_type` | `text NOT NULL` | `boolean` / `integer` / `number` / `string` / `enum` / `duration` / `json` |
| `unit` | `text` | Unit of measure (e.g. `ms`, `bytes`, `percent`) |
| `default_value` | `jsonb NOT NULL` | Product-defined default |
| `product_value` | `jsonb` | Active product-set value (overrides `default_value`) |
| `min_value` | `jsonb` | Minimum bound for tenant overrides |
| `max_value` | `jsonb` | Maximum bound for tenant overrides |
| `allowed_values` | `jsonb` | Array of permitted values for `enum` type |
| `runtime_reload` | `text NOT NULL DEFAULT 'next_request'` | See Reload Modes below |
| `cache_ttl_seconds` | `integer NOT NULL DEFAULT 300` | 0–86400 |
| `is_security_sensitive` | `bool NOT NULL DEFAULT false` | Masked in UI when true |
| `is_runtime_reloadable` | `bool NOT NULL DEFAULT true` | |
| `is_enabled` | `bool NOT NULL DEFAULT true` | |
| `sort_order` | `integer NOT NULL DEFAULT 0` | Display order within namespace |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Code format:** `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` — must have at least one dot separator (namespace prefix required).

### Control Levels

| Level | Meaning |
|---|---|
| `system_controlled` | Product-owned; read-only to tenants |
| `tenant_configurable` | Product-owned but tenants may override within `min_value`/`max_value`/`allowed_values` bounds |
| `tenant_owned` | Future tenant-authored parameter class |

### Reload Modes

| Mode | When change takes effect |
|---|---|
| `immediate` | Next evaluation cycle (hot reload) |
| `next_request` | Next HTTP request to the service |
| `next_login` | Next user session (session-cached values) |
| `restart` | Service restart required |
| `external_provider` | Change propagated by an external config provider |

---

## `control.content_quota`

Per-tenant per-kind content item and storage quotas. RLS enabled. `ARCHETYPE=C;SCOPE=T;DEVIATION` (manual `is_active` boolean, no `status`/`is_active GENERATED`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | FK → `master.tenant(id)` ON DELETE CASCADE |
| `kind` | `text NOT NULL` | Pattern `^[a-z_*][a-z0-9_*]*$`; max 64 chars; `*` = catch-all |
| `max_items` | `bigint` | NULL = unlimited; `> 0` |
| `max_storage_bytes` | `bigint` | NULL = unlimited; `> 0` |
| `warn_at_pct` | `integer NOT NULL DEFAULT 80` | 1–100; warning threshold as % of limit |
| `is_active` | `bool NOT NULL DEFAULT true` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, kind)`

### Quota Check Order

When `POST /content/items` is called, the engine resolves the applicable quota:

```
1. Exact kind match for tenant   (e.g. tenant=X, kind='document')
2. Wildcard '*' for tenant       (e.g. tenant=X, kind='*')
3. No quota row found            → unlimited; pass-through
```

When `max_items` or `max_storage_bytes` would be exceeded, the API returns `429 Too Many Requests`. When current usage crosses `warn_at_pct`, a warning is included in the response headers.

---

## Provisioning Flow

```
Tenant onboarding starts
        │
        ▼
Select blueprints (UI reads blueprint_registry)
  → choose coa_framework (exactly one)
  → choose industry_pack(s) (zero or more)
  → choose module_pack(s) (subscription-gated)
        │
        ▼
Runner resolves dependency order
  (topological sort of dependencies[] arrays)
        │
        ▼
For each blueprint in order:
  → execute seed_files[] against tenant DB
  → INSERT INTO tenant_blueprint_application (status='applied')
  → on failure: status='failed', error_detail set
        │
        ▼
Post-provisioning:
  → feature_flag tenant_overrides updated for module gates
  → parameter_definition tenant overrides populated
  → content_quota rows inserted for plan-tier limits
  → cron_schedule rows inserted for tenant-scoped jobs
```

---

## Related Docs

- [Overview](./overview.md)
- [Entity Flow](./entity-flow.md)
- [AI Runtime](./ai-runtime.md)
