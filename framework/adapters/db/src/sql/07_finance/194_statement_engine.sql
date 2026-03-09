/* ============================================================================
   Athyper v2.4 — Financial Statement Engine
   Schema: fin
   Dependencies: core.tenant, fin.chart_of_accounts, fin.gl_balance,
                 fin.ledger_book, fin.rpt_balance_cube, fin.dimension_set

   Provides a governed, metadata-driven reporting layer that converts
   GL balances into structured financial statements.

   Supported statement types:
     INCOME_STATEMENT    — Profit & Loss
     BALANCE_SHEET       — Statement of Financial Position
     CASH_FLOW           — Cash Flow Statement (indirect method)
     TRIAL_BALANCE       — Trial Balance
     MANAGEMENT          — Custom management reports
     COMPARISON          — Multi-book comparison reports
     DIMENSION_PACK      — Dimension-based management packs

   Table topology:
     Definition layer (3 tables):
       fin.statement_definition        → Statement types and metadata
       fin.statement_line              → Hierarchical line items
       fin.statement_line_account      → Account-to-line mapping

     Instance layer (2 tables):
       fin.statement_instance          → Generated statement snapshot
       fin.statement_instance_line     → Computed line values

   Design principles:
     1. Statements are metadata-driven — line hierarchies exist as data, not code
     2. Statements are book-aware — each definition can target a specific book
     3. Statements are dimension-aware — slicing by project, department, etc.
     4. Account-to-line mapping is explicit and auditable
     5. Calculations are hierarchical using line references (not account lists)
     6. Statement instances are immutable point-in-time snapshots
     7. Follows Athyper engine pattern: definition → generation → instance
   ============================================================================ */

-- ============================================================================
-- fin.statement_definition — Statement types and configuration
-- ============================================================================
-- Each definition describes a kind of financial statement.
-- A tenant can have multiple definitions per type (e.g., IFRS P&L vs GAAP P&L).
CREATE TABLE IF NOT EXISTS fin.statement_definition (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Identity
    definition_code VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Classification
    statement_type  VARCHAR(30) NOT NULL
                    CHECK (statement_type IN (
                        'INCOME_STATEMENT',
                        'BALANCE_SHEET',
                        'CASH_FLOW',
                        'TRIAL_BALANCE',
                        'MANAGEMENT',
                        'COMPARISON',
                        'DIMENSION_PACK'
                    )),

    -- Book targeting: which ledger book(s) this statement draws from
    -- NULL = all books. Array = specific books.
    book_codes      VARCHAR(20)[],

    -- Reporting standard this statement conforms to
    reporting_standard VARCHAR(30),   -- IFRS, US_GAAP, IND_AS, LOCAL_GAAP, etc.

    -- Default currency (NULL = entity base currency)
    currency_code   VARCHAR(3),

    -- Dimension slicing: which dimensions this statement can be filtered by
    -- NULL = no dimension slicing. Array = enabled dimension type codes.
    dimension_codes VARCHAR(50)[],

    -- Version control (metadata-driven definitions can evolve)
    version         SMALLINT NOT NULL DEFAULT 1,

    -- Visibility
    scope           VARCHAR(20) NOT NULL DEFAULT 'TENANT'
                    CHECK (scope IN ('SYSTEM', 'TENANT', 'ENTITY')),

    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_stmt_def UNIQUE (tenant_id, entity_code, definition_code, version)
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_def_tenant
    ON fin.statement_definition(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_def_type
    ON fin.statement_definition(statement_type) WHERE is_active = TRUE;

-- ============================================================================
-- fin.statement_line — Hierarchical line items within a statement
-- ============================================================================
-- Each line is a row in the final rendered statement.
-- Lines form a tree: sections contain sub-sections contain leaf lines.
--
-- Line types:
--   SECTION     — grouping header (Revenue, Operating Expenses, etc.)
--   ACCOUNT     — maps to GL accounts (populated from account mapping)
--   SUBTOTAL    — computed from child lines (sum of children)
--   CALCULATION — computed from other line references (Gross Profit = Revenue - COGS)
--   SEPARATOR   — visual separator / blank line
--   NOTE        — text-only annotation line
--
-- Calculation formula format (for CALCULATION lines):
--   Array of { lineCode: string, operator: "+" | "-" | "*" | "/" }
--   Evaluated left-to-right: result = lines[0].value op lines[1].value op ...
--   Example: Gross Profit = [{ lineCode: "REVENUE", operator: "+" },
--                            { lineCode: "COGS", operator: "-" }]
CREATE TABLE IF NOT EXISTS fin.statement_line (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id       UUID NOT NULL REFERENCES fin.statement_definition(id) ON DELETE CASCADE,

    -- Identity within the statement
    line_code           VARCHAR(50) NOT NULL,
    label               VARCHAR(200) NOT NULL,
    description         TEXT,

    -- Hierarchy
    parent_line_id      UUID REFERENCES fin.statement_line(id),
    level               SMALLINT NOT NULL DEFAULT 1,
    sort_order          SMALLINT NOT NULL DEFAULT 0,

    -- Line type determines how the value is computed
    line_type           VARCHAR(20) NOT NULL
                        CHECK (line_type IN (
                            'SECTION',          -- grouping header
                            'ACCOUNT',          -- maps to GL accounts
                            'SUBTOTAL',         -- sum of child lines
                            'CALCULATION',      -- formula from line references
                            'SEPARATOR',        -- visual divider
                            'NOTE'              -- text annotation
                        )),

    -- For CALCULATION lines: formula as JSONB array
    -- [{ "lineCode": "REVENUE", "operator": "+" }, { "lineCode": "COGS", "operator": "-" }]
    calculation_formula JSONB,

    -- Display configuration
    is_bold             BOOLEAN NOT NULL DEFAULT FALSE,
    is_underlined       BOOLEAN NOT NULL DEFAULT FALSE,
    indent_level        SMALLINT NOT NULL DEFAULT 0,
    show_sign           BOOLEAN NOT NULL DEFAULT TRUE,     -- show negative as (xxx)
    invert_sign         BOOLEAN NOT NULL DEFAULT FALSE,    -- display credit-normal as positive

    -- Account type filter (for ACCOUNT lines that pull from specific account types)
    -- NULL = determined by account mapping. Non-null = additional filter.
    account_type_filter VARCHAR(20),   -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE

    -- Normal balance direction for this line (controls sign display)
    -- DEBIT = debit-positive (assets, expenses). CREDIT = credit-positive (liabilities, equity, revenue)
    normal_balance      VARCHAR(10) NOT NULL DEFAULT 'CREDIT'
                        CHECK (normal_balance IN ('DEBIT', 'CREDIT')),

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_stmt_line UNIQUE (definition_id, line_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_line_def
    ON fin.statement_line(definition_id);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_line_parent
    ON fin.statement_line(parent_line_id) WHERE parent_line_id IS NOT NULL;

-- ============================================================================
-- fin.statement_line_account — Account-to-line mapping
-- ============================================================================
-- Explicitly maps GL accounts to statement lines.
-- Supports three mapping modes:
--   EXACT      — specific account code
--   RANGE      — account code range (inclusive)
--   TYPE       — all accounts of a specific type (ASSET, REVENUE, etc.)
--
-- When generating a statement:
--   1. For each ACCOUNT line, find all matching mappings
--   2. Sum GL balances for all matched accounts
--   3. Apply sign convention (normal_balance of the line)
CREATE TABLE IF NOT EXISTS fin.statement_line_account (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id         UUID NOT NULL REFERENCES fin.statement_line(id) ON DELETE CASCADE,

    -- Mapping mode
    mapping_mode    VARCHAR(10) NOT NULL
                    CHECK (mapping_mode IN ('EXACT', 'RANGE', 'TYPE')),

    -- For EXACT mode: specific account code
    account_code    VARCHAR(20),

    -- For RANGE mode: inclusive range
    range_from      VARCHAR(20),
    range_to        VARCHAR(20),

    -- For TYPE mode: account type
    account_type    VARCHAR(20),   -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE

    -- Optional: further filter by subledger type
    subledger_type  VARCHAR(20),

    -- Sign treatment for this mapping
    -- NATURAL = use GL balance as-is
    -- INVERT  = negate the balance (e.g., contra accounts)
    sign_treatment  VARCHAR(10) NOT NULL DEFAULT 'NATURAL'
                    CHECK (sign_treatment IN ('NATURAL', 'INVERT')),

    -- Priority: higher priority mappings override lower when an account
    -- matches multiple lines (prevents double-counting)
    priority        SMALLINT NOT NULL DEFAULT 0,

    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Validate that the right fields are set for each mode
    CONSTRAINT chk_fin_stmt_acct_exact CHECK (
        mapping_mode != 'EXACT' OR account_code IS NOT NULL
    ),
    CONSTRAINT chk_fin_stmt_acct_range CHECK (
        mapping_mode != 'RANGE' OR (range_from IS NOT NULL AND range_to IS NOT NULL)
    ),
    CONSTRAINT chk_fin_stmt_acct_type CHECK (
        mapping_mode != 'TYPE' OR account_type IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_line_acct
    ON fin.statement_line_account(line_id);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_acct_code
    ON fin.statement_line_account(account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_stmt_acct_type
    ON fin.statement_line_account(account_type) WHERE account_type IS NOT NULL;

-- ============================================================================
-- fin.statement_instance — Generated statement snapshot
-- ============================================================================
-- A point-in-time rendering of a statement definition against GL data.
-- Immutable once status reaches FINALIZED.
--
-- Lifecycle:
--   DRAFT       — generated but not reviewed
--   REVIEWED    — reviewed by preparer
--   APPROVED    — approved for publication
--   FINALIZED   — locked, immutable, official record
--   SUPERSEDED  — replaced by a newer instance for the same period
CREATE TABLE IF NOT EXISTS fin.statement_instance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- Which definition was used
    definition_id       UUID NOT NULL REFERENCES fin.statement_definition(id),
    definition_version  SMALLINT NOT NULL,

    -- Period scope
    fiscal_year         SMALLINT NOT NULL,
    period_from         SMALLINT NOT NULL,       -- start period (inclusive)
    period_to           SMALLINT NOT NULL,        -- end period (inclusive)

    -- Book
    book_code           VARCHAR(20) NOT NULL DEFAULT 'STAT',

    -- Dimension filter (NULL = undimensioned / all dimensions)
    dimension_set_id    UUID REFERENCES fin.dimension_set(id),
    dimension_filter    JSONB,                    -- { typeCode: valueCode } pairs for filtering

    -- Currency
    currency_code       VARCHAR(3) NOT NULL,

    -- Lifecycle
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                            'DRAFT', 'REVIEWED', 'APPROVED', 'FINALIZED', 'SUPERSEDED'
                        )),

    -- Generation metadata
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by        UUID,
    generation_duration_ms INTEGER,

    -- Source data snapshot
    gl_balance_as_of    TIMESTAMPTZ,              -- when the GL data was read
    cube_refresh_run_id UUID,                     -- which cube refresh was the source

    -- Review/approval
    reviewed_by         UUID,
    reviewed_at         TIMESTAMPTZ,
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    finalized_at        TIMESTAMPTZ,

    -- Supersession
    supersedes_id       UUID REFERENCES fin.statement_instance(id),

    -- Totals (denormalized for quick display)
    total_line_count    INTEGER NOT NULL DEFAULT 0,

    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fin_stmt_period CHECK (period_from <= period_to)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_stmt_instance
    ON fin.statement_instance (
        tenant_id, entity_code, definition_id, fiscal_year,
        period_from, period_to, book_code,
        COALESCE(dimension_set_id, '00000000-0000-0000-0000-000000000000')
    );

CREATE INDEX IF NOT EXISTS idx_fin_stmt_instance_tenant
    ON fin.statement_instance(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_instance_def
    ON fin.statement_instance(definition_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_instance_status
    ON fin.statement_instance(status) WHERE status NOT IN ('SUPERSEDED');

-- ============================================================================
-- fin.statement_instance_line — Computed line values in an instance
-- ============================================================================
-- Each row is a rendered line in a generated statement.
-- Values are computed at generation time and stored as a snapshot.
-- Immutable once the parent instance is FINALIZED.
CREATE TABLE IF NOT EXISTS fin.statement_instance_line (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         UUID NOT NULL REFERENCES fin.statement_instance(id) ON DELETE CASCADE,

    -- Which line definition this was rendered from
    line_id             UUID NOT NULL REFERENCES fin.statement_line(id),
    line_code           VARCHAR(50) NOT NULL,
    label               VARCHAR(200) NOT NULL,
    line_type           VARCHAR(20) NOT NULL,

    -- Hierarchy (denormalized from definition for rendering)
    parent_line_code    VARCHAR(50),
    level               SMALLINT NOT NULL DEFAULT 1,
    sort_order          SMALLINT NOT NULL DEFAULT 0,

    -- Computed values (MC-4: DECIMAL(18,4))
    current_amount      DECIMAL(18,4) NOT NULL DEFAULT 0,
    prior_amount        DECIMAL(18,4),            -- prior year comparison (NULL if not computed)
    budget_amount       DECIMAL(18,4),            -- budget comparison (NULL if not available)

    -- Variance calculations (computed from amounts)
    variance_amount     DECIMAL(18,4),            -- current - prior
    variance_pct        DECIMAL(9,4),             -- ((current - prior) / ABS(prior)) * 100

    -- Breakdown: which accounts contributed to this line
    -- Array of { accountId, accountCode, accountName, amount }
    account_breakdown   JSONB,

    -- Display metadata (denormalized from definition)
    is_bold             BOOLEAN NOT NULL DEFAULT FALSE,
    is_underlined       BOOLEAN NOT NULL DEFAULT FALSE,
    indent_level        SMALLINT NOT NULL DEFAULT 0,
    is_calculated       BOOLEAN NOT NULL DEFAULT FALSE,    -- TRUE for SUBTOTAL/CALCULATION lines

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_stmt_inst_line UNIQUE (instance_id, line_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_inst_line_instance
    ON fin.statement_instance_line(instance_id);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_inst_line_code
    ON fin.statement_instance_line(line_code);

-- ============================================================================
-- Immutability: finalized statement instances cannot be modified
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.trg_statement_instance_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'FINALIZED' AND NEW.status != 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Finalized statement instance % cannot be modified', OLD.id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_statement_instance_immutable ON fin.statement_instance;
CREATE TRIGGER trg_statement_instance_immutable
    BEFORE UPDATE ON fin.statement_instance
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_statement_instance_immutable();

-- Finalized instance lines cannot be modified
CREATE OR REPLACE FUNCTION fin.trg_statement_instance_line_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM fin.statement_instance WHERE id = OLD.instance_id;
    IF v_status = 'FINALIZED' THEN
        RAISE EXCEPTION 'Lines of finalized statement instance cannot be modified';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stmt_inst_line_immutable ON fin.statement_instance_line;
CREATE TRIGGER trg_stmt_inst_line_immutable
    BEFORE UPDATE OR DELETE ON fin.statement_instance_line
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_statement_instance_line_immutable();

-- ============================================================================
-- Helper function: Generate a statement instance from definition + GL data
-- ============================================================================
-- This function is called by the Statement Generation Service.
-- It reads GL balances (or cube data), computes line values,
-- evaluates calculations, and inserts the instance + instance_lines.
--
-- The actual rendering logic is in the TypeScript service layer
-- (more testable, more flexible). This SQL function provides
-- the data retrieval layer for account resolution.
CREATE OR REPLACE FUNCTION fin.resolve_statement_accounts(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_definition_id UUID,
    p_fiscal_year   SMALLINT,
    p_period_from   SMALLINT,
    p_period_to     SMALLINT,
    p_book_code     VARCHAR(20) DEFAULT 'STAT',
    p_dimension_set_id UUID DEFAULT NULL
) RETURNS TABLE (
    line_code       VARCHAR(50),
    account_id      UUID,
    account_code    VARCHAR(20),
    account_name    VARCHAR(200),
    account_type    VARCHAR(20),
    period_debit    DECIMAL(18,4),
    period_credit   DECIMAL(18,4),
    closing_debit   DECIMAL(18,4),
    closing_credit  DECIMAL(18,4),
    sign_treatment  VARCHAR(10)
) LANGUAGE sql STABLE AS $fn$
    SELECT
        sl.line_code,
        a.id AS account_id,
        a.account_code,
        a.account_name,
        a.account_type,
        COALESCE(SUM(b.period_debit), 0)  AS period_debit,
        COALESCE(SUM(b.period_credit), 0) AS period_credit,
        COALESCE(SUM(b.closing_debit), 0) AS closing_debit,
        COALESCE(SUM(b.closing_credit), 0) AS closing_credit,
        sla.sign_treatment
    FROM fin.statement_line sl
    JOIN fin.statement_line_account sla ON sla.line_id = sl.id
    JOIN fin.chart_of_accounts a ON (
        -- EXACT mode
        (sla.mapping_mode = 'EXACT' AND a.account_code = sla.account_code)
        -- RANGE mode
        OR (sla.mapping_mode = 'RANGE' AND a.account_code >= sla.range_from
            AND a.account_code <= sla.range_to)
        -- TYPE mode
        OR (sla.mapping_mode = 'TYPE' AND a.account_type = sla.account_type)
    )
    LEFT JOIN fin.gl_balance b ON (
        b.tenant_id = p_tenant_id
        AND b.entity_code = p_entity_code
        AND b.account_id = a.id
        AND b.fiscal_year = p_fiscal_year
        AND b.period_number BETWEEN p_period_from AND p_period_to
        AND b.book_code = p_book_code
        AND (p_dimension_set_id IS NULL OR b.dimension_set_id = p_dimension_set_id)
    )
    WHERE sl.definition_id = p_definition_id
      AND sl.line_type = 'ACCOUNT'
      AND sl.is_active = TRUE
      AND a.tenant_id = p_tenant_id
      AND a.entity_code = p_entity_code
      AND a.is_active = TRUE
      -- Optional subledger filter
      AND (sla.subledger_type IS NULL OR a.subledger_type = sla.subledger_type)
    GROUP BY sl.line_code, a.id, a.account_code, a.account_name,
             a.account_type, sla.sign_treatment
    ORDER BY sl.line_code, a.account_code;
$fn$;
