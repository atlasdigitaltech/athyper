/* ============================================================================
   Athyper v2.3 — Reporting Analytics Engine
   Schema: fin
   Dependencies: 190_posting.sql (fin.gl_balance, fin.chart_of_accounts,
                 fin.fiscal_period, fin.journal_entry, fin.journal_line)
                 191_ledger_dimensions.sql (fin.dimension_set, fin.dimension_set_item,
                 fin.dimension_type, fin.dimension_value)
                 192_ledger_book.sql (fin.ledger_book — optional, book-aware cubes)
                 150_event_store.sql (evt.event — event-driven refresh tracking)

   Provides compressed analytic structures for reporting, dashboards, and
   near-real-time finance analytics without hammering the authoritative
   gl_balance table.

   Architecture: two-layer read-optimized projection

     Layer 1 — Dimension Compression Projection:
       fin.dimension_set_flat (materialized view)
         Pivots dimension_set_item into named columns for direct SQL joins.
         Eliminates repeated joins through dimension_set_item → dimension_value
         for every report run. Immutable source = cheap REFRESH CONCURRENTLY.

     Layer 2 — Reporting Cube Materialization:
       fin.rpt_cube_definition    — Metadata: cube families, dimensions, refresh mode
       fin.rpt_balance_cube       — Pre-aggregated monthly balance cube (wide table)
       fin.rpt_cube_refresh_run   — Tracks incremental/batch refresh jobs

   Design principles:
     1. Cubes are PROJECTIONS, never source of truth — all corrections, reversals,
        and audit lineage stay in journal_entry / gl_balance
     2. Every cube is fully rebuildable from gl_balance + dimension_set + masters
     3. Book-aware: cubes include book_code (from 192_ledger_book.sql)
     4. Blueprint-selective: cube families enabled per blueprint tier (A-F)
     5. Period-close aware: frozen periods marked with close snapshot version
     6. Event-driven incremental refresh (primary) + batch rebuild (fallback)
     7. Monthly grain first — daily/hourly only if operationally justified

   Guardrails:
     - Cubes MUST NOT be used for: posting, corrections, reversals, audit
     - Cubes MUST be rebuildable: DELETE + repopulate from gl_balance at any time
     - Only governed dimension types are materialized as flat columns
     - Custom/tenant-specific dimensions use the JSONB overflow column

   Query pattern improvement:
     WITHOUT cube: gl_balance → dimension_set → dimension_set_item (×N) → dimension_value → filter/group
     WITH cube:    rpt_balance_cube → filter direct columns → aggregate
   ============================================================================ */

-- ============================================================================
-- Layer 1: fin.dimension_set_flat — Flattened dimension pivot
-- ============================================================================
-- Pivots common dimension types from dimension_set_item into named columns.
-- Backed by a materialized view for zero-write-cost maintenance.
-- Since dimension_set and its items are IMMUTABLE, refresh only needs to
-- pick up newly created sets — existing rows never change.
--
-- Strategy: hybrid flat columns + JSONB overflow
--   - Flat columns for governed system dimensions (fast SQL filtering)
--   - extra_dimensions JSONB for tenant-specific custom dimensions
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS fin.dimension_set_flat AS
SELECT
    ds.id                   AS dimension_set_id,
    ds.tenant_id,
    ds.entity_code,
    ds.dimension_count,
    ds.display_label,
    -- System dimension columns (pivoted from dimension_set_item)
    -- Each LEFT JOIN pulls the value_id for a specific dimension type code.
    -- NULL = this set does not include that dimension type.
    cc.dimension_value_id   AS cost_center_value_id,
    pc.dimension_value_id   AS profit_center_value_id,
    prj.dimension_value_id  AS project_value_id,
    reg.dimension_value_id  AS region_value_id,
    seg.dimension_value_id  AS segment_value_id,
    loc.dimension_value_id  AS location_value_id,
    func.dimension_value_id AS function_value_id,
    ico.dimension_value_id  AS intercompany_value_id,
    -- JSONB overflow: all dimension pairs for custom/uncommon types
    -- Enables flexible querying without schema changes when tenants add types
    (
        SELECT jsonb_object_agg(dt.code, dsi_all.dimension_value_id)
        FROM fin.dimension_set_item dsi_all
        JOIN fin.dimension_type dt ON dt.id = dsi_all.dimension_type_id
        WHERE dsi_all.dimension_set_id = ds.id
          AND dt.code NOT IN ('COST_CENTER','PROFIT_CENTER','PROJECT',
                              'REGION','SEGMENT','LOCATION','FUNCTION',
                              'INTERCOMPANY')
    )                       AS extra_dimensions
FROM fin.dimension_set ds
-- Cost Center
LEFT JOIN fin.dimension_set_item cc
    ON cc.dimension_set_id = ds.id
    AND cc.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'COST_CENTER' LIMIT 1
    )
-- Profit Center
LEFT JOIN fin.dimension_set_item pc
    ON pc.dimension_set_id = ds.id
    AND pc.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'PROFIT_CENTER' LIMIT 1
    )
-- Project
LEFT JOIN fin.dimension_set_item prj
    ON prj.dimension_set_id = ds.id
    AND prj.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'PROJECT' LIMIT 1
    )
-- Region
LEFT JOIN fin.dimension_set_item reg
    ON reg.dimension_set_id = ds.id
    AND reg.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'REGION' LIMIT 1
    )
-- Segment
LEFT JOIN fin.dimension_set_item seg
    ON seg.dimension_set_id = ds.id
    AND seg.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'SEGMENT' LIMIT 1
    )
-- Location
LEFT JOIN fin.dimension_set_item loc
    ON loc.dimension_set_id = ds.id
    AND loc.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'LOCATION' LIMIT 1
    )
-- Function
LEFT JOIN fin.dimension_set_item func
    ON func.dimension_set_id = ds.id
    AND func.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'FUNCTION' LIMIT 1
    )
-- Intercompany
LEFT JOIN fin.dimension_set_item ico
    ON ico.dimension_set_id = ds.id
    AND ico.dimension_type_id = (
        SELECT id FROM fin.dimension_type
        WHERE tenant_id = ds.tenant_id AND entity_code = ds.entity_code
          AND code = 'INTERCOMPANY' LIMIT 1
    )
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS uq_dim_set_flat_id
    ON fin.dimension_set_flat(dimension_set_id);

-- Query acceleration indexes
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_tenant
    ON fin.dimension_set_flat(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_cc
    ON fin.dimension_set_flat(cost_center_value_id)
    WHERE cost_center_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_pc
    ON fin.dimension_set_flat(profit_center_value_id)
    WHERE profit_center_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_project
    ON fin.dimension_set_flat(project_value_id)
    WHERE project_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_region
    ON fin.dimension_set_flat(region_value_id)
    WHERE region_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dim_set_flat_segment
    ON fin.dimension_set_flat(segment_value_id)
    WHERE segment_value_id IS NOT NULL;

-- Initial population (will be empty until first REFRESH)
-- Application runs: REFRESH MATERIALIZED VIEW CONCURRENTLY fin.dimension_set_flat;

-- ============================================================================
-- Layer 2: Reporting Cube Engine
-- ============================================================================

-- ============================================================================
-- fin.rpt_cube_definition — Cube family metadata
-- ============================================================================
-- Describes what cube families exist, which dimensions they include,
-- which blueprints/tenants they are enabled for, and how they refresh.
--
-- This makes cube materialization META-DRIVEN: the projection engine reads
-- cube definitions to know what to build, rather than hardcoded logic.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_cube_definition (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Identity
    cube_code       VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Classification
    cube_type       VARCHAR(20) NOT NULL DEFAULT 'FS'
                    CHECK (cube_type IN (
                        'FS',       -- Financial Statement (P&L, BS, CF)
                        'MGMT',     -- Management Analytics (internal reporting)
                        'OPS',      -- Operational Cost (projects, manufacturing)
                        'IC'        -- Intercompany / Consolidation
                    )),

    -- Grain
    grain           VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
                    CHECK (grain IN ('MONTHLY', 'DAILY')),

    -- Dimension layout: which dimension_type codes are included as cube axes
    -- Array of dimension_type.code values, e.g. ['COST_CENTER', 'PROFIT_CENTER']
    -- The cube engine uses this to know which flat columns to populate
    dimension_codes TEXT[] NOT NULL,

    -- Measure layout: which measures to include
    -- Default measures: amount_dr, amount_cr, amount_net
    -- Optional: opening_dr, opening_cr, closing_dr, closing_cr
    measure_codes   TEXT[] NOT NULL DEFAULT '{amount_dr,amount_cr,amount_net}',

    -- Account filter: restrict cube to specific account types
    -- NULL = all account types included
    account_types   TEXT[],             -- e.g., {'REVENUE','EXPENSE'} for P&L cube

    -- Book filter: restrict cube to specific ledger books
    -- NULL = primary book only
    book_codes      TEXT[],             -- e.g., {'STAT','MGMT'}

    -- Refresh configuration
    refresh_mode    VARCHAR(20) NOT NULL DEFAULT 'EVENT'
                    CHECK (refresh_mode IN (
                        'EVENT',    -- Incremental via event-driven projection
                        'BATCH',    -- Nightly/on-demand full rebuild
                        'HYBRID'    -- Event-driven + periodic full reconciliation
                    )),

    -- Retention: how many fiscal years to keep in the cube
    retention_years SMALLINT NOT NULL DEFAULT 3,

    -- Enablement
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Tracking
    last_built_at   TIMESTAMPTZ,
    last_full_rebuild_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_rpt_cube_def UNIQUE (tenant_id, entity_code, cube_code)
);

CREATE INDEX IF NOT EXISTS idx_rpt_cube_def_tenant
    ON fin.rpt_cube_definition(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_rpt_cube_def_active
    ON fin.rpt_cube_definition(tenant_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- fin.rpt_balance_cube — Pre-aggregated monthly reporting cube
-- ============================================================================
-- Wide analytic projection table. NOT a normalized transactional model.
-- Each row represents the balance for one (account, period, book, dimension
-- combination) intersection.
--
-- Design decisions:
--   - Flat dimension columns for the 8 governed types (same as dimension_set_flat)
--   - JSONB overflow for custom dimensions
--   - dimension_set_id retained for traceability back to authoritative source
--   - book_code included for multi-book awareness
--   - source_row_count tracks how many gl_balance rows were aggregated
--   - cube_code identifies which cube_definition produced this row
--
-- This table is DELETABLE and REBUILDABLE. It is never the source of truth.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_balance_cube (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Cube identity
    cube_code       VARCHAR(50) NOT NULL,

    -- Book (from 192_ledger_book.sql; defaults to 'STAT' for single-book tenants)
    book_code       VARCHAR(20) NOT NULL DEFAULT 'STAT',

    -- Period grain
    fiscal_year     SMALLINT NOT NULL,
    period_number   SMALLINT NOT NULL,
    currency_code   VARCHAR(3) NOT NULL,

    -- Account
    account_id      UUID NOT NULL REFERENCES fin.chart_of_accounts(id),
    account_code    VARCHAR(20) NOT NULL,      -- denormalized for query speed
    account_type    VARCHAR(20) NOT NULL,       -- denormalized: ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE

    -- Dimension axes (flat columns — NULL = not applicable for this cube/set)
    cost_center_value_id        UUID,
    profit_center_value_id      UUID,
    project_value_id            UUID,
    region_value_id             UUID,
    segment_value_id            UUID,
    location_value_id           UUID,
    function_value_id           UUID,
    intercompany_value_id       UUID,

    -- Overflow for custom dimensions
    extra_dimensions            JSONB,

    -- Traceability
    dimension_set_id            UUID,          -- link back to authoritative dimension_set

    -- Measures
    opening_debit               DECIMAL(18,4) NOT NULL DEFAULT 0,
    opening_credit              DECIMAL(18,4) NOT NULL DEFAULT 0,
    period_debit                DECIMAL(18,4) NOT NULL DEFAULT 0,
    period_credit               DECIMAL(18,4) NOT NULL DEFAULT 0,
    closing_debit               DECIMAL(18,4) NOT NULL DEFAULT 0,
    closing_credit              DECIMAL(18,4) NOT NULL DEFAULT 0,
    amount_net                  DECIMAL(18,4) NOT NULL DEFAULT 0,   -- period_debit - period_credit

    -- Aggregation metadata
    source_row_count            INTEGER NOT NULL DEFAULT 1,

    -- Period close status snapshot
    period_status               VARCHAR(20),   -- OPEN/SOFT_CLOSE/HARD_CLOSE at refresh time
    close_snapshot_version      INTEGER,        -- incremented at hard close

    -- Refresh tracking
    last_refresh_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Grain uniqueness: one row per cube × book × period × account × dimension intersection
    CONSTRAINT uq_fin_rpt_cube_row UNIQUE (
        tenant_id, entity_code, cube_code, book_code,
        fiscal_year, period_number, currency_code,
        account_id, dimension_set_id
    )
);

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_rpt_cube_tenant
    ON fin.rpt_balance_cube(tenant_id, entity_code, cube_code);
CREATE INDEX IF NOT EXISTS idx_rpt_cube_period
    ON fin.rpt_balance_cube(tenant_id, entity_code, cube_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_rpt_cube_account_type
    ON fin.rpt_balance_cube(tenant_id, cube_code, account_type);

-- Dimension drilldown indexes
CREATE INDEX IF NOT EXISTS idx_rpt_cube_cc
    ON fin.rpt_balance_cube(cost_center_value_id)
    WHERE cost_center_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rpt_cube_pc
    ON fin.rpt_balance_cube(profit_center_value_id)
    WHERE profit_center_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rpt_cube_project
    ON fin.rpt_balance_cube(project_value_id)
    WHERE project_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rpt_cube_region
    ON fin.rpt_balance_cube(region_value_id)
    WHERE region_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rpt_cube_segment
    ON fin.rpt_balance_cube(segment_value_id)
    WHERE segment_value_id IS NOT NULL;

-- Book-based query pattern
CREATE INDEX IF NOT EXISTS idx_rpt_cube_book
    ON fin.rpt_balance_cube(tenant_id, entity_code, book_code, cube_code);

-- Period-over-period comparison pattern
CREATE INDEX IF NOT EXISTS idx_rpt_cube_yoy
    ON fin.rpt_balance_cube(tenant_id, entity_code, cube_code, account_id, fiscal_year);

-- ============================================================================
-- fin.rpt_cube_refresh_run — Refresh job tracking
-- ============================================================================
-- Tracks every incremental and full rebuild execution against a cube.
-- Used for:
--   - Incremental catch-up: last_event_sequence_no marks where to resume
--   - Rebuild auditing: who triggered, duration, row counts
--   - Reconciliation: compare cube totals vs. gl_balance after rebuild
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_cube_refresh_run (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    cube_code       VARCHAR(50) NOT NULL,

    -- Run classification
    run_type        VARCHAR(20) NOT NULL
                    CHECK (run_type IN (
                        'INCREMENTAL',      -- event-driven delta
                        'FULL_REBUILD',      -- complete rebuild from gl_balance
                        'PERIOD_FREEZE',     -- snapshot at period hard close
                        'RECONCILIATION'     -- verify cube vs. gl_balance
                    )),

    -- Scope
    fiscal_year     SMALLINT,           -- NULL = all years
    period_number   SMALLINT,           -- NULL = all periods
    book_code       VARCHAR(20),        -- NULL = all books

    -- Event tracking (for incremental mode)
    -- The projection engine reads events after this sequence_no
    from_event_sequence BIGINT,
    to_event_sequence   BIGINT,

    -- Results
    rows_inserted   INTEGER NOT NULL DEFAULT 0,
    rows_updated    INTEGER NOT NULL DEFAULT 0,
    rows_deleted    INTEGER NOT NULL DEFAULT 0,
    total_cube_rows INTEGER,            -- total rows in cube after this run

    -- Reconciliation (for RECONCILIATION runs)
    gl_balance_total    DECIMAL(18,4),  -- sum from authoritative gl_balance
    cube_total          DECIMAL(18,4),  -- sum from cube
    variance            DECIMAL(18,4),  -- difference (should be 0)
    is_reconciled       BOOLEAN,

    -- Execution
    status          VARCHAR(20) NOT NULL DEFAULT 'RUNNING'
                    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,            -- computed: completed_at - started_at
    error_message   TEXT,

    triggered_by    UUID,               -- actor who initiated the run
    trigger_source  VARCHAR(20) NOT NULL DEFAULT 'EVENT'
                    CHECK (trigger_source IN ('EVENT', 'SCHEDULER', 'MANUAL', 'PERIOD_CLOSE'))
);

CREATE INDEX IF NOT EXISTS idx_rpt_refresh_tenant
    ON fin.rpt_cube_refresh_run(tenant_id, entity_code, cube_code);
CREATE INDEX IF NOT EXISTS idx_rpt_refresh_status
    ON fin.rpt_cube_refresh_run(status) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS idx_rpt_refresh_latest
    ON fin.rpt_cube_refresh_run(tenant_id, entity_code, cube_code, started_at DESC);

-- ============================================================================
-- Helper: fin.refresh_balance_cube() — Full rebuild for a specific cube+period
-- ============================================================================
-- Deletes existing cube rows for the given scope and repopulates from
-- gl_balance + dimension_set_flat. This is the BATCH rebuild path.
--
-- For incremental (EVENT) refresh, the application-layer projection engine
-- handles delta processing via the event store.
--
-- Parameters:
--   p_tenant_id, p_entity_code — tenant scope
--   p_cube_code — which cube to rebuild
--   p_fiscal_year, p_period_number — period scope (NULL = all)
--   p_triggered_by — actor UUID for audit
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.refresh_balance_cube(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_cube_code     VARCHAR(50),
    p_fiscal_year   SMALLINT DEFAULT NULL,
    p_period_number SMALLINT DEFAULT NULL,
    p_triggered_by  UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_run_id        UUID;
    v_cube_def      RECORD;
    v_rows_deleted  INTEGER;
    v_rows_inserted INTEGER;
    v_start         TIMESTAMPTZ := clock_timestamp();
    v_period_status VARCHAR(20);
BEGIN
    -- Load cube definition
    SELECT * INTO v_cube_def
    FROM fin.rpt_cube_definition
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND cube_code = p_cube_code
      AND is_active = TRUE;

    IF v_cube_def IS NULL THEN
        RAISE EXCEPTION 'No active cube definition found for % / % / %',
            p_tenant_id, p_entity_code, p_cube_code;
    END IF;

    -- Create refresh run record
    INSERT INTO fin.rpt_cube_refresh_run (
        tenant_id, entity_code, cube_code, run_type,
        fiscal_year, period_number, triggered_by, trigger_source
    ) VALUES (
        p_tenant_id, p_entity_code, p_cube_code, 'FULL_REBUILD',
        p_fiscal_year, p_period_number, p_triggered_by, 'MANUAL'
    ) RETURNING id INTO v_run_id;

    -- Delete existing rows in scope
    DELETE FROM fin.rpt_balance_cube
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND cube_code = p_cube_code
      AND (p_fiscal_year IS NULL OR fiscal_year = p_fiscal_year)
      AND (p_period_number IS NULL OR period_number = p_period_number);

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    -- Repopulate from gl_balance + dimension_set_flat
    -- The INSERT selects from gl_balance, joins dimension_set_flat for
    -- flattened dimension columns, and filters by the cube definition's
    -- account_types and book_codes.
    INSERT INTO fin.rpt_balance_cube (
        tenant_id, entity_code, cube_code, book_code,
        fiscal_year, period_number, currency_code,
        account_id, account_code, account_type,
        cost_center_value_id, profit_center_value_id,
        project_value_id, region_value_id, segment_value_id,
        location_value_id, function_value_id, intercompany_value_id,
        extra_dimensions, dimension_set_id,
        opening_debit, opening_credit,
        period_debit, period_credit,
        closing_debit, closing_credit,
        amount_net,
        source_row_count,
        period_status,
        last_refresh_at
    )
    SELECT
        b.tenant_id,
        b.entity_code,
        p_cube_code,
        COALESCE(b.book_code, 'STAT'),
        b.fiscal_year,
        b.period_number,
        b.currency_code,
        b.account_id,
        coa.account_code,
        coa.account_type,
        -- Flat dimension columns from the materialized view
        f.cost_center_value_id,
        f.profit_center_value_id,
        f.project_value_id,
        f.region_value_id,
        f.segment_value_id,
        f.location_value_id,
        f.function_value_id,
        f.intercompany_value_id,
        f.extra_dimensions,
        b.dimension_set_id,
        -- Measures
        b.opening_debit,
        b.opening_credit,
        b.period_debit,
        b.period_credit,
        b.closing_debit,
        b.closing_credit,
        (b.period_debit - b.period_credit),
        1,          -- source_row_count: 1:1 mapping from gl_balance
        fp.status,  -- period status at refresh time
        now()
    FROM fin.gl_balance b
    JOIN fin.chart_of_accounts coa
        ON coa.id = b.account_id
    LEFT JOIN fin.dimension_set_flat f
        ON f.dimension_set_id = b.dimension_set_id
    LEFT JOIN fin.fiscal_period fp
        ON fp.tenant_id = b.tenant_id
        AND fp.entity_code = b.entity_code
        AND fp.fiscal_year = b.fiscal_year
        AND fp.period_number = b.period_number
    WHERE b.tenant_id = p_tenant_id
      AND b.entity_code = p_entity_code
      -- Period scope
      AND (p_fiscal_year IS NULL OR b.fiscal_year = p_fiscal_year)
      AND (p_period_number IS NULL OR b.period_number = p_period_number)
      -- Account type filter from cube definition
      AND (v_cube_def.account_types IS NULL
           OR coa.account_type = ANY(v_cube_def.account_types))
      -- Book filter from cube definition
      AND (v_cube_def.book_codes IS NULL
           OR COALESCE(b.book_code, 'STAT') = ANY(v_cube_def.book_codes))
    ON CONFLICT (tenant_id, entity_code, cube_code, book_code,
                 fiscal_year, period_number, currency_code,
                 account_id, dimension_set_id)
    DO UPDATE SET
        opening_debit  = EXCLUDED.opening_debit,
        opening_credit = EXCLUDED.opening_credit,
        period_debit   = EXCLUDED.period_debit,
        period_credit  = EXCLUDED.period_credit,
        closing_debit  = EXCLUDED.closing_debit,
        closing_credit = EXCLUDED.closing_credit,
        amount_net     = EXCLUDED.amount_net,
        period_status  = EXCLUDED.period_status,
        last_refresh_at = now();

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    -- Update refresh run with results
    UPDATE fin.rpt_cube_refresh_run
    SET status = 'COMPLETED',
        rows_deleted = v_rows_deleted,
        rows_inserted = v_rows_inserted,
        total_cube_rows = (
            SELECT count(*) FROM fin.rpt_balance_cube
            WHERE tenant_id = p_tenant_id
              AND entity_code = p_entity_code
              AND cube_code = p_cube_code
        ),
        completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECOND FROM clock_timestamp() - v_start)::INTEGER
    WHERE id = v_run_id;

    -- Update cube definition tracking
    UPDATE fin.rpt_cube_definition
    SET last_built_at = now(),
        last_full_rebuild_at = now(),
        updated_at = now()
    WHERE id = v_cube_def.id;

    RETURN v_run_id;
END $fn$;

-- ============================================================================
-- Helper: fin.reconcile_cube() — Verify cube vs. gl_balance integrity
-- ============================================================================
-- Compares the net balance totals between the cube and gl_balance for a
-- given period scope. Returns the refresh_run_id with reconciliation results.
-- Should be run after period close or on a schedule for assurance.
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.reconcile_cube(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_cube_code     VARCHAR(50),
    p_fiscal_year   SMALLINT,
    p_period_number SMALLINT,
    p_triggered_by  UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_run_id        UUID;
    v_cube_def      RECORD;
    v_gl_total      DECIMAL(18,4);
    v_cube_total    DECIMAL(18,4);
    v_variance      DECIMAL(18,4);
BEGIN
    -- Load cube definition
    SELECT * INTO v_cube_def
    FROM fin.rpt_cube_definition
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND cube_code = p_cube_code
      AND is_active = TRUE;

    IF v_cube_def IS NULL THEN
        RAISE EXCEPTION 'No active cube definition found for reconciliation';
    END IF;

    -- Sum from authoritative gl_balance
    SELECT COALESCE(SUM(period_debit - period_credit), 0)
    INTO v_gl_total
    FROM fin.gl_balance b
    JOIN fin.chart_of_accounts coa ON coa.id = b.account_id
    WHERE b.tenant_id = p_tenant_id
      AND b.entity_code = p_entity_code
      AND b.fiscal_year = p_fiscal_year
      AND b.period_number = p_period_number
      AND (v_cube_def.account_types IS NULL
           OR coa.account_type = ANY(v_cube_def.account_types))
      AND (v_cube_def.book_codes IS NULL
           OR COALESCE(b.book_code, 'STAT') = ANY(v_cube_def.book_codes));

    -- Sum from cube
    SELECT COALESCE(SUM(amount_net), 0)
    INTO v_cube_total
    FROM fin.rpt_balance_cube
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND cube_code = p_cube_code
      AND fiscal_year = p_fiscal_year
      AND period_number = p_period_number;

    v_variance := v_gl_total - v_cube_total;

    -- Record reconciliation run
    INSERT INTO fin.rpt_cube_refresh_run (
        tenant_id, entity_code, cube_code, run_type,
        fiscal_year, period_number,
        gl_balance_total, cube_total, variance, is_reconciled,
        status, completed_at,
        duration_ms, triggered_by, trigger_source
    ) VALUES (
        p_tenant_id, p_entity_code, p_cube_code, 'RECONCILIATION',
        p_fiscal_year, p_period_number,
        v_gl_total, v_cube_total, v_variance, (v_variance = 0),
        'COMPLETED', now(),
        0, p_triggered_by, 'MANUAL'
    ) RETURNING id INTO v_run_id;

    RETURN v_run_id;
END $fn$;

-- ============================================================================
-- Add book_code to gl_balance if not present (from 192_ledger_book.sql)
-- This is a safe no-op if ledger_book.sql already added it.
-- ============================================================================
ALTER TABLE fin.gl_balance
    ADD COLUMN IF NOT EXISTS book_code VARCHAR(20) NOT NULL DEFAULT 'STAT';

-- ============================================================================
-- fin.rpt_report_preset — Saved report configurations
-- ============================================================================
-- Stores named parameter combinations for one-click report loading.
-- Follows the same scope model as ui.saved_view:
--   USER   — personal, owned by principal
--   SHARED — team/department level
--   SYSTEM — global, admin/seed-created
--
-- Parameters are stored as JSONB matching the report's filter interface
-- (PnLReportFilters, MonthEndAnalysisFilters, DrilldownRequest).
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_report_preset (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,

    -- Identity
    preset_code         VARCHAR(80) NOT NULL,
    preset_name         VARCHAR(200) NOT NULL,
    description         TEXT,

    -- Classification
    report_type         VARCHAR(20) NOT NULL
                        CHECK (report_type IN ('pnl', 'drilldown', 'month_end')),

    -- Visibility
    scope               VARCHAR(10) NOT NULL DEFAULT 'USER'
                        CHECK (scope IN ('SYSTEM', 'USER', 'SHARED')),
    owner_principal_id  UUID REFERENCES core.principal(id) ON DELETE CASCADE,

    -- Configuration payload
    parameters          JSONB NOT NULL,
    state_hash          VARCHAR(64) NOT NULL,       -- SHA-256 truncated, for dirty detection

    -- Flags
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Versioning (optimistic concurrency)
    version             INT NOT NULL DEFAULT 1,

    -- Soft delete
    deleted_at          TIMESTAMPTZ,

    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          TEXT NOT NULL,
    updated_at          TIMESTAMPTZ,
    updated_by          TEXT,

    CONSTRAINT uq_rpt_preset_tenant_scope_code
        UNIQUE NULLS NOT DISTINCT (tenant_id, scope, owner_principal_id, preset_code)
);

CREATE INDEX IF NOT EXISTS idx_rpt_preset_tenant
    ON fin.rpt_report_preset(tenant_id, scope)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_preset_owner
    ON fin.rpt_report_preset(owner_principal_id)
    WHERE deleted_at IS NULL AND scope = 'USER';
