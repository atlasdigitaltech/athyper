/* ============================================================================
   Athyper v2.1 — Tenant Operational Isolation
   Schema: core
   Dependencies: core.tenant

   Resource quotas and workload limits for SaaS tenant isolation.
   Works alongside core.feature_flag (toggles) and core.tenant.subscription
   (tier-based entitlement).

   Tables:
     1. core.tenant_resource_quota   — declarative limits with optimistic locking
     2. core.quota_usage_snapshot    — periodic measurement history (mirrors workspace_usage_metric)
     3. core.check_quota()           — atomic quota check-and-increment function
     4. core.tenant_quota_utilization — dashboard view
   ============================================================================ */


-- ============================================================================
-- CORE: Tenant Resource Quota
-- Declarative resource limits per tenant, enforced by runtime services.
--
-- Update semantics:
--   current_value is a denormalized snapshot updated via core.record_quota_usage()
--   or directly by the enforcement service. Optimistic locking via `version` column
--   prevents lost updates from concurrent measurement jobs.
--
--   Pattern mirrors core.workspace_usage_metric for periodic measurements,
--   but adds enforcement semantics (HARD/SOFT/ADVISORY).
-- ============================================================================
create table if not exists core.tenant_resource_quota (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- What resource this quota governs
  quota_key       text not null,
  quota_name      text,
  category        text not null,

  -- Limits
  limit_value     bigint not null,
  limit_unit      text not null default 'COUNT',
  warning_pct     int not null default 80,

  -- Current usage (denormalized snapshot — authoritative source is quota_usage_snapshot)
  -- Updated via core.record_quota_usage() with optimistic locking
  current_value   bigint not null default 0,
  last_measured_at timestamptz,
  measured_by     text,

  -- Optimistic locking: prevents lost updates from concurrent measurement jobs
  version         int not null default 1,

  -- Enforcement
  enforcement     text not null default 'HARD',
  overage_action  text not null default 'BLOCK',

  -- Tier linkage: which subscription tiers get which limits
  applies_to_tiers text[],

  -- Lifecycle
  is_active       boolean not null default true,
  effective_from  timestamptz not null default now(),
  effective_until timestamptz,

  metadata        jsonb,

  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz,
  updated_by      text,

  constraint quota_category_chk
    check (category in (
      'API',           -- API rate limits (requests per minute/hour)
      'STORAGE',       -- Storage limits (GB)
      'USERS',         -- Active user count
      'ENTITIES',      -- Entity record count
      'EVENTS',        -- Event throughput (events per hour)
      'COMPUTE',       -- Background job slots, concurrent operations
      'INTEGRATIONS',  -- External integration connections
      'EXPORT'         -- Export/report generation limits
    )),
  constraint quota_limit_unit_chk
    check (limit_unit in ('COUNT', 'BYTES', 'GB', 'MB', 'RPM', 'RPH', 'RPD', 'CONCURRENT')),
  constraint quota_enforcement_chk
    check (enforcement in ('HARD', 'SOFT', 'ADVISORY')),
  constraint quota_overage_chk
    check (overage_action in ('BLOCK', 'THROTTLE', 'WARN', 'LOG')),
  constraint quota_warning_pct_chk
    check (warning_pct >= 0 and warning_pct <= 100),
  constraint quota_tenant_key_uniq
    unique (tenant_id, quota_key)
);

comment on table core.tenant_resource_quota is
'Per-tenant resource quotas and workload limits for SaaS operational isolation. '
'current_value updated via core.record_quota_usage() with optimistic locking.';

create index if not exists idx_quota_tenant_active
  on core.tenant_resource_quota (tenant_id, is_active);

create index if not exists idx_quota_category
  on core.tenant_resource_quota (category);

create index if not exists idx_quota_near_limit
  on core.tenant_resource_quota (tenant_id, quota_key)
  where current_value > 0;

create index if not exists idx_quota_enforcement
  on core.tenant_resource_quota (enforcement) where enforcement = 'HARD';


-- ============================================================================
-- CORE: Quota Usage Snapshot (periodic measurement history)
-- Mirrors core.workspace_usage_metric pattern.
-- Append-only: one row per measurement period per quota.
-- Used for trend analysis, billing, and audit trail of quota changes.
-- ============================================================================
create table if not exists core.quota_usage_snapshot (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  quota_id        uuid not null references core.tenant_resource_quota(id) on delete cascade,

  -- Measurement
  measured_value  bigint not null,
  limit_at_time   bigint not null,
  utilization_pct numeric(5,2) not null,

  -- Period
  period_start    timestamptz not null,
  period_end      timestamptz not null,

  -- Attribution
  measured_by     text not null,
  measurement_method text not null default 'SCHEDULED',

  recorded_at     timestamptz not null default now(),

  constraint snapshot_method_chk
    check (measurement_method in ('SCHEDULED', 'ON_DEMAND', 'REAL_TIME', 'ESTIMATE')),
  constraint snapshot_period_chk
    check (period_end > period_start)
);

comment on table core.quota_usage_snapshot is
'Periodic measurement history for tenant resource quotas. '
'Append-only. Used for trend analysis, billing, and audit.';

create index if not exists idx_quota_snapshot_quota
  on core.quota_usage_snapshot (quota_id, period_end desc);

create index if not exists idx_quota_snapshot_tenant
  on core.quota_usage_snapshot (tenant_id, recorded_at desc);


-- ============================================================================
-- FUNCTION: core.record_quota_usage()
-- Atomically records a quota measurement:
--   1. Inserts a snapshot row (append-only history)
--   2. Updates current_value on tenant_resource_quota with optimistic locking
-- Returns TRUE if update succeeded, FALSE if version conflict (caller retries).
-- ============================================================================
create or replace function core.record_quota_usage(
  p_tenant_id       uuid,
  p_quota_key       text,
  p_measured_value  bigint,
  p_measured_by     text,
  p_period_start    timestamptz default now() - interval '1 hour',
  p_period_end      timestamptz default now(),
  p_method          text default 'SCHEDULED'
) returns boolean as $$
declare
  v_quota_id    uuid;
  v_version     int;
  v_limit       bigint;
  v_updated     int;
begin
  -- Read current version (SELECT FOR UPDATE prevents concurrent reads)
  select id, version, limit_value
  into v_quota_id, v_version, v_limit
  from core.tenant_resource_quota
  where tenant_id = p_tenant_id and quota_key = p_quota_key and is_active = true
  for update;

  if v_quota_id is null then
    return false;
  end if;

  -- 1. Insert measurement snapshot
  insert into core.quota_usage_snapshot
    (tenant_id, quota_id, measured_value, limit_at_time, utilization_pct,
     period_start, period_end, measured_by, measurement_method)
  values
    (p_tenant_id, v_quota_id, p_measured_value, v_limit,
     case when v_limit = 0 then 0
          else round((p_measured_value::numeric / v_limit::numeric) * 100, 2)
     end,
     p_period_start, p_period_end, p_measured_by, p_method);

  -- 2. Update current_value with optimistic version bump
  update core.tenant_resource_quota
  set current_value = p_measured_value,
      last_measured_at = now(),
      measured_by = p_measured_by,
      version = v_version + 1,
      updated_at = now(),
      updated_by = p_measured_by
  where id = v_quota_id and version = v_version;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$ language plpgsql;

comment on function core.record_quota_usage is
'Atomically records quota measurement with optimistic locking. '
'Inserts snapshot row + updates current_value. Returns false on version conflict.';


-- ============================================================================
-- FUNCTION: core.check_quota()
-- Fast quota enforcement check. Returns enforcement decision without mutation.
-- Called by middleware/interceptors on each request for HARD quotas.
-- ============================================================================
create or replace function core.check_quota(
  p_tenant_id   uuid,
  p_quota_key   text,
  p_increment   bigint default 1
) returns table (
  allowed        boolean,
  current_value  bigint,
  limit_value    bigint,
  remaining      bigint,
  enforcement    text,
  overage_action text
) as $$
begin
  return query
  select
    case
      when q.enforcement = 'ADVISORY' then true
      when q.enforcement = 'SOFT' and (q.current_value + p_increment) <= (q.limit_value * 1.1)::bigint then true
      when (q.current_value + p_increment) <= q.limit_value then true
      else false
    end as allowed,
    q.current_value,
    q.limit_value,
    greatest(q.limit_value - q.current_value, 0) as remaining,
    q.enforcement,
    q.overage_action
  from core.tenant_resource_quota q
  where q.tenant_id = p_tenant_id
    and q.quota_key = p_quota_key
    and q.is_active = true
    and (q.effective_until is null or q.effective_until > now());
end;
$$ language plpgsql stable;

comment on function core.check_quota is
'Fast quota enforcement check. SOFT allows 10%% overage. ADVISORY always allows.';


-- ============================================================================
-- VIEW: Tenant quota utilization (for dashboards / alerting)
-- ============================================================================
create or replace view core.tenant_quota_utilization as
  select
    q.id,
    q.tenant_id,
    t.code as tenant_code,
    t.name as tenant_name,
    t.subscription,
    q.quota_key,
    q.quota_name,
    q.category,
    q.limit_value,
    q.limit_unit,
    q.current_value,
    q.warning_pct,
    case
      when q.limit_value = 0 then 0
      else round((q.current_value::numeric / q.limit_value::numeric) * 100, 2)
    end as utilization_pct,
    case
      when q.limit_value = 0 then 'OK'
      when (q.current_value::numeric / q.limit_value::numeric) * 100 >= 100 then 'EXCEEDED'
      when (q.current_value::numeric / q.limit_value::numeric) * 100 >= q.warning_pct then 'WARNING'
      else 'OK'
    end as status,
    q.enforcement,
    q.overage_action,
    q.last_measured_at,
    q.measured_by,
    q.version,
    q.is_active
  from core.tenant_resource_quota q
  join core.tenant t on q.tenant_id = t.id
  where q.is_active = true;

comment on view core.tenant_quota_utilization is
'Denormalized view of tenant resource utilization for dashboards and alerting.';
