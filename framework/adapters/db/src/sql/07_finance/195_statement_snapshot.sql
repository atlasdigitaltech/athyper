/* ============================================================================
   Athyper v2.6 — Statement Snapshot at Period Close
   Schema: fin
   Dependencies: 194_statement_engine.sql, 195_statement_engine_v2.sql,
                 191_period_close_governance.sql

   Enables capturing rendered financial statements at period close so users
   can later retrieve "what did the P&L look like at the moment of close?"
   without recomputing from changing definitions.

   Changes:
     1. Extend statement_instance with snapshot provenance columns
     2. Add snapshot content hash for tamper detection
     3. Add snapshot retrieval helpers
   ============================================================================ */

-- ============================================================================
-- 1. Extend statement_instance with snapshot provenance
-- ============================================================================

-- source_definition_code: bridges the report-model layer (rpt_statement_definition.statement_code)
-- to the engine-layer instance, enabling retrieval by the same code the rendering API uses.
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS source_definition_code VARCHAR(50);

-- trigger_context: distinguishes how the snapshot was created
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS trigger_context VARCHAR(20) DEFAULT 'MANUAL'
        CHECK (trigger_context IN ('MANUAL', 'PERIOD_CLOSE', 'SCHEDULED'));

-- snapshot_hash: SHA-256 of the canonical rendered output.
-- Hash specification (v1) covers:
--   Header: definition_code, version, entity, year, period, book, currency
--   Per-row (all rows in sort_order, including hidden):
--     row_code, label, row_type, sort_order, display_style, sign_policy,
--     emphasis_style, amount_debit/credit/net, prior_debit/credit/net,
--     variance, variance_pct, is_visible, show_zero
-- All numeric values are normalized to DECIMAL(18,4) fixed-point format
-- (e.g., "50000.0000") to ensure hash stability across formatting changes.
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS snapshot_hash VARCHAR(64);

-- period_status_at_capture: the period status when the snapshot was taken
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS period_status_at_capture VARCHAR(20);

-- ============================================================================
-- 1b. Snapshot scope uniqueness and retrieval indexes
-- ============================================================================
-- The conceptual "latest snapshot" grain is:
--   (tenant, entity, source_definition_code, fiscal_year, period_from, period_to,
--    book_code, trigger_context)
-- with status filtering (FINALIZED/PUBLISHED only, excluding SUPERSEDED).

-- Primary retrieval index: definition code + period + book + trigger
CREATE INDEX IF NOT EXISTS idx_fin_stmt_inst_snapshot
    ON fin.statement_instance(
        tenant_id, entity_code, source_definition_code,
        fiscal_year, period_from, period_to,
        book_code, trigger_context
    )
    WHERE source_definition_code IS NOT NULL
      AND status IN ('FINALIZED', 'PUBLISHED');

-- Period-close snapshots specifically (for close dashboard)
CREATE INDEX IF NOT EXISTS idx_fin_stmt_inst_close
    ON fin.statement_instance(tenant_id, entity_code, fiscal_year, trigger_context)
    WHERE trigger_context = 'PERIOD_CLOSE'
      AND status IN ('FINALIZED', 'PUBLISHED');

-- ============================================================================
-- 1c. Diagnostics summary captured at snapshot time
-- ============================================================================
-- Preserves formula/definition diagnostic state at the moment of capture.
-- Useful for audit defensibility: "were there known issues at close time?"

ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS diagnostic_count INTEGER DEFAULT 0;
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS diagnostic_error_count INTEGER DEFAULT 0;
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS diagnostic_warning_count INTEGER DEFAULT 0;
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS diagnostic_info_count INTEGER DEFAULT 0;
ALTER TABLE fin.statement_instance
    ADD COLUMN IF NOT EXISTS diagnostics_payload JSONB;

-- ============================================================================
-- 1d. Close-state guard for PERIOD_CLOSE trigger_context
-- ============================================================================
-- Enforces that PERIOD_CLOSE snapshots can only be inserted when the
-- fiscal period is at SOFT_CLOSE or HARD_CLOSE state. This prevents
-- accidental PERIOD_CLOSE snapshots on open periods.
-- Manual snapshots are allowed at any time.

CREATE OR REPLACE FUNCTION fin.trg_snapshot_close_state_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_period_status VARCHAR(20);
BEGIN
    -- Only guard PERIOD_CLOSE trigger context
    IF NEW.trigger_context != 'PERIOD_CLOSE' THEN
        RETURN NEW;
    END IF;

    -- Look up current period status
    SELECT status INTO v_period_status
    FROM fin.fiscal_period
    WHERE tenant_id = NEW.tenant_id
      AND entity_code = NEW.entity_code
      AND fiscal_year = NEW.fiscal_year
      AND period_number = NEW.period_from
    LIMIT 1;

    -- Allow if period is at or beyond SOFT_CLOSE
    IF v_period_status IS NULL THEN
        RAISE EXCEPTION 'Cannot create PERIOD_CLOSE snapshot: fiscal period %.P% not found',
            NEW.fiscal_year, NEW.period_from;
    END IF;

    IF v_period_status NOT IN ('SOFT_CLOSE', 'HARD_CLOSE') THEN
        RAISE EXCEPTION 'Cannot create PERIOD_CLOSE snapshot: period %.P% is % (must be SOFT_CLOSE or HARD_CLOSE)',
            NEW.fiscal_year, NEW.period_from, v_period_status;
    END IF;

    -- Record the period status at capture time
    NEW.period_status_at_capture := v_period_status;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_snapshot_close_state_guard ON fin.statement_instance;
CREATE TRIGGER trg_snapshot_close_state_guard
    BEFORE INSERT ON fin.statement_instance
    FOR EACH ROW
    WHEN (NEW.trigger_context = 'PERIOD_CLOSE')
    EXECUTE FUNCTION fin.trg_snapshot_close_state_guard();

-- ============================================================================
-- 2. Extend statement_instance_line with report-model display fields
-- ============================================================================
-- These columns store the full rendering metadata so snapshots are
-- self-contained and don't depend on the current definition state.

ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS display_style VARCHAR(20) DEFAULT 'NORMAL';
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS sign_policy VARCHAR(20) DEFAULT 'NATURAL';
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS emphasis_style VARCHAR(20) DEFAULT 'NONE';
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS formula_expression TEXT;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS show_zero BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS is_expandable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS mapped_account_codes TEXT[];

-- Prior period amounts (debit/credit split)
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS current_debit DECIMAL(18,4) DEFAULT 0;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS current_credit DECIMAL(18,4) DEFAULT 0;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS prior_debit DECIMAL(18,4) DEFAULT 0;
ALTER TABLE fin.statement_instance_line
    ADD COLUMN IF NOT EXISTS prior_credit DECIMAL(18,4) DEFAULT 0;

-- ============================================================================
-- 3. Snapshot retrieval helper
-- ============================================================================
-- Returns the most recent finalized/published snapshot for a given
-- definition code and period scope. Used by the snapshot retrieval API.

CREATE OR REPLACE FUNCTION fin.get_latest_snapshot(
    p_tenant_id         UUID,
    p_entity_code       VARCHAR(20),
    p_definition_code   VARCHAR(50),
    p_fiscal_year       SMALLINT,
    p_period_from       SMALLINT DEFAULT 1,
    p_period_to         SMALLINT DEFAULT 12,
    p_book_code         VARCHAR(20) DEFAULT NULL,
    p_trigger_context   VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    instance_id         UUID,
    definition_id       UUID,
    definition_version  SMALLINT,
    source_definition_code VARCHAR(50),
    fiscal_year         SMALLINT,
    period_from         SMALLINT,
    period_to           SMALLINT,
    book_code           VARCHAR(20),
    currency_code       VARCHAR(3),
    status              VARCHAR(20),
    trigger_context     VARCHAR(20),
    snapshot_hash       VARCHAR(64),
    period_status_at_capture VARCHAR(20),
    generated_at        TIMESTAMPTZ,
    generated_by        UUID,
    gl_balance_as_of    TIMESTAMPTZ,
    cube_refresh_run_id UUID,
    finalized_at        TIMESTAMPTZ,
    published_at        TIMESTAMPTZ,
    total_line_count    INTEGER
) LANGUAGE sql STABLE AS $fn$
    SELECT
        si.id AS instance_id,
        si.definition_id,
        si.definition_version,
        si.source_definition_code,
        si.fiscal_year,
        si.period_from,
        si.period_to,
        si.book_code,
        si.currency_code,
        si.status,
        si.trigger_context,
        si.snapshot_hash,
        si.period_status_at_capture,
        si.generated_at,
        si.generated_by,
        si.gl_balance_as_of,
        si.cube_refresh_run_id,
        si.finalized_at,
        si.published_at,
        si.total_line_count
    FROM fin.statement_instance si
    WHERE si.tenant_id = p_tenant_id
      AND si.entity_code = p_entity_code
      AND si.source_definition_code = p_definition_code
      AND si.fiscal_year = p_fiscal_year
      AND si.period_from = p_period_from
      AND si.period_to = p_period_to
      AND (p_book_code IS NULL OR si.book_code = p_book_code)
      AND (p_trigger_context IS NULL OR si.trigger_context = p_trigger_context)
      AND si.status IN ('FINALIZED', 'PUBLISHED')
    ORDER BY si.generated_at DESC
    LIMIT 1;
$fn$;

-- ============================================================================
-- 4. Snapshot line retrieval helper
-- ============================================================================
-- Returns all lines for a snapshot instance in display order,
-- mapped to the same shape as the live rendering API.

CREATE OR REPLACE FUNCTION fin.get_snapshot_lines(
    p_instance_id UUID
) RETURNS TABLE (
    line_code           VARCHAR(50),
    label               VARCHAR(200),
    line_type           VARCHAR(20),
    parent_line_code    VARCHAR(50),
    level               SMALLINT,
    sort_order          SMALLINT,
    display_style       VARCHAR(20),
    sign_policy         VARCHAR(20),
    emphasis_style      VARCHAR(20),
    formula_expression  TEXT,
    indent_level        SMALLINT,
    is_expandable       BOOLEAN,
    is_visible          BOOLEAN,
    show_zero           BOOLEAN,
    is_bold             BOOLEAN,
    is_underlined       BOOLEAN,
    is_calculated       BOOLEAN,
    -- Current period
    current_debit       DECIMAL(18,4),
    current_credit      DECIMAL(18,4),
    current_amount      DECIMAL(18,4),
    -- Prior period
    prior_debit         DECIMAL(18,4),
    prior_credit        DECIMAL(18,4),
    prior_amount        DECIMAL(18,4),
    -- Variance
    variance_amount     DECIMAL(18,4),
    variance_pct        DECIMAL(9,4),
    -- Account detail
    mapped_account_codes TEXT[],
    account_breakdown   JSONB
) LANGUAGE sql STABLE AS $fn$
    SELECT
        sil.line_code,
        sil.label,
        sil.line_type,
        sil.parent_line_code,
        sil.level,
        sil.sort_order,
        COALESCE(sil.display_style, 'NORMAL'),
        COALESCE(sil.sign_policy, 'NATURAL'),
        COALESCE(sil.emphasis_style, 'NONE'),
        sil.formula_expression,
        sil.indent_level,
        COALESCE(sil.is_expandable, FALSE),
        COALESCE(sil.is_visible, TRUE),
        COALESCE(sil.show_zero, FALSE),
        sil.is_bold,
        sil.is_underlined,
        sil.is_calculated,
        COALESCE(sil.current_debit, 0),
        COALESCE(sil.current_credit, 0),
        sil.current_amount,
        COALESCE(sil.prior_debit, 0),
        COALESCE(sil.prior_credit, 0),
        COALESCE(sil.prior_amount, 0),
        sil.variance_amount,
        sil.variance_pct,
        sil.mapped_account_codes,
        sil.account_breakdown
    FROM fin.statement_instance_line sil
    WHERE sil.instance_id = p_instance_id
    ORDER BY sil.sort_order;
$fn$;
