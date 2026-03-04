/* ============================================================================
   Athyper — AUDIT Schema
   Logs: Audit Log, Permission Decision Log, Field Access Log
   Workflow Audit: Events (partitioned), Hash Anchors, DLQ
   Integrity: Reports, Archive Markers
   Security: Immutability Triggers, RLS, Roles, SECURITY DEFINER Functions

   PostgreSQL 16+
   ============================================================================ */


-- ############################################################################
-- SECTION 1: BASE TABLES
-- ############################################################################

-- ============================================================================
-- AUDIT: Audit Log (append-only platform audit)
-- Source: 020_core_foundation.sql
-- ============================================================================
create table if not exists audit.audit_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  occurred_at   timestamptz not null default now(),
  actor_id      uuid,
  actor_type    text not null,
  action        text not null,
  entity_name   text,
  entity_id     text,
  entity_version_id uuid,
  correlation_id text,
  ip_address    text,
  user_agent    text,
  payload       jsonb,

  constraint audit_actor_type_chk check (actor_type in ('user','service','system'))
);

comment on table audit.audit_log is 'Unified platform audit (append-only).';

create index if not exists idx_audit_log_tenant_time
  on audit.audit_log (tenant_id, occurred_at desc);


-- ============================================================================
-- AUDIT: Permission Decision Log (append-only access decisions)
-- Source: 020_core_foundation.sql
-- ============================================================================
create table if not exists audit.permission_decision_log (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  occurred_at       timestamptz not null default now(),

  actor_principal_id uuid,
  subject_snapshot  jsonb,

  entity_name       text,
  entity_id         text,
  entity_version_id uuid,

  operation_code    text not null,
  effect            text not null,
  matched_rule_id   uuid,
  matched_policy_version_id uuid,

  reason            text,
  correlation_id    text,

  constraint decision_effect_chk check (effect in ('allow','deny'))
);

comment on table audit.permission_decision_log is
'Append-only audit log for access decisions (allow/deny + matched rule/version).';

create index if not exists idx_decision_log_tenant_time
  on audit.permission_decision_log (tenant_id, occurred_at desc);


-- ============================================================================
-- AUDIT: Field Access Audit Log (append-only)
-- Source: 020_core_foundation.sql
-- ============================================================================
create table if not exists audit.field_access_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  entity_key      text not null,
  record_id       uuid,

  subject_id      uuid not null,
  subject_type    text not null,

  action          text not null,
  field_path      text not null,
  was_allowed     boolean not null,

  mask_applied    text,
  policy_id       uuid,

  request_id      text,
  trace_id        text,
  correlation_id  text,

  created_at      timestamptz not null default now(),

  constraint field_access_log_subject_type_chk
    check (subject_type in ('user', 'service', 'system')),
  constraint field_access_log_action_chk
    check (action in ('read', 'write'))
);

comment on table audit.field_access_log is
'Append-only audit log for field-level access decisions.';

create index if not exists idx_field_access_log_entity
  on audit.field_access_log (tenant_id, entity_key, created_at desc);

create index if not exists idx_field_access_log_subject
  on audit.field_access_log (tenant_id, subject_id, created_at desc);

create index if not exists idx_field_access_log_record
  on audit.field_access_log (record_id) where record_id is not null;

create index if not exists idx_field_access_log_policy
  on audit.field_access_log (policy_id) where policy_id is not null;

create index if not exists idx_field_access_log_denied
  on audit.field_access_log (tenant_id, created_at desc) where was_allowed = false;

create index if not exists idx_field_access_log_request
  on audit.field_access_log (request_id) where request_id is not null;


-- ============================================================================
-- AUDIT: Workflow Audit Event (partitioned by month on event_timestamp)
-- Sources: 150_workflow_audit.sql + 151_audit_partitioning.sql + 153_audit_encryption.sql
-- Merged: key_version column from 153
-- ============================================================================

-- Drop non-partitioned version if it exists (one-time migration to partitioned).
-- Guarded: only drops if the table is NOT already partitioned.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'audit' and c.relname = 'workflow_event_log'
      and c.relkind = 'r'  -- ordinary table, NOT 'p' (partitioned)
  ) then
    drop table audit.workflow_event_log cascade;
    raise notice 'Dropped non-partitioned audit.workflow_event_log for migration to partitioned.';
  end if;
end $$;

create table if not exists audit.workflow_event_log (
  id                       uuid not null default gen_random_uuid(),
  tenant_id                uuid not null,

  -- Event classification
  event_type               text not null,
  severity                 text not null default 'info',
  schema_version           int  not null default 1,

  -- Workflow instance references
  instance_id              text not null,
  step_instance_id         text,

  -- Entity info (denormalized for query perf + full JSONB)
  entity_type              text not null,
  entity_id                text not null,
  entity                   jsonb not null,

  -- Workflow info (denormalized + full JSONB)
  workflow                 jsonb not null,
  workflow_template_code   text,
  workflow_template_version int,

  -- Actor info (denormalized + full JSONB)
  actor                    jsonb not null,
  actor_user_id            text,
  actor_is_admin           boolean default false,

  -- Module origin
  module_code              text default 'WF',

  -- Action & state transition
  action                   text,
  previous_state           jsonb,
  new_state                jsonb,

  -- Human-readable
  comment                  text,
  attachments              jsonb,

  -- Freeform details
  details                  jsonb,

  -- Request context
  ip_address               text,
  user_agent               text,
  correlation_id           text,
  session_id               text,
  trace_id                 text,

  -- Tamper evidence (hash chain)
  hash_prev                text,
  hash_curr                text,

  -- PII redaction tracking
  is_redacted              boolean default false,
  redaction_version        int,

  -- Encryption key rotation tracking (NULL = plaintext)
  key_version              int,

  -- Timestamps
  event_timestamp          timestamptz not null default now(),
  created_at               timestamptz not null default now(),

  -- PK must include the partition key
  primary key (id, event_timestamp),

  constraint wf_audit_severity_chk   check (severity in ('info','warning','error','critical')),
  constraint wf_audit_module_chk     check (module_code in ('WF','META','CORE','AUTH','SEC'))
) partition by range (event_timestamp);

comment on table audit.workflow_event_log is
  'Partitioned workflow audit event log (monthly range on event_timestamp). Immutable after insert.';
comment on column audit.workflow_event_log.key_version is
  'Encryption key version used for ip_address, user_agent, comment, attachments columns. NULL = plaintext.';

-- FK: tenant_id references core.tenant
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wf_audit_tenant_fk'
      and table_schema = 'audit'
      and table_name = 'workflow_event_log'
  ) then
    alter table audit.workflow_event_log
      add constraint wf_audit_tenant_fk foreign key (tenant_id)
      references core.tenant(id) on delete cascade;
  end if;
end $$;

-- Create partitions for current + next 3 months
do $$
declare
  v_start date;
  v_end   date;
  v_name  text;
  v_month date := date_trunc('month', current_date);
begin
  for i in 0..3 loop
    v_start := v_month + (i || ' months')::interval;
    v_end   := v_month + ((i + 1) || ' months')::interval;
    v_name  := 'workflow_event_log_' || to_char(v_start, 'YYYY_MM');

    execute format(
      'create table if not exists audit.%I partition of audit.workflow_event_log
         for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
  end loop;
end;
$$;

-- Indexes on the partitioned parent (auto-created per partition by PostgreSQL)
create index if not exists idx_wf_audit_tenant_time
  on audit.workflow_event_log (tenant_id, event_timestamp desc);

create index if not exists idx_wf_audit_instance
  on audit.workflow_event_log (tenant_id, instance_id, event_timestamp asc);

create index if not exists idx_wf_audit_step
  on audit.workflow_event_log (tenant_id, step_instance_id)
  where step_instance_id is not null;

create index if not exists idx_wf_audit_correlation
  on audit.workflow_event_log (tenant_id, correlation_id)
  where correlation_id is not null;

create index if not exists idx_wf_audit_event_type
  on audit.workflow_event_log (tenant_id, event_type, event_timestamp desc);

create index if not exists idx_wf_audit_entity
  on audit.workflow_event_log (tenant_id, entity_type, entity_id);

create index if not exists idx_wf_audit_actor
  on audit.workflow_event_log (tenant_id, actor_user_id, event_timestamp desc);

create index if not exists idx_wf_audit_template
  on audit.workflow_event_log (tenant_id, workflow_template_code);

create index if not exists idx_wf_audit_details_gin
  on audit.workflow_event_log using gin (details)
  where details is not null;

-- Key rotation worker index (find rows with old key versions)
create index if not exists idx_audit_event_key_version
  on audit.workflow_event_log (tenant_id, key_version)
  where key_version is not null;

-- Replay dedup partial unique index (159)
create unique index if not exists idx_audit_event_dedup
  on audit.workflow_event_log (
    tenant_id,
    correlation_id,
    event_timestamp,
    event_type,
    actor_user_id
  )
  where correlation_id is not null;


-- ============================================================================
-- AUDIT: Audit Hash Anchor (daily tamper-evidence checkpoints)
-- Source: 150_workflow_audit.sql
-- ============================================================================
create table if not exists audit.hash_anchor (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  anchor_date   date not null,
  last_hash     text not null,
  event_count   int  not null,

  created_at    timestamptz not null default now(),

  constraint hash_anchor_uniq unique (tenant_id, anchor_date)
);

comment on table audit.hash_anchor is
  'Daily hash chain anchors for tamper-evidence verification.';

create index if not exists idx_hash_anchor_tenant
  on audit.hash_anchor (tenant_id, anchor_date desc);


-- ============================================================================
-- AUDIT: Dead-Letter Queue
-- Source: 152_dlq.sql
-- ============================================================================
create table if not exists audit.dlq (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  -- Link back to original outbox entry
  outbox_id        uuid not null,

  -- Event metadata
  event_type       text not null,
  payload          jsonb not null,

  -- Failure info
  last_error       text,
  error_category   text,
  attempt_count    int not null default 0,

  -- Lifecycle
  dead_at          timestamptz not null default now(),
  replayed_at      timestamptz,
  replayed_by      text,
  replay_count     int not null default 0,

  -- Correlation
  correlation_id   text,

  created_at       timestamptz not null default now()
);

comment on table audit.dlq is
  'Dead-letter queue for audit outbox items that exceeded max retry attempts.';

create index if not exists idx_dlq_unreplayed
  on audit.dlq (tenant_id, dead_at desc)
  where replayed_at is null;

create index if not exists idx_dlq_tenant
  on audit.dlq (tenant_id, created_at desc);

create index if not exists idx_dlq_correlation
  on audit.dlq (correlation_id)
  where correlation_id is not null;


-- ============================================================================
-- AUDIT: Integrity Report (persistent verification results)
-- Source: 158_integrity_report.sql
-- ============================================================================
create table if not exists audit.integrity_report (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,

  verification_type   text not null,
  start_date          timestamptz,
  end_date            timestamptz,

  -- Result
  status              text not null default 'pending',
  events_checked      int default 0,
  chain_valid         boolean,
  anchor_match        boolean,
  partitions_complete boolean,
  export_hash_valid   boolean,

  -- Failure details
  broken_at_event_id  text,
  broken_at_index     int,
  error_message       text,
  details             jsonb default '{}',

  -- Provenance
  initiated_by        text not null,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),

  constraint integrity_report_type_chk check (verification_type in ('range','export','full')),
  constraint integrity_report_status_chk check (status in ('pending','running','passed','failed','error'))
);

comment on table audit.integrity_report is
  'Persistent integrity verification reports for evidence-grade audit.';

create index if not exists idx_integrity_report_tenant_created
  on audit.integrity_report (tenant_id, created_at desc);

create index if not exists idx_integrity_report_tenant_status
  on audit.integrity_report (tenant_id, status, created_at desc);


-- ============================================================================
-- AUDIT: Archive Marker (storage tiering hot/warm/cold)
-- Source: 161_archive_marker.sql
-- ============================================================================
create table if not exists audit.archive_marker (
  id              uuid primary key default gen_random_uuid(),
  partition_name  text not null unique,
  partition_month date not null unique,
  ndjson_key      text not null,
  sha256          text not null,
  row_count       bigint not null default 0,
  archived_at     timestamptz not null default now(),
  archived_by     text not null,
  detached_at     timestamptz,
  created_at      timestamptz not null default now()
);

comment on table audit.archive_marker is
  'Tracks which partitions have been archived to object storage (cold tier).';

create index if not exists idx_archive_marker_month
  on audit.archive_marker (partition_month);


-- ############################################################################
-- SECTION 2: IMMUTABILITY TRIGGER FUNCTION + TRIGGERS
-- ############################################################################

-- ============================================================================
-- Immutability Guard: prevent UPDATE/DELETE on audit tables
-- Sources: 150_workflow_audit.sql + 154_audit_security_hardening.sql (tightened)
-- Role-based bypass: athyper_retention (DELETE), athyper_admin (UPDATE key_version)
-- ============================================================================
create or replace function audit.prevent_audit_mutation()
returns trigger as $$
declare
  v_bypass text;
  v_is_retention boolean;
  v_is_admin boolean;
begin
  v_bypass := current_setting('athyper.audit_retention_bypass', true);

  if v_bypass = 'true' then
    -- Check that the caller has the required role
    v_is_retention := pg_has_role(current_user, 'athyper_retention', 'MEMBER');
    v_is_admin := pg_has_role(current_user, 'athyper_admin', 'MEMBER');

    if tg_op = 'DELETE' and v_is_retention then
      return old;
    end if;

    if tg_op = 'UPDATE' and v_is_admin then
      -- Only allow UPDATE on encryption-related columns
      -- (key_version, ip_address, user_agent, comment, attachments)
      if tg_table_name = 'workflow_event_log' then
        if old.key_version is distinct from new.key_version then
          return new;
        end if;
      end if;
    end if;

    -- Bypass set but role/column check failed
    raise exception 'Audit mutation bypass requires appropriate role. op=%, user=%, table=%.%',
      tg_op, current_user, tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  raise exception 'Audit tables are immutable. % operations are not permitted on %.%',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
  return null;
end;
$$ language plpgsql;

comment on function audit.prevent_audit_mutation() is
  'Immutability guard for audit tables. Bypass requires athyper_retention (DELETE) or athyper_admin (UPDATE key_version) role + session variable.';

-- Attach immutability triggers to all audit tables
create or replace trigger trg_audit_log_immutable
  before update or delete on audit.audit_log
  for each row execute function audit.prevent_audit_mutation();

create or replace trigger trg_permission_decision_log_immutable
  before update or delete on audit.permission_decision_log
  for each row execute function audit.prevent_audit_mutation();

create or replace trigger trg_field_access_log_immutable
  before update or delete on audit.field_access_log
  for each row execute function audit.prevent_audit_mutation();

create or replace trigger trg_audit_immutable_workflow_audit
  before update or delete on audit.workflow_event_log
  for each row execute function audit.prevent_audit_mutation();

create or replace trigger trg_security_event_immutable
  before update or delete on sec.security_event
  for each row execute function audit.prevent_audit_mutation();


-- ############################################################################
-- SECTION 3: PARTITIONING LIFECYCLE FUNCTIONS
-- ############################################################################

-- ============================================================================
-- Auto-create next month partition (called monthly by pg_cron)
-- Source: 151_audit_partitioning.sql
-- ============================================================================
create or replace function audit.create_next_audit_partition()
returns void as $$
declare
  v_next_month date := date_trunc('month', current_date + interval '1 month');
  v_end        date := v_next_month + interval '1 month';
  v_name       text := 'workflow_event_log_' || to_char(v_next_month, 'YYYY_MM');
begin
  execute format(
    'create table if not exists audit.%I partition of audit.workflow_event_log
       for values from (%L) to (%L)',
    v_name, v_next_month, v_end
  );

  raise notice 'Created partition: audit.%', v_name;
end;
$$ language plpgsql;

comment on function audit.create_next_audit_partition()
  is 'Auto-create next month partition for workflow_event_log. Schedule via pg_cron on the 25th.';


-- ============================================================================
-- Drop old partition (retention via DDL, bypasses immutability trigger)
-- Source: 151_audit_partitioning.sql
-- ============================================================================
create or replace function audit.drop_audit_partition(p_year int, p_month int)
returns void as $$
declare
  v_name text := 'workflow_event_log_' || lpad(p_year::text, 4, '0') || '_' || lpad(p_month::text, 2, '0');
begin
  execute format('drop table if exists audit.%I', v_name);
  raise notice 'Dropped partition: audit.%', v_name;
end;
$$ language plpgsql;

comment on function audit.drop_audit_partition(int, int)
  is 'Drop a monthly audit partition. Use for retention — bypasses immutability trigger (DDL, not DML).';


-- ============================================================================
-- Create a partition for a specific month
-- Source: 155_audit_partition_functions.sql
-- ============================================================================
create or replace function audit.create_audit_partition_for_month(p_target date)
returns text as $$
declare
  v_start date := date_trunc('month', p_target);
  v_end   date := v_start + interval '1 month';
  v_name  text := 'workflow_event_log_' || to_char(v_start, 'YYYY_MM');
begin
  execute format(
    'create table if not exists audit.%I partition of audit.workflow_event_log
       for values from (%L) to (%L)',
    v_name, v_start, v_end
  );

  return v_name;
end;
$$ language plpgsql;

comment on function audit.create_audit_partition_for_month(date) is
  'Create a monthly partition for workflow_event_log. Returns partition name.';


-- ============================================================================
-- List all existing audit partitions
-- Source: 155_audit_partition_functions.sql
-- ============================================================================
create or replace function audit.list_audit_partitions()
returns table (
  partition_name text,
  range_start   text,
  range_end     text,
  row_count     bigint,
  size_bytes    bigint
) as $$
begin
  return query
  select
    c.relname::text as partition_name,
    pg_get_expr(c.relpartbound, c.oid, true) as range_start,
    ''::text as range_end,
    pg_stat_get_live_tuples(c.oid) as row_count,
    pg_relation_size(c.oid) as size_bytes
  from pg_inherits i
  join pg_class c on c.oid = i.inhrelid
  join pg_class p on p.oid = i.inhparent
  join pg_namespace n on n.oid = p.relnamespace
  where n.nspname = 'audit'
    and p.relname = 'workflow_event_log'
  order by c.relname;
end;
$$ language plpgsql;

comment on function audit.list_audit_partitions() is
  'List all partitions of workflow_event_log with row counts and sizes.';


-- ============================================================================
-- Check for missing indexes on a partition
-- Source: 155_audit_partition_functions.sql
-- ============================================================================
create or replace function audit.check_audit_partition_indexes(p_partition text)
returns table (
  expected_index text,
  exists_  boolean
) as $$
declare
  v_expected_prefixes text[] := array[
    'idx_wf_audit_tenant_time',
    'idx_wf_audit_instance',
    'idx_wf_audit_step',
    'idx_wf_audit_correlation',
    'idx_wf_audit_event_type',
    'idx_wf_audit_entity',
    'idx_wf_audit_actor',
    'idx_wf_audit_template',
    'idx_wf_audit_details_gin'
  ];
  v_prefix text;
begin
  foreach v_prefix in array v_expected_prefixes
  loop
    expected_index := v_prefix;
    select exists (
      select 1 from pg_indexes
      where schemaname = 'audit'
        and tablename = p_partition
        and indexname like v_prefix || '%'
    ) into exists_;
    return next;
  end loop;
end;
$$ language plpgsql;

comment on function audit.check_audit_partition_indexes(text) is
  'Check which expected indexes exist on a given audit partition.';


-- ############################################################################
-- SECTION 4: ROLES + PERMISSIONS + RLS
-- ############################################################################

-- ============================================================================
-- Dedicated DB Roles (NOLOGIN, used via SET ROLE)
-- Sources: 154_audit_security_hardening.sql + 157_audit_role_separation.sql
-- ============================================================================
do $$
begin
  if not exists (select from pg_roles where rolname = 'athyper_retention') then
    create role athyper_retention nologin;
    comment on role athyper_retention is 'Role for audit retention jobs. Allowed to DELETE old partitions/rows.';
  end if;

  if not exists (select from pg_roles where rolname = 'athyper_admin') then
    create role athyper_admin nologin;
    comment on role athyper_admin is 'Role for audit admin operations (key rotation, manual corrections).';
  end if;

  if not exists (select from pg_roles where rolname = 'athyper_app_writer') then
    create role athyper_app_writer nologin;
    comment on role athyper_app_writer is 'INSERT-only role for audit tables. Used by application code during event ingestion.';
  end if;

  if not exists (select from pg_roles where rolname = 'athyper_audit_reader') then
    create role athyper_audit_reader nologin;
    comment on role athyper_audit_reader is 'SELECT-only role for audit tables with RLS enforcement. Used by query services.';
  end if;

  if not exists (select from pg_roles where rolname = 'athyper_audit_admin') then
    create role athyper_audit_admin nologin;
    comment on role athyper_audit_admin is 'Integrity verification, export operations, and audit-of-audit on audit tables.';
  end if;
end;
$$;

-- ── athyper_retention: DELETE on audit tables ────────────────────────────────

grant delete on audit.workflow_event_log to athyper_retention;
grant delete on audit.audit_log to athyper_retention;
grant delete on audit.permission_decision_log to athyper_retention;
grant delete on audit.field_access_log to athyper_retention;
grant delete on sec.security_event to athyper_retention;

-- ── athyper_admin: UPDATE encryption-related columns ────────────────────────

grant update (key_version, ip_address, user_agent, comment, attachments)
  on audit.workflow_event_log to athyper_admin;

-- ── athyper_app_writer: INSERT-only for event ingestion ─────────────────────

grant insert on audit.workflow_event_log to athyper_app_writer;
grant insert on audit.hash_anchor to athyper_app_writer;
grant insert on audit.dlq to athyper_app_writer;
grant insert on sec.security_event to athyper_app_writer;

-- ── athyper_audit_reader: SELECT with RLS ───────────────────────────────────

grant select on audit.workflow_event_log to athyper_audit_reader;
grant select on audit.hash_anchor to athyper_audit_reader;
grant select on audit.dlq to athyper_audit_reader;
grant select on sec.security_event to athyper_audit_reader;
grant select on audit.permission_decision_log to athyper_audit_reader;
grant select on audit.field_access_log to athyper_audit_reader;
grant select on audit.audit_log to athyper_audit_reader;

-- ── athyper_audit_admin: SELECT + INSERT for integrity/export ───────────────

grant select on audit.workflow_event_log to athyper_audit_admin;
grant select on audit.hash_anchor to athyper_audit_admin;
grant select on audit.dlq to athyper_audit_admin;
grant select on sec.security_event to athyper_audit_admin;
grant insert on sec.security_event to athyper_audit_admin;
grant select on audit.permission_decision_log to athyper_audit_admin;
grant select on audit.field_access_log to athyper_audit_admin;
grant select on audit.audit_log to athyper_audit_admin;

-- Integrity report: athyper_audit_admin can read and create reports
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'athyper_audit_admin') then
    grant select, insert, update on audit.integrity_report to athyper_audit_admin;
  end if;
end $$;


-- ============================================================================
-- Row-Level Security: Tenant Isolation
-- Sources: 154_audit_security_hardening.sql + 158_integrity_report.sql
-- ============================================================================

-- Enable RLS on audit tables
alter table audit.workflow_event_log enable row level security;
alter table audit.hash_anchor enable row level security;
alter table audit.integrity_report enable row level security;

-- RLS on DLQ (if table exists — it does, created above)
alter table audit.dlq enable row level security;

-- Policies: tenant isolation based on session variable
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_event_log'
      and policyname = 'audit_event_tenant_isolation'
  ) then
    create policy audit_event_tenant_isolation on audit.workflow_event_log
      using (tenant_id = current_setting('athyper.current_tenant', true)::uuid)
      with check (tenant_id = current_setting('athyper.current_tenant', true)::uuid);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'hash_anchor'
      and policyname = 'audit_anchor_tenant_isolation'
  ) then
    create policy audit_anchor_tenant_isolation on audit.hash_anchor
      using (tenant_id = current_setting('athyper.current_tenant', true)::uuid)
      with check (tenant_id = current_setting('athyper.current_tenant', true)::uuid);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'dlq'
      and policyname = 'dlq_tenant_isolation'
  ) then
    create policy dlq_tenant_isolation on audit.dlq
      using (tenant_id = current_setting('athyper.current_tenant', true)::uuid)
      with check (tenant_id = current_setting('athyper.current_tenant', true)::uuid);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'integrity_report'
      and policyname = 'tenant_isolation_integrity_report'
  ) then
    create policy tenant_isolation_integrity_report
      on audit.integrity_report
      for all
      using (tenant_id::text = current_setting('athyper.current_tenant', true));
  end if;
end $$;

comment on policy audit_event_tenant_isolation on audit.workflow_event_log is
  'Tenant isolation: queries only return rows matching athyper.current_tenant session variable.';


-- ############################################################################
-- SECTION 5: SECURITY DEFINER FUNCTIONS
-- ############################################################################

-- ============================================================================
-- Key Rotation UPDATE (SECURITY DEFINER)
-- Source: 157_audit_role_separation.sql
-- Replaces: SET LOCAL bypass + direct UPDATE
-- ============================================================================
create or replace function audit.audit_key_rotation_update(
  p_tenant_id        uuid,
  p_row_id           uuid,
  p_event_timestamp  timestamptz,
  p_ip_address       text,
  p_user_agent       text,
  p_comment          text,
  p_attachments      text,
  p_key_version      int
)
returns void
security definer
set search_path = audit, pg_temp
language plpgsql
as $$
begin
  set local athyper.audit_retention_bypass = 'true';

  update audit.workflow_event_log
  set ip_address   = p_ip_address,
      user_agent   = p_user_agent,
      comment      = p_comment,
      attachments  = p_attachments,
      key_version  = p_key_version
  where id              = p_row_id
    and tenant_id       = p_tenant_id
    and event_timestamp = p_event_timestamp;
end;
$$;

-- Ownership: athyper_admin so the immutability trigger sees the correct role
do $$
begin
  if exists (select from pg_roles where rolname = 'athyper_admin') then
    alter function audit.audit_key_rotation_update(uuid, uuid, timestamptz, text, text, text, text, int)
      owner to athyper_admin;
  end if;
end;
$$;

revoke all on function audit.audit_key_rotation_update(uuid, uuid, timestamptz, text, text, text, text, int) from public;
grant execute on function audit.audit_key_rotation_update(uuid, uuid, timestamptz, text, text, text, text, int) to athyper_audit_admin;

comment on function audit.audit_key_rotation_update is
  'SECURITY DEFINER: Re-encrypt audit event columns during key rotation. Owned by athyper_admin to satisfy immutability trigger bypass.';


-- ============================================================================
-- Retention DELETE (SECURITY DEFINER)
-- Source: 157_audit_role_separation.sql
-- Replaces: SET LOCAL bypass + direct DELETE
-- ============================================================================
create or replace function audit.audit_retention_delete(
  p_table_name  text,
  p_cutoff_date timestamptz,
  p_tenant_id   uuid default null
)
returns bigint
security definer
set search_path = audit, pg_temp
language plpgsql
as $$
declare
  v_count   bigint;
  v_allowed text[] := array[
    'workflow_event_log',
    'audit_log',
    'permission_decision_log',
    'field_access_log',
    'security_event'
  ];
begin
  -- Validate table name against allowlist (prevents SQL injection)
  if not (p_table_name = any(v_allowed)) then
    raise exception 'audit_retention_delete: table "%" not in allowlist', p_table_name
      using errcode = 'restrict_violation';
  end if;

  set local athyper.audit_retention_bypass = 'true';

  if p_tenant_id is not null then
    execute format(
      'with deleted as (
         delete from audit.%I where created_at < $1 and tenant_id = $2 returning id
       ) select count(*) from deleted',
      p_table_name
    ) into v_count using p_cutoff_date, p_tenant_id;
  else
    execute format(
      'with deleted as (
         delete from audit.%I where created_at < $1 returning id
       ) select count(*) from deleted',
      p_table_name
    ) into v_count using p_cutoff_date;
  end if;

  return coalesce(v_count, 0);
end;
$$;

-- Ownership: athyper_retention so the immutability trigger sees the correct role
do $$
begin
  if exists (select from pg_roles where rolname = 'athyper_retention') then
    alter function audit.audit_retention_delete(text, timestamptz, uuid)
      owner to athyper_retention;
  end if;
end;
$$;

revoke all on function audit.audit_retention_delete(text, timestamptz, uuid) from public;
grant execute on function audit.audit_retention_delete(text, timestamptz, uuid) to athyper_retention;

comment on function audit.audit_retention_delete is
  'SECURITY DEFINER: Delete old audit rows for retention. Validates table name against allowlist. Owned by athyper_retention to satisfy immutability trigger bypass.';


-- ############################################################################
-- SECTION 6: TIMELINE COVERING INDEXES
-- Source: 156_timeline_indexes.sql
-- ############################################################################

-- security_event timeline covering index
create index if not exists idx_security_event_timeline
  on sec.security_event (tenant_id, occurred_at desc)
  include (event_type, severity, principal_id, details);

-- permission_decision_log timeline covering index
create index if not exists idx_permission_decision_timeline
  on audit.permission_decision_log (tenant_id, occurred_at desc)
  include (effect, operation_code, actor_principal_id, entity_name, entity_id, reason);

create index if not exists idx_permission_decision_entity_timeline
  on audit.permission_decision_log (tenant_id, entity_name, entity_id, occurred_at desc);

-- field_access_log timeline covering index
create index if not exists idx_field_access_timeline
  on audit.field_access_log (tenant_id, created_at desc)
  include (action, field_path, was_allowed, subject_id, entity_key, record_id);

create index if not exists idx_field_access_entity_timeline
  on audit.field_access_log (tenant_id, entity_key, record_id, created_at desc);

-- audit_log timeline covering index
create index if not exists idx_audit_log_timeline
  on audit.audit_log (tenant_id, occurred_at desc)
  include (action, entity_name, entity_id, actor_id, payload);

create index if not exists idx_audit_log_entity_timeline
  on audit.audit_log (tenant_id, entity_name, entity_id, occurred_at desc);

-- workflow_event_log timeline covering index
create index if not exists idx_wf_audit_timeline
  on audit.workflow_event_log (tenant_id, event_timestamp desc)
  include (event_type, severity, entity_type, entity_id, actor_user_id, comment, details);

-- ============================================================================
-- Deferred FK: audit.field_access_log -> meta.field_security_policy
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fal_policy_fk') then
    alter table audit.field_access_log
      add constraint fal_policy_fk
      foreign key (policy_id) references meta.field_security_policy(id) on delete set null;
  end if;
end $$;
