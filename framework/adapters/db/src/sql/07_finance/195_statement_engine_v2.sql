/* ============================================================================
   Athyper v2.5 — Statement Engine Enhancements
   Schema: fin
   Dependencies: 194_statement_engine.sql

   Adds:
     1. MOVEMENT line type for indirect cash flow (BS delta computation)
     2. PUBLISHED lifecycle status for governed statement publishing
     3. Book-aware comparison support (side-by-side multi-book instances)
     4. Dimension-aware statement generation helpers
     5. Statement export metadata tracking
   ============================================================================ */

-- ============================================================================
-- 1. Add MOVEMENT to statement_line.line_type CHECK constraint
-- ============================================================================
-- MOVEMENT lines compute balance sheet delta: closing(current) - closing(prior)
-- Used by indirect-method cash flow for working capital changes.
ALTER TABLE fin.statement_line DROP CONSTRAINT IF EXISTS statement_line_line_type_check;

ALTER TABLE fin.statement_line ADD CONSTRAINT statement_line_line_type_check
    CHECK (line_type IN (
        'SECTION',
        'ACCOUNT',
        'SUBTOTAL',
        'CALCULATION',
        'MOVEMENT',
        'SEPARATOR',
        'NOTE'
    ));

-- ============================================================================
-- 2. Add PUBLISHED status to statement_instance lifecycle
-- ============================================================================
-- PUBLISHED sits between FINALIZED and SUPERSEDED.
-- Published statements are externally visible governed artifacts.
ALTER TABLE fin.statement_instance DROP CONSTRAINT IF EXISTS statement_instance_status_check;

ALTER TABLE fin.statement_instance ADD CONSTRAINT statement_instance_status_check
    CHECK (status IN (
        'DRAFT', 'REVIEWED', 'APPROVED', 'FINALIZED',
        'PUBLISHED', 'SUPERSEDED'
    ));

-- Add publishing audit columns
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS published_by UUID,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Update immutability trigger to also protect PUBLISHED instances
CREATE OR REPLACE FUNCTION fin.trg_statement_instance_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('FINALIZED', 'PUBLISHED') AND NEW.status NOT IN ('PUBLISHED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'Finalized/published statement instance % cannot be modified (current: %, target: %)',
            OLD.id, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$;

-- ============================================================================
-- 3. Book comparison support — statement_comparison table
-- ============================================================================
-- Stores side-by-side comparison results between instances from different books.
-- Each row links two statement instances and stores the line-level variances.
CREATE TABLE IF NOT EXISTS fin.statement_comparison (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- What definition is being compared
    definition_id       UUID NOT NULL REFERENCES fin.statement_definition(id),
    fiscal_year         SMALLINT NOT NULL,
    period_from         SMALLINT NOT NULL,
    period_to           SMALLINT NOT NULL,

    -- The two instances being compared
    base_instance_id    UUID NOT NULL REFERENCES fin.statement_instance(id),
    base_book_code      VARCHAR(20) NOT NULL,
    compare_instance_id UUID NOT NULL REFERENCES fin.statement_instance(id),
    compare_book_code   VARCHAR(20) NOT NULL,

    -- Summary statistics
    total_lines         INTEGER NOT NULL DEFAULT 0,
    lines_with_variance INTEGER NOT NULL DEFAULT 0,
    max_variance_pct    DECIMAL(9,4),
    total_variance      DECIMAL(18,4) NOT NULL DEFAULT 0,

    -- Metadata
    compared_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    compared_by         UUID,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_stmt_comparison UNIQUE (
        base_instance_id, compare_instance_id
    )
);

CREATE TABLE IF NOT EXISTS fin.statement_comparison_line (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id       UUID NOT NULL REFERENCES fin.statement_comparison(id) ON DELETE CASCADE,

    line_code           VARCHAR(50) NOT NULL,
    label               VARCHAR(200) NOT NULL,
    line_type           VARCHAR(20) NOT NULL,

    -- Base book values
    base_amount         DECIMAL(18,4) NOT NULL DEFAULT 0,
    -- Compare book values
    compare_amount      DECIMAL(18,4) NOT NULL DEFAULT 0,
    -- Variance
    variance_amount     DECIMAL(18,4) NOT NULL DEFAULT 0,
    variance_pct        DECIMAL(9,4),

    sort_order          SMALLINT NOT NULL DEFAULT 0,
    indent_level        SMALLINT NOT NULL DEFAULT 0,
    is_bold             BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT uq_fin_stmt_comparison_line UNIQUE (comparison_id, line_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_comparison_tenant
    ON fin.statement_comparison(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_comparison_def
    ON fin.statement_comparison(definition_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_stmt_comparison_line_cmp
    ON fin.statement_comparison_line(comparison_id);

-- ============================================================================
-- 4. Dimension-aware resolution: resolve accounts with dimension filtering
-- ============================================================================
-- Enhanced version of resolve_statement_accounts that supports
-- per-dimension-type filtering (for management packs).
CREATE OR REPLACE FUNCTION fin.resolve_statement_accounts_by_dimension(
    p_tenant_id         UUID,
    p_entity_code       VARCHAR(20),
    p_definition_id     UUID,
    p_fiscal_year       SMALLINT,
    p_period_from       SMALLINT,
    p_period_to         SMALLINT,
    p_book_code         VARCHAR(20) DEFAULT 'STAT',
    p_dimension_type_code VARCHAR(50) DEFAULT NULL,
    p_dimension_value_code VARCHAR(50) DEFAULT NULL
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
    sign_treatment  VARCHAR(10),
    dimension_set_id UUID,
    dimension_label TEXT
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
        sla.sign_treatment,
        b.dimension_set_id,
        ds.display_label AS dimension_label
    FROM fin.statement_line sl
    JOIN fin.statement_line_account sla ON sla.line_id = sl.id
    JOIN fin.chart_of_accounts a ON (
        (sla.mapping_mode = 'EXACT' AND a.account_code = sla.account_code)
        OR (sla.mapping_mode = 'RANGE' AND a.account_code >= sla.range_from
            AND a.account_code <= sla.range_to)
        OR (sla.mapping_mode = 'TYPE' AND a.account_type = sla.account_type)
    )
    LEFT JOIN fin.gl_balance b ON (
        b.tenant_id = p_tenant_id
        AND b.entity_code = p_entity_code
        AND b.account_id = a.id
        AND b.fiscal_year = p_fiscal_year
        AND b.period_number BETWEEN p_period_from AND p_period_to
        AND b.book_code = p_book_code
    )
    LEFT JOIN fin.dimension_set ds ON ds.id = b.dimension_set_id
    LEFT JOIN fin.dimension_set_item dsi ON (
        dsi.dimension_set_id = b.dimension_set_id
        AND p_dimension_type_code IS NOT NULL
    )
    LEFT JOIN fin.dimension_type dt ON (
        dt.id = dsi.dimension_type_id
        AND dt.code = p_dimension_type_code
    )
    LEFT JOIN fin.dimension_value dv ON (
        dv.id = dsi.dimension_value_id
        AND dv.code = p_dimension_value_code
    )
    WHERE sl.definition_id = p_definition_id
      AND sl.line_type IN ('ACCOUNT', 'MOVEMENT')
      AND sl.is_active = TRUE
      AND a.tenant_id = p_tenant_id
      AND a.entity_code = p_entity_code
      AND a.is_active = TRUE
      AND (sla.subledger_type IS NULL OR a.subledger_type = sla.subledger_type)
      -- Dimension filter: if type+value specified, only include matching dimension sets
      AND (p_dimension_type_code IS NULL OR dt.id IS NOT NULL)
      AND (p_dimension_value_code IS NULL OR dv.id IS NOT NULL)
    GROUP BY sl.line_code, a.id, a.account_code, a.account_name,
             a.account_type, sla.sign_treatment, b.dimension_set_id, ds.display_label
    ORDER BY sl.line_code, a.account_code;
$fn$;

-- ============================================================================
-- 5. Statement export tracking
-- ============================================================================
-- Tracks when statements were exported and in what format.
CREATE TABLE IF NOT EXISTS fin.statement_export_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES fin.statement_instance(id),
    export_format   VARCHAR(20) NOT NULL
                    CHECK (export_format IN ('CSV', 'XLSX', 'PDF', 'JSON')),
    exported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    exported_by     UUID,
    file_name       VARCHAR(500),
    file_size_bytes INTEGER
);

CREATE INDEX IF NOT EXISTS idx_fin_stmt_export_instance
    ON fin.statement_export_log(instance_id);

-- ============================================================================
-- 6. Update original resolve function to also handle MOVEMENT lines
-- ============================================================================
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
        (sla.mapping_mode = 'EXACT' AND a.account_code = sla.account_code)
        OR (sla.mapping_mode = 'RANGE' AND a.account_code >= sla.range_from
            AND a.account_code <= sla.range_to)
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
      AND sl.line_type IN ('ACCOUNT', 'MOVEMENT')
      AND sl.is_active = TRUE
      AND a.tenant_id = p_tenant_id
      AND a.entity_code = p_entity_code
      AND a.is_active = TRUE
      AND (sla.subledger_type IS NULL OR a.subledger_type = sla.subledger_type)
    GROUP BY sl.line_code, a.id, a.account_code, a.account_name,
             a.account_type, sla.sign_treatment
    ORDER BY sl.line_code, a.account_code;
$fn$;
