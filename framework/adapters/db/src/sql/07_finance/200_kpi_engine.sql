/* ============================================================================
   Athyper v2.7 — KPI Definition & Execution Engine
   Schema: fin
   Dependencies: core.tenant, fin.chart_of_accounts, fin.gl_balance,
                 fin.fiscal_period, fin.dimension_set,
                 fin.report_pack_definition, fin.report_pack_item

   Provides a governed KPI layer that defines, computes, thresholds, and
   binds financial & operational KPIs into management packs.

   Table topology:
     Definition layer:
       fin.kpi_definition        → Master KPI catalogue
       fin.kpi_threshold         → Traffic-light alert thresholds
       fin.kpi_account_binding   → Maps formula leaf nodes to GL accounts

     Execution layer:
       fin.kpi_execution         → Computed KPI values per period/entity/dimension

     Pack integration:
       fin.kpi_pack_binding      → Links KPIs to report pack items

   Design principles:
     1. Formula KPIs use an expression tree (JSONB) evaluated by runtime
     2. Driver KPIs pull from the planning engine (201_driver_planning.sql)
     3. GL-sourced KPIs bind to accounts via kpi_account_binding
     4. Thresholds drive traffic-light dashboards and alerting
     5. KPI values are snapshot-immutable; recalculation creates new rows
     6. Full tenant/entity scoping per Athyper convention
     7. Dimension-aware: KPIs can be sliced by any registered dimension
   ============================================================================ */

-- ============================================================================
-- fin.kpi_definition — Master KPI catalogue
-- ============================================================================
-- One row per KPI per (tenant, entity_code). Defines what, how, and where.
--
-- formula JSONB expression tree example:
--   { "op": "DIVIDE",
--     "left":  { "op": "SUBTRACT",
--                "left":  { "ref": "REVENUE" },
--                "right": { "ref": "COGS" } },
--     "right": { "ref": "REVENUE" },
--     "multiply": 100 }
-- → (REVENUE - COGS) / REVENUE * 100 = Gross Margin %
--
-- Leaf nodes reference either:
--   - Account bindings via kpi_account_binding (data_source = 'GL')
--   - Other KPI codes via cross-ref  (data_source = 'KPI')
--   - Driver plan values              (data_source = 'DRIVER')
--   - Cube/reporting aggregates       (data_source = 'CUBE')
-- ============================================================================
create table if not exists fin.kpi_definition (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    -- Identity
    kpi_code        varchar(50) not null,
    kpi_name        varchar(200) not null,
    description     text,

    -- Classification
    category        varchar(30) not null default 'FINANCIAL'
                    check (category in (
                        'PROFITABILITY',    -- gross margin, EBITDA, net margin
                        'LIQUIDITY',        -- current ratio, quick ratio, cash conversion
                        'EFFICIENCY',       -- DSO, DPO, inventory turnover
                        'LEVERAGE',         -- debt-to-equity, interest coverage
                        'GROWTH',           -- revenue growth, customer growth
                        'OPERATIONAL',      -- headcount, utilization, throughput
                        'FINANCIAL',        -- catch-all financial KPIs
                        'CUSTOM'
                    )),

    -- Data source: where the raw numbers come from
    data_source     varchar(20) not null default 'GL'
                    check (data_source in ('GL', 'CUBE', 'DRIVER', 'KPI', 'MANUAL')),

    -- Formula: expression tree for computed KPIs
    -- NULL for MANUAL data_source (values entered directly)
    formula         jsonb,

    -- Aggregation: how period values roll up
    aggregation_method varchar(20) not null default 'SUM'
                    check (aggregation_method in (
                        'SUM',          -- sum of period values
                        'AVG',          -- average across periods
                        'RATIO',        -- ratio of two measures
                        'LAST',         -- last period value (point-in-time)
                        'DELTA',        -- change from prior period
                        'DELTA_PCT'     -- % change from prior period
                    )),

    -- Display
    unit            varchar(20) not null default 'CURRENCY'
                    check (unit in (
                        'CURRENCY',     -- monetary (uses entity's functional currency)
                        'PERCENTAGE',   -- displayed as %
                        'DAYS',         -- e.g., DSO
                        'RATIO',        -- e.g., 2.5x
                        'COUNT',        -- headcount, units
                        'CUSTOM'
                    )),
    decimal_places  smallint not null default 2,
    format_pattern  varchar(50),     -- optional: '#,##0.00', '0.0x', etc.

    -- Sign convention: for display (e.g., expenses show positive)
    sign_rule       varchar(10) not null default 'NORMAL'
                    check (sign_rule in ('NORMAL', 'INVERSE')),

    -- Comparison: what to compare against
    compare_mode    varchar(20) default 'PRIOR_YEAR'
                    check (compare_mode is null or compare_mode in (
                        'PRIOR_YEAR', 'PRIOR_PERIOD', 'BUDGET', 'FORECAST', 'TARGET'
                    )),

    -- Target value (for TARGET compare_mode)
    target_value    decimal(18,4),

    -- Dimension slicing: which dimension types this KPI can be sliced by
    -- NULL = all dimensions; empty array = no dimension slicing
    dimension_type_codes varchar(50)[],

    -- Ordering within category / dashboard
    sort_order      smallint not null default 0,

    -- Lifecycle
    is_active       boolean not null default true,
    scope           varchar(20) not null default 'TENANT'
                    check (scope in ('SYSTEM', 'TENANT', 'ENTITY')),
    version         smallint not null default 1,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,

    constraint uq_fin_kpi_def unique (tenant_id, entity_code, kpi_code, version),
    -- Formula required for non-MANUAL KPIs
    constraint chk_kpi_formula check (
        data_source = 'MANUAL' or formula is not null
    )
);

create index if not exists idx_fin_kpi_def_tenant
    on fin.kpi_definition(tenant_id, entity_code);
create index if not exists idx_fin_kpi_def_category
    on fin.kpi_definition(tenant_id, category) where is_active = true;
create index if not exists idx_fin_kpi_def_source
    on fin.kpi_definition(data_source) where is_active = true;

comment on table fin.kpi_definition is
    'Master catalogue of financial and operational KPIs. Defines formula, data source, aggregation, and display rules.';
comment on column fin.kpi_definition.formula is
    'Expression tree (JSONB) for computed KPIs. Leaf nodes reference GL accounts, other KPIs, drivers, or cubes.';
comment on column fin.kpi_definition.data_source is
    'Where raw KPI data comes from: GL (chart_of_accounts via kpi_account_binding), CUBE (reporting), DRIVER (planning engine), KPI (cross-ref), MANUAL (user-entered).';

-- ============================================================================
-- fin.kpi_account_binding — Maps KPI formula leaf nodes to GL accounts
-- ============================================================================
-- For GL-sourced KPIs, maps formula reference names (e.g., "REVENUE", "COGS")
-- to one or more GL accounts. Supports exact, range, and type-based mapping,
-- following the same pattern as fin.statement_line_account.
-- ============================================================================
create table if not exists fin.kpi_account_binding (
    id              uuid primary key default gen_random_uuid(),
    kpi_id          uuid not null references fin.kpi_definition(id) on delete cascade,

    -- Reference name in the formula (e.g., "REVENUE", "COGS", "AR_BALANCE")
    ref_name        varchar(50) not null,

    -- Mapping mode (same pattern as statement_line_account)
    mapping_mode    varchar(10) not null default 'TYPE'
                    check (mapping_mode in ('EXACT', 'RANGE', 'TYPE')),

    -- For EXACT: single account code
    account_code    varchar(20),

    -- For RANGE: account code range (inclusive)
    range_from      varchar(20),
    range_to        varchar(20),

    -- For TYPE: account type
    account_type    varchar(20)
                    check (account_type is null or account_type in (
                        'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
                    )),

    -- Optional: subledger type filter
    subledger_type  varchar(20)
                    check (subledger_type is null or subledger_type in (
                        'AP', 'AR', 'ASSET', 'INVENTORY', 'WIP', 'COMMISSION'
                    )),

    -- Balance column to use
    balance_column  varchar(20) not null default 'NET'
                    check (balance_column in (
                        'DEBIT',        -- period_debit
                        'CREDIT',       -- period_credit
                        'NET',          -- period_debit - period_credit
                        'CLOSING_NET'   -- closing_debit - closing_credit (balance sheet)
                    )),

    created_at      timestamptz not null default now()
);

create unique index if not exists uq_fin_kpi_acct_bind
    on fin.kpi_account_binding (kpi_id, ref_name, mapping_mode,
        coalesce(account_code, ''), coalesce(range_from, ''), coalesce(account_type, ''));

create index if not exists idx_fin_kpi_acct_bind_kpi
    on fin.kpi_account_binding(kpi_id);

comment on table fin.kpi_account_binding is
    'Maps KPI formula leaf nodes (ref_name) to GL accounts. Supports EXACT, RANGE, and TYPE-based account matching.';

-- ============================================================================
-- fin.kpi_threshold — Traffic-light alert thresholds
-- ============================================================================
-- Defines severity bands for KPI values. Multiple thresholds per KPI create
-- a traffic-light system (e.g., GREEN → YELLOW → RED).
--
-- Evaluation order: thresholds are evaluated by severity (CRITICAL first),
-- then by priority. First matching threshold wins.
-- ============================================================================
create table if not exists fin.kpi_threshold (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    kpi_id          uuid not null references fin.kpi_definition(id) on delete cascade,

    -- Severity band
    severity        varchar(20) not null
                    check (severity in ('INFO', 'WARNING', 'CRITICAL')),

    -- Condition
    operator        varchar(5) not null
                    check (operator in ('>', '<', '>=', '<=', '=', '!=')),
    threshold_value decimal(18,4) not null,

    -- Display
    label           varchar(100),   -- e.g., "Below target", "Critical low"
    color_code      varchar(7),     -- e.g., "#FF0000" for red

    -- Alert config
    alert_enabled   boolean not null default false,
    alert_channel   varchar(30)
                    check (alert_channel is null or alert_channel in (
                        'EMAIL', 'NOTIFICATION', 'WEBHOOK', 'SLACK'
                    )),

    -- Priority: within same severity, higher priority evaluated first
    priority        smallint not null default 0,

    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_kpi_threshold unique (tenant_id, kpi_id, severity, operator, threshold_value)
);

create index if not exists idx_fin_kpi_threshold_kpi
    on fin.kpi_threshold(kpi_id) where is_active = true;

comment on table fin.kpi_threshold is
    'Traffic-light thresholds for KPI alerting. Multiple thresholds per KPI create severity bands (INFO/WARNING/CRITICAL).';

-- ============================================================================
-- fin.kpi_execution — Computed KPI values per period/entity/dimension
-- ============================================================================
-- Stores snapshot-immutable calculated KPI values. Recalculation creates
-- new rows; prior values are preserved for audit and trend analysis.
--
-- Grain: one row per (kpi, period, entity, dimension, calculation_run).
-- ============================================================================
create table if not exists fin.kpi_execution (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,

    kpi_id          uuid not null references fin.kpi_definition(id),

    -- Period context
    fiscal_year     smallint not null,
    period_number   smallint not null,

    -- Dimension context (optional)
    dimension_set_id uuid references fin.dimension_set(id),

    -- Book context
    book_code       varchar(20) not null default 'STAT',

    -- Calculated value
    value           decimal(18,4) not null,

    -- Comparison value (prior year, budget, etc.)
    comparison_value decimal(18,4),
    variance_amount  decimal(18,4),
    variance_pct     decimal(8,4),

    -- Threshold evaluation result
    threshold_severity varchar(20)
                    check (threshold_severity is null or threshold_severity in (
                        'OK', 'INFO', 'WARNING', 'CRITICAL'
                    )),

    -- Computation metadata
    formula_inputs  jsonb,              -- snapshot of input values used
    calculated_at   timestamptz not null default now(),
    calculated_by   uuid,               -- user or system actor
    calculation_run_id uuid,            -- links executions from same batch

    -- Is this the latest calculation for this grain?
    is_current      boolean not null default true
);

create unique index if not exists uq_fin_kpi_execution
    on fin.kpi_execution (
        tenant_id, entity_code, kpi_id, fiscal_year, period_number,
        book_code, coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000'),
        calculated_at
    );

create index if not exists idx_fin_kpi_exec_tenant
    on fin.kpi_execution(tenant_id, entity_code, fiscal_year);
create index if not exists idx_fin_kpi_exec_kpi
    on fin.kpi_execution(kpi_id, fiscal_year, period_number) where is_current = true;
create index if not exists idx_fin_kpi_exec_run
    on fin.kpi_execution(calculation_run_id) where calculation_run_id is not null;
create index if not exists idx_fin_kpi_exec_severity
    on fin.kpi_execution(tenant_id, threshold_severity)
    where is_current = true and threshold_severity in ('WARNING', 'CRITICAL');

comment on table fin.kpi_execution is
    'Snapshot-immutable computed KPI values. Each calculation creates a new row; is_current marks the latest.';
comment on column fin.kpi_execution.formula_inputs is
    'JSONB snapshot of input values used in computation. Enables audit trail and recalculation verification.';

-- ============================================================================
-- fin.kpi_pack_binding — Links KPIs to report pack items
-- ============================================================================
-- Connects KPIs to management packs, enabling KPI dashboards within
-- governed report packages. Positioned as pack items of type 'KPI_DASHBOARD'.
-- ============================================================================
create table if not exists fin.kpi_pack_binding (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),

    -- Pack item reference
    pack_item_id    uuid not null references fin.report_pack_item(id) on delete cascade,

    -- KPI reference
    kpi_id          uuid not null references fin.kpi_definition(id),

    -- Display within the KPI section of the pack
    display_order   smallint not null default 0,
    show_trend      boolean not null default true,
    show_threshold  boolean not null default true,
    show_sparkline  boolean not null default false,

    -- Period count for trend/sparkline (how many periods to show)
    trend_periods   smallint not null default 6,

    created_at      timestamptz not null default now(),

    constraint uq_fin_kpi_pack_bind unique (pack_item_id, kpi_id)
);

create index if not exists idx_fin_kpi_pack_bind_item
    on fin.kpi_pack_binding(pack_item_id);
create index if not exists idx_fin_kpi_pack_bind_kpi
    on fin.kpi_pack_binding(kpi_id);

comment on table fin.kpi_pack_binding is
    'Links KPI definitions to report pack items. Enables KPI dashboards within governed management packs.';

-- ============================================================================
-- Extend report_pack_item to support KPI_DASHBOARD item type
-- ============================================================================
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.report_pack_item'::regclass
          AND conname LIKE '%item_type%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.report_pack_item DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.report_pack_item'::regclass
               AND conname LIKE '%item_type%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.report_pack_item
        ADD CONSTRAINT chk_fin_pack_item_type CHECK (
            item_type IN (
                'STATEMENT', 'COMPARISON', 'NARRATIVE',
                'SEPARATOR', 'KPI_DASHBOARD'
            )
        );
END $$;

-- ============================================================================
-- Helper function: Resolve GL value for a KPI formula leaf node
-- ============================================================================
create or replace function fin.resolve_kpi_gl_value(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_kpi_id        uuid,
    p_ref_name      varchar(50),
    p_fiscal_year   smallint,
    p_period_from   smallint,
    p_period_to     smallint,
    p_book_code     varchar(20) default 'STAT',
    p_dimension_set_id uuid default null
) returns decimal(18,4) language sql stable as $$
    select coalesce(sum(
        case b.balance_column
            when 'DEBIT'       then gl.period_debit
            when 'CREDIT'      then gl.period_credit
            when 'NET'         then gl.period_debit - gl.period_credit
            when 'CLOSING_NET' then gl.closing_debit - gl.closing_credit
        end
    ), 0)
    from fin.kpi_account_binding b
    join fin.chart_of_accounts a on (
        a.tenant_id = p_tenant_id
        and a.entity_code = p_entity_code
        and a.is_active = true
        and (
            (b.mapping_mode = 'EXACT'  and a.account_code = b.account_code)
            or (b.mapping_mode = 'RANGE' and a.account_code >= b.range_from
                and a.account_code <= b.range_to)
            or (b.mapping_mode = 'TYPE'  and a.account_type = b.account_type)
        )
        and (b.subledger_type is null or a.subledger_type = b.subledger_type)
    )
    join fin.gl_balance gl on (
        gl.tenant_id = p_tenant_id
        and gl.entity_code = p_entity_code
        and gl.account_id = a.id
        and gl.fiscal_year = p_fiscal_year
        and gl.period_number between p_period_from and p_period_to
        and gl.book_code = p_book_code
        and (p_dimension_set_id is null or gl.dimension_set_id = p_dimension_set_id)
    )
    where b.kpi_id = p_kpi_id
      and b.ref_name = p_ref_name;
$$;

-- ============================================================================
-- View: KPI dashboard summary (latest values with threshold status)
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_kpi_dashboard CASCADE;
create or replace view fin.vw_kpi_dashboard as
select
    e.tenant_id,
    e.entity_code,
    d.kpi_code,
    d.kpi_name,
    d.category,
    d.unit,
    d.sign_rule,
    d.decimal_places,
    e.fiscal_year,
    e.period_number,
    e.book_code,
    e.dimension_set_id,
    ds.display_label as dimension_label,
    e.value,
    e.comparison_value,
    e.variance_amount,
    e.variance_pct,
    e.threshold_severity,
    e.calculated_at
from fin.kpi_execution e
join fin.kpi_definition d on d.id = e.kpi_id
left join fin.dimension_set ds on ds.id = e.dimension_set_id
where e.is_current = true
  and d.is_active = true;

comment on view fin.vw_kpi_dashboard is
    'Dashboard-ready view of latest KPI values with threshold status, joined to definition metadata.';
