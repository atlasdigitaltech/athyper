/* ============================================================================
   Athyper — META Schema
   Entity Registry, Versioning, Fields, Relations, Indexes
   Policies, Permissions, Lifecycle, Approval Templates, Overlays

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- META: Entity Registry
-- ============================================================================
create table if not exists meta.entity (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  module_id     text not null,
  name          text not null,
  kind          text not null default 'ent',
  table_schema  text not null default 'ent',
  table_name    text not null,
  naming_policy jsonb,
  feature_flags jsonb,

  is_active     boolean not null default true,

  -- Governance level controls what meta features apply to this entity
  -- full:       field dictionary, field security, permission policies, lifecycle, overlays, compiled
  -- light:      field dictionary, permission policies, audit policy (no overlays/lifecycle)
  -- audit_only: audit policy only (immutable transaction tables)
  governance_level text not null default 'full',

  -- Engine tag groups finance entities by owning engine (dashboard/filtering)
  engine_tag  text,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint entity_kind_chk check (kind in ('ref','ent','doc','fin','cfg','int')),
  constraint entity_governance_level_chk check (governance_level in ('full','light','audit_only')),
  constraint entity_name_uniq unique (tenant_id, name)
);

-- Incremental upgrade: add new columns/constraints if table already existed
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS governance_level text NOT NULL DEFAULT 'full';
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS engine_tag text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS entity_short text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_short_uniq
  ON meta.entity (tenant_id, entity_short) WHERE entity_short IS NOT NULL;

COMMENT ON COLUMN meta.entity.entity_short IS
  'Short mnemonic code (PO, INV, JE) for command palette aliases and TCODE generation.';

-- Expand kind constraint (drop old, add new — idempotent via DO block)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_kind_chk') THEN
        ALTER TABLE meta.entity DROP CONSTRAINT entity_kind_chk;
    END IF;
    ALTER TABLE meta.entity ADD CONSTRAINT entity_kind_chk
        CHECK (kind IN ('ref','ent','doc','fin','cfg','int'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_governance_level_chk') THEN
        ALTER TABLE meta.entity ADD CONSTRAINT entity_governance_level_chk
            CHECK (governance_level IN ('full','light','audit_only'));
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

comment on table meta.entity is
'Entity (DocType) registry: kind, physical mapping, naming, feature flags, version links.';
comment on column meta.entity.governance_level is 'full = all meta features; light = field dict + permissions; audit_only = audit policy only';
comment on column meta.entity.engine_tag is 'Owning engine identifier (e.g., posting-engine, budget-engine, inventory-engine)';

create index if not exists idx_entity_module
  on meta.entity (tenant_id, module_id);

create index if not exists idx_entity_kind
  on meta.entity (tenant_id, kind);

create index if not exists idx_entity_engine_tag
  on meta.entity (tenant_id, engine_tag)
  where engine_tag is not null;

-- ============================================================================
-- META: Entity Versioning
-- ============================================================================
create table if not exists meta.entity_version (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  entity_id     uuid not null references meta.entity(id) on delete cascade,

  version_no    int not null default 1,
  status        text not null default 'draft',
  label         text,
  behaviors     jsonb,

  published_at  timestamptz,
  published_by  text,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint entity_version_status_chk check (status in ('draft','published','archived')),
  constraint entity_version_uniq unique (tenant_id, entity_id, version_no)
);

comment on table meta.entity_version is 'Versioned entity definition (draft -> published -> archived).';

create index if not exists idx_entity_version_entity_status
  on meta.entity_version (tenant_id, entity_id, status);

-- ============================================================================
-- META: Field Dictionary
-- ============================================================================
create table if not exists meta.field (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,
  entity_version_id uuid not null references meta.entity_version(id) on delete cascade,

  name             text not null,
  column_name      text,
  data_type        text not null,
  ui_type          text,
  is_required      boolean not null default false,
  is_unique        boolean not null default false,
  is_searchable    boolean not null default false,
  is_filterable    boolean not null default false,

  default_value    jsonb,
  validation       jsonb,
  lookup_config    jsonb,

  sort_order       int not null default 0,
  is_active        boolean not null default true,

  created_at       timestamptz not null default now(),
  created_by       text not null,
  updated_at       timestamptz,
  updated_by       text,

  constraint field_name_uniq unique (tenant_id, entity_version_id, name)
);

comment on table meta.field is
'Field dictionary per entity_version: column mapping, datatype/ui type, validation/defaults, lookup config.';

create index if not exists idx_field_entity_version
  on meta.field (tenant_id, entity_version_id);

-- ============================================================================
-- META: Relations
-- ============================================================================
create table if not exists meta.relation (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,
  entity_version_id uuid not null references meta.entity_version(id) on delete cascade,

  name            text not null,
  relation_kind   text not null,
  target_entity   text not null,
  fk_field        text,
  target_key      text,
  on_delete       text not null default 'restrict',
  ui_behavior     jsonb,

  created_at      timestamptz not null default now(),
  created_by      text not null,

  constraint relation_kind_chk check (relation_kind in ('belongs_to','has_many','m2m')),
  constraint relation_on_delete_chk check (on_delete in ('restrict','cascade','set_null')),
  constraint relation_name_uniq unique (tenant_id, entity_version_id, name)
);

comment on table meta.relation is 'Relationship model per entity_version: FK wiring, delete rules, UI picker behavior.';

-- ============================================================================
-- META: Index Definitions
-- ============================================================================
create table if not exists meta.index_def (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,
  entity_version_id uuid not null references meta.entity_version(id) on delete cascade,

  name            text not null,
  is_unique       boolean not null default false,
  method          text not null default 'btree',
  columns         jsonb not null,
  where_clause    text,

  created_at      timestamptz not null default now(),
  created_by      text not null,

  constraint index_method_chk check (method in ('btree','gin','gist','hash')),
  constraint index_def_name_uniq unique (tenant_id, entity_version_id, name)
);

comment on table meta.index_def is 'Declarative index definitions per entity_version (used by migrations).';

-- ============================================================================
-- META: Entity Policy
-- ============================================================================
create table if not exists meta.entity_policy (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  entity_id        uuid references meta.entity(id) on delete cascade,
  entity_version_id uuid references meta.entity_version(id) on delete cascade,

  access_mode      text not null default 'default_deny',
  ou_scope_mode    text not null default 'none',
  audit_mode       text not null default 'enabled',
  retention_policy jsonb,
  default_filters  jsonb,
  cache_flags      jsonb,

  created_at       timestamptz not null default now(),
  created_by       text not null,
  updated_at       timestamptz,
  updated_by       text,

  constraint entity_policy_access_chk check (access_mode in ('default_deny','default_allow','inherit')),
  constraint entity_policy_ou_chk check (ou_scope_mode in ('none','single','subtree','multi')),
  constraint entity_policy_audit_chk check (audit_mode in ('enabled','disabled')),
  constraint entity_policy_target_chk check (
    (entity_id is not null and entity_version_id is null) or
    (entity_id is null and entity_version_id is not null)
  )
);

comment on table meta.entity_policy is
'Default behavior policy per entity or entity_version (access, OU scope, audit, retention, caching).';

create index if not exists idx_entity_policy_entity
  on meta.entity_policy (tenant_id, entity_id) where entity_id is not null;

create index if not exists idx_entity_policy_version
  on meta.entity_policy (tenant_id, entity_version_id) where entity_version_id is not null;

-- ============================================================================
-- META: Compiled Entity Snapshot (base, no overlays)
-- ============================================================================
create table if not exists meta.entity_compiled (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,
  entity_version_id uuid not null references meta.entity_version(id) on delete cascade,

  compiled_json     jsonb not null,
  compiled_hash     text not null,
  generated_at      timestamptz not null default now(),

  created_at        timestamptz not null default now(),
  created_by        text not null,

  constraint entity_compiled_hash_uniq unique (tenant_id, entity_version_id, compiled_hash)
);

comment on table meta.entity_compiled is
'Precompiled snapshot per tenant+entity_version for fast runtime reads (flattened meta).';

-- ============================================================================
-- META: Field Security Policy
-- ============================================================================
create table if not exists meta.field_security_policy (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  entity_id       uuid not null references meta.entity(id) on delete cascade,
  field_path      text not null,

  policy_type     text not null,
  role_list       text[],
  abac_condition  jsonb,

  mask_strategy   text,
  mask_config     jsonb,

  scope           text not null default 'entity',
  scope_ref       uuid,
  priority        integer not null default 100,
  is_active       boolean not null default true,

  metadata        jsonb,

  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz,
  updated_by      text,
  version         integer not null default 1,

  constraint field_security_policy_type_chk
    check (policy_type in ('read', 'write', 'both')),
  constraint field_security_mask_strategy_chk
    check (mask_strategy in ('null', 'redact', 'hash', 'partial', 'remove')),
  constraint field_security_scope_chk
    check (scope in ('global', 'module', 'entity', 'entity_version', 'record')),
  constraint field_security_policy_uniq
    unique (tenant_id, entity_id, field_path, policy_type, scope, scope_ref)
);

comment on table meta.field_security_policy is
'Field-level security policies defining read/write access control with masking strategies.';

create index if not exists idx_field_security_entity
  on meta.field_security_policy (tenant_id, entity_id);

create index if not exists idx_field_security_field
  on meta.field_security_policy (field_path);

create index if not exists idx_field_security_type
  on meta.field_security_policy (policy_type);

create index if not exists idx_field_security_active
  on meta.field_security_policy (is_active) where is_active = true;

create index if not exists idx_field_security_scope
  on meta.field_security_policy (scope, scope_ref);

create index if not exists idx_field_security_priority
  on meta.field_security_policy (entity_id, priority);

create index if not exists idx_field_security_lookup
  on meta.field_security_policy (tenant_id, entity_id, field_path, policy_type, is_active);

-- ============================================================================
-- META: Permission Policy (tenant-scoped container)
-- ============================================================================
create table if not exists meta.permission_policy (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  name          text not null,
  description   text,

  scope_type    text not null,
  scope_key     text,

  source_type   text not null default 'system',
  source_ref    text,
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint permission_policy_scope_chk check (scope_type in ('global','module','entity','entity_version')),
  constraint permission_policy_name_uniq unique (tenant_id, name)
);

comment on table meta.permission_policy is 'Policy container per tenant/app with versioning control.';

-- ============================================================================
-- META: Permission Policy Version
-- ============================================================================
create table if not exists meta.permission_policy_version (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenant(id) on delete cascade,
  permission_policy_id uuid not null references meta.permission_policy(id) on delete cascade,

  version_no          int not null default 1,
  status              text not null default 'draft',
  published_at        timestamptz,
  published_by        text,

  created_at          timestamptz not null default now(),
  created_by          text not null,

  constraint policy_version_status_chk check (status in ('draft','published','archived')),
  constraint policy_version_uniq unique (tenant_id, permission_policy_id, version_no)
);

comment on table meta.permission_policy_version is 'Policy versioning & publish lifecycle (immutable once published).';

-- ============================================================================
-- META: Permission Rules
-- NOTE: References core.operation (migrated from core.operation)
-- ============================================================================
create table if not exists meta.permission_rule (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  policy_version_id   uuid not null references meta.permission_policy_version(id) on delete cascade,

  scope_type           text not null,
  scope_key            text,

  subject_type         text not null,
  subject_key          text not null,

  effect               text not null,
  conditions           jsonb,
  priority             int not null default 100,

  is_active            boolean not null default true,
  comment              text,

  created_at           timestamptz not null default now(),
  created_by           text not null,

  constraint rule_scope_chk check (scope_type in ('global','module','entity','entity_version','record')),
  constraint rule_subject_chk check (subject_type in ('kc_role','kc_group','user','service')),
  constraint rule_effect_chk check (effect in ('allow','deny'))
);

comment on table meta.permission_rule is
'Rule logic bound to a specific policy_version (immutable once published): subject + scope + conditions + effect + priority.';

create index if not exists idx_permission_rule_lookup
  on meta.permission_rule (tenant_id, policy_version_id, scope_type, scope_key, subject_type, subject_key, priority);

-- ============================================================================
-- META: Permission Rule <-> Operation junction
-- NOTE: References core.operation (migrated from core.operation)
-- ============================================================================
create table if not exists meta.permission_rule_operation (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  permission_rule_id  uuid not null references meta.permission_rule(id) on delete cascade,
  operation_id        uuid not null references core.operation(id) on delete restrict,

  operation_constraints jsonb,

  created_at           timestamptz not null default now(),
  created_by           text not null,

  constraint rule_operation_uniq unique (tenant_id, permission_rule_id, operation_id)
);

comment on table meta.permission_rule_operation is
'Junction linking permission rules to operations with optional per-operation constraints.';

create index if not exists idx_rule_operation_op
  on meta.permission_rule_operation (tenant_id, operation_id);

-- ============================================================================
-- META: Permission Policy Compiled
-- ============================================================================
create table if not exists meta.permission_policy_compiled (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenant(id) on delete cascade,
  policy_version_id  uuid not null references meta.permission_policy_version(id) on delete cascade,

  compiled_json       jsonb not null,
  compiled_hash       text not null,
  generated_at        timestamptz not null default now(),

  created_at          timestamptz not null default now(),
  created_by          text not null,

  constraint policy_compiled_hash_uniq unique (tenant_id, policy_version_id, compiled_hash)
);

comment on table meta.permission_policy_compiled is
'Pre-resolved rule graph per tenant+policy_version for fast evaluation (compiled_hash).';

-- ============================================================================
-- META: Lifecycle Definitions
-- ============================================================================
create table if not exists meta.lifecycle (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenant(id) on delete cascade,

  code        text not null,
  name        text not null,
  description text,
  version_no  int not null default 1,
  is_active   boolean not null default true,
  config      jsonb,

  created_at  timestamptz not null default now(),
  created_by  text not null,

  constraint lifecycle_code_uniq unique (tenant_id, code, version_no)
);

comment on table meta.lifecycle is 'Lifecycle (state machine) definitions with versioning.';

-- ============================================================================
-- META: Lifecycle States
-- ============================================================================
create table if not exists meta.lifecycle_state (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  lifecycle_id uuid not null references meta.lifecycle(id) on delete cascade,

  code         text not null,
  name         text not null,
  is_terminal  boolean not null default false,
  sort_order   int not null default 0,
  config       jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint lifecycle_state_code_uniq unique (tenant_id, lifecycle_id, code)
);

comment on table meta.lifecycle_state is 'States within a lifecycle (DRAFT, PENDING, APPROVED, etc.).';

-- ============================================================================
-- META: Lifecycle Transitions
-- ============================================================================
create table if not exists meta.lifecycle_transition (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  lifecycle_id    uuid not null references meta.lifecycle(id) on delete cascade,

  from_state_id    uuid not null references meta.lifecycle_state(id) on delete cascade,
  to_state_id      uuid not null references meta.lifecycle_state(id) on delete cascade,

  operation_code   text not null,
  is_active        boolean not null default true,
  config           jsonb,

  created_at       timestamptz not null default now(),
  created_by       text not null
);

comment on table meta.lifecycle_transition is 'Allowed state transitions (from -> to) triggered by operations.';

create index if not exists idx_transition_lookup
  on meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, operation_code);

-- ============================================================================
-- META: Transition Gates
-- ============================================================================
create table if not exists meta.lifecycle_transition_gate (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenant(id) on delete cascade,
  transition_id      uuid not null references meta.lifecycle_transition(id) on delete cascade,

  required_operations jsonb,
  approval_template_id uuid,
  conditions           jsonb,
  threshold_rules      jsonb,

  created_at           timestamptz not null default now(),
  created_by           text not null
);

comment on table meta.lifecycle_transition_gate is
'Gate bindings: required permission ops, approval template, conditions, thresholds.';

-- ============================================================================
-- META: Approval Templates
-- ============================================================================
create table if not exists meta.approval_template (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  behaviors    jsonb,
  escalation_style text,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint approval_template_code_uniq unique (tenant_id, code)
);

comment on table meta.approval_template is 'Multi-stage approval workflow templates.';

-- ============================================================================
-- META: Approval Template Stages
-- ============================================================================
create table if not exists meta.approval_template_stage (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  approval_template_id uuid not null references meta.approval_template(id) on delete cascade,

  stage_no             int not null,
  name                 text,
  mode                 text not null default 'serial',
  quorum               jsonb,

  created_at           timestamptz not null default now(),
  created_by           text not null,

  constraint stage_mode_chk check (mode in ('serial','parallel')),
  constraint template_stage_uniq unique (tenant_id, approval_template_id, stage_no)
);

comment on table meta.approval_template_stage is 'Stages within an approval template (serial or parallel).';

-- ============================================================================
-- META: Approval Routing Rules
-- ============================================================================
create table if not exists meta.approval_template_rule (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  approval_template_id uuid not null references meta.approval_template(id) on delete cascade,

  priority             int not null default 100,
  conditions           jsonb not null,
  assign_to            jsonb not null,

  created_at           timestamptz not null default now(),
  created_by           text not null
);

comment on table meta.approval_template_rule is 'Routing rules: conditions (OU/amount/etc.) to approver assignment.';

create index if not exists idx_approval_template_rule
  on meta.approval_template_rule (tenant_id, approval_template_id, priority);

-- ============================================================================
-- META: Approval SLA Policies
-- ============================================================================
create table if not exists meta.approval_sla_policy (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  timers       jsonb not null,
  escalation_chain jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint approval_sla_code_uniq unique (tenant_id, code)
);

comment on table meta.approval_sla_policy is 'SLA policies with reminder/escalation timers.';

-- ============================================================================
-- META: Lifecycle Timer Policies
-- ============================================================================
create table if not exists meta.lifecycle_timer_policy (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  rules        jsonb not null,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint lifecycle_timer_policy_code_uniq unique (tenant_id, code)
);

comment on table meta.lifecycle_timer_policy is 'Timer policies for auto-close, auto-cancel, reminders.';

-- ============================================================================
-- META: Entity <-> Lifecycle Binding
-- ============================================================================
create table if not exists meta.entity_lifecycle (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  entity_name   text not null,
  lifecycle_id  uuid not null references meta.lifecycle(id) on delete cascade,
  conditions    jsonb,
  priority      int not null default 100,

  created_at    timestamptz not null default now(),
  created_by    text not null
);

comment on table meta.entity_lifecycle is 'Binds entity types to lifecycle definitions with priority-based resolution.';

create index if not exists idx_entity_lifecycle_resolution
  on meta.entity_lifecycle (tenant_id, entity_name, priority);

-- ============================================================================
-- META: Compiled Lifecycle Route
-- ============================================================================
create table if not exists meta.entity_lifecycle_route_compiled (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  entity_name   text not null,
  compiled_json jsonb not null,
  compiled_hash text not null,
  generated_at  timestamptz not null default now(),

  created_at    timestamptz not null default now(),
  created_by    text not null,

  constraint route_compiled_hash_uniq unique (tenant_id, entity_name, compiled_hash)
);

comment on table meta.entity_lifecycle_route_compiled is
'Precompiled lifecycle routing per entity for fast runtime resolution.';

-- ============================================================================
-- META: Overlay Container
-- ============================================================================
create table if not exists meta.overlay (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  overlay_key  text not null,
  description  text,

  base_entity_id  uuid not null references meta.entity(id) on delete cascade,
  base_version_id uuid references meta.entity_version(id) on delete set null,

  priority      int not null default 100,
  conflict_mode text not null default 'fail',
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint overlay_conflict_mode_chk check (conflict_mode in ('fail','overwrite','merge')),
  constraint overlay_key_uniq unique (tenant_id, overlay_key)
);

comment on table meta.overlay is
'Schema overlay definitions for extending base entity schemas with deterministic merge.';

create index if not exists idx_overlay_base_entity
  on meta.overlay (tenant_id, base_entity_id);

create index if not exists idx_overlay_priority
  on meta.overlay (base_entity_id, priority);

create index if not exists idx_overlay_active
  on meta.overlay (is_active) where is_active = true;

-- Optimistic locking version column
alter table meta.overlay add column if not exists version integer not null default 1;

-- ============================================================================
-- META: Overlay Change Deltas
-- ============================================================================
create table if not exists meta.overlay_change (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  overlay_id    uuid not null references meta.overlay(id) on delete cascade,

  change_order  int not null,
  kind          text not null,
  path          text not null,
  value         jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,

  constraint overlay_change_kind_chk check (kind in (
    'addField','removeField','modifyField',
    'tweakPolicy','overrideValidation','overrideUi',
    'addIndex','removeIndex','tweakRelation'
  )),
  constraint overlay_change_order_uniq unique (overlay_id, change_order)
);

comment on table meta.overlay_change is
'Individual change deltas within an overlay, applied in change_order sequence.';

create index if not exists idx_overlay_change_overlay
  on meta.overlay_change (overlay_id);

-- ============================================================================
-- META: Compiled Overlay Snapshot
-- ============================================================================
create table if not exists meta.entity_compiled_overlay (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  entity_version_id uuid not null references meta.entity_version(id) on delete cascade,
  overlay_set       jsonb not null,

  compiled_json     jsonb not null,
  compiled_hash     text not null,
  generated_at      timestamptz not null default now(),

  created_at        timestamptz not null default now(),
  created_by        text not null
);

comment on table meta.entity_compiled_overlay is
'Resolved compiled snapshot after overlays applied for deterministic runtime execution.';

create index if not exists idx_entity_compiled_overlay_lookup
  on meta.entity_compiled_overlay (tenant_id, entity_version_id, compiled_hash);

-- ============================================================================
-- META: Audit Load Shedding Policy
-- ============================================================================
CREATE TABLE IF NOT EXISTS meta.audit_policy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES core.tenant(id) ON DELETE CASCADE,
  event_category  TEXT NOT NULL,
  disposition     TEXT NOT NULL DEFAULT 'required',
  sample_rate     NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT audit_policy_disposition_chk
    CHECK (disposition IN ('required', 'sampled', 'disabled')),
  CONSTRAINT audit_policy_sample_rate_chk
    CHECK (sample_rate >= 0 AND sample_rate <= 1),
  CONSTRAINT audit_policy_uniq
    UNIQUE (tenant_id, event_category)
);

COMMENT ON TABLE meta.audit_policy IS
  'Per-tenant audit load shedding policies. NULL tenant_id = global default. disposition: required/sampled/disabled.';

CREATE INDEX IF NOT EXISTS idx_audit_policy_tenant
  ON meta.audit_policy (tenant_id, event_category);

-- ============================================================================
-- META: Approval Template Versioning + Compilation Columns
-- ============================================================================

-- Add versioning columns
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS version_no int NOT NULL DEFAULT 1;
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS updated_by text;

-- Add compilation artifact columns
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS compiled_json jsonb;
ALTER TABLE meta.approval_template ADD COLUMN IF NOT EXISTS compiled_hash text;

-- Replace single-code unique constraint with versioned unique constraint
-- (allows multiple versions of the same template code)
ALTER TABLE meta.approval_template DROP CONSTRAINT IF EXISTS approval_template_code_uniq;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_template_code_version_uniq') THEN
        ALTER TABLE meta.approval_template ADD CONSTRAINT approval_template_code_version_uniq
          UNIQUE (tenant_id, code, version_no);
    END IF;
END $$;

-- Index for fast active-version lookup
CREATE INDEX IF NOT EXISTS idx_approval_template_active
  ON meta.approval_template (tenant_id, code, is_active)
  WHERE is_active = true;



-- ============================================================================
-- META: Notification Channel Registry
-- ============================================================================
create table if not exists meta.notification_channel (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  is_enabled  boolean not null default true,
  config      jsonb,
  sort_order  integer not null default 0,
  created_at  timestamptz(6) not null default now(),
  created_by  text not null,

  constraint notification_channel_code_uniq unique (code)
);

comment on table meta.notification_channel is
'Reference: available notification channels (EMAIL, TEAMS, WHATSAPP, IN_APP, etc.)';

-- ============================================================================
-- META: Notification Provider
-- ============================================================================
create table if not exists meta.notification_provider (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references meta.notification_channel(id) on delete cascade,
  code        text not null,
  name        text not null,
  adapter_key text not null,
  priority    integer not null default 1,
  is_enabled  boolean not null default true,
  config      jsonb not null default '{}',
  rate_limit  jsonb,
  health      text not null default 'healthy',
  created_at  timestamptz(6) not null default now(),
  created_by  text not null,
  updated_at  timestamptz(6),
  updated_by  text,

  constraint notification_provider_code_uniq unique (code),
  constraint notification_provider_health_chk
    check (health in ('healthy','degraded','down'))
);

comment on table meta.notification_provider is
'Provider instances for each channel (SendGrid, SES, Graph API, etc.)';

create index if not exists idx_notification_provider_channel
  on meta.notification_provider (channel_id, priority);

-- ============================================================================
-- META: Notification Template
-- ============================================================================
create table if not exists meta.notification_template (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references core.tenant(id) on delete cascade,
  template_key     text not null,
  channel          text not null,
  locale           text not null default 'en',
  version          integer not null default 1,
  status           text not null default 'draft',
  subject          text,
  body_text        text,
  body_html        text,
  body_json        jsonb,
  variables_schema jsonb,
  metadata         jsonb,
  created_at       timestamptz(6) not null default now(),
  created_by       text not null,
  updated_at       timestamptz(6),
  updated_by       text,

  constraint notification_template_status_chk
    check (status in ('draft','active','retired')),
  constraint notification_template_key_channel_locale_version_uniq
    unique (tenant_id, template_key, channel, locale, version)
);

comment on table meta.notification_template is
'Versioned, localized notification templates per channel';

create index if not exists idx_notification_template_lookup
  on meta.notification_template (template_key, channel, locale, status);

-- ============================================================================
-- META: Notification Rule
-- ============================================================================
create table if not exists meta.notification_rule (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references core.tenant(id) on delete cascade,
  code            text not null,
  name            text not null,
  description     text,
  event_type      text not null,
  entity_type     text,
  lifecycle_state text,
  condition_expr  jsonb,
  template_key    text not null,
  channels        text[] not null,
  priority        text not null default 'normal',
  recipient_rules jsonb not null,
  sla_minutes     integer,
  dedup_window_ms integer default 300000,
  is_enabled      boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz(6) not null default now(),
  created_by      text not null,
  updated_at      timestamptz(6),
  updated_by      text,

  constraint notification_rule_priority_chk
    check (priority in ('low','normal','high','critical')),
  constraint notification_rule_tenant_code_uniq
    unique (tenant_id, code)
);

comment on table meta.notification_rule is
'Rules mapping domain events to notification plans';

create index if not exists idx_notification_rule_event
  on meta.notification_rule (event_type, is_enabled);

-- ============================================================================
-- META: Migration History
-- ============================================================================
create table if not exists meta.migration_history (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  entity_name   text not null,
  version       text not null,
  action        text not null,
  ddl_sql       text not null,
  ddl_hash      text not null,
  status        text not null default 'applied',
  error_message text,

  applied_at    timestamptz not null default now(),
  applied_by    text not null,

  constraint migration_history_action_chk check (action in ('create','alter')),
  constraint migration_history_status_chk check (status in ('applied','failed','rolled_back'))
);

comment on table meta.migration_history is
'Tracks DDL migrations applied to entity tables in the ent schema.';

create index if not exists idx_migration_history_entity
  on meta.migration_history (tenant_id, entity_name);

create index if not exists idx_migration_history_applied
  on meta.migration_history (applied_at);

-- ============================================================================
-- META: Publish Artifact
-- ============================================================================
create table if not exists meta.publish_artifact (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references core.tenant(id) on delete cascade,

  entity_name          text not null,
  version              text not null,
  compiled_hash        text not null,
  diagnostics_summary  jsonb,
  applied_overlay_set  jsonb,
  migration_plan_hash  text,
  migration_plan_sql   text,

  published_at         timestamptz not null default now(),
  published_by         text not null,

  constraint publish_artifact_version_uniq unique (tenant_id, entity_name, version)
);

comment on table meta.publish_artifact is
'Immutable publish artifacts: one per entity+version, tracks compiled hash, DDL, and diagnostics.';

create index if not exists idx_publish_artifact_entity
  on meta.publish_artifact (tenant_id, entity_name);

create index if not exists idx_publish_artifact_published
  on meta.publish_artifact (published_at);
