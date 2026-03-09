/* ============================================================================
   Athyper v2.3 — Period Close Governance
   Schema: fin
   Dependencies: 190_posting.sql (fin.fiscal_period)

   Implements an orchestrated financial close process with:
   - Master task catalogue (fin.period_close_task)
   - Per-period checklist instances (fin.period_close_checklist)
   - Transition gating: period cannot advance past a gate until all
     mandatory checklist items for that gate are completed/waived
   - Waiver governance with approval tracking
   - Evidence capture for audit compliance
   - Manual / system / hybrid completion modes
   ============================================================================ */

-- ============================================================================
-- fin.period_close_task — Master catalogue of close tasks
-- ============================================================================
-- Template definitions: one row per task per (tenant, entity_code).
-- Blueprints filter which tasks appear for each tenant tier.
-- Each task declares which period transition it gates, whether it is
-- mandatory, waivable, and how it gets completed (manual/system/hybrid).
--
-- Materialization: When a period transitions to OPEN, the runtime calls
-- fin.materialize_close_checklist() to stamp one checklist row per active
-- task. This gives the ops team visibility into the full close plan early.
-- ============================================================================
create table if not exists fin.period_close_task (
    id                       uuid primary key default gen_random_uuid(),
    tenant_id                uuid not null references core.tenant(id),
    entity_code              varchar(20) not null,

    -- Identity
    task_code                varchar(50) not null,
    task_name                varchar(150) not null,
    description              text,
    category                 varchar(30) not null
                             check (category in (
                                 'SUBLEDGER', 'CONSOLIDATION', 'VALIDATION',
                                 'TAX', 'CASH', 'REVENUE', 'ADJUSTMENTS', 'APPROVAL'
                             )),

    -- Gate: which period transition this task must be done before
    required_before          varchar(20) not null default 'SOFT_CLOSE'
                             check (required_before in ('SOFT_CLOSE', 'HARD_CLOSE')),

    -- Ordering within the close sequence
    sort_order               smallint not null default 0,

    -- Mandatory / waiver governance
    is_mandatory             boolean not null default true,
    is_waivable              boolean not null default false,
    waiver_requires_approval boolean not null default true,
    waiver_reason_required   boolean not null default true,

    -- Completion mode
    completion_mode          varchar(10) not null default 'MANUAL'
                             check (completion_mode in ('MANUAL', 'SYSTEM', 'HYBRID')),
    -- Handler identifier for SYSTEM/HYBRID tasks (dispatched by runtime)
    system_check_handler     varchar(100),

    -- Blueprint filtering: which tenant tiers include this task (null = all)
    blueprint_filter         varchar(5)[] default null,

    is_active                boolean not null default true,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),

    constraint uq_fin_close_task unique (tenant_id, entity_code, task_code),
    -- SYSTEM/HYBRID tasks must declare a handler
    constraint chk_system_handler check (
        completion_mode = 'MANUAL' or system_check_handler is not null
    )
);

create index if not exists idx_fin_close_task_tenant
    on fin.period_close_task(tenant_id, entity_code);
create index if not exists idx_fin_close_task_gate
    on fin.period_close_task(required_before) where is_active = true;

-- ============================================================================
-- fin.period_close_checklist — Per-period instance of close tasks
-- ============================================================================
-- Materialized from the task catalogue when a period transitions to OPEN.
-- Tracks completion status, evidence, waiver governance, and assignment.
--
-- Status semantics:
--   PENDING      — Task not yet started
--   IN_PROGRESS  — Work underway (manual attestation or system check running)
--   COMPLETED    — Task executed and passed; evidence captured
--   WAIVED       — Intentionally bypassed with governance (reason + optional approval)
--   FAILED       — Task executed/validated and did NOT pass (e.g., trial balance
--                   imbalanced, recon mismatch). Requires retry or investigation.
--   BLOCKED      — Cannot proceed because a prerequisite or upstream dependency
--                   is missing (e.g., depreciation blocked until asset master updated).
--                   Differs from FAILED: the task was never attempted.
-- ============================================================================
create table if not exists fin.period_close_checklist (
    id                       uuid primary key default gen_random_uuid(),
    tenant_id                uuid not null references core.tenant(id),
    entity_code              varchar(20) not null,
    fiscal_year              smallint not null,
    period_number            smallint not null,

    -- Task reference
    task_id                  uuid not null references fin.period_close_task(id),
    task_code                varchar(50) not null,

    -- Status lifecycle: PENDING → IN_PROGRESS → COMPLETED | WAIVED | FAILED | BLOCKED
    task_status              varchar(20) not null default 'PENDING'
                             check (task_status in (
                                 'PENDING', 'IN_PROGRESS', 'COMPLETED',
                                 'WAIVED', 'BLOCKED', 'FAILED'
                             )),
    is_mandatory             boolean not null default true,

    -- Assignment
    assigned_to              uuid,

    -- Completion tracking
    completed_by             uuid,
    completed_at             timestamptz,
    completion_notes         text,

    -- Evidence / audit payload
    evidence_payload         jsonb default '{}'::jsonb,

    -- Waiver governance
    waived_by                uuid,
    waived_at                timestamptz,
    waiver_reason            text,
    waiver_approval_ref      varchar(255),

    -- Failure tracking
    failure_reason           text,
    failed_at                timestamptz,

    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),

    -- FK to fiscal period (composite)
    constraint fk_fin_checklist_period
        foreign key (tenant_id, entity_code, fiscal_year, period_number)
        references fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    constraint uq_fin_close_checklist
        unique (tenant_id, entity_code, fiscal_year, period_number, task_code),

    -- Waived items must have waived_by, waived_at, and waiver_reason
    constraint chk_waiver check (
        task_status != 'WAIVED'
        or (waived_by is not null and waived_at is not null and waiver_reason is not null)
    ),

    -- Waiver fields must NOT be populated unless status is WAIVED
    constraint chk_waiver_fields_clean check (
        task_status = 'WAIVED' or waived_by is null
    ),

    -- Completed items must have completed_by and completed_at
    constraint chk_completion check (
        task_status != 'COMPLETED'
        or (completed_by is not null and completed_at is not null)
    ),

    -- Completion fields must NOT be populated unless status is COMPLETED
    constraint chk_completion_fields_clean check (
        task_status = 'COMPLETED' or completed_by is null
    ),

    -- Failed items must have failure_reason and failed_at
    constraint chk_failure check (
        task_status != 'FAILED'
        or (failure_reason is not null and failed_at is not null)
    ),

    -- Failure fields must NOT be populated unless status is FAILED
    constraint chk_failure_fields_clean check (
        task_status = 'FAILED' or failure_reason is null
    )
);

create index if not exists idx_fin_checklist_period
    on fin.period_close_checklist(tenant_id, entity_code, fiscal_year, period_number);
create index if not exists idx_fin_checklist_status
    on fin.period_close_checklist(task_status);
create index if not exists idx_fin_checklist_assigned
    on fin.period_close_checklist(assigned_to) where assigned_to is not null;

-- Table-level comments
comment on table fin.period_close_task is
    'Master catalogue of close tasks per (tenant, entity_code). Template rows that get materialized into fin.period_close_checklist when a period opens.';
comment on table fin.period_close_checklist is
    'Per-period instance of close tasks. Materialized from fin.period_close_task on period OPEN transition. Gates SOFT_CLOSE and HARD_CLOSE transitions.';

-- Key column comments
comment on column fin.period_close_task.required_before is
    'Which period transition this task gates. Task must be COMPLETED or WAIVED before the period can advance to this status.';
comment on column fin.period_close_task.completion_mode is
    'MANUAL = user-attested, SYSTEM = auto-validated by system_check_handler, HYBRID = system-assisted + user-confirmed.';
comment on column fin.period_close_task.system_check_handler is
    'Handler identifier dispatched by runtime for SYSTEM/HYBRID tasks (e.g., close.trial_balance_validation).';
comment on column fin.period_close_checklist.task_status is
    'PENDING = not started, IN_PROGRESS = underway, COMPLETED = passed, WAIVED = intentionally bypassed, FAILED = executed and did not pass, BLOCKED = upstream dependency missing.';
comment on column fin.period_close_checklist.evidence_payload is
    'JSONB for structured audit evidence: batch IDs, JE references, report hashes, recon numbers. Schema varies by task type.';

-- ============================================================================
-- fin.check_close_gate — Can a period transition proceed?
-- ============================================================================
-- Returns whether all mandatory tasks gating a target transition have been
-- resolved (COMPLETED or WAIVED). Surfaces the list of blocking tasks
-- for dashboard/error reporting.
-- ============================================================================
create or replace function fin.check_close_gate(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_num    smallint,
    p_target_status varchar(20)
) returns table (
    gate_passed     boolean,
    pending_count   integer,
    pending_tasks   text[]
) language sql stable as $$
    with blocking as (
        select cl.task_code
        from fin.period_close_checklist cl
        join fin.period_close_task t on t.id = cl.task_id
        where cl.tenant_id     = p_tenant_id
          and cl.entity_code   = p_entity_code
          and cl.fiscal_year   = p_fiscal_year
          and cl.period_number = p_period_num
          and cl.is_mandatory  = true
          and t.required_before = p_target_status
          and cl.task_status not in ('COMPLETED', 'WAIVED')
    )
    select
        (select count(*) = 0 from blocking)                         as gate_passed,
        (select count(*)::integer from blocking)                    as pending_count,
        (select coalesce(array_agg(task_code), '{}') from blocking) as pending_tasks;
$$;

-- ============================================================================
-- fin.get_close_progress — Dashboard-friendly period close summary
-- ============================================================================
create or replace function fin.get_close_progress(
    p_tenant_id   uuid,
    p_entity_code varchar(20),
    p_fiscal_year smallint,
    p_period_num  smallint
) returns table (
    total_tasks       integer,
    completed_count   integer,
    waived_count      integer,
    failed_count      integer,
    blocked_count     integer,
    in_progress_count integer,
    pending_count     integer,
    completion_pct    numeric(5,2)
) language sql stable as $$
    select
        count(*)::integer                                                    as total_tasks,
        count(*) filter (where task_status = 'COMPLETED')::integer           as completed_count,
        count(*) filter (where task_status = 'WAIVED')::integer              as waived_count,
        count(*) filter (where task_status = 'FAILED')::integer              as failed_count,
        count(*) filter (where task_status = 'BLOCKED')::integer             as blocked_count,
        count(*) filter (where task_status = 'IN_PROGRESS')::integer         as in_progress_count,
        count(*) filter (where task_status = 'PENDING')::integer             as pending_count,
        case when count(*) = 0 then 0
             else round(
                 count(*) filter (where task_status in ('COMPLETED','WAIVED'))::numeric
                 / count(*)::numeric * 100, 2
             )
        end                                                                  as completion_pct
    from fin.period_close_checklist
    where tenant_id     = p_tenant_id
      and entity_code   = p_entity_code
      and fiscal_year   = p_fiscal_year
      and period_number = p_period_num;
$$;

-- ============================================================================
-- fin.materialize_close_checklist — Populate checklist for a period
-- ============================================================================
-- Called automatically when a period transitions FUTURE → OPEN.
-- Inserts one checklist row per active task template, giving the ops team
-- immediate visibility into the full close plan.
-- Idempotent via ON CONFLICT DO NOTHING — safe to call multiple times.
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
        task_id, task_code, is_mandatory
    )
    select
        p_tenant_id, p_entity_code, p_fiscal_year, p_period_num,
        t.id, t.task_code, t.is_mandatory
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
