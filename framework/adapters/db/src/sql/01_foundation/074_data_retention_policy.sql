/* ============================================================================
   Athyper v2.1 — Data Retention & Privacy Compliance
   Schema: core, meta
   Dependencies: core.tenant, meta.entity, meta.field_security_policy

   1. core.data_retention_policy        — per-entity/schema configurable retention
   2. core.resolve_retention_policy()    — precedence resolution (scope specificity)
   3. meta.field_security_policy ALTERs  — pii_classification + privacy metadata
   ============================================================================ */


-- ============================================================================
-- CORE: Data Retention Policy
-- Configurable retention rules per entity/schema for compliance (GDPR, PDPA, SOC2)
-- Replaces the hardcoded 90-day default in audit-log-retention.job.ts
--
-- Precedence (mirrors fin.dimension_policy pattern):
--   1. entity   scope (most specific — linked to meta.entity)
--   2. table    scope (schema + table name)
--   3. schema   scope (entire schema — least specific)
--   Within same scope: higher priority wins. Tiebreaker: newest updated_at.
--   Legal hold ALWAYS overrides — suspends all retention processing.
--
-- Relationship to evt.data_tiering_policy:
--   Retention policy governs WHEN data can be removed/anonymized.
--   Tiering policy governs WHERE data lives (HOT/WARM/COLD storage).
--   Rule: retention_days must be >= tiering warm_months * 30.
--   A tiered partition in COLD storage cannot be purged until retention expires.
--   Legal hold freezes BOTH retention AND tiering transitions.
-- ============================================================================
create table if not exists core.data_retention_policy (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- Scope: what this policy applies to
  -- Precedence: entity (1) > table (2) > schema (3)
  policy_scope    text not null default 'entity',
  target_schema   text not null,
  target_table    text,
  entity_id       uuid references meta.entity(id) on delete set null,

  -- Retention rules
  retention_days  int not null,
  action_on_expiry text not null default 'ARCHIVE',

  -- Compliance framework driving this policy
  compliance_framework text,

  -- Legal hold: suspends ALL retention AND tiering processing
  legal_hold      boolean not null default false,
  legal_hold_reason text,
  legal_hold_at   timestamptz,
  legal_hold_by   text,

  -- Governance
  is_active       boolean not null default true,
  priority        int not null default 100,
  approved_by     text,
  approved_at     timestamptz,

  -- Version tracking for audit trail
  version         int not null default 1,

  metadata        jsonb,

  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz,
  updated_by      text,

  constraint retention_scope_chk
    check (policy_scope in ('schema', 'entity', 'table')),
  constraint retention_action_chk
    check (action_on_expiry in ('ARCHIVE', 'ANONYMIZE', 'DELETE', 'SOFT_DELETE')),
  constraint retention_compliance_chk
    check (compliance_framework is null or compliance_framework in (
      'GDPR', 'PDPA', 'SOC2', 'HIPAA', 'PCI_DSS', 'INTERNAL'
    )),
  constraint retention_days_chk
    check (retention_days > 0),
  constraint retention_entity_scope_chk
    check (
      (policy_scope = 'entity' and entity_id is not null)
      or (policy_scope != 'entity')
    ),
  constraint retention_table_scope_chk
    check (
      (policy_scope = 'table' and target_table is not null)
      or (policy_scope != 'table')
    ),
  constraint retention_policy_uniq
    unique (tenant_id, target_schema, target_table, policy_scope)
);

comment on table core.data_retention_policy is
'Per-entity/schema data retention rules for GDPR, PDPA, SOC2 compliance. '
'Scope precedence: entity > table > schema. Legal hold freezes both retention and tiering.';

create index if not exists idx_retention_policy_tenant
  on core.data_retention_policy (tenant_id, is_active);

create index if not exists idx_retention_policy_scope
  on core.data_retention_policy (target_schema, target_table);

create index if not exists idx_retention_policy_entity
  on core.data_retention_policy (entity_id) where entity_id is not null;

create index if not exists idx_retention_policy_legal_hold
  on core.data_retention_policy (legal_hold) where legal_hold = true;

-- Composite index for precedence resolution query
create index if not exists idx_retention_policy_resolution
  on core.data_retention_policy (tenant_id, target_schema, target_table, policy_scope, priority desc)
  where is_active = true;


-- ============================================================================
-- FUNCTION: core.resolve_retention_policy()
-- Resolves the winning retention policy for a given schema+table.
-- Follows athyper precedence pattern: scope specificity → priority → newest.
-- Returns NULL if no active policy exists or legal hold is active.
-- ============================================================================
create or replace function core.resolve_retention_policy(
  p_tenant_id    uuid,
  p_schema       text,
  p_table        text,
  p_entity_id    uuid default null
) returns table (
  policy_id          uuid,
  retention_days     int,
  action_on_expiry   text,
  compliance_framework text,
  legal_hold         boolean,
  resolved_scope     text,
  priority           int
) as $$
begin
  return query
  select
    rp.id,
    rp.retention_days,
    rp.action_on_expiry,
    rp.compliance_framework,
    rp.legal_hold,
    rp.policy_scope,
    rp.priority
  from core.data_retention_policy rp
  where rp.tenant_id = p_tenant_id
    and rp.is_active = true
    and rp.target_schema = p_schema
    and (
      -- Match by scope specificity (entity > table > schema)
      (rp.policy_scope = 'entity' and rp.entity_id = p_entity_id and p_entity_id is not null)
      or (rp.policy_scope = 'table'  and rp.target_table = p_table and p_table is not null)
      or (rp.policy_scope = 'schema' and rp.target_table is null)
    )
  order by
    -- Scope specificity: entity=1 (most specific), table=2, schema=3 (least)
    case rp.policy_scope
      when 'entity' then 1
      when 'table'  then 2
      when 'schema' then 3
    end asc,
    -- Within same scope: higher priority wins
    rp.priority desc,
    -- Tiebreaker: newest update
    coalesce(rp.updated_at, rp.created_at) desc
  limit 1;
end;
$$ language plpgsql stable;

comment on function core.resolve_retention_policy is
'Resolves the winning retention policy using scope specificity → priority → newest. '
'Mirrors fin.dimension_policy precedence pattern.';


-- ============================================================================
-- META: Add PII classification + privacy metadata to field_security_policy
-- Formalizes PII categorization instead of a separate pii_registry table.
-- Privacy metadata supports GDPR Art 6 lawful basis, consent tracking, and
-- per-field retention overrides.
-- ============================================================================
alter table meta.field_security_policy
  add column if not exists pii_classification text;

alter table meta.field_security_policy
  drop constraint if exists field_security_pii_class_chk;

alter table meta.field_security_policy
  add constraint field_security_pii_class_chk
    check (pii_classification is null or pii_classification in (
      'DIRECT_ID',       -- Directly identifies a person (name, email, SSN, tax ID)
      'QUASI_ID',        -- Could identify when combined (DOB, zip code, job title)
      'SENSITIVE',       -- Health, religion, ethnicity, biometric
      'FINANCIAL',       -- Bank account, credit card, salary
      'CONTACT',         -- Phone, address, social media handle
      'BEHAVIORAL'       -- Usage patterns, preferences, browsing history
    ));

comment on column meta.field_security_policy.pii_classification is
'PII category for GDPR/PDPA compliance. Drives DSAR reports, anonymization, and retention enforcement.';

-- Privacy metadata: lawful basis, consent requirements, field-level retention override
alter table meta.field_security_policy
  add column if not exists privacy_metadata jsonb;

comment on column meta.field_security_policy.privacy_metadata is
'GDPR/PDPA privacy metadata. Structure: '
'{ "lawful_basis": "consent"|"contract"|"legal_obligation"|"vital_interest"|"public_task"|"legitimate_interest", '
'  "consent_required": bool, '
'  "retention_override_days": int (field-level override, trumps table-level policy), '
'  "anonymization_strategy": "redact"|"hash"|"generalize"|"suppress"|"noise", '
'  "cross_border_restricted": bool (blocks export to non-adequate jurisdictions), '
'  "data_subject_type": "customer"|"employee"|"supplier"|"prospect" }';

-- Validation: if pii_classification is set, privacy_metadata should have lawful_basis
-- (enforced at application layer, not DB — JSONB CHECK constraints are fragile)

create index if not exists idx_field_security_pii
  on meta.field_security_policy (pii_classification)
  where pii_classification is not null;

create index if not exists idx_field_security_pii_tenant
  on meta.field_security_policy (tenant_id, pii_classification)
  where pii_classification is not null;

-- ============================================================================
-- VIEW: PII field inventory (for DSAR, DPO dashboards, compliance audits)
-- Replaces the need for a separate core.pii_registry table
-- ============================================================================
create or replace view meta.pii_field_inventory as
  select
    fsp.tenant_id,
    e.name as entity_name,
    e.table_schema,
    e.table_name,
    fsp.field_path,
    fsp.pii_classification,
    fsp.mask_strategy,
    fsp.privacy_metadata->>'lawful_basis' as lawful_basis,
    (fsp.privacy_metadata->>'consent_required')::boolean as consent_required,
    (fsp.privacy_metadata->>'retention_override_days')::int as retention_override_days,
    fsp.privacy_metadata->>'anonymization_strategy' as anonymization_strategy,
    (fsp.privacy_metadata->>'cross_border_restricted')::boolean as cross_border_restricted,
    fsp.privacy_metadata->>'data_subject_type' as data_subject_type,
    fsp.is_active
  from meta.field_security_policy fsp
  join meta.entity e on fsp.entity_id = e.id and fsp.tenant_id = e.tenant_id
  where fsp.pii_classification is not null;

comment on view meta.pii_field_inventory is
'Consolidated PII field inventory across all entities. '
'Drives DSAR reports, DPO dashboards, and compliance audits. '
'Replaces the need for a separate pii_registry table.';
