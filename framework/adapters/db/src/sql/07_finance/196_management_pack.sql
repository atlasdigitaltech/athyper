/* ============================================================================
   Athyper v2.5 — Management Pack & Variance Reporting Engine
   Schema: fin
   Dependencies: core.tenant, fin.statement_definition, fin.statement_instance,
                 fin.chart_of_accounts, fin.gl_balance, fin.dimension_set

   Provides a governed pack orchestration layer that bundles multiple
   statement artifacts into a single reviewable, publishable package.

   Table topology:
     Definition layer:
       fin.report_pack_definition   → Pack template (what's in it)
       fin.report_pack_item         → Ordered items within a pack
       fin.budget_line              → Per-account/period budget data

     Instance layer:
       fin.report_pack_instance     → Generated pack snapshot
       fin.report_pack_instance_item → Links pack instance → statement instances
       fin.report_commentary        → Structured narrative/annotations

   Key concepts:
     - Pack = ordered bundle of statement generation requests
     - Each item specifies a statement definition + variance source + period mode
     - Pack instances aggregate statement instances into a governed artifact
     - Commentary is attached at pack, section, or line level
     - Variance sources: PRIOR_YEAR, BUDGET, FORECAST, PRIOR_PERIOD
     - Period modes: PTD, QTD, YTD, PRIOR_PERIOD, PRIOR_YEAR, ROLLING_12M
   ============================================================================ */

-- ============================================================================
-- fin.report_pack_definition — Pack templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.report_pack_definition (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    pack_code       VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Pack classification
    pack_type       VARCHAR(30) NOT NULL DEFAULT 'MANAGEMENT'
                    CHECK (pack_type IN (
                        'EXECUTIVE',        -- board-level summary
                        'MANAGEMENT',       -- management review
                        'OPERATIONAL',      -- operational detail
                        'COMPLIANCE',       -- regulatory / audit
                        'CUSTOM'
                    )),

    -- Default settings (can be overridden per item)
    default_book_code       VARCHAR(20) DEFAULT 'STAT',
    default_period_mode     VARCHAR(20) NOT NULL DEFAULT 'PTD'
                            CHECK (default_period_mode IN (
                                'PTD', 'QTD', 'YTD',
                                'PRIOR_PERIOD', 'PRIOR_YEAR', 'ROLLING_12M'
                            )),
    default_variance_source VARCHAR(20) DEFAULT 'PRIOR_YEAR'
                            CHECK (default_variance_source IS NULL OR
                                   default_variance_source IN (
                                'PRIOR_YEAR', 'BUDGET', 'FORECAST', 'PRIOR_PERIOD'
                            )),

    -- Dimension slicing (inherited by items unless overridden)
    dimension_codes VARCHAR(50)[],

    version         SMALLINT NOT NULL DEFAULT 1,
    scope           VARCHAR(20) NOT NULL DEFAULT 'TENANT'
                    CHECK (scope IN ('SYSTEM', 'TENANT', 'ENTITY')),
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,

    CONSTRAINT uq_fin_pack_def UNIQUE (tenant_id, entity_code, pack_code, version)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_def_tenant
    ON fin.report_pack_definition(tenant_id, entity_code);

-- ============================================================================
-- fin.report_pack_item — Ordered items within a pack
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.report_pack_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_definition_id  UUID NOT NULL REFERENCES fin.report_pack_definition(id) ON DELETE CASCADE,

    -- Identity
    item_code           VARCHAR(50) NOT NULL,
    label               VARCHAR(200) NOT NULL,
    description         TEXT,

    -- What to generate
    item_type           VARCHAR(30) NOT NULL
                        CHECK (item_type IN (
                            'STATEMENT',        -- generates a statement instance
                            'COMPARISON',       -- generates a cross-book comparison
                            'NARRATIVE',        -- text-only section (cover page, summary)
                            'SEPARATOR'         -- visual break between sections
                        )),

    -- For STATEMENT items: which definition to generate
    statement_definition_id UUID REFERENCES fin.statement_definition(id),

    -- For COMPARISON items: base and compare books
    compare_base_book   VARCHAR(20),
    compare_target_book VARCHAR(20),

    -- Variance source override (NULL = use pack default)
    variance_source     VARCHAR(20)
                        CHECK (variance_source IS NULL OR
                               variance_source IN (
                            'PRIOR_YEAR', 'BUDGET', 'FORECAST', 'PRIOR_PERIOD'
                        )),

    -- Period mode override (NULL = use pack default)
    period_mode         VARCHAR(20)
                        CHECK (period_mode IS NULL OR
                               period_mode IN (
                            'PTD', 'QTD', 'YTD',
                            'PRIOR_PERIOD', 'PRIOR_YEAR', 'ROLLING_12M'
                        )),

    -- Book override (NULL = use pack default)
    book_code           VARCHAR(20),

    -- Dimension override (NULL = use pack default)
    dimension_type_code VARCHAR(50),
    dimension_value_code VARCHAR(50),

    -- Display config
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    page_break_before   BOOLEAN NOT NULL DEFAULT FALSE,
    show_variance       BOOLEAN NOT NULL DEFAULT TRUE,
    show_prior          BOOLEAN NOT NULL DEFAULT TRUE,
    show_budget         BOOLEAN NOT NULL DEFAULT FALSE,

    -- For NARRATIVE items: static content
    narrative_content   TEXT,

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pack_item UNIQUE (pack_definition_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_item_def
    ON fin.report_pack_item(pack_definition_id);
CREATE INDEX IF NOT EXISTS idx_fin_pack_item_stmt
    ON fin.report_pack_item(statement_definition_id) WHERE statement_definition_id IS NOT NULL;

-- ============================================================================
-- fin.budget_line — Per-account/period budget data
-- ============================================================================
-- Stores budget amounts at account + period + dimension grain.
-- Used by the statement engine to populate budget_amount on instance lines.
CREATE TABLE IF NOT EXISTS fin.budget_line (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Budget identity
    budget_code     VARCHAR(50) NOT NULL,       -- e.g., 'FY2026-ANNUAL', 'FY2026-Q1-REFORECAST'
    budget_type     VARCHAR(20) NOT NULL DEFAULT 'BUDGET'
                    CHECK (budget_type IN ('BUDGET', 'FORECAST', 'PLAN')),
    budget_version  SMALLINT NOT NULL DEFAULT 1,

    -- Account scope
    account_id      UUID NOT NULL REFERENCES fin.chart_of_accounts(id),

    -- Period scope
    fiscal_year     SMALLINT NOT NULL,
    period_number   SMALLINT NOT NULL,

    -- Book (budget can be book-specific)
    book_code       VARCHAR(20) NOT NULL DEFAULT 'STAT',

    -- Dimension scope (NULL = undimensioned)
    dimension_set_id UUID REFERENCES fin.dimension_set(id),

    -- Amount (MC-4: DECIMAL(18,4))
    budget_amount   DECIMAL(18,4) NOT NULL DEFAULT 0,

    -- Status
    is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by     UUID,
    approved_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_budget_line
    ON fin.budget_line (
        tenant_id, entity_code, budget_code, budget_version,
        account_id, fiscal_year, period_number, book_code,
        COALESCE(dimension_set_id, '00000000-0000-0000-0000-000000000000')
    );

CREATE INDEX IF NOT EXISTS idx_fin_budget_line_tenant
    ON fin.budget_line(tenant_id, entity_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_budget_line_account
    ON fin.budget_line(account_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_budget_line_code
    ON fin.budget_line(budget_code, budget_version);

-- ============================================================================
-- fin.report_pack_instance — Generated pack snapshot
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.report_pack_instance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- Which pack definition was used
    pack_definition_id  UUID NOT NULL REFERENCES fin.report_pack_definition(id),
    pack_version        SMALLINT NOT NULL,

    -- Period scope
    fiscal_year         SMALLINT NOT NULL,
    period_from         SMALLINT NOT NULL,
    period_to           SMALLINT NOT NULL,

    -- Book (resolved default)
    book_code           VARCHAR(20) NOT NULL DEFAULT 'STAT',

    -- Dimension filter (if pack-level dimension was set)
    dimension_set_id    UUID REFERENCES fin.dimension_set(id),

    -- Lifecycle
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                            'GENERATING',       -- items being generated
                            'DRAFT',            -- all items generated
                            'REVIEWED',
                            'APPROVED',
                            'FINALIZED',
                            'PUBLISHED',
                            'SUPERSEDED'
                        )),

    -- Generation metadata
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by        UUID,
    generation_duration_ms INTEGER,
    total_items         SMALLINT NOT NULL DEFAULT 0,
    items_completed     SMALLINT NOT NULL DEFAULT 0,

    -- Variance metadata
    variance_source     VARCHAR(20),
    period_mode         VARCHAR(20),

    -- Review/approval/publish audit
    reviewed_by         UUID,
    reviewed_at         TIMESTAMPTZ,
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    finalized_at        TIMESTAMPTZ,
    published_by        UUID,
    published_at        TIMESTAMPTZ,

    -- Supersession
    supersedes_id       UUID REFERENCES fin.report_pack_instance(id),

    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fin_pack_period CHECK (period_from <= period_to)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_instance_tenant
    ON fin.report_pack_instance(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_pack_instance_def
    ON fin.report_pack_instance(pack_definition_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_pack_instance_status
    ON fin.report_pack_instance(status) WHERE status NOT IN ('SUPERSEDED');

-- ============================================================================
-- fin.report_pack_instance_item — Links pack → statement instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.report_pack_instance_item (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_instance_id        UUID NOT NULL REFERENCES fin.report_pack_instance(id) ON DELETE CASCADE,
    pack_item_id            UUID NOT NULL REFERENCES fin.report_pack_item(id),

    -- For STATEMENT items: the generated statement instance
    statement_instance_id   UUID REFERENCES fin.statement_instance(id),

    -- For COMPARISON items: the comparison record
    comparison_id           UUID REFERENCES fin.statement_comparison(id),

    -- Item status
    item_status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (item_status IN (
                                'PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'SKIPPED'
                            )),
    error_message           TEXT,

    -- Resolved parameters (what was actually used)
    resolved_book_code      VARCHAR(20),
    resolved_period_mode    VARCHAR(20),
    resolved_variance_source VARCHAR(20),
    resolved_period_from    SMALLINT,
    resolved_period_to      SMALLINT,
    resolved_fiscal_year    SMALLINT,

    sort_order              SMALLINT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pack_inst_item UNIQUE (pack_instance_id, pack_item_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_inst_item_pack
    ON fin.report_pack_instance_item(pack_instance_id);
CREATE INDEX IF NOT EXISTS idx_fin_pack_inst_item_stmt
    ON fin.report_pack_instance_item(statement_instance_id)
    WHERE statement_instance_id IS NOT NULL;

-- ============================================================================
-- fin.report_commentary — Structured narrative annotations
-- ============================================================================
-- Polymorphic commentary tied to pack instances, sections, or lines.
-- Versioned for audit trail.
CREATE TABLE IF NOT EXISTS fin.report_commentary (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),

    -- Polymorphic target
    target_kind         VARCHAR(30) NOT NULL
                        CHECK (target_kind IN (
                            'pack_instance',        -- pack-level (executive summary)
                            'pack_item',            -- section-level (per-report commentary)
                            'statement_line'        -- line-level (account explanation)
                        )),
    target_id           UUID NOT NULL,              -- FK depends on target_kind

    -- For line-level: which pack item and statement line
    pack_instance_item_id UUID REFERENCES fin.report_pack_instance_item(id),
    statement_line_code VARCHAR(50),

    -- Commentary content
    commentary_type     VARCHAR(20) NOT NULL DEFAULT 'NARRATIVE'
                        CHECK (commentary_type IN (
                            'NARRATIVE',        -- free-form explanation
                            'HIGHLIGHT',        -- flagged attention item
                            'RISK',             -- risk callout
                            'ACTION',           -- action item / follow-up
                            'APPROVAL_NOTE'     -- reviewer/approver note
                        )),

    title               VARCHAR(200),
    body                TEXT NOT NULL,

    -- Versioning (allows editing history)
    version             SMALLINT NOT NULL DEFAULT 1,
    is_current          BOOLEAN NOT NULL DEFAULT TRUE,

    -- Metadata
    author_id           UUID,
    author_name         VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_commentary_version UNIQUE (target_kind, target_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fin_commentary_target
    ON fin.report_commentary(target_kind, target_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_fin_commentary_pack_item
    ON fin.report_commentary(pack_instance_item_id)
    WHERE pack_instance_item_id IS NOT NULL;

-- ============================================================================
-- Budget resolution function
-- ============================================================================
-- Resolves budget amounts for statement line accounts,
-- matching the shape of resolve_statement_accounts.
CREATE OR REPLACE FUNCTION fin.resolve_statement_budget(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_definition_id UUID,
    p_fiscal_year   SMALLINT,
    p_period_from   SMALLINT,
    p_period_to     SMALLINT,
    p_book_code     VARCHAR(20) DEFAULT 'STAT',
    p_budget_code   VARCHAR(50) DEFAULT NULL,
    p_dimension_set_id UUID DEFAULT NULL
) RETURNS TABLE (
    line_code       VARCHAR(50),
    account_id      UUID,
    account_code    VARCHAR(20),
    budget_amount   DECIMAL(18,4)
) LANGUAGE sql STABLE AS $fn$
    SELECT
        sl.line_code,
        a.id AS account_id,
        a.account_code,
        COALESCE(SUM(bl.budget_amount), 0) AS budget_amount
    FROM fin.statement_line sl
    JOIN fin.statement_line_account sla ON sla.line_id = sl.id
    JOIN fin.chart_of_accounts a ON (
        (sla.mapping_mode = 'EXACT' AND a.account_code = sla.account_code)
        OR (sla.mapping_mode = 'RANGE' AND a.account_code >= sla.range_from
            AND a.account_code <= sla.range_to)
        OR (sla.mapping_mode = 'TYPE' AND a.account_type = sla.account_type)
    )
    LEFT JOIN fin.budget_line bl ON (
        bl.tenant_id = p_tenant_id
        AND bl.entity_code = p_entity_code
        AND bl.account_id = a.id
        AND bl.fiscal_year = p_fiscal_year
        AND bl.period_number BETWEEN p_period_from AND p_period_to
        AND bl.book_code = p_book_code
        AND bl.is_approved = TRUE
        AND (p_budget_code IS NULL OR bl.budget_code = p_budget_code)
        AND (p_dimension_set_id IS NULL OR bl.dimension_set_id = p_dimension_set_id)
    )
    WHERE sl.definition_id = p_definition_id
      AND sl.line_type IN ('ACCOUNT', 'MOVEMENT')
      AND sl.is_active = TRUE
      AND a.tenant_id = p_tenant_id
      AND a.entity_code = p_entity_code
      AND a.is_active = TRUE
      AND (sla.subledger_type IS NULL OR a.subledger_type = sla.subledger_type)
    GROUP BY sl.line_code, a.id, a.account_code
    ORDER BY sl.line_code, a.account_code;
$fn$;

-- ============================================================================
-- Immutability: finalized/published pack instances cannot be modified
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.trg_pack_instance_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('FINALIZED', 'PUBLISHED') AND
       NEW.status NOT IN ('PUBLISHED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'Finalized/published pack instance % cannot be modified', OLD.id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pack_instance_immutable ON fin.report_pack_instance;
CREATE TRIGGER trg_pack_instance_immutable
    BEFORE UPDATE ON fin.report_pack_instance
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_pack_instance_immutable();
