/* ============================================================================
   Athyper — WF Schema
   Lifecycle: Definitions, Versions, Instances, Transitions
   Approval: Definitions, Instances, Tasks, Comments
   Timers: Lifecycle Timer Schedules

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- WF: Lifecycle Definition (state machine template)
-- ============================================================================
create table if not exists wf.lifecycle (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  description  text,
  entity_type  text not null,

  definition   jsonb not null default '{"states": [], "transitions": []}',

  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  created_by   text not null,
  updated_at   timestamptz,
  updated_by   text,

  constraint lifecycle_tenant_code_uniq unique (tenant_id, code)
);

comment on table wf.lifecycle is 'State machine definitions (ordered state → transition rules).';

create index if not exists idx_lifecycle_tenant
  on wf.lifecycle (tenant_id);

create index if not exists idx_lifecycle_entity_type
  on wf.lifecycle (tenant_id, entity_type);

-- ============================================================================
-- WF: Lifecycle Version (immutable version of lifecycle)
-- ============================================================================
create table if not exists wf.lifecycle_version (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  lifecycle_id uuid not null references wf.lifecycle(id) on delete cascade,

  version      int not null,
  definition   jsonb not null,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint lifecycle_version_lc_ver_uniq unique (lifecycle_id, version)
);

comment on table wf.lifecycle_version is 'Immutable lifecycle definition snapshots (audit trail).';

create index if not exists idx_lifecycle_version_lifecycle
  on wf.lifecycle_version (lifecycle_id, version desc);

-- ============================================================================
-- WF: Workflow Instance (runtime execution of state machine)
-- ============================================================================
create table if not exists wf.workflow_instance (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  entity_type        text not null,
  entity_id          uuid not null,
  entity_version_id  uuid,

  lifecycle_id       uuid not null references wf.lifecycle(id) on delete restrict,
  lifecycle_version_id uuid not null references wf.lifecycle_version(id) on delete restrict,

  current_state      text not null,
  previous_state     text,

  status             text not null default 'active',

  data               jsonb,
  context            jsonb,

  initiated_by       uuid references core.principal(id) on delete set null,
  initiated_at       timestamptz not null default now(),

  completed_by       uuid references core.principal(id) on delete set null,
  completed_at       timestamptz,

  created_at         timestamptz not null default now(),
  created_by         text not null,
  updated_at         timestamptz,
  updated_by         text,

  constraint workflow_instance_entity_uniq unique (tenant_id, entity_type, entity_id),
  constraint workflow_instance_status_chk check (status in ('active','paused','completed','failed','canceled'))
);

comment on table wf.workflow_instance is 'Runtime execution of lifecycle state machines per entity.';

create index if not exists idx_workflow_instance_tenant_status
  on wf.workflow_instance (tenant_id, status);

create index if not exists idx_workflow_instance_entity
  on wf.workflow_instance (tenant_id, entity_type, entity_id);

create index if not exists idx_workflow_instance_current_state
  on wf.workflow_instance (tenant_id, current_state);

-- ============================================================================
-- WF: Workflow Transition Record (audit trail of state changes)
-- ============================================================================
create table if not exists wf.workflow_transition (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  workflow_instance_id uuid not null references wf.workflow_instance(id) on delete cascade,

  from_state         text not null,
  to_state           text not null,

  transition_name    text,
  transition_data    jsonb,

  triggered_by       uuid not null references core.principal(id) on delete set null,
  triggered_at       timestamptz not null default now(),

  created_at         timestamptz not null default now()
);

comment on table wf.workflow_transition is 'Append-only audit log of state transitions.';

create index if not exists idx_workflow_transition_instance
  on wf.workflow_transition (workflow_instance_id, triggered_at desc);

create index if not exists idx_workflow_transition_tenant_time
  on wf.workflow_transition (tenant_id, triggered_at desc);

-- ============================================================================
-- WF: Approval Definition (approval workflow template)
-- ============================================================================
create table if not exists wf.approval_definition (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  description  text,
  entity_type  text not null,

  rules        jsonb not null default '{"approvers": [], "conditions": []}',

  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  created_by   text not null,
  updated_at   timestamptz,
  updated_by   text,

  constraint approval_definition_tenant_code_uniq unique (tenant_id, code)
);

comment on table wf.approval_definition is 'Approval workflow rules (approvers, conditions, paths).';

create index if not exists idx_approval_definition_tenant
  on wf.approval_definition (tenant_id);

create index if not exists idx_approval_definition_entity_type
  on wf.approval_definition (tenant_id, entity_type);

-- ============================================================================
-- WF: Approval Instance (runtime approval session)
-- ============================================================================
create table if not exists wf.approval_instance (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  approval_definition_id uuid not null references wf.approval_definition(id) on delete restrict,

  entity_type        text not null,
  entity_id          uuid not null,
  entity_version_id  uuid,
  entity_snapshot    jsonb,

  status             text not null default 'pending',
  decision           text,

  requested_by       uuid not null references core.principal(id) on delete set null,
  requested_at       timestamptz not null default now(),

  decided_by         uuid references core.principal(id) on delete set null,
  decided_at         timestamptz,

  reason             text,
  metadata           jsonb,

  created_at         timestamptz not null default now(),
  created_by         text not null,
  updated_at         timestamptz,
  updated_by         text,

  constraint approval_instance_status_chk check (status in ('pending','approved','rejected','escalated','canceled')),
  constraint approval_instance_decision_chk check (decision is null or decision in ('approve','reject','escalate'))
);

comment on table wf.approval_instance is 'Runtime approval request (single decision point).';

create index if not exists idx_approval_instance_status
  on wf.approval_instance (tenant_id, status);

create index if not exists idx_approval_instance_entity
  on wf.approval_instance (tenant_id, entity_type, entity_id);

create index if not exists idx_approval_instance_requested_by
  on wf.approval_instance (requested_by, requested_at desc);

-- ============================================================================
-- WF: Approval Task (individual approver action item)
-- ============================================================================
create table if not exists wf.approval_task (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id uuid not null references wf.approval_instance(id) on delete cascade,

  approver_id        uuid not null references core.principal(id) on delete cascade,

  order_index        int not null,
  status             text not null default 'pending',

  assigned_at        timestamptz not null default now(),
  started_at         timestamptz,
  completed_at       timestamptz,

  decision           text,
  reason             text,
  metadata           jsonb,

  created_at         timestamptz not null default now(),
  created_by         text not null,
  updated_at         timestamptz,
  updated_by         text,

  constraint approval_task_status_chk check (status in ('pending','assigned','in_progress','approved','rejected','skipped','escalated')),
  constraint approval_task_decision_chk check (decision is null or decision in ('approve','reject','escalate'))
);

comment on table wf.approval_task is 'Individual approval task assigned to one approver.';

create index if not exists idx_approval_task_instance
  on wf.approval_task (approval_instance_id, order_index);

create index if not exists idx_approval_task_approver
  on wf.approval_task (approver_id, status);

create index if not exists idx_approval_task_status
  on wf.approval_task (tenant_id, status);

-- ============================================================================
-- WF: Approval Comment (audit trail of approval discussion)
-- ============================================================================
create table if not exists wf.approval_comment (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id uuid not null references wf.approval_instance(id) on delete cascade,
  approval_task_id    uuid references wf.approval_task(id) on delete set null,

  commenter_id       uuid not null references core.principal(id) on delete set null,
  comment_text       text not null,

  created_at         timestamptz not null default now(),
  created_by         text not null
);

comment on table wf.approval_comment is 'Comments/discussion on an approval request.';

create index if not exists idx_approval_comment_instance
  on wf.approval_comment (approval_instance_id, created_at asc);

create index if not exists idx_approval_comment_commenter
  on wf.approval_comment (commenter_id, created_at desc);

-- ============================================================================
-- WF: Approval Stage (runtime stage within an approval instance)
-- ============================================================================
create table if not exists wf.approval_stage (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id uuid not null references wf.approval_instance(id) on delete cascade,

  stage_no             int not null,
  name                 text,
  mode                 text not null default 'serial',
  quorum               jsonb,
  status               text not null default 'pending',

  started_at           timestamptz,
  completed_at         timestamptz,

  created_at           timestamptz not null default now(),
  created_by           text not null,

  constraint approval_stage_mode_chk check (mode in ('serial','parallel')),
  constraint approval_stage_status_chk check (status in ('pending','active','completed','skipped','canceled')),
  constraint approval_stage_instance_order_uniq unique (approval_instance_id, stage_no)
);

comment on table wf.approval_stage is 'Runtime stage within an approval instance (serial or parallel mode with quorum).';

create index if not exists idx_approval_stage_instance
  on wf.approval_stage (approval_instance_id, stage_no);

-- ============================================================================
-- WF: Approval Assignment Snapshot
-- ============================================================================
create table if not exists wf.approval_assignment_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id  uuid not null references wf.approval_instance(id) on delete cascade,

  stage_id              uuid references wf.approval_stage(id) on delete cascade,
  assignee_principal_id uuid,
  assignee_group_id     uuid,
  resolution_strategy   text,
  resolved_at           timestamptz,
  snapshot_data         jsonb,

  created_at            timestamptz not null default now(),
  created_by            text not null
);

comment on table wf.approval_assignment_snapshot is 'Point-in-time snapshot of approver assignments for audit trail.';

create index if not exists idx_approval_assignment_instance
  on wf.approval_assignment_snapshot (approval_instance_id);

-- ============================================================================
-- WF: Approval Escalation
-- ============================================================================
create table if not exists wf.approval_escalation (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id  uuid not null references wf.approval_instance(id) on delete cascade,

  kind                  text not null default 'sla_breach',
  payload               jsonb,
  occurred_at           timestamptz not null default now(),

  created_at            timestamptz not null default now()
);

comment on table wf.approval_escalation is 'SLA escalation events recorded during approval processing.';

create index if not exists idx_approval_escalation_instance
  on wf.approval_escalation (approval_instance_id, occurred_at);

-- ============================================================================
-- WF: Approval Event (audit log of approval lifecycle events)
-- ============================================================================
create table if not exists wf.approval_event (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenant(id) on delete cascade,
  approval_instance_id  uuid not null references wf.approval_instance(id) on delete cascade,

  event_type            text not null,
  actor_id              text,
  payload               jsonb,

  created_at            timestamptz not null default now()
);

comment on table wf.approval_event is 'Append-only audit log of approval lifecycle events.';

create index if not exists idx_approval_event_instance
  on wf.approval_event (approval_instance_id, created_at);

create index if not exists idx_approval_event_type
  on wf.approval_event (tenant_id, event_type);

-- ============================================================================
-- WF: Approval Task — additional columns for stage binding and SLA
-- ============================================================================
alter table wf.approval_task add column if not exists approval_stage_id uuid references wf.approval_stage(id) on delete cascade;
alter table wf.approval_task add column if not exists assignee_principal_id uuid;
alter table wf.approval_task add column if not exists assignee_group_id uuid;
alter table wf.approval_task add column if not exists due_at timestamptz;

-- ============================================================================
-- WF: Lifecycle Timer Schedule
-- ============================================================================
-- Tracks active lifecycle timer jobs for auto-transitions and reminders.
-- Enables timer cancellation when manual transitions occur.
-- ============================================================================

create table if not exists wf.lifecycle_timer_schedule (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  -- Entity identification
  entity_name         text not null,
  entity_id           text not null,
  lifecycle_id        uuid not null references meta.lifecycle(id) on delete cascade,
  state_id            uuid not null references meta.lifecycle_state(id) on delete cascade,

  -- Timer configuration
  timer_type          text not null,  -- 'auto_close', 'auto_cancel', 'reminder', 'auto_transition'
  transition_id       uuid references meta.lifecycle_transition(id) on delete cascade,

  -- Scheduling information
  scheduled_at        timestamptz not null default now(),
  fire_at             timestamptz not null,
  job_id              text not null,  -- BullMQ job ID for cancellation

  -- Policy snapshot (immutable - policy changes don't affect scheduled timers)
  policy_id           uuid references meta.lifecycle_timer_policy(id) on delete set null,
  policy_snapshot     jsonb not null,

  -- Status tracking
  status              text not null default 'scheduled',  -- 'scheduled', 'fired', 'canceled'

  -- Audit fields
  created_at          timestamptz not null default now(),
  created_by          text not null,

  -- Constraints
  constraint lifecycle_timer_schedule_status_chk
    check (status in ('scheduled','fired','canceled')),
  constraint lifecycle_timer_schedule_type_chk
    check (timer_type in ('auto_close','auto_cancel','reminder','auto_transition'))
);

comment on table wf.lifecycle_timer_schedule is
  'Active lifecycle timer jobs for auto-transitions and reminders. Enables timer cancellation and audit trail.';

comment on column wf.lifecycle_timer_schedule.policy_snapshot is
  'Immutable snapshot of timer policy rules at scheduling time. Policy changes do not affect already-scheduled timers.';

comment on column wf.lifecycle_timer_schedule.job_id is
  'BullMQ job ID for cancellation. Allows removing jobs from queue when entity transitions manually.';

-- Query timers by entity (for cancellation on manual transition)
create index if not exists idx_lifecycle_timer_schedule_entity
  on wf.lifecycle_timer_schedule (tenant_id, entity_name, entity_id);

-- Query timers by fire time (for rehydration and monitoring)
create index if not exists idx_lifecycle_timer_schedule_fire_at
  on wf.lifecycle_timer_schedule (tenant_id, status, fire_at);

-- Query by job ID (for job completion tracking)
create index if not exists idx_lifecycle_timer_schedule_job_id
  on wf.lifecycle_timer_schedule (job_id);

-- Query by state (for impact analysis)
create index if not exists idx_lifecycle_timer_schedule_state
  on wf.lifecycle_timer_schedule (tenant_id, state_id, status);
