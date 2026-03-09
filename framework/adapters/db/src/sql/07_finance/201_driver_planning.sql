/* ============================================================================
   Athyper v2.7 — Driver-Based Planning Engine
   Schema: fin
   Dependencies: core.tenant, fin.chart_of_accounts, fin.fiscal_period,
                 fin.budget_line (196_management_pack.sql),
                 fin.dimension_set (191_ledger_dimensions.sql)

   Enables CFO teams to forecast using operational drivers instead of
   manual line-by-line budgets. Driver assumptions flow through formula
   models to produce financial plan lines that feed fin.budget_line.

   Table topology:
     Definition layer:
       fin.planning_model         → Top-level planning model (scenario container)
       fin.planning_driver        → Operational driver definitions
       fin.planning_driver_formula → How drivers map to GL accounts

     Data layer:
       fin.driver_assumption      → Time-series driver values per scenario
       fin.planning_output        → Computed financial output per period

   Integration:
     - Planning outputs can be promoted to fin.budget_line for statement
       variance analysis and pack reporting
     - KPI Engine can reference driver values via data_source = 'DRIVER'
     - Driver assumptions feed from actuals (GL) or manual entry

   Design principles:
     1. Model → Driver → Assumption → Output pipeline
     2. Multiple scenarios per model (BUDGET, FORECAST, ROLLING)
     3. Versioned assumptions for what-if analysis
     4. Dimension-aware: plans can be dimensioned
     5. Promotion workflow: plan → approved budget
     6. Full tenant/entity scoping per Athyper convention
   ============================================================================ */

-- ============================================================================
-- fin.planning_model — Top-level planning model
-- ============================================================================
-- A planning model is a container for a set of related drivers and their
-- assumptions under a specific scenario. Think of it as a "budget workbook".
--
-- Example models:
--   FY2027-ANNUAL-BUDGET — annual budget for fiscal year 2027
--   FY2027-Q2-REFORECAST — mid-year rolling forecast
--   FY2027-BEST-CASE     — optimistic scenario
-- ============================================================================
create table if not exists fin.planning_model (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Identity
    model_code      varchar(50) not null,
    model_name      varchar(200) not null,
    description     text,

    -- Scenario classification
    scenario        varchar(20) not null default 'BUDGET'
                    check (scenario in (
                        'BUDGET',           -- annual budget
                        'FORECAST',         -- rolling forecast
                        'ROLLING',          -- rolling N-month forecast
                        'BEST_CASE',        -- optimistic
                        'WORST_CASE',       -- pessimistic
                        'CUSTOM'
                    )),

    -- Period scope
    fiscal_year     smallint not null,
    period_from     smallint not null default 1,
    period_to       smallint not null default 12,

    -- Version (allows multiple iterations)
    version         smallint not null default 1,

    -- Book context
    book_code       varchar(20) not null default 'STAT',

    -- Lifecycle
    status          varchar(20) not null default 'DRAFT'
                    check (status in (
                        'DRAFT',            -- being built
                        'IN_REVIEW',        -- submitted for review
                        'APPROVED',         -- approved by controller/CFO
                        'PROMOTED',         -- promoted to fin.budget_line
                        'SUPERSEDED',       -- replaced by newer version
                        'ARCHIVED'
                    )),

    -- Approval audit
    submitted_by    uuid,
    submitted_at    timestamptz,
    approved_by     uuid,
    approved_at     timestamptz,
    promoted_at     timestamptz,
    promoted_by     uuid,

    -- Supersession
    supersedes_id   uuid references fin.planning_model(id),

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,

    constraint uq_fin_plan_model unique (tenant_id, entity_code, model_code, version),
    constraint chk_fin_plan_period check (period_from <= period_to)
);

create index if not exists idx_fin_plan_model_tenant
    on fin.planning_model(tenant_id, entity_code);
create index if not exists idx_fin_plan_model_year
    on fin.planning_model(tenant_id, fiscal_year, scenario);
create index if not exists idx_fin_plan_model_status
    on fin.planning_model(status) where status not in ('ARCHIVED', 'SUPERSEDED');

comment on table fin.planning_model is
    'Top-level planning model. Container for drivers and assumptions under a specific scenario (BUDGET/FORECAST/ROLLING).';

-- ============================================================================
-- fin.planning_driver — Operational driver definitions
-- ============================================================================
-- Reusable driver definitions shared across models.
-- A driver is an operational metric that, when combined with a formula,
-- produces financial plan amounts.
--
-- Examples:
--   STORES       — Number of retail locations
--   CUSTOMERS    — Average customers per store per month
--   BASKET_SIZE  — Average transaction value
--   HEADCOUNT    — Full-time equivalent employees
--   UNIT_COST    — Cost per unit produced
--   CHURN_RATE   — Monthly customer churn %
--   ARPU         — Average revenue per user
-- ============================================================================
create table if not exists fin.planning_driver (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Identity
    driver_code     varchar(50) not null,
    driver_name     varchar(200) not null,
    description     text,

    -- Classification
    driver_category varchar(30) not null default 'REVENUE'
                    check (driver_category in (
                        'REVENUE',          -- revenue drivers (volume, price, mix)
                        'COST',             -- cost drivers (unit cost, headcount)
                        'CAPACITY',         -- capacity drivers (utilization, throughput)
                        'GROWTH',           -- growth drivers (customer acquisition, churn)
                        'OPERATIONAL',      -- operational drivers (headcount, FTE)
                        'CUSTOM'
                    )),

    -- Data type
    unit            varchar(20) not null default 'NUMBER'
                    check (unit in (
                        'NUMBER',           -- integer/decimal count
                        'CURRENCY',         -- monetary value
                        'PERCENTAGE',       -- rate or percentage
                        'DAYS',             -- time-based
                        'UNITS'             -- physical units
                    )),
    decimal_places  smallint not null default 2,

    -- Constraints
    min_value       decimal(18,4),
    max_value       decimal(18,4),

    -- Lifecycle
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_plan_driver unique (tenant_id, entity_code, driver_code),
    constraint chk_fin_driver_range check (
        min_value is null or max_value is null or min_value <= max_value
    )
);

create index if not exists idx_fin_plan_driver_tenant
    on fin.planning_driver(tenant_id, entity_code);
create index if not exists idx_fin_plan_driver_category
    on fin.planning_driver(driver_category) where is_active = true;

comment on table fin.planning_driver is
    'Reusable operational driver definitions (e.g., STORES, HEADCOUNT, ARPU). Shared across planning models.';

-- ============================================================================
-- fin.planning_driver_formula — How drivers map to GL accounts
-- ============================================================================
-- Defines the financial impact formula: how driver values translate into
-- GL account amounts. Each formula row maps a combination of drivers
-- to a target GL account with a calculation expression.
--
-- Example:
--   Revenue = STORES × CUSTOMERS × BASKET_SIZE
--   → target account: 4000 (Revenue)
--   → formula: { "op": "MULTIPLY", "refs": ["STORES", "CUSTOMERS", "BASKET_SIZE"] }
--
--   Salary Expense = HEADCOUNT × AVG_SALARY / 12
--   → target account: 5100 (Salary Expense)
--   → formula: { "op": "DIVIDE",
--                "left": { "op": "MULTIPLY", "refs": ["HEADCOUNT", "AVG_SALARY"] },
--                "right": { "literal": 12 } }
-- ============================================================================
create table if not exists fin.planning_driver_formula (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Identity
    formula_code    varchar(50) not null,
    formula_name    varchar(200) not null,
    description     text,

    -- Target: which GL account receives the calculated amount
    account_id      uuid not null references fin.chart_of_accounts(id),

    -- Formula: expression tree referencing driver codes
    -- Same expression tree format as kpi_definition.formula
    formula         jsonb not null,

    -- Which drivers are inputs (denormalized for query efficiency)
    input_driver_codes varchar(50)[] not null,

    -- Sign: does this formula produce debit or credit amounts?
    posting_side    varchar(10) not null default 'DEBIT'
                    check (posting_side in ('DEBIT', 'CREDIT')),

    -- Dimension context (optional — formula can be dimension-specific)
    dimension_set_id uuid references fin.dimension_set(id),

    -- Ordering
    sort_order      smallint not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_plan_formula unique (tenant_id, entity_code, formula_code)
);

create index if not exists idx_fin_plan_formula_tenant
    on fin.planning_driver_formula(tenant_id, entity_code);
create index if not exists idx_fin_plan_formula_account
    on fin.planning_driver_formula(account_id);

comment on table fin.planning_driver_formula is
    'Maps driver combinations to GL accounts via expression formulas. Defines how operational drivers produce financial plan amounts.';

-- ============================================================================
-- fin.driver_assumption — Time-series driver values per model
-- ============================================================================
-- Stores the actual assumption values for each driver, per period, within
-- a planning model. This is what the CFO team edits in the planning UI.
--
-- Grain: one row per (model, driver, period, entity, dimension).
-- ============================================================================
create table if not exists fin.driver_assumption (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Model context
    model_id        uuid not null references fin.planning_model(id) on delete cascade,

    -- Driver reference
    driver_id       uuid not null references fin.planning_driver(id),

    -- Period
    fiscal_year     smallint not null,
    period_number   smallint not null,

    -- Dimension context (optional)
    dimension_set_id uuid references fin.dimension_set(id),

    -- Value
    value           decimal(18,4) not null,

    -- Source: how was this value determined?
    source          varchar(20) not null default 'MANUAL'
                    check (source in (
                        'MANUAL',           -- user-entered
                        'IMPORTED',         -- imported from external source
                        'ACTUAL',           -- seeded from GL actuals
                        'ALGORITHM',        -- computed by trend/regression
                        'COPIED'            -- copied from another scenario
                    )),

    -- Notes
    notes           text,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid
);

create unique index if not exists uq_fin_driver_assumption
    on fin.driver_assumption (
        model_id, driver_id, fiscal_year, period_number,
        coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000')
    );

create index if not exists idx_fin_driver_assumption_model
    on fin.driver_assumption(model_id);
create index if not exists idx_fin_driver_assumption_driver
    on fin.driver_assumption(driver_id, fiscal_year, period_number);
create index if not exists idx_fin_driver_assumption_period
    on fin.driver_assumption(tenant_id, entity_code, fiscal_year, period_number);

comment on table fin.driver_assumption is
    'Time-series assumption values for operational drivers within a planning model. The core planning input.';

-- ============================================================================
-- fin.planning_output — Computed financial output per period
-- ============================================================================
-- Stores the calculated financial amounts produced by applying driver
-- formulas to assumptions. These are the plan numbers that get promoted
-- to fin.budget_line.
--
-- Grain: one row per (model, formula, period, dimension).
-- Immutable per calculation run — recalculation creates new rows.
-- ============================================================================
create table if not exists fin.planning_output (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Model context
    model_id        uuid not null references fin.planning_model(id) on delete cascade,

    -- Formula that produced this output
    formula_id      uuid not null references fin.planning_driver_formula(id),

    -- Target account (denormalized from formula for query performance)
    account_id      uuid not null references fin.chart_of_accounts(id),

    -- Period
    fiscal_year     smallint not null,
    period_number   smallint not null,

    -- Dimension context (optional)
    dimension_set_id uuid references fin.dimension_set(id),

    -- Calculated amount (MC-4: DECIMAL(18,4))
    amount          decimal(18,4) not null,
    posting_side    varchar(10) not null
                    check (posting_side in ('DEBIT', 'CREDIT')),

    -- Computation metadata
    input_snapshot  jsonb,              -- snapshot of driver assumptions used
    calculated_at   timestamptz not null default now(),
    calculation_run_id uuid,            -- links outputs from same batch

    -- Is this the latest calculation?
    is_current      boolean not null default true
);

create unique index if not exists uq_fin_plan_output
    on fin.planning_output (
        model_id, formula_id, fiscal_year, period_number,
        coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000'),
        calculated_at
    );

create index if not exists idx_fin_plan_output_model
    on fin.planning_output(model_id) where is_current = true;
create index if not exists idx_fin_plan_output_account
    on fin.planning_output(account_id, fiscal_year, period_number);
create index if not exists idx_fin_plan_output_run
    on fin.planning_output(calculation_run_id) where calculation_run_id is not null;

comment on table fin.planning_output is
    'Computed financial plan amounts from driver formulas. Promoted to fin.budget_line when model is approved.';

-- ============================================================================
-- Helper function: Promote planning model outputs to budget lines
-- ============================================================================
-- Called when a planning model transitions to PROMOTED status.
-- Creates or updates fin.budget_line rows from planning_output.
-- Idempotent via ON CONFLICT DO UPDATE.
-- ============================================================================
create or replace function fin.promote_plan_to_budget(
    p_model_id uuid
) returns integer language plpgsql as $$
declare
    v_model     fin.planning_model;
    v_count     integer := 0;
    v_budget_code text;
begin
    select * into v_model from fin.planning_model where id = p_model_id;

    if v_model is null then
        raise exception 'Planning model % not found', p_model_id;
    end if;

    if v_model.status != 'APPROVED' then
        raise exception 'Planning model % must be APPROVED before promotion (current: %)',
            p_model_id, v_model.status;
    end if;

    -- Budget code derived from model code
    v_budget_code := v_model.model_code;

    -- Upsert planning outputs into budget lines
    insert into fin.budget_line (
        tenant_id, entity_code, budget_code, budget_type, budget_version,
        account_id, fiscal_year, period_number, book_code,
        dimension_set_id, budget_amount, is_approved, approved_by, approved_at,
        created_by
    )
    select
        o.tenant_id, o.entity_code, v_budget_code,
        case v_model.scenario
            when 'BUDGET'    then 'BUDGET'
            when 'FORECAST'  then 'FORECAST'
            when 'ROLLING'   then 'FORECAST'
            else 'PLAN'
        end,
        v_model.version,
        o.account_id, o.fiscal_year, o.period_number, v_model.book_code,
        o.dimension_set_id,
        case o.posting_side
            when 'DEBIT' then o.amount
            else -o.amount
        end,
        true, v_model.approved_by, v_model.approved_at,
        v_model.promoted_by
    from fin.planning_output o
    where o.model_id = p_model_id
      and o.is_current = true
    on conflict (tenant_id, entity_code, budget_code, budget_version,
                 account_id, fiscal_year, period_number, book_code,
                 coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000'))
    do update set
        budget_amount = excluded.budget_amount,
        is_approved   = true,
        approved_by   = excluded.approved_by,
        approved_at   = excluded.approved_at,
        updated_at    = now();

    get diagnostics v_count = row_count;

    -- Update model status
    update fin.planning_model
    set status = 'PROMOTED', promoted_at = now(), updated_at = now()
    where id = p_model_id;

    return v_count;
end;
$$;

-- ============================================================================
-- View: Planning model summary with driver counts and output totals
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_planning_model_summary CASCADE;
create or replace view fin.vw_planning_model_summary as
select
    m.id as model_id,
    m.tenant_id,
    m.entity_code,
    m.model_code,
    m.model_name,
    m.scenario,
    m.fiscal_year,
    m.period_from,
    m.period_to,
    m.version,
    m.status,
    m.book_code,
    (select count(distinct da.driver_id)
     from fin.driver_assumption da where da.model_id = m.id)::integer as driver_count,
    (select count(*)
     from fin.driver_assumption da where da.model_id = m.id)::integer as assumption_count,
    (select count(*)
     from fin.planning_output po where po.model_id = m.id and po.is_current = true)::integer as output_count,
    (select coalesce(sum(po.amount), 0)
     from fin.planning_output po
     where po.model_id = m.id and po.is_current = true and po.posting_side = 'CREDIT')
     as total_revenue,
    (select coalesce(sum(po.amount), 0)
     from fin.planning_output po
     where po.model_id = m.id and po.is_current = true and po.posting_side = 'DEBIT')
     as total_expense,
    m.created_at,
    m.updated_at
from fin.planning_model m;

comment on view fin.vw_planning_model_summary is
    'Summary view of planning models with driver counts and output totals for dashboard display.';
