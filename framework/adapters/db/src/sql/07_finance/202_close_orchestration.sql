/* ============================================================================
   Athyper v2.7 — Close Orchestration Engine (Enhancement Layer)
   Schema: fin
   Dependencies: core.tenant, fin.fiscal_period, fin.period_close_task,
                 fin.period_close_checklist (191_period_close_governance.sql)

   Extends the existing period close governance system (191) with:
   - Close calendar: scheduling and SLA targets
   - Close run: orchestration wrapper for a close cycle
   - Close dependencies: DAG-based task ordering
   - Close exceptions: blocker and issue tracking
   - Close readiness snapshots: materialized dashboard metrics

   This layer sits ABOVE the existing gate-based close governance and adds
   operational orchestration capabilities that CFO teams need to manage
   month-end/quarter-end close as a coordinated process.

   Existing system (191_period_close_governance.sql):
     fin.period_close_task        → Task catalogue (KEEP)
     fin.period_close_checklist   → Per-period instances (KEEP)
     fin.check_close_gate()       → Gate validation (KEEP)
     fin.get_close_progress()     → Progress summary (KEEP)
     fin.materialize_close_checklist() → Materialization (KEEP)

   New tables (this file):
     fin.close_calendar           → Close schedule and SLA targets
     fin.close_run                → Active close cycle orchestration
     fin.close_dependency         → Task DAG (predecessor/successor)
     fin.close_exception          → Blocker and issue tracking
     fin.close_readiness_snapshot → Point-in-time dashboard metrics
   ============================================================================ */

-- ============================================================================
-- fin.close_calendar — Close schedule and SLA targets
-- ============================================================================
-- Defines the planned close schedule for each fiscal period.
-- Captures target dates, SLA windows, and actual completion.
--
-- One row per (tenant, entity, fiscal_year, period_number).
-- Created at the start of the fiscal year (or on demand).
-- ============================================================================
create table if not exists fin.close_calendar (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Period reference
    fiscal_year     smallint not null,
    period_number   smallint not null,

    -- Schedule
    period_end_date     date not null,      -- last day of the accounting period
    close_start_date    date not null,      -- when close activities begin
    soft_close_target   date not null,      -- SLA: soft close deadline
    hard_close_target   date not null,      -- SLA: hard close deadline

    -- Actual completion
    soft_close_actual   date,
    hard_close_actual   date,

    -- SLA tracking
    close_type      varchar(20) not null default 'MONTH_END'
                    check (close_type in (
                        'MONTH_END',        -- standard month-end close
                        'QUARTER_END',      -- quarter-end (typically more tasks)
                        'YEAR_END',         -- year-end (most comprehensive)
                        'INTERIM'           -- interim/ad-hoc close
                    )),

    -- Target working days for close (e.g., "5-day close" initiative)
    target_working_days smallint,

    -- Actual working days (calculated on completion)
    actual_working_days smallint,

    -- Notes
    notes           text,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- FK to fiscal period
    constraint fk_fin_close_cal_period
        foreign key (tenant_id, entity_code, fiscal_year, period_number)
        references fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    constraint uq_fin_close_calendar
        unique (tenant_id, entity_code, fiscal_year, period_number),

    constraint chk_fin_close_dates check (
        close_start_date <= soft_close_target
        and soft_close_target <= hard_close_target
    )
);

create index if not exists idx_fin_close_cal_tenant
    on fin.close_calendar(tenant_id, entity_code, fiscal_year);
create index if not exists idx_fin_close_cal_upcoming
    on fin.close_calendar(hard_close_target)
    where hard_close_actual is null;

comment on table fin.close_calendar is
    'Close schedule and SLA targets per fiscal period. Tracks planned vs actual close timelines.';
comment on column fin.close_calendar.target_working_days is
    'Target number of working days for close completion (e.g., 5 for a "5-day close" initiative).';

-- ============================================================================
-- fin.close_run — Active close cycle orchestration
-- ============================================================================
-- Represents an active close cycle for a specific period. Wraps the existing
-- period_close_checklist with orchestration metadata.
--
-- A close run is created when the close process begins (typically when the
-- period transitions to OPEN or when close_start_date arrives).
-- Multiple runs can exist if a close is reopened (e.g., after adjustment).
-- ============================================================================
create table if not exists fin.close_run (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Period reference
    fiscal_year     smallint not null,
    period_number   smallint not null,

    -- Calendar reference (optional — ad-hoc runs may not have a calendar entry)
    calendar_id     uuid references fin.close_calendar(id),

    -- Run identity
    run_number      smallint not null default 1,   -- increments on reopen

    -- Status lifecycle
    status          varchar(20) not null default 'OPEN'
                    check (status in (
                        'OPEN',             -- close activities underway
                        'IN_PROGRESS',      -- tasks being executed
                        'SOFT_CLOSED',      -- soft close gate passed
                        'HARD_CLOSED',      -- hard close gate passed, period locked
                        'REOPENED',         -- reopened for adjustments
                        'CANCELLED'         -- cancelled (e.g., period voided)
                    )),

    -- Timestamps
    started_at      timestamptz not null default now(),
    soft_closed_at  timestamptz,
    hard_closed_at  timestamptz,
    reopened_at     timestamptz,
    completed_at    timestamptz,

    -- Actors
    started_by      uuid,
    soft_closed_by  uuid,
    hard_closed_by  uuid,
    reopened_by     uuid,

    -- Reopen governance
    reopen_reason   text,
    reopen_approval_ref varchar(255),

    -- Notes
    notes           text,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- FK to fiscal period
    constraint fk_fin_close_run_period
        foreign key (tenant_id, entity_code, fiscal_year, period_number)
        references fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    constraint uq_fin_close_run
        unique (tenant_id, entity_code, fiscal_year, period_number, run_number),

    -- Reopened runs must have a reason
    constraint chk_fin_close_reopen check (
        status != 'REOPENED' or reopen_reason is not null
    )
);

create index if not exists idx_fin_close_run_tenant
    on fin.close_run(tenant_id, entity_code, fiscal_year);
create index if not exists idx_fin_close_run_status
    on fin.close_run(status) where status not in ('HARD_CLOSED', 'CANCELLED');
create index if not exists idx_fin_close_run_calendar
    on fin.close_run(calendar_id) where calendar_id is not null;

comment on table fin.close_run is
    'Active close cycle orchestration. Wraps period_close_checklist with lifecycle tracking and reopen governance.';

-- ============================================================================
-- fin.close_dependency — Task DAG (predecessor/successor)
-- ============================================================================
-- Defines ordering dependencies between close tasks beyond the simple
-- gate-based model in period_close_task.required_before.
--
-- Example DAG:
--   AR_RECON → TRIAL_BALANCE → MGMT_SIGNOFF
--   AP_RECON → TRIAL_BALANCE
--   BANK_RECON → TRIAL_BALANCE
--   FX_REVALUATION → IC_ELIMINATION → CONSOLIDATION
--
-- The runtime uses this to:
--   1. Block a task from starting until predecessors are COMPLETED/WAIVED
--   2. Automatically set status to BLOCKED when a predecessor fails
--   3. Visualize the close DAG in the UI
-- ============================================================================
create table if not exists fin.close_dependency (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Predecessor task (must complete before successor can start)
    predecessor_task_id uuid not null references fin.period_close_task(id),

    -- Successor task (blocked until predecessor completes)
    successor_task_id   uuid not null references fin.period_close_task(id),

    -- Dependency type
    dependency_type varchar(20) not null default 'FINISH_TO_START'
                    check (dependency_type in (
                        'FINISH_TO_START',  -- successor starts after predecessor finishes
                        'FINISH_TO_FINISH'  -- successor finishes after predecessor finishes
                    )),

    -- Is this a hard dependency (blocks) or soft (warning only)?
    is_hard         boolean not null default true,

    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),

    constraint uq_fin_close_dep unique (tenant_id, entity_code, predecessor_task_id, successor_task_id),
    -- Prevent self-dependency
    constraint chk_fin_close_dep_no_self check (predecessor_task_id != successor_task_id)
);

create index if not exists idx_fin_close_dep_predecessor
    on fin.close_dependency(predecessor_task_id) where is_active = true;
create index if not exists idx_fin_close_dep_successor
    on fin.close_dependency(successor_task_id) where is_active = true;

comment on table fin.close_dependency is
    'DAG-based task ordering for close orchestration. Extends the gate model with predecessor/successor relationships.';

-- ============================================================================
-- fin.close_exception — Blocker and issue tracking
-- ============================================================================
-- Tracks issues, blockers, and exceptions discovered during the close process.
-- Unlike the FAILED/BLOCKED status on checklist items (which are task-level),
-- exceptions are free-form issues that may span multiple tasks.
--
-- Examples:
--   - "Supplier X invoice missing, blocking AP reconciliation"
--   - "FX rate feed delayed, manual rates required for revaluation"
--   - "Intercompany balance mismatch: $12,400 between LE-CA and LE-MY"
-- ============================================================================
create table if not exists fin.close_exception (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Close run reference
    run_id          uuid not null references fin.close_run(id),

    -- Related task (optional — exception may span multiple tasks)
    task_id         uuid references fin.period_close_task(id),
    checklist_id    uuid references fin.period_close_checklist(id),

    -- Exception identity
    exception_code  varchar(50),
    title           varchar(200) not null,
    description     text not null,

    -- Severity
    severity        varchar(20) not null default 'MEDIUM'
                    check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

    -- Impact: what does this block?
    impact          varchar(30) not null default 'TASK_BLOCKER'
                    check (impact in (
                        'TASK_BLOCKER',     -- blocks specific task completion
                        'GATE_BLOCKER',     -- blocks period transition
                        'DATA_QUALITY',     -- data issue (may not block)
                        'PROCESS',          -- process issue
                        'EXTERNAL'          -- external dependency
                    )),

    -- Status lifecycle
    status          varchar(20) not null default 'OPEN'
                    check (status in (
                        'OPEN',             -- issue identified
                        'IN_PROGRESS',      -- being worked on
                        'RESOLVED',         -- fixed
                        'DEFERRED',         -- deferred to next period
                        'ACCEPTED'          -- accepted as-is (risk accepted)
                    )),

    -- Assignment
    assigned_to     uuid,
    assigned_at     timestamptz,

    -- Resolution
    resolved_by     uuid,
    resolved_at     timestamptz,
    resolution_notes text,

    -- Evidence
    evidence_payload jsonb default '{}'::jsonb,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,

    -- Resolved exceptions must have resolution notes
    constraint chk_fin_close_exception_resolution check (
        status not in ('RESOLVED', 'ACCEPTED') or resolution_notes is not null
    )
);

create index if not exists idx_fin_close_exception_run
    on fin.close_exception(run_id);
create index if not exists idx_fin_close_exception_status
    on fin.close_exception(status) where status in ('OPEN', 'IN_PROGRESS');
create index if not exists idx_fin_close_exception_severity
    on fin.close_exception(severity, status)
    where status in ('OPEN', 'IN_PROGRESS') and severity in ('HIGH', 'CRITICAL');
create index if not exists idx_fin_close_exception_task
    on fin.close_exception(task_id) where task_id is not null;
create index if not exists idx_fin_close_exception_assigned
    on fin.close_exception(assigned_to) where assigned_to is not null and status in ('OPEN', 'IN_PROGRESS');

comment on table fin.close_exception is
    'Blocker and issue tracking during close process. Free-form exceptions that may span multiple tasks.';

-- ============================================================================
-- fin.close_readiness_snapshot — Point-in-time dashboard metrics
-- ============================================================================
-- Materialized snapshot of close readiness metrics, captured periodically
-- (e.g., daily during close) or on demand. Enables trend analysis of
-- close progress over time.
--
-- This supplements the real-time fin.get_close_progress() function with
-- historical snapshots for:
--   - "How did close progress day-by-day?"
--   - "Are we on track vs. the calendar SLA?"
--   - "How does this close compare to last month's?"
-- ============================================================================
create table if not exists fin.close_readiness_snapshot (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Close run reference
    run_id          uuid not null references fin.close_run(id),

    -- Snapshot timestamp
    captured_at     timestamptz not null default now(),

    -- Checklist metrics (from get_close_progress)
    total_tasks         integer not null,
    completed_count     integer not null,
    waived_count        integer not null,
    failed_count        integer not null,
    blocked_count       integer not null,
    in_progress_count   integer not null,
    pending_count       integer not null,
    completion_pct      decimal(5,2) not null,

    -- Exception metrics
    open_exceptions     integer not null default 0,
    critical_exceptions integer not null default 0,
    resolved_exceptions integer not null default 0,

    -- SLA metrics (requires close_calendar)
    days_elapsed        smallint,       -- working days since close_start_date
    days_remaining      smallint,       -- working days until hard_close_target
    sla_status          varchar(20)
                        check (sla_status is null or sla_status in (
                            'ON_TRACK',     -- ahead of or on schedule
                            'AT_RISK',      -- falling behind
                            'BREACHED'      -- past SLA target
                        )),

    -- Readiness score: weighted composite metric (0-100)
    -- Calculation: configurable weights on completion_pct, exception severity,
    -- SLA status, reconciliation status, approval status
    readiness_score     decimal(5,2) not null,

    -- Breakdown (for dashboard drill-down)
    category_progress   jsonb,  -- { "SUBLEDGER": 80, "CONSOLIDATION": 60, ... }

    captured_by     uuid
);

create index if not exists idx_fin_readiness_run
    on fin.close_readiness_snapshot(run_id, captured_at desc);
create index if not exists idx_fin_readiness_tenant
    on fin.close_readiness_snapshot(tenant_id, entity_code, captured_at desc);
create index if not exists idx_fin_readiness_sla
    on fin.close_readiness_snapshot(sla_status)
    where sla_status in ('AT_RISK', 'BREACHED');

comment on table fin.close_readiness_snapshot is
    'Point-in-time snapshot of close readiness metrics. Enables trend analysis and SLA tracking across close cycles.';

-- ============================================================================
-- Helper function: Capture a readiness snapshot for a close run
-- ============================================================================
create or replace function fin.capture_close_readiness(
    p_run_id        uuid,
    p_captured_by   uuid default null
) returns uuid language plpgsql as $$
declare
    v_run           fin.close_run;
    v_cal           fin.close_calendar;
    v_snapshot_id   uuid;
    v_progress      record;
    v_open_exc      integer;
    v_critical_exc  integer;
    v_resolved_exc  integer;
    v_days_elapsed  smallint;
    v_days_remaining smallint;
    v_sla_status    varchar(20);
    v_readiness     decimal(5,2);
    v_cat_progress  jsonb;
begin
    select * into v_run from fin.close_run where id = p_run_id;
    if v_run is null then
        raise exception 'Close run % not found', p_run_id;
    end if;

    -- Get checklist progress
    select * into v_progress
    from fin.get_close_progress(
        v_run.tenant_id, v_run.entity_code,
        v_run.fiscal_year, v_run.period_number
    );

    -- Get exception counts
    select
        count(*) filter (where status in ('OPEN', 'IN_PROGRESS')),
        count(*) filter (where status in ('OPEN', 'IN_PROGRESS') and severity = 'CRITICAL'),
        count(*) filter (where status = 'RESOLVED')
    into v_open_exc, v_critical_exc, v_resolved_exc
    from fin.close_exception
    where run_id = p_run_id;

    -- SLA calculation (if calendar exists)
    select * into v_cal from fin.close_calendar where id = v_run.calendar_id;
    if v_cal is not null then
        v_days_elapsed := greatest(0, (current_date - v_cal.close_start_date));
        v_days_remaining := greatest(0, (v_cal.hard_close_target - current_date));

        if current_date > v_cal.hard_close_target and v_run.status not in ('HARD_CLOSED', 'CANCELLED') then
            v_sla_status := 'BREACHED';
        elsif current_date > v_cal.soft_close_target and v_run.status not in ('SOFT_CLOSED', 'HARD_CLOSED', 'CANCELLED') then
            v_sla_status := 'AT_RISK';
        else
            v_sla_status := 'ON_TRACK';
        end if;
    end if;

    -- Category progress breakdown
    select jsonb_object_agg(cat, pct) into v_cat_progress
    from (
        select
            t.category as cat,
            case when count(*) = 0 then 0
                 else round(
                     count(*) filter (where cl.task_status in ('COMPLETED', 'WAIVED'))::numeric
                     / count(*)::numeric * 100, 2
                 )
            end as pct
        from fin.period_close_checklist cl
        join fin.period_close_task t on t.id = cl.task_id
        where cl.tenant_id = v_run.tenant_id
          and cl.entity_code = v_run.entity_code
          and cl.fiscal_year = v_run.fiscal_year
          and cl.period_number = v_run.period_number
        group by t.category
    ) sub;

    -- Readiness score: weighted composite
    -- 60% checklist completion + 25% exception-free + 15% SLA status
    v_readiness := (
        v_progress.completion_pct * 0.60
        + case when v_open_exc = 0 then 100 else greatest(0, 100 - (v_critical_exc * 25) - (v_open_exc * 5)) end * 0.25
        + case v_sla_status
            when 'ON_TRACK' then 100
            when 'AT_RISK'  then 50
            when 'BREACHED' then 0
            else 75  -- no calendar
          end * 0.15
    );

    -- Insert snapshot
    insert into fin.close_readiness_snapshot (
        tenant_id, entity_code, run_id,
        total_tasks, completed_count, waived_count, failed_count,
        blocked_count, in_progress_count, pending_count, completion_pct,
        open_exceptions, critical_exceptions, resolved_exceptions,
        days_elapsed, days_remaining, sla_status,
        readiness_score, category_progress, captured_by
    ) values (
        v_run.tenant_id, v_run.entity_code, p_run_id,
        v_progress.total_tasks, v_progress.completed_count,
        v_progress.waived_count, v_progress.failed_count,
        v_progress.blocked_count, v_progress.in_progress_count,
        v_progress.pending_count, v_progress.completion_pct,
        v_open_exc, v_critical_exc, v_resolved_exc,
        v_days_elapsed, v_days_remaining, v_sla_status,
        v_readiness, v_cat_progress, p_captured_by
    ) returning id into v_snapshot_id;

    return v_snapshot_id;
end;
$$;

-- ============================================================================
-- Helper function: Check task dependencies before starting a task
-- ============================================================================
create or replace function fin.check_close_dependencies(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_num    smallint,
    p_task_id       uuid
) returns table (
    can_start           boolean,
    blocking_count      integer,
    blocking_tasks      text[]
) language sql stable as $$
    with blocking as (
        select pt.task_code
        from fin.close_dependency d
        join fin.period_close_task pt on pt.id = d.predecessor_task_id
        join fin.period_close_checklist cl on (
            cl.task_id = d.predecessor_task_id
            and cl.tenant_id = p_tenant_id
            and cl.entity_code = p_entity_code
            and cl.fiscal_year = p_fiscal_year
            and cl.period_number = p_period_num
        )
        where d.successor_task_id = p_task_id
          and d.tenant_id = p_tenant_id
          and d.entity_code = p_entity_code
          and d.is_active = true
          and d.is_hard = true
          and cl.task_status not in ('COMPLETED', 'WAIVED')
    )
    select
        (select count(*) = 0 from blocking)                          as can_start,
        (select count(*)::integer from blocking)                     as blocking_count,
        (select coalesce(array_agg(task_code), '{}') from blocking)  as blocking_tasks;
$$;

-- ============================================================================
-- View: Close run dashboard (latest run per period with readiness)
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_dashboard CASCADE;
create or replace view fin.vw_close_dashboard as
select
    r.id as run_id,
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    r.run_number,
    r.status,
    r.started_at,
    r.soft_closed_at,
    r.hard_closed_at,
    c.close_type,
    c.close_start_date,
    c.soft_close_target,
    c.hard_close_target,
    c.target_working_days,
    s.total_tasks,
    s.completed_count,
    s.completion_pct,
    s.open_exceptions,
    s.critical_exceptions,
    s.sla_status,
    s.readiness_score,
    s.category_progress,
    s.captured_at as last_snapshot_at
from fin.close_run r
left join fin.close_calendar c on c.id = r.calendar_id
left join lateral (
    select *
    from fin.close_readiness_snapshot snap
    where snap.run_id = r.id
    order by snap.captured_at desc
    limit 1
) s on true
where r.status not in ('CANCELLED');

comment on view fin.vw_close_dashboard is
    'Close run dashboard: latest run per period with most recent readiness snapshot and calendar SLA targets.';
