/* ============================================================================
   Athyper v2.1 — Event Store Data Tiering & Archival
   Schema: evt
   Dependencies: core.tenant, evt.event (150_event_store.sql),
                 core.data_retention_policy (074_data_retention_policy.sql)

   Manages storage tiering (HOT → WARM → COLD) for the append-only event
   store, and tracks partition-level archive manifests for compliance
   and cold-storage restoration.

   Tables:
     1. evt.data_tiering_policy    — per-tenant storage lifecycle rules
     2. evt.archive_manifest       — partition archive tracking (state machine)
     3. evt.prevent_manifest_mutation() — immutability guard (mirrors audit pattern)

   Relationship to core.data_retention_policy:
     Tiering controls WHERE data lives (HOT/WARM/COLD).
     Retention controls WHEN data can be removed.
     Legal hold (retention policy) freezes both tiering AND retention.
     A partition cannot be DETACHED until retention policy allows it.
   ============================================================================ */


-- ============================================================================
-- evt.data_tiering_policy — Per-tenant storage lifecycle rules
--
-- Precedence when multiple policies match:
--   1. partition_domain-specific (most specific)
--   2. table-wide (partition_domain IS NULL)
--   Within same specificity: higher priority wins.
--
-- Legal hold integration:
--   Before executing any tier transition, the tiering service MUST check
--   core.data_retention_policy.legal_hold for the target schema/table.
--   If legal_hold = true, ALL tier transitions are frozen.
-- ============================================================================
create table if not exists evt.data_tiering_policy (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- What this policy applies to
  source_schema   text not null default 'evt',
  source_table    text not null default 'event',
  partition_domain varchar(30),

  -- Tier thresholds (months from event creation)
  hot_months      int not null default 3,
  warm_months     int not null default 12,

  -- Hot tier: full indexes, fast queries (default: 0–3 months)
  -- Warm tier: reduced indexes, still queryable (3–12 months)
  -- Cold tier: archived to object storage, detached from DB (12+ months)

  -- Warm tier behaviour
  warm_strategy   text not null default 'COMPRESS',
  warm_config     jsonb,

  -- Cold tier behaviour
  cold_strategy   text not null default 'ARCHIVE_NDJSON',
  cold_storage_uri text,
  cold_config     jsonb,

  -- Governance
  is_active       boolean not null default true,
  priority        int not null default 100,
  version         int not null default 1,

  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz,
  updated_by      text,

  constraint evt_tiering_warm_strategy_chk
    check (warm_strategy in ('COMPRESS', 'REDUCE_INDEXES', 'MOVE_TABLESPACE', 'NONE')),
  constraint evt_tiering_cold_strategy_chk
    check (cold_strategy in ('ARCHIVE_NDJSON', 'ARCHIVE_PARQUET', 'ARCHIVE_S3', 'DELETE', 'NONE')),
  constraint evt_tiering_months_chk
    check (hot_months > 0 and warm_months > hot_months),
  constraint evt_tiering_policy_uniq
    unique (tenant_id, source_schema, source_table, partition_domain)
);

comment on table evt.data_tiering_policy is
'Per-tenant storage lifecycle rules for event store data (HOT/WARM/COLD tiering). '
'Legal hold on corresponding retention policy freezes all tier transitions.';

create index if not exists idx_evt_tiering_tenant
  on evt.data_tiering_policy (tenant_id, is_active);

create index if not exists idx_evt_tiering_source
  on evt.data_tiering_policy (source_schema, source_table);


-- ============================================================================
-- FUNCTION: evt.resolve_tiering_policy()
-- Resolves the winning tiering policy for a given partition domain.
-- partition_domain-specific wins over table-wide (NULL domain).
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
    -- Check legal hold from retention policy for same schema/table
    coalesce(
      (select rp.legal_hold
       from core.data_retention_policy rp
       where rp.tenant_id = p_tenant_id
         and rp.target_schema = p_source_schema
         and (rp.target_table = p_source_table or rp.target_table is null)
         and rp.is_active = true
         and rp.legal_hold = true
       limit 1),
      false
    ) as legal_hold
  from evt.data_tiering_policy tp
  where tp.tenant_id = p_tenant_id
    and tp.source_schema = p_source_schema
    and tp.source_table = p_source_table
    and tp.is_active = true
    and (
      -- Match: domain-specific or table-wide
      (tp.partition_domain = p_partition_domain)
      or (tp.partition_domain is null)
    )
  order by
    -- Domain-specific wins over table-wide
    case when tp.partition_domain is not null then 1 else 2 end asc,
    tp.priority desc,
    coalesce(tp.updated_at, tp.created_at) desc
  limit 1;
end;
$$ language plpgsql stable;

comment on function evt.resolve_tiering_policy is
'Resolves winning tiering policy. Domain-specific > table-wide. '
'Also checks legal hold from retention policy.';


-- ============================================================================
-- evt.archive_manifest — Tracks archived event partitions
-- Mirrors audit.archive_marker pattern for the event store, with full
-- lifecycle state machine and immutability protection.
--
-- Lifecycle state machine (enforced by trigger):
--   ARCHIVED → VERIFIED → DETACHED → RESTORED
--                                  ↘ (cannot skip VERIFIED before DETACH)
--
-- State transitions:
--   INSERT (archived_at set)                           → ARCHIVED
--   UPDATE verified_at (from NULL)                     → VERIFIED
--   UPDATE detached_at (requires verified_at NOT NULL) → DETACHED
--   UPDATE restored_at (from DETACHED only)            → RESTORED
--
-- Immutability rules (mirror audit.prevent_audit_mutation):
--   - sha256, row_count, archive_format, storage_uri: immutable after INSERT
--   - archived_at, archived_by: immutable after INSERT
--   - DELETE: prohibited (archives are permanent records)
-- ============================================================================
create table if not exists evt.archive_manifest (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- Source partition identity
  partition_name  text not null,
  partition_month date not null,
  partition_domain varchar(30),

  -- Archive artefact (immutable after INSERT)
  archive_format  text not null default 'NDJSON',
  storage_uri     text not null,
  sha256          text not null,
  row_count       bigint not null default 0,
  size_bytes      bigint,

  -- Lifecycle timestamps (state machine — see trigger below)
  archived_at     timestamptz not null default now(),
  archived_by     text not null,
  verified_at     timestamptz,
  verified_by     text,
  detached_at     timestamptz,
  detached_by     text,
  restored_at     timestamptz,
  restored_by     text,

  -- Metadata
  tier_at_archive text not null default 'COLD',
  metadata        jsonb,

  created_at      timestamptz not null default now(),

  constraint evt_archive_format_chk
    check (archive_format in ('NDJSON', 'PARQUET', 'CSV')),
  constraint evt_archive_tier_chk
    check (tier_at_archive in ('WARM', 'COLD')),
  constraint evt_archive_manifest_uniq
    unique (tenant_id, partition_name),
  -- Cannot detach without verifying first
  constraint evt_archive_detach_requires_verify
    check (detached_at is null or verified_at is not null),
  -- Cannot restore without detaching first
  constraint evt_archive_restore_requires_detach
    check (restored_at is null or detached_at is not null)
);

comment on table evt.archive_manifest is
'Tracks archived event partitions with lifecycle state machine: '
'ARCHIVED → VERIFIED → DETACHED → RESTORED. '
'Immutable core fields (sha256, storage_uri) protected by trigger.';

create index if not exists idx_evt_archive_tenant_month
  on evt.archive_manifest (tenant_id, partition_month);

create index if not exists idx_evt_archive_unverified
  on evt.archive_manifest (tenant_id)
  where verified_at is null;

create index if not exists idx_evt_archive_detachable
  on evt.archive_manifest (tenant_id)
  where verified_at is not null and detached_at is null;


-- ============================================================================
-- TRIGGER: evt.prevent_manifest_mutation()
-- Protects archive manifest immutability.
-- Mirrors audit.prevent_audit_mutation() pattern.
--
-- Allowed UPDATEs (lifecycle transitions only):
--   - verified_at, verified_by     (NULL → value)
--   - detached_at, detached_by     (NULL → value, requires verified_at)
--   - restored_at, restored_by     (NULL → value, requires detached_at)
--   - metadata                     (always mutable for operational notes)
--
-- Prohibited:
--   - DELETE (archives are permanent compliance records)
--   - Changing sha256, storage_uri, row_count, archive_format, archived_at, archived_by
--   - Setting lifecycle timestamps backwards (e.g., clearing verified_at)
-- ============================================================================
create or replace function evt.prevent_manifest_mutation()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Archive manifest records are permanent. DELETE is prohibited.';
  end if;

  if TG_OP = 'UPDATE' then
    -- Immutable core fields
    if OLD.sha256 is distinct from NEW.sha256 then
      raise exception 'sha256 is immutable after archive creation.';
    end if;
    if OLD.storage_uri is distinct from NEW.storage_uri then
      raise exception 'storage_uri is immutable after archive creation.';
    end if;
    if OLD.row_count is distinct from NEW.row_count then
      raise exception 'row_count is immutable after archive creation.';
    end if;
    if OLD.archive_format is distinct from NEW.archive_format then
      raise exception 'archive_format is immutable after archive creation.';
    end if;
    if OLD.archived_at is distinct from NEW.archived_at then
      raise exception 'archived_at is immutable after archive creation.';
    end if;
    if OLD.archived_by is distinct from NEW.archived_by then
      raise exception 'archived_by is immutable after archive creation.';
    end if;
    if OLD.partition_name is distinct from NEW.partition_name then
      raise exception 'partition_name is immutable after archive creation.';
    end if;

    -- Lifecycle timestamps: can only move forward (NULL → value), never backward
    if OLD.verified_at is not null and NEW.verified_at is distinct from OLD.verified_at then
      raise exception 'verified_at cannot be changed once set.';
    end if;
    if OLD.detached_at is not null and NEW.detached_at is distinct from OLD.detached_at then
      raise exception 'detached_at cannot be changed once set.';
    end if;
    if OLD.restored_at is not null and NEW.restored_at is distinct from OLD.restored_at then
      raise exception 'restored_at cannot be changed once set.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;

-- Apply immutability trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_evt_archive_manifest_guard'
  ) then
    create trigger trg_evt_archive_manifest_guard
      before update or delete on evt.archive_manifest
      for each row execute function evt.prevent_manifest_mutation();
  end if;
end $$;
