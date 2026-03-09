/* ============================================================================
   Athyper v2.1 — Legal Hold as First-Class Governance Object
   Schema: core
   Dependencies: core.tenant, core.data_retention_policy (074),
                 evt.archive_manifest (151_event_tiering.sql)

   Promotes legal hold from a boolean flag on retention policy to a
   standalone governance entity with:
     - Hold source (litigation, regulatory, internal, preservation)
     - Scope (schema/table/entity — mirrors retention policy scoping)
     - Issuer identity and reason
     - Release workflow (released_by, released_at, release_reason)
     - Affected partition/manifest tracking via junction table
     - Function: core.is_legal_hold_active() for fast enforcement checks

   Integration:
     - core.resolve_retention_policy() checks active holds via this table
     - evt.resolve_tiering_policy()   checks active holds via this table
     - evt.prevent_manifest_mutation() blocks DETACH on held manifests
     - Audit trail via audit.audit_log (standard entity auditing)
   ============================================================================ */


-- ============================================================================
-- CORE: Legal Hold
-- Standalone governance object that freezes retention AND tiering transitions
-- for a given scope. Replaces the inline legal_hold boolean on retention policy.
--
-- Lifecycle:
--   ACTIVE (created) → RELEASED (released_at set)
--   Once released, the hold no longer affects retention or tiering.
--   Released holds are kept for audit trail (never deleted).
--
-- Scope types (mirror retention policy):
--   - schema:  holds all tables in a schema
--   - table:   holds a specific schema.table
--   - entity:  holds a specific meta.entity
--   - global:  holds everything for the tenant (e.g., full litigation freeze)
-- ============================================================================
create table if not exists core.legal_hold (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- Hold identity
  hold_reference  text not null,
  hold_source     text not null,
  reason          text not null,

  -- Scope: what is frozen
  scope_type      text not null default 'table',
  target_schema   text,
  target_table    text,
  entity_id       uuid references meta.entity(id) on delete set null,

  -- Issuer
  issued_by       text not null,
  issued_at       timestamptz not null default now(),

  -- Release workflow
  released_by     text,
  released_at     timestamptz,
  release_reason  text,

  -- Governance
  compliance_framework text,
  metadata        jsonb,
  version         int not null default 1,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint legal_hold_source_chk
    check (hold_source in ('LITIGATION', 'REGULATORY', 'INTERNAL', 'PRESERVATION', 'INVESTIGATION')),
  constraint legal_hold_scope_chk
    check (scope_type in ('global', 'schema', 'table', 'entity')),
  constraint legal_hold_scope_schema_chk
    check (
      (scope_type = 'global')
      or (scope_type in ('schema', 'table') and target_schema is not null)
    ),
  constraint legal_hold_scope_table_chk
    check (
      (scope_type = 'table' and target_table is not null)
      or (scope_type != 'table')
    ),
  constraint legal_hold_scope_entity_chk
    check (
      (scope_type = 'entity' and entity_id is not null)
      or (scope_type != 'entity')
    ),
  constraint legal_hold_release_chk
    check (
      (released_at is null and released_by is null and release_reason is null)
      or (released_at is not null and released_by is not null and release_reason is not null)
    ),
  constraint legal_hold_compliance_chk
    check (compliance_framework is null or compliance_framework in (
      'GDPR', 'PDPA', 'SOC2', 'HIPAA', 'PCI_DSS', 'INTERNAL'
    )),
  constraint legal_hold_ref_uniq
    unique (tenant_id, hold_reference)
);

comment on table core.legal_hold is
'First-class governance object that freezes retention AND tiering transitions. '
'Scope types: global, schema, table, entity. Released holds kept for audit trail.';

-- Active holds index (most common query path)
create index if not exists idx_legal_hold_active
  on core.legal_hold (tenant_id, scope_type, target_schema, target_table)
  where released_at is null;

-- Entity-scoped holds
create index if not exists idx_legal_hold_entity
  on core.legal_hold (entity_id)
  where entity_id is not null and released_at is null;

-- Audit: all holds for a tenant (active + released)
create index if not exists idx_legal_hold_tenant
  on core.legal_hold (tenant_id, issued_at desc);

-- Released holds index (for compliance reporting)
create index if not exists idx_legal_hold_released
  on core.legal_hold (tenant_id, released_at)
  where released_at is not null;


-- ============================================================================
-- Junction: Legal Hold ↔ Archive Manifest
-- Tracks which archive manifests are affected by a legal hold.
-- Prevents DETACH/PURGE of held manifests.
-- Populated when a hold is created (for existing manifests matching scope)
-- and when new manifests are created in a held scope.
-- ============================================================================
create table if not exists core.legal_hold_manifest (
  id              uuid primary key default gen_random_uuid(),
  legal_hold_id   uuid not null references core.legal_hold(id) on delete cascade,
  manifest_id     uuid not null references evt.archive_manifest(id) on delete restrict,
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- When the manifest was placed under this hold
  held_at         timestamptz not null default now(),
  held_by         text not null,

  -- When the manifest was released from this specific hold
  released_at     timestamptz,
  released_by     text,

  created_at      timestamptz not null default now(),

  constraint legal_hold_manifest_uniq
    unique (legal_hold_id, manifest_id)
);

comment on table core.legal_hold_manifest is
'Junction table linking legal holds to affected archive manifests. '
'Prevents DETACH/PURGE of held manifests. Released when parent hold is released.';

create index if not exists idx_legal_hold_manifest_hold
  on core.legal_hold_manifest (legal_hold_id) where released_at is null;

create index if not exists idx_legal_hold_manifest_manifest
  on core.legal_hold_manifest (manifest_id) where released_at is null;


-- ============================================================================
-- FUNCTION: core.is_legal_hold_active()
-- Fast enforcement check: returns true if ANY active hold covers the given scope.
-- Used by retention resolution, tiering service, and archive lifecycle operations.
--
-- Scope matching rules (from most to least specific):
--   - global hold → matches everything
--   - schema hold → matches if target_schema matches
--   - table hold  → matches if target_schema + target_table match
--   - entity hold → matches if entity_id matches
--
-- A hold at a broader scope covers narrower targets (global covers all tables).
-- ============================================================================
create or replace function core.is_legal_hold_active(
  p_tenant_id    uuid,
  p_schema       text default null,
  p_table        text default null,
  p_entity_id    uuid default null
) returns boolean as $$
begin
  return exists (
    select 1
    from core.legal_hold lh
    where lh.tenant_id = p_tenant_id
      and lh.released_at is null
      and (
        -- Global hold: covers everything
        lh.scope_type = 'global'
        -- Schema hold: covers all tables in that schema
        or (lh.scope_type = 'schema' and lh.target_schema = p_schema and p_schema is not null)
        -- Table hold: covers a specific table
        or (lh.scope_type = 'table' and lh.target_schema = p_schema and lh.target_table = p_table
            and p_schema is not null and p_table is not null)
        -- Entity hold: covers a specific entity
        or (lh.scope_type = 'entity' and lh.entity_id = p_entity_id and p_entity_id is not null)
      )
  );
end;
$$ language plpgsql stable;

comment on function core.is_legal_hold_active is
'Fast enforcement check for active legal holds. Returns true if any active hold '
'covers the given scope. Global holds match everything. Used by retention and tiering resolution.';


-- ============================================================================
-- UPDATE: core.resolve_retention_policy()
-- Replace inline legal_hold boolean with core.is_legal_hold_active() check.
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
    -- Check first-class legal hold table instead of inline boolean
    core.is_legal_hold_active(p_tenant_id, p_schema, p_table, p_entity_id) as legal_hold,
    rp.policy_scope,
    rp.priority
  from core.data_retention_policy rp
  where rp.tenant_id = p_tenant_id
    and rp.is_active = true
    and rp.target_schema = p_schema
    and (
      (rp.policy_scope = 'entity' and rp.entity_id = p_entity_id and p_entity_id is not null)
      or (rp.policy_scope = 'table'  and rp.target_table = p_table and p_table is not null)
      or (rp.policy_scope = 'schema' and rp.target_table is null)
    )
  order by
    case rp.policy_scope
      when 'entity' then 1
      when 'table'  then 2
      when 'schema' then 3
    end asc,
    rp.priority desc,
    coalesce(rp.updated_at, rp.created_at) desc
  limit 1;
end;
$$ language plpgsql stable;


-- ============================================================================
-- UPDATE: evt.resolve_tiering_policy()
-- Replace inline retention_policy.legal_hold check with core.is_legal_hold_active().
-- ============================================================================
create or replace function evt.resolve_tiering_policy(
  p_tenant_id        uuid,
  p_source_schema    text default 'evt',
  p_source_table     text default 'event',
  p_partition_domain varchar(30) default null
) returns table (
  policy_id       uuid,
  hot_months      int,
  warm_months     int,
  warm_strategy   text,
  cold_strategy   text,
  cold_storage_uri text,
  priority        int,
  legal_hold      boolean
) as $$
begin
  return query
  select
    tp.id,
    tp.hot_months,
    tp.warm_months,
    tp.warm_strategy,
    tp.cold_strategy,
    tp.cold_storage_uri,
    tp.priority,
    -- Check first-class legal hold table
    core.is_legal_hold_active(p_tenant_id, p_source_schema, p_source_table) as legal_hold
  from evt.data_tiering_policy tp
  where tp.tenant_id = p_tenant_id
    and tp.source_schema = p_source_schema
    and tp.source_table = p_source_table
    and tp.is_active = true
    and (
      (tp.partition_domain = p_partition_domain)
      or (tp.partition_domain is null)
    )
  order by
    case when tp.partition_domain is not null then 1 else 2 end asc,
    tp.priority desc,
    coalesce(tp.updated_at, tp.created_at) desc
  limit 1;
end;
$$ language plpgsql stable;


-- ============================================================================
-- TRIGGER: Prevent mutation of released legal holds
-- Once a hold is released, only metadata can be updated.
-- Active holds can be released but not re-scoped.
-- Deletion is prohibited (audit trail).
-- ============================================================================
create or replace function core.prevent_legal_hold_mutation()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Legal hold records are permanent audit artifacts. DELETE is prohibited.';
  end if;

  if TG_OP = 'UPDATE' then
    -- Immutable fields after creation
    if OLD.hold_reference is distinct from NEW.hold_reference then
      raise exception 'hold_reference is immutable after creation.';
    end if;
    if OLD.hold_source is distinct from NEW.hold_source then
      raise exception 'hold_source is immutable after creation.';
    end if;
    if OLD.reason is distinct from NEW.reason then
      raise exception 'reason is immutable after creation.';
    end if;
    if OLD.issued_by is distinct from NEW.issued_by then
      raise exception 'issued_by is immutable after creation.';
    end if;
    if OLD.issued_at is distinct from NEW.issued_at then
      raise exception 'issued_at is immutable after creation.';
    end if;
    if OLD.scope_type is distinct from NEW.scope_type then
      raise exception 'scope_type is immutable after creation.';
    end if;
    if OLD.target_schema is distinct from NEW.target_schema then
      raise exception 'target_schema is immutable after creation.';
    end if;
    if OLD.target_table is distinct from NEW.target_table then
      raise exception 'target_table is immutable after creation.';
    end if;
    if OLD.entity_id is distinct from NEW.entity_id then
      raise exception 'entity_id is immutable after creation.';
    end if;

    -- Once released, only metadata can change
    if OLD.released_at is not null then
      if NEW.released_at is distinct from OLD.released_at
         or NEW.released_by is distinct from OLD.released_by
         or NEW.release_reason is distinct from OLD.release_reason then
        raise exception 'Release details are immutable once set.';
      end if;
    end if;

    -- Release timestamp can only move forward (NULL → value)
    if OLD.released_at is not null and NEW.released_at is distinct from OLD.released_at then
      raise exception 'released_at cannot be changed once set.';
    end if;
  end if;

  -- Auto-set updated_at
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

-- Apply immutability trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_core_legal_hold_guard'
  ) then
    create trigger trg_core_legal_hold_guard
      before update or delete on core.legal_hold
      for each row execute function core.prevent_legal_hold_mutation();
  end if;
end $$;


-- ============================================================================
-- TRIGGER: Auto-release manifest holds when parent hold is released
-- When a legal_hold is released, cascade release to all junction rows.
-- ============================================================================
create or replace function core.cascade_legal_hold_release()
returns trigger as $$
begin
  if TG_OP = 'UPDATE'
     and OLD.released_at is null
     and NEW.released_at is not null then
    -- Cascade release to all held manifests
    update core.legal_hold_manifest
    set released_at = NEW.released_at,
        released_by = NEW.released_by
    where legal_hold_id = NEW.id
      and released_at is null;
  end if;
  return NEW;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_core_legal_hold_release_cascade'
  ) then
    create trigger trg_core_legal_hold_release_cascade
      after update on core.legal_hold
      for each row execute function core.cascade_legal_hold_release();
  end if;
end $$;


-- ============================================================================
-- VIEW: Active legal hold summary (for admin dashboards)
-- ============================================================================
create or replace view core.active_legal_holds as
  select
    lh.id,
    lh.tenant_id,
    lh.hold_reference,
    lh.hold_source,
    lh.reason,
    lh.scope_type,
    lh.target_schema,
    lh.target_table,
    lh.entity_id,
    lh.issued_by,
    lh.issued_at,
    lh.compliance_framework,
    (select count(*) from core.legal_hold_manifest lhm
     where lhm.legal_hold_id = lh.id and lhm.released_at is null) as held_manifest_count,
    now() - lh.issued_at as hold_duration
  from core.legal_hold lh
  where lh.released_at is null;

comment on view core.active_legal_holds is
'Active legal holds with held manifest count and duration. For admin dashboards and compliance reporting.';


-- ============================================================================
-- FUNCTION: core.active_holds_for_scope()
-- Returns ALL active holds covering a given scope (not just boolean).
-- Essential for overlap/conflict visibility: when multiple holds apply to the
-- same scope, operators need to see each hold's source, reason, and issuer.
--
-- A manifest/table stays held while ANY covering hold is active.
-- Releasing one hold does NOT release the scope if others remain.
-- ============================================================================
create or replace function core.active_holds_for_scope(
  p_tenant_id    uuid,
  p_schema       text default null,
  p_table        text default null,
  p_entity_id    uuid default null
) returns table (
  hold_id             uuid,
  hold_reference      text,
  hold_source         text,
  reason              text,
  scope_type          text,
  target_schema       text,
  target_table        text,
  entity_id           uuid,
  issued_by           text,
  issued_at           timestamptz,
  compliance_framework text,
  hold_duration       interval,
  held_manifest_count bigint
) as $$
begin
  return query
  select
    lh.id,
    lh.hold_reference,
    lh.hold_source,
    lh.reason,
    lh.scope_type,
    lh.target_schema,
    lh.target_table,
    lh.entity_id,
    lh.issued_by,
    lh.issued_at,
    lh.compliance_framework,
    now() - lh.issued_at as hold_duration,
    (select count(*) from core.legal_hold_manifest lhm
     where lhm.legal_hold_id = lh.id and lhm.released_at is null) as held_manifest_count
  from core.legal_hold lh
  where lh.tenant_id = p_tenant_id
    and lh.released_at is null
    and (
      -- Global hold: covers everything
      lh.scope_type = 'global'
      -- Schema hold: covers all tables in that schema
      or (lh.scope_type = 'schema' and lh.target_schema = p_schema and p_schema is not null)
      -- Table hold: covers a specific table
      or (lh.scope_type = 'table' and lh.target_schema = p_schema and lh.target_table = p_table
          and p_schema is not null and p_table is not null)
      -- Entity hold: covers a specific entity
      or (lh.scope_type = 'entity' and lh.entity_id = p_entity_id and p_entity_id is not null)
    )
  order by lh.issued_at desc;
end;
$$ language plpgsql stable;

comment on function core.active_holds_for_scope is
'Returns all active legal holds covering a scope. Unlike is_legal_hold_active() which returns boolean, '
'this returns full hold details for overlap visibility and operator explainability.';


-- ============================================================================
-- FUNCTION: core.is_manifest_held()
-- Checks if a specific archive manifest is held by ANY active legal hold.
-- Uses the junction table directly — handles multiple overlapping holds.
-- ============================================================================
create or replace function core.is_manifest_held(
  p_manifest_id  uuid
) returns boolean as $$
begin
  return exists (
    select 1
    from core.legal_hold_manifest lhm
    where lhm.manifest_id = p_manifest_id
      and lhm.released_at is null
  );
end;
$$ language plpgsql stable;

comment on function core.is_manifest_held is
'Checks if an archive manifest is held by any active legal hold via the junction table. '
'A manifest stays held while ANY junction row has released_at IS NULL.';


-- ============================================================================
-- FUNCTION: core.holds_for_manifest()
-- Returns all active holds covering a specific manifest (for overlap diagnostics).
-- ============================================================================
create or replace function core.holds_for_manifest(
  p_manifest_id  uuid
) returns table (
  hold_id             uuid,
  hold_reference      text,
  hold_source         text,
  reason              text,
  scope_type          text,
  issued_by           text,
  issued_at           timestamptz,
  compliance_framework text,
  held_at             timestamptz
) as $$
begin
  return query
  select
    lh.id,
    lh.hold_reference,
    lh.hold_source,
    lh.reason,
    lh.scope_type,
    lh.issued_by,
    lh.issued_at,
    lh.compliance_framework,
    lhm.held_at
  from core.legal_hold_manifest lhm
  join core.legal_hold lh on lhm.legal_hold_id = lh.id
  where lhm.manifest_id = p_manifest_id
    and lhm.released_at is null
    and lh.released_at is null
  order by lh.issued_at desc;
end;
$$ language plpgsql stable;

comment on function core.holds_for_manifest is
'Returns all active holds covering a specific manifest. For overlap diagnostics '
'when a manifest is under multiple holds from different sources.';
