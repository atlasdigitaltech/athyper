-- ============================================================================
-- Finance: Period Close Governance — Phase 3
-- Schema extensions for waiver approval, task ownership, activity timeline,
-- and handler execution observability.
--
-- Prerequisites: 191_period_close_governance.sql (Phase 1+2 tables)
-- Architecture alignment:
--   - Approval via wf.approval_instance (entity_type = 'fin_period_close_waiver')
--   - Notifications via platform notify.* infrastructure (TOKENS.notificationOrchestrator)
--   - Reminders via BullMQ scheduler (TOKENS.scheduler), not DB polling
--   - Audit compliance via audit.workflow_event_log + AuditWriter
-- ============================================================================

-- ============================================================================
-- 1. Extend fin.period_close_task — ownership + SLA policy defaults
-- ============================================================================

-- Default ownership: role/user assigned on materialization
alter table fin.period_close_task
  add column if not exists default_owner_role    text,
  add column if not exists default_owner_user_id uuid references core.principal(id) on delete set null,
  add column if not exists sla_hours             integer,
  add column if not exists severity              text,
  add column if not exists reminder_lead_hours   integer;

comment on column fin.period_close_task.default_owner_role    is 'Role code auto-assigned to checklist items on materialization';
comment on column fin.period_close_task.default_owner_user_id is 'Principal auto-assigned to checklist items on materialization';
comment on column fin.period_close_task.sla_hours             is 'Expected completion window in hours from materialization';
comment on column fin.period_close_task.severity              is 'Task severity for prioritization: low | medium | high | critical';
comment on column fin.period_close_task.reminder_lead_hours   is 'Hours before SLA breach to send first reminder';

-- Severity CHECK
do $$ begin
  alter table fin.period_close_task
    add constraint chk_task_severity
    check (severity is null or severity in ('low', 'medium', 'high', 'critical'));
exception when duplicate_object then null;
end $$;

-- SLA positive CHECK
do $$ begin
  alter table fin.period_close_task
    add constraint chk_task_sla_positive
    check (sla_hours is null or sla_hours > 0);
exception when duplicate_object then null;
end $$;

-- Reminder lead positive CHECK
do $$ begin
  alter table fin.period_close_task
    add constraint chk_task_reminder_lead_positive
    check (reminder_lead_hours is null or reminder_lead_hours > 0);
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- 2. Extend fin.period_close_checklist — assignment, waiver approval, handler
-- ============================================================================

-- 2a. Task ownership / assignment
alter table fin.period_close_checklist
  add column if not exists assigned_role     text,
  add column if not exists assigned_user_id  uuid references core.principal(id) on delete set null,
  add column if not exists assigned_group_id uuid references core.principal(id) on delete set null,
  add column if not exists due_at            timestamptz;

comment on column fin.period_close_checklist.assigned_role     is 'Role code of the assigned owner';
comment on column fin.period_close_checklist.assigned_user_id  is 'Principal assigned as task owner';
comment on column fin.period_close_checklist.assigned_group_id is 'Principal group assigned as task owner';
comment on column fin.period_close_checklist.due_at            is 'SLA deadline computed from materialization + sla_hours';

-- 2b. Waiver approval integration
alter table fin.period_close_checklist
  add column if not exists waiver_status               text,
  add column if not exists waiver_request_submitted_at  timestamptz,
  add column if not exists waiver_request_submitted_by  text,
  add column if not exists waiver_decision_at           timestamptz,
  add column if not exists waiver_decision_by           text,
  add column if not exists approval_instance_id         uuid;

comment on column fin.period_close_checklist.waiver_status               is 'Waiver approval state: not_required | not_requested | pending_approval | approved | rejected';
comment on column fin.period_close_checklist.waiver_request_submitted_at is 'When the waiver request was submitted';
comment on column fin.period_close_checklist.waiver_request_submitted_by is 'Who submitted the waiver request';
comment on column fin.period_close_checklist.waiver_decision_at          is 'When the waiver decision was made (approved/rejected)';
comment on column fin.period_close_checklist.waiver_decision_by          is 'Who made the waiver decision';
comment on column fin.period_close_checklist.approval_instance_id        is 'FK to wf.approval_instance for approval-backed waivers';

-- Waiver status CHECK
do $$ begin
  alter table fin.period_close_checklist
    add constraint chk_waiver_status
    check (waiver_status is null or waiver_status in (
      'not_required', 'not_requested', 'pending_approval', 'approved', 'rejected'
    ));
exception when duplicate_object then null;
end $$;

-- Consistency: if WAIVED and task requires approval, waiver_status must be 'approved'
-- (enforced at application layer — CHECK would need cross-table join)

-- 2c. Handler execution observability
alter table fin.period_close_checklist
  add column if not exists last_handler_run_at  timestamptz,
  add column if not exists last_handler_result  jsonb,
  add column if not exists handler_run_count    integer not null default 0;

comment on column fin.period_close_checklist.last_handler_run_at  is 'When the system handler was last executed';
comment on column fin.period_close_checklist.last_handler_result  is 'Structured result of the last handler execution';
comment on column fin.period_close_checklist.handler_run_count    is 'Number of times the handler has been executed';

-- 2d. Reminder / escalation markers (for BullMQ job scheduling, not DB polling)
alter table fin.period_close_checklist
  add column if not exists escalated_at     timestamptz,
  add column if not exists escalated_to     text;

comment on column fin.period_close_checklist.escalated_at is 'When this task was escalated due to SLA breach';
comment on column fin.period_close_checklist.escalated_to is 'Who/role the escalation was sent to';

-- ============================================================================
-- 3. Indexes for Phase 3 queries
-- ============================================================================

-- Assignment lookups
create index if not exists idx_close_checklist_assigned_user
  on fin.period_close_checklist (tenant_id, assigned_user_id)
  where assigned_user_id is not null;

create index if not exists idx_close_checklist_assigned_role
  on fin.period_close_checklist (tenant_id, assigned_role)
  where assigned_role is not null;

-- SLA / due date queries
create index if not exists idx_close_checklist_due_at
  on fin.period_close_checklist (tenant_id, due_at)
  where due_at is not null and task_status not in ('COMPLETED', 'WAIVED');

-- Waiver approval status
create index if not exists idx_close_checklist_waiver_status
  on fin.period_close_checklist (tenant_id, waiver_status)
  where waiver_status = 'pending_approval';

-- Approval instance linkage
create index if not exists idx_close_checklist_approval_instance
  on fin.period_close_checklist (approval_instance_id)
  where approval_instance_id is not null;

-- ============================================================================
-- 4. fin.period_close_activity — append-only timeline / read model
-- ============================================================================
-- This is the close dashboard's timeline feed. It complements (does NOT replace)
-- the platform audit.workflow_event_log which provides tamper-evidence.
-- Both are written to: activity for fast domain reads, audit for compliance.
-- ============================================================================
create table if not exists fin.period_close_activity (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,
  entity_code      varchar(20) not null,
  fiscal_year      smallint not null,
  period_number    smallint not null,

  -- Link to specific checklist item (null for period-level events)
  checklist_id     uuid references fin.period_close_checklist(id) on delete set null,
  task_code        varchar(50),

  -- Event classification
  activity_type    text not null,
  actor_type       text not null default 'user',
  actor_id         text,

  -- Human-readable summary
  message          text not null,

  -- Structured payload (handler results, waiver details, gate denial, etc.)
  payload          jsonb,

  created_at       timestamptz not null default now(),

  constraint chk_activity_type check (activity_type in (
    'TASK_COMPLETED', 'TASK_FAILED', 'TASK_BLOCKED', 'TASK_UNBLOCKED',
    'TASK_ASSIGNED', 'TASK_REASSIGNED',
    'WAIVER_REQUESTED', 'WAIVER_APPROVED', 'WAIVER_REJECTED',
    'HANDLER_EXECUTED', 'HANDLER_FAILED',
    'REMINDER_SENT', 'ESCALATED',
    'TRANSITION_ATTEMPTED', 'TRANSITION_DENIED', 'TRANSITION_SUCCEEDED',
    'CHECKLIST_MATERIALIZED'
  )),
  constraint chk_actor_type check (actor_type in (
    'user', 'system', 'approval_engine', 'scheduler'
  ))
);

comment on table fin.period_close_activity is 'Append-only timeline for period close governance. Read model for close dashboard; audit.workflow_event_log provides compliance trail.';

-- Append-only: prevent UPDATE/DELETE (soft enforcement via trigger)
create or replace function fin.period_close_activity_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'fin.period_close_activity is append-only — UPDATE/DELETE prohibited';
end;
$$;

drop trigger if exists trg_close_activity_immutable on fin.period_close_activity;
create trigger trg_close_activity_immutable
  before update or delete on fin.period_close_activity
  for each row execute function fin.period_close_activity_immutable();

-- Timeline queries
create index if not exists idx_close_activity_period
  on fin.period_close_activity (tenant_id, entity_code, fiscal_year, period_number, created_at desc);

create index if not exists idx_close_activity_checklist
  on fin.period_close_activity (checklist_id, created_at desc)
  where checklist_id is not null;

create index if not exists idx_close_activity_type
  on fin.period_close_activity (tenant_id, activity_type, created_at desc);

-- ============================================================================
-- 5. Update materialization function to populate Phase 3 defaults
-- ============================================================================
-- Replace the Phase 1 function to also set assignment and SLA defaults.
-- ============================================================================
create or replace function fin.materialize_close_checklist(
    p_tenant_id   uuid,
    p_entity_code varchar(20),
    p_fiscal_year smallint,
    p_period_num  smallint,
    p_blueprint   varchar(5) default null
) returns integer language plpgsql as $$
declare
    v_count integer := 0;
begin
    insert into fin.period_close_checklist (
        tenant_id, entity_code, fiscal_year, period_number,
        task_id, task_code, is_mandatory,
        assigned_role, assigned_user_id,
        waiver_status,
        due_at
    )
    select
        p_tenant_id, p_entity_code, p_fiscal_year, p_period_num,
        t.id, t.task_code, t.is_mandatory,
        t.default_owner_role,
        t.default_owner_user_id,
        case
            when t.is_waivable and t.waiver_requires_approval then 'not_requested'
            when t.is_waivable                                then 'not_required'
            else null
        end,
        case
            when t.sla_hours is not null then now() + (t.sla_hours || ' hours')::interval
            else null
        end
    from fin.period_close_task t
    where t.tenant_id   = p_tenant_id
      and t.entity_code = p_entity_code
      and t.is_active   = true
      and (t.blueprint_filter is null
           or p_blueprint = any(t.blueprint_filter))
    on conflict (tenant_id, entity_code, fiscal_year, period_number, task_code)
    do nothing;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

comment on function fin.materialize_close_checklist is 'Populate checklist from task catalogue with Phase 3 defaults (assignment, SLA, waiver status). Idempotent via ON CONFLICT DO NOTHING.';
