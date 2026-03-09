-- ============================================================================
-- 194_statement_model.sql — Financial Statement Presentation Layer
-- ============================================================================
--
-- Provides structured financial statement rendering on top of the existing
-- chart-of-accounts hierarchy and reporting cube engine.
--
-- Architecture:
--   Layer A: COA hierarchy (existing chart_of_accounts with parent_id/level)
--            Enhanced with sort_order + materialized path for subtree queries.
--
--   Layer B: Statement presentation model
--            fin.rpt_statement_definition  — Statement templates (P&L, BS, CF)
--            fin.rpt_statement_row         — Row tree with types, formulas, sign rules
--            fin.rpt_statement_row_map     — Maps rows to accounts/subtrees/ranges
--
-- Key principle:
--   COA hierarchy organizes accounts.
--   Statement rows organize presentation.
--   These are deliberately separate concerns.
--
-- ============================================================================


-- ============================================================================
-- Layer A: COA Hierarchy Enhancement
-- ============================================================================
-- chart_of_accounts already has parent_id + level + is_group.
-- Add sort_order for explicit ordering and path for fast subtree matching.
-- ============================================================================

ALTER TABLE fin.chart_of_accounts
    ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE fin.chart_of_accounts
    ADD COLUMN IF NOT EXISTS path TEXT;

-- Backfill path from account_code (simple default: account_code itself)
-- Real path computation happens via the helper function below.
UPDATE fin.chart_of_accounts
SET path = account_code
WHERE path IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_coa_path
    ON fin.chart_of_accounts(tenant_id, entity_code, path text_pattern_ops)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fin_coa_sort
    ON fin.chart_of_accounts(tenant_id, entity_code, parent_id, sort_order);

-- ============================================================================
-- Helper: fin.rebuild_coa_paths() — Rebuild materialized paths
-- ============================================================================
-- Computes materialized paths for the entire COA tree using a recursive CTE.
-- Path format: "1000/1100/1110" (account_code separated by /)
-- Should be called after COA structure changes.
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.rebuild_coa_paths(
    p_tenant_id   UUID,
    p_entity_code VARCHAR(20)
) RETURNS INTEGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_updated INTEGER;
BEGIN
    WITH RECURSIVE tree AS (
        -- Roots: accounts with no parent
        SELECT id, account_code, account_code AS computed_path, 1 AS computed_level
        FROM fin.chart_of_accounts
        WHERE tenant_id = p_tenant_id
          AND entity_code = p_entity_code
          AND parent_id IS NULL
        UNION ALL
        -- Children
        SELECT c.id, c.account_code,
               tree.computed_path || '/' || c.account_code,
               tree.computed_level + 1
        FROM fin.chart_of_accounts c
        JOIN tree ON tree.id = c.parent_id
        WHERE c.tenant_id = p_tenant_id
          AND c.entity_code = p_entity_code
    )
    UPDATE fin.chart_of_accounts coa
    SET path = tree.computed_path,
        level = tree.computed_level
    FROM tree
    WHERE coa.id = tree.id
      AND (coa.path IS DISTINCT FROM tree.computed_path
           OR coa.level IS DISTINCT FROM tree.computed_level);

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END $fn$;


-- ============================================================================
-- Layer B: Financial Statement Presentation Model
-- ============================================================================


-- ============================================================================
-- fin.rpt_statement_definition — Statement templates
-- ============================================================================
-- Master for statement types: P&L, Balance Sheet, Cash Flow, Management P&L.
-- Each definition owns a tree of statement rows.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_statement_definition (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,

    -- Identity
    statement_code  VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Classification
    statement_type  VARCHAR(20) NOT NULL
                    CHECK (statement_type IN (
                        'PNL',              -- Profit & Loss
                        'BALANCE_SHEET',    -- Balance Sheet
                        'CASH_FLOW',        -- Cash Flow Statement
                        'MGMT_PNL',         -- Management P&L
                        'CUSTOM'            -- Custom statement
                    )),

    -- Scope
    scope           VARCHAR(10) NOT NULL DEFAULT 'TENANT'
                    CHECK (scope IN ('SYSTEM', 'TENANT')),

    -- Optional book restriction (NULL = all books)
    book_code       VARCHAR(20),

    -- Currency display mode
    currency_mode   VARCHAR(20) NOT NULL DEFAULT 'LEDGER'
                    CHECK (currency_mode IN (
                        'LEDGER',           -- Use ledger base currency
                        'REPORTING',        -- Use reporting currency
                        'TRANSACTION'       -- Show in transaction currency
                    )),

    -- Versioning
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    version         INT NOT NULL DEFAULT 1,
    state_hash      VARCHAR(64),

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT NOT NULL,
    updated_at      TIMESTAMPTZ,
    updated_by      TEXT,

    CONSTRAINT uq_rpt_stmt_def
        UNIQUE (tenant_id, statement_code)
);

CREATE INDEX IF NOT EXISTS idx_rpt_stmt_def_tenant
    ON fin.rpt_statement_definition(tenant_id, is_active)
    WHERE is_active = TRUE;


-- ============================================================================
-- fin.rpt_statement_row — Statement row tree
-- ============================================================================
-- Defines the hierarchical structure of rows within a statement.
-- Rows can be: headings, account lines, subtotals, formulas, ratios, spacers.
--
-- Key design:
--   - parent_row_id creates the tree (like COA parent_id)
--   - sort_order controls presentation order
--   - row_type determines rendering behavior
--   - formula_expression references other row_codes for computed rows
--   - sign_policy controls how amounts display
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_statement_row (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    statement_definition_id UUID NOT NULL
                            REFERENCES fin.rpt_statement_definition(id) ON DELETE CASCADE,

    -- Identity
    row_code                VARCHAR(50) NOT NULL,
    label                   VARCHAR(200) NOT NULL,

    -- Classification
    row_type                VARCHAR(20) NOT NULL
                            CHECK (row_type IN (
                                'HEADING',      -- Section header (no amount)
                                'LINE',         -- Maps to account(s) via row_map
                                'SUBTOTAL',     -- Sum of sibling LINE rows, or formula
                                'FORMULA',      -- Calculated from other rows
                                'RATIO',        -- Percentage/ratio formula
                                'SPACER'        -- Visual separator (no data)
                            )),

    -- Hierarchy
    parent_row_id           UUID REFERENCES fin.rpt_statement_row(id) ON DELETE CASCADE,
    sort_order              SMALLINT NOT NULL DEFAULT 0,
    depth                   SMALLINT NOT NULL DEFAULT 0,

    -- Display
    display_style           VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                            CHECK (display_style IN (
                                'NORMAL',       -- Regular row
                                'BOLD',         -- Bold text
                                'ITALIC',       -- Italic
                                'UNDERLINE',    -- Single underline
                                'DOUBLE_LINE',  -- Double underline (final totals)
                                'SHADED'        -- Background shading
                            )),

    -- Sign handling
    sign_policy             VARCHAR(20) NOT NULL DEFAULT 'NATURAL'
                            CHECK (sign_policy IN (
                                'NATURAL',          -- Show as-is from ledger
                                'DEBIT_POSITIVE',   -- Debit balances show positive
                                'CREDIT_POSITIVE',  -- Credit balances show positive
                                'ABSOLUTE',         -- Always positive
                                'INVERT'            -- Flip sign
                            )),

    -- Emphasis (additional visual treatment)
    emphasis_style          VARCHAR(20) DEFAULT 'NONE'
                            CHECK (emphasis_style IN (
                                'NONE',
                                'PRIMARY',      -- Primary color highlight
                                'SUCCESS',      -- Green (profit)
                                'DANGER',       -- Red (loss)
                                'MUTED'         -- Gray/subdued
                            )),

    -- Formula (for FORMULA, RATIO, SUBTOTAL with custom logic)
    -- References row_codes: "TOTAL_REVENUE - TOTAL_COS"
    formula_expression      TEXT,

    -- Behavior
    is_expandable           BOOLEAN NOT NULL DEFAULT FALSE,
    is_visible              BOOLEAN NOT NULL DEFAULT TRUE,
    show_zero               BOOLEAN NOT NULL DEFAULT TRUE,
    indent_level            SMALLINT NOT NULL DEFAULT 0,

    -- Notes
    notes                   TEXT,

    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              TEXT NOT NULL,
    updated_at              TIMESTAMPTZ,
    updated_by              TEXT,

    CONSTRAINT uq_rpt_stmt_row_code
        UNIQUE (tenant_id, statement_definition_id, row_code)
);

CREATE INDEX IF NOT EXISTS idx_rpt_stmt_row_def
    ON fin.rpt_statement_row(statement_definition_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_rpt_stmt_row_parent
    ON fin.rpt_statement_row(parent_row_id);


-- ============================================================================
-- fin.rpt_statement_row_map — Maps rows to ledger content
-- ============================================================================
-- Each row can have zero (headings, formulas) or many mappings.
-- Mappings define which account data aggregates into each row.
--
-- Supported strategies:
--   ACCOUNT          — Single GL account by ID
--   ACCOUNT_RANGE    — Account code range (from/to)
--   COA_SUBTREE      — All accounts under a COA parent node
--   ACCOUNT_CATEGORY — All accounts of a given type (REVENUE, EXPENSE, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.rpt_statement_row_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    statement_row_id    UUID NOT NULL
                        REFERENCES fin.rpt_statement_row(id) ON DELETE CASCADE,

    -- Mapping strategy
    map_type            VARCHAR(30) NOT NULL
                        CHECK (map_type IN (
                            'ACCOUNT',              -- Single GL account
                            'ACCOUNT_RANGE',        -- Range of account codes
                            'COA_SUBTREE',          -- Subtree under a COA parent
                            'ACCOUNT_CATEGORY'      -- All accounts of a type
                        )),

    -- For ACCOUNT mapping
    gl_account_id       UUID REFERENCES fin.chart_of_accounts(id),

    -- For COA_SUBTREE mapping
    coa_parent_id       UUID REFERENCES fin.chart_of_accounts(id),

    -- For ACCOUNT_CATEGORY mapping
    account_category    VARCHAR(20)
                        CHECK (account_category IS NULL
                               OR account_category IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),

    -- For ACCOUNT_RANGE mapping
    account_code_from   VARCHAR(20),
    account_code_to     VARCHAR(20),

    -- Optional dimension filter (e.g., restrict to a specific cost center)
    dimension_filter    JSONB,

    -- Optional book restriction
    book_code           VARCHAR(20),

    -- Subtree behavior
    include_children    BOOLEAN NOT NULL DEFAULT TRUE,
    exclude_contra      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Aggregation weight (default 1.0; use -1.0 for contra entries)
    weight              DECIMAL(5,2) NOT NULL DEFAULT 1.0,

    -- Ordering within a row (if multiple mappings)
    sort_order          SMALLINT NOT NULL DEFAULT 0,

    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          TEXT NOT NULL,

    CONSTRAINT chk_rpt_row_map_strategy CHECK (
        (map_type = 'ACCOUNT' AND gl_account_id IS NOT NULL)
        OR (map_type = 'ACCOUNT_RANGE' AND account_code_from IS NOT NULL AND account_code_to IS NOT NULL)
        OR (map_type = 'COA_SUBTREE' AND coa_parent_id IS NOT NULL)
        OR (map_type = 'ACCOUNT_CATEGORY' AND account_category IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_rpt_row_map_row
    ON fin.rpt_statement_row_map(statement_row_id);

CREATE INDEX IF NOT EXISTS idx_rpt_row_map_account
    ON fin.rpt_statement_row_map(gl_account_id)
    WHERE gl_account_id IS NOT NULL;


-- ============================================================================
-- fin.render_statement() — Render a financial statement from cube data
-- ============================================================================
-- Resolves row mappings → aggregates from rpt_balance_cube → evaluates
-- formulas → returns ordered result set ready for UI rendering.
--
-- Parameters:
--   p_tenant_id, p_entity_code  — tenant scope
--   p_statement_code            — which statement to render
--   p_fiscal_year, p_period_from, p_period_to — period range
--   p_book_code                 — ledger book (NULL = statement default or 'STAT')
--   p_cube_code                 — cube to read from (default 'FS_MONTHLY')
--
-- Returns: ordered set of (row_code, label, amount, prior_amount, ...)
-- Formula rows are left as NULL — evaluated client-side for flexibility.
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.render_statement(
    p_tenant_id       UUID,
    p_entity_code     VARCHAR(20),
    p_statement_code  VARCHAR(50),
    p_fiscal_year     SMALLINT,
    p_period_from     SMALLINT DEFAULT 1,
    p_period_to       SMALLINT DEFAULT 12,
    p_book_code       VARCHAR(20) DEFAULT NULL,
    p_cube_code       VARCHAR(50) DEFAULT 'FS_MONTHLY'
) RETURNS TABLE (
    row_code          VARCHAR(50),
    label             VARCHAR(200),
    row_type          VARCHAR(20),
    depth             SMALLINT,
    sort_order        SMALLINT,
    parent_row_code   VARCHAR(50),
    display_style     VARCHAR(20),
    sign_policy       VARCHAR(20),
    emphasis_style    VARCHAR(20),
    formula_expression TEXT,
    indent_level      SMALLINT,
    is_expandable     BOOLEAN,
    is_visible        BOOLEAN,
    show_zero         BOOLEAN,
    -- Current period amounts
    amount_debit      DECIMAL(18,4),
    amount_credit     DECIMAL(18,4),
    amount_net        DECIMAL(18,4),
    -- Prior year amounts (same period range)
    prior_debit       DECIMAL(18,4),
    prior_credit      DECIMAL(18,4),
    prior_net         DECIMAL(18,4),
    -- Variance
    variance          DECIMAL(18,4),
    variance_pct      DECIMAL(10,4),
    -- Account detail (for LINE rows with single account)
    mapped_account_codes TEXT[]
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
    v_stmt_def      RECORD;
    v_effective_book VARCHAR(20);
BEGIN
    -- Load statement definition
    SELECT * INTO v_stmt_def
    FROM fin.rpt_statement_definition
    WHERE tenant_id = p_tenant_id
      AND statement_code = p_statement_code
      AND is_active = TRUE;

    IF v_stmt_def IS NULL THEN
        RAISE EXCEPTION 'No active statement definition found for %', p_statement_code;
    END IF;

    -- Resolve effective book
    v_effective_book := COALESCE(p_book_code, v_stmt_def.book_code, 'STAT');

    RETURN QUERY
    WITH row_tree AS (
        -- All rows for this statement, with parent code
        SELECT
            sr.id AS row_id,
            sr.row_code,
            sr.label,
            sr.row_type,
            sr.depth,
            sr.sort_order,
            pr.row_code AS parent_row_code,
            sr.display_style,
            sr.sign_policy,
            sr.emphasis_style,
            sr.formula_expression,
            sr.indent_level,
            sr.is_expandable,
            sr.is_visible,
            sr.show_zero
        FROM fin.rpt_statement_row sr
        LEFT JOIN fin.rpt_statement_row pr ON pr.id = sr.parent_row_id
        WHERE sr.tenant_id = p_tenant_id
          AND sr.statement_definition_id = v_stmt_def.id
    ),
    -- Resolve mapped accounts for each row
    row_accounts AS (
        SELECT
            rm.statement_row_id,
            array_agg(DISTINCT coa.account_code ORDER BY coa.account_code) AS account_codes,
            array_agg(DISTINCT coa.id) AS account_ids
        FROM fin.rpt_statement_row_map rm
        JOIN fin.rpt_statement_row sr ON sr.id = rm.statement_row_id
            AND sr.statement_definition_id = v_stmt_def.id
        LEFT JOIN fin.chart_of_accounts coa ON (
            -- ACCOUNT: direct match
            (rm.map_type = 'ACCOUNT' AND coa.id = rm.gl_account_id)
            -- COA_SUBTREE: all children under parent
            OR (rm.map_type = 'COA_SUBTREE'
                AND coa.tenant_id = p_tenant_id
                AND coa.entity_code = p_entity_code
                AND coa.is_active = TRUE
                AND (
                    coa.id = rm.coa_parent_id
                    OR (rm.include_children AND coa.parent_id = rm.coa_parent_id)
                    -- For deeper subtrees, use path-based matching
                    OR (rm.include_children AND coa.path LIKE (
                        SELECT pc.path || '/%'
                        FROM fin.chart_of_accounts pc
                        WHERE pc.id = rm.coa_parent_id
                    ))
                )
            )
            -- ACCOUNT_RANGE: code range
            OR (rm.map_type = 'ACCOUNT_RANGE'
                AND coa.tenant_id = p_tenant_id
                AND coa.entity_code = p_entity_code
                AND coa.is_active = TRUE
                AND coa.account_code >= rm.account_code_from
                AND coa.account_code <= rm.account_code_to
                AND coa.allow_direct_posting = TRUE
            )
            -- ACCOUNT_CATEGORY: all accounts of a type
            OR (rm.map_type = 'ACCOUNT_CATEGORY'
                AND coa.tenant_id = p_tenant_id
                AND coa.entity_code = p_entity_code
                AND coa.is_active = TRUE
                AND coa.account_type = rm.account_category
                AND coa.allow_direct_posting = TRUE
            )
        )
        WHERE rm.tenant_id = p_tenant_id
          AND coa.id IS NOT NULL
        GROUP BY rm.statement_row_id
    ),
    -- Aggregate current period amounts
    current_amounts AS (
        SELECT
            ra.statement_row_id,
            COALESCE(SUM(cube.period_debit), 0) AS amount_debit,
            COALESCE(SUM(cube.period_credit), 0) AS amount_credit,
            COALESCE(SUM(cube.amount_net), 0) AS amount_net
        FROM row_accounts ra
        CROSS JOIN LATERAL unnest(ra.account_ids) AS aid(account_id)
        LEFT JOIN fin.rpt_balance_cube cube ON
            cube.tenant_id = p_tenant_id
            AND cube.entity_code = p_entity_code
            AND cube.cube_code = p_cube_code
            AND cube.book_code = v_effective_book
            AND cube.fiscal_year = p_fiscal_year
            AND cube.period_number BETWEEN p_period_from AND p_period_to
            AND cube.account_id = aid.account_id
        GROUP BY ra.statement_row_id
    ),
    -- Aggregate prior year amounts (same period range)
    prior_amounts AS (
        SELECT
            ra.statement_row_id,
            COALESCE(SUM(cube.period_debit), 0) AS prior_debit,
            COALESCE(SUM(cube.period_credit), 0) AS prior_credit,
            COALESCE(SUM(cube.amount_net), 0) AS prior_net
        FROM row_accounts ra
        CROSS JOIN LATERAL unnest(ra.account_ids) AS aid(account_id)
        LEFT JOIN fin.rpt_balance_cube cube ON
            cube.tenant_id = p_tenant_id
            AND cube.entity_code = p_entity_code
            AND cube.cube_code = p_cube_code
            AND cube.book_code = v_effective_book
            AND cube.fiscal_year = p_fiscal_year - 1
            AND cube.period_number BETWEEN p_period_from AND p_period_to
            AND cube.account_id = aid.account_id
        GROUP BY ra.statement_row_id
    )
    SELECT
        rt.row_code,
        rt.label,
        rt.row_type,
        rt.depth,
        rt.sort_order,
        rt.parent_row_code,
        rt.display_style,
        rt.sign_policy,
        rt.emphasis_style,
        rt.formula_expression,
        rt.indent_level,
        rt.is_expandable,
        rt.is_visible,
        rt.show_zero,
        -- Current
        COALESCE(ca.amount_debit, 0)::DECIMAL(18,4),
        COALESCE(ca.amount_credit, 0)::DECIMAL(18,4),
        COALESCE(ca.amount_net, 0)::DECIMAL(18,4),
        -- Prior
        COALESCE(pa.prior_debit, 0)::DECIMAL(18,4),
        COALESCE(pa.prior_credit, 0)::DECIMAL(18,4),
        COALESCE(pa.prior_net, 0)::DECIMAL(18,4),
        -- Variance
        (COALESCE(ca.amount_net, 0) - COALESCE(pa.prior_net, 0))::DECIMAL(18,4),
        CASE
            WHEN COALESCE(pa.prior_net, 0) = 0 THEN NULL
            ELSE (
                (COALESCE(ca.amount_net, 0) - COALESCE(pa.prior_net, 0))
                / NULLIF(pa.prior_net, 0) * 100
            )::DECIMAL(10,4)
        END,
        -- Mapped accounts
        ra.account_codes
    FROM row_tree rt
    LEFT JOIN current_amounts ca ON ca.statement_row_id = rt.row_id
    LEFT JOIN prior_amounts pa ON pa.statement_row_id = rt.row_id
    LEFT JOIN row_accounts ra ON ra.statement_row_id = rt.row_id
    ORDER BY rt.sort_order;

END $fn$;


-- ============================================================================
-- Extend report preset type to support statement presets
-- ============================================================================
-- Adds 'statement' to the report_type CHECK constraint on rpt_report_preset,
-- allowing users to save statement configurations (code, period, book) as presets.
-- ============================================================================
ALTER TABLE fin.rpt_report_preset
    DROP CONSTRAINT IF EXISTS rpt_report_preset_report_type_check;

ALTER TABLE fin.rpt_report_preset
    ADD CONSTRAINT rpt_report_preset_report_type_check
    CHECK (report_type IN ('pnl', 'drilldown', 'month_end', 'statement'));
