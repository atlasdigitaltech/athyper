/* ============================================================================
   Athyper v2.3 — Multi-Book Accounting System (Ledger Book Engine)
   Schema: fin
   Dependencies: 190_posting.sql (fin.journal_entry, fin.gl_balance,
                 fin.chart_of_accounts, fin.fiscal_period, fin.accounting_profile)
                 164_federation.sql (fin.legal_entity) — optional

   Implements a multi-book general ledger architecture where a single source
   transaction can generate separate journal entries in parallel accounting
   books, each following different recognition rules and standards.

   Table topology:

     Master data (2 tables):
       fin.ledger_book           — Book registry (STAT, TAX, MGMT, IFRS, LOCAL)
       fin.book_assignment       — Which books are active per legal entity

     Posting intelligence (1 table):
       fin.book_posting_rule     — How source transactions post differently per book

     Per-book period close (1 table):
       fin.book_period_status    — Independent period status per book per entity

     Existing tables extended (2 ALTER TABLEs):
       fin.journal_entry         → + book_code (FK to ledger_book)
       fin.gl_balance            → + book_code (included in balance grain)

     Operational safety (3 triggers/functions):
       trg_fin_je_derived_immutable    — Prevents mutation of derived JEs
       trg_fin_je_book_assignment_guard — Validates book is assigned to entity
       fin.audit_cross_book_integrity() — Cross-book integrity audit

     Helper functions (3):
       fin.get_entity_books()           — Active books for an entity
       fin.get_book_trial_balance()     — Trial balance per book
       fin.compare_books()              — Cross-book balance comparison

   Design principles:
     1. Books are PARALLEL LEDGERS, not dimensions — same source transaction can
        post different amounts/accounts to different books
     2. Every JE belongs to exactly one book (no cross-book journal entries)
     3. GL balances are maintained per book — each book has its own trial balance
     4. Primary book (is_primary = TRUE) is the default for single-book tenants
     5. Book posting rules drive multi-book posting intelligence
     6. Backward compatible: existing data defaults to 'STAT' (primary book)
     7. Asset book types (fin.asset_book.book_type) align with ledger_book codes

   Multi-book posting flow:
     1. Source document enters transaction pipeline
     2. Posting Engine queries fin.book_posting_rule for applicable rules
     3. For each matched book: generate a separate JE with book-specific
        account mapping, amount adjustment, and recognition treatment
     4. Each JE is independently balanced (total_debit = total_credit)
     5. GL balances updated per book independently
     6. Period close is per-book or unified (controlled by book_assignment)

   Consolidation integration:
     - Consolidation elimination entries (164_federation.sql) reference a book_code
     - IFRS and LOCAL books enable dual-GAAP reporting for legal entities
       operating in jurisdictions requiring both standards
     - Management book supports internal KPI reporting without statutory constraints

   Operational safety (4 guards):
     1. Per-book period close     — fin.book_period_status tracks independent close
                                    cycles for books with close_mode = 'INDEPENDENT'
     2. Derived JE immutability   — trigger prevents manual edit/reversal of
                                    system-derived JEs (derived_from_je_id NOT NULL)
     3. Entity-book validation    — trigger ensures JE.book_code is assigned to
                                    JE.entity_code via fin.book_assignment
     4. Cross-book integrity audit — fin.audit_cross_book_integrity() detects
                                    orphaned derivations, missing books, balance
                                    drift, and unassigned book postings
   ============================================================================ */

-- ============================================================================
-- fin.ledger_book — Master registry of accounting books
-- ============================================================================
-- Defines the available accounting books (ledgers) in the system.
-- Each book represents a complete, independent set of accounting records
-- following a specific reporting standard or purpose.
--
-- Book categories:
--   STATUTORY  — Primary books for legal/regulatory compliance
--   TAX        — Tax-basis accounting (may differ from statutory)
--   MANAGEMENT — Internal management reporting
--   REGULATORY — Specific regulatory standard (IFRS, Local GAAP)
--   CUSTOM     — Tenant-defined purpose
CREATE TABLE IF NOT EXISTS fin.ledger_book (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),

    -- Identity
    book_code       VARCHAR(20) NOT NULL,
    book_name       VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Classification
    category        VARCHAR(20) NOT NULL DEFAULT 'STATUTORY'
                    CHECK (category IN (
                        'STATUTORY',
                        'TAX',
                        'MANAGEMENT',
                        'REGULATORY',
                        'CUSTOM'
                    )),

    -- Reporting standard this book follows
    reporting_standard VARCHAR(30)
                    CHECK (reporting_standard IS NULL OR reporting_standard IN (
                        'IFRS',             -- International Financial Reporting Standards
                        'US_GAAP',          -- United States GAAP
                        'IND_AS',           -- Indian Accounting Standards
                        'UK_GAAP',          -- United Kingdom GAAP
                        'LOCAL_GAAP',       -- Other local GAAP (specified in description)
                        'TAX_LOCAL',        -- Local tax code
                        'TAX_TRANSFER',     -- Transfer pricing basis
                        'MANAGEMENT',       -- No external standard
                        'CUSTOM'            -- Tenant-defined
                    )),

    -- Currency: base reporting currency for this book
    -- (transactions may still be multi-currency; this is the functional currency)
    base_currency_code VARCHAR(3) NOT NULL DEFAULT 'USD'
                    REFERENCES ref.currency(code),

    -- Behavior flags
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,    -- primary book for single-book operations
    auto_post       BOOLEAN NOT NULL DEFAULT TRUE,     -- auto-generate JEs from source documents
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,  -- JEs need separate approval workflow

    -- Period close behavior
    -- UNIFIED: follows the primary book's period close
    -- INDEPENDENT: has its own period close cycle
    close_mode      VARCHAR(15) NOT NULL DEFAULT 'UNIFIED'
                    CHECK (close_mode IN ('UNIFIED', 'INDEPENDENT')),

    -- Posting control
    allow_manual_je BOOLEAN NOT NULL DEFAULT TRUE,     -- allow manual journal entries
    allow_reversal  BOOLEAN NOT NULL DEFAULT TRUE,     -- allow JE reversals

    -- Display
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    color_code      VARCHAR(7),                        -- hex color for UI badges

    -- Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One book_code per tenant (codes are tenant-global, assigned per entity via book_assignment)
    CONSTRAINT uq_fin_ledger_book UNIQUE (tenant_id, book_code),
    -- At most one primary book per tenant
    CONSTRAINT uq_fin_ledger_book_primary UNIQUE (tenant_id, is_primary)
        -- PostgreSQL partial unique index needed instead (see below)
);

-- Replace the table-level primary constraint with a partial unique index
-- (table constraint above will fail; use this instead)
ALTER TABLE fin.ledger_book DROP CONSTRAINT IF EXISTS uq_fin_ledger_book_primary;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_ledger_book_primary
    ON fin.ledger_book(tenant_id) WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_fin_ledger_book_tenant
    ON fin.ledger_book(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_book_active
    ON fin.ledger_book(tenant_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE fin.ledger_book IS
    'Master registry of accounting books (parallel ledgers). Each book represents '
    'a complete set of accounting records following a specific standard or purpose.';

-- ============================================================================
-- fin.book_assignment — Which books are active per legal entity
-- ============================================================================
-- Controls which books are available for each entity_code within a tenant.
-- Not all entities need all books — e.g., a holding company may only use
-- STAT + IFRS, while an operating subsidiary uses STAT + TAX + MGMT.
CREATE TABLE IF NOT EXISTS fin.book_assignment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    book_code       VARCHAR(20) NOT NULL,

    -- Override: entity-specific chart of accounts (NULL = use default CoA)
    -- Enables book-specific account mappings (e.g., IFRS requires different
    -- account structures than local GAAP)
    alternate_coa_prefix VARCHAR(10),

    -- Override: entity-specific base currency for this book
    -- (NULL = use ledger_book.base_currency_code)
    override_currency_code VARCHAR(3) REFERENCES ref.currency(code),

    -- Effective dating: when this book becomes/ceases active for this entity
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- FK to ledger_book
    CONSTRAINT fk_fin_book_assign_book
        FOREIGN KEY (tenant_id, book_code)
        REFERENCES fin.ledger_book(tenant_id, book_code),

    -- One assignment per book per entity
    CONSTRAINT uq_fin_book_assignment UNIQUE (tenant_id, entity_code, book_code),

    CONSTRAINT chk_fin_book_assign_dates CHECK (
        effective_to IS NULL OR effective_from <= effective_to
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_book_assign_entity
    ON fin.book_assignment(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_book_assign_active
    ON fin.book_assignment(tenant_id, entity_code, is_active)
    WHERE is_active = TRUE;

COMMENT ON TABLE fin.book_assignment IS
    'Controls which ledger books are active per legal entity. '
    'Enables entity-specific book configurations and effective dating.';

-- ============================================================================
-- fin.book_posting_rule — Multi-book posting intelligence
-- ============================================================================
-- Defines how a single source transaction generates different journal entries
-- across multiple books. The Posting Engine evaluates these rules during the
-- POSTING step of the transaction pipeline.
--
-- Example use cases:
--   - Depreciation: STAT uses straight-line, TAX uses MACRS → different amounts
--   - Revenue recognition: IFRS 15 vs local GAAP timing differences
--   - Lease accounting: IFRS 16 capitalizes, local GAAP expenses
--   - Fair value: IFRS marks to market, local GAAP uses cost basis
--   - Transfer pricing: TAX book uses arm's-length adjustments
--
-- Rule evaluation:
--   1. Match rules by (tenant, entity, source_book, target_book, doc_type, intent)
--   2. Apply account mapping (source account → target account)
--   3. Apply amount adjustment (multiplier, formula, or profile override)
--   4. Generate target-book JE with adjusted lines
CREATE TABLE IF NOT EXISTS fin.book_posting_rule (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Identity
    rule_code       VARCHAR(50) NOT NULL,
    rule_name       VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Source and target books
    source_book_code VARCHAR(20) NOT NULL,  -- the book that triggers this rule
    target_book_code VARCHAR(20) NOT NULL,  -- the book that receives the derived JE

    -- Scope: when does this rule apply?
    scope_doc_type      VARCHAR(30),        -- NULL = all doc types
    scope_intent_code   VARCHAR(50),        -- NULL = all intents
    scope_account_type  VARCHAR(20),        -- NULL = all account types
    scope_subledger_type VARCHAR(20),       -- NULL = all subledger types

    -- Account mapping strategy
    --   SAME:       use same GL accounts as source book
    --   MAP:        use account_mapping JSONB to remap accounts
    --   PROFILE:    use a different accounting_profile for target book
    account_strategy VARCHAR(10) NOT NULL DEFAULT 'SAME'
                    CHECK (account_strategy IN ('SAME', 'MAP', 'PROFILE')),

    -- For MAP strategy: { "source_account_code": "target_account_code", ... }
    account_mapping JSONB,

    -- For PROFILE strategy: accounting profile to use for target book
    target_profile_id UUID REFERENCES fin.accounting_profile(id),

    -- Amount adjustment strategy
    --   MIRROR:     copy amounts exactly from source
    --   MULTIPLY:   apply amount_multiplier to all amounts
    --   FORMULA:    evaluate amount_formula JSONB expression
    --   SUPPRESS:   do not post (skip this combination)
    amount_strategy VARCHAR(10) NOT NULL DEFAULT 'MIRROR'
                    CHECK (amount_strategy IN ('MIRROR', 'MULTIPLY', 'FORMULA', 'SUPPRESS')),

    -- For MULTIPLY: factor applied to debit/credit amounts
    amount_multiplier DECIMAL(10,6) DEFAULT 1.0,

    -- For FORMULA: evaluation expression
    -- e.g., {"type": "tax_adjustment", "rate_source": "tax_jurisdiction", "method": "accelerated"}
    amount_formula  JSONB,

    -- Timing: when does the target book recognize the entry?
    --   SIMULTANEOUS:  post at same time as source
    --   DEFERRED:      post in a later period (recognition_lag_periods)
    --   ON_CLOSE:      post during period close
    recognition_timing VARCHAR(15) NOT NULL DEFAULT 'SIMULTANEOUS'
                    CHECK (recognition_timing IN ('SIMULTANEOUS', 'DEFERRED', 'ON_CLOSE')),
    recognition_lag_periods SMALLINT DEFAULT 0,

    -- Priority for conflict resolution (higher wins)
    priority        SMALLINT NOT NULL DEFAULT 0,

    -- Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    version         SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- FKs to ledger_book
    CONSTRAINT fk_fin_bpr_source_book
        FOREIGN KEY (tenant_id, source_book_code)
        REFERENCES fin.ledger_book(tenant_id, book_code),
    CONSTRAINT fk_fin_bpr_target_book
        FOREIGN KEY (tenant_id, target_book_code)
        REFERENCES fin.ledger_book(tenant_id, book_code),

    CONSTRAINT uq_fin_book_posting_rule UNIQUE (tenant_id, entity_code, rule_code, version),

    -- Source and target must differ
    CONSTRAINT chk_fin_bpr_diff_books CHECK (source_book_code != target_book_code),

    -- MAP strategy requires account_mapping
    CONSTRAINT chk_fin_bpr_map CHECK (
        account_strategy != 'MAP' OR account_mapping IS NOT NULL
    ),
    -- PROFILE strategy requires target_profile_id
    CONSTRAINT chk_fin_bpr_profile CHECK (
        account_strategy != 'PROFILE' OR target_profile_id IS NOT NULL
    ),
    -- MULTIPLY strategy requires multiplier
    CONSTRAINT chk_fin_bpr_multiplier CHECK (
        amount_strategy != 'MULTIPLY' OR amount_multiplier IS NOT NULL
    ),
    -- FORMULA strategy requires formula
    CONSTRAINT chk_fin_bpr_formula CHECK (
        amount_strategy != 'FORMULA' OR amount_formula IS NOT NULL
    ),
    -- DEFERRED timing requires lag
    CONSTRAINT chk_fin_bpr_lag CHECK (
        recognition_timing != 'DEFERRED' OR recognition_lag_periods > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_bpr_tenant
    ON fin.book_posting_rule(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_bpr_source
    ON fin.book_posting_rule(tenant_id, source_book_code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fin_bpr_target
    ON fin.book_posting_rule(tenant_id, target_book_code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fin_bpr_scope
    ON fin.book_posting_rule(scope_doc_type, scope_intent_code)
    WHERE is_active = TRUE;

COMMENT ON TABLE fin.book_posting_rule IS
    'Multi-book posting intelligence. Defines how a single source transaction '
    'generates different journal entries across parallel accounting books, with '
    'account mapping, amount adjustment, and recognition timing control.';

-- ============================================================================
-- Schema extensions: add book_code to existing posting tables
-- ============================================================================

-- fin.journal_entry: each JE belongs to exactly one book
-- Default 'STAT' for backward compatibility with existing single-book data
ALTER TABLE fin.journal_entry
    ADD COLUMN IF NOT EXISTS book_code VARCHAR(20) NOT NULL DEFAULT 'STAT';

-- Add FK constraint (deferred to handle existing data without the ledger_book row)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fin_je_book') THEN
        ALTER TABLE fin.journal_entry
            ADD CONSTRAINT fk_fin_je_book
            FOREIGN KEY (tenant_id, book_code)
            REFERENCES fin.ledger_book(tenant_id, book_code)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- Source tracking: which JE in which book triggered this derived JE?
-- Enables traceability from STAT → TAX, STAT → IFRS, etc.
ALTER TABLE fin.journal_entry
    ADD COLUMN IF NOT EXISTS derived_from_je_id UUID REFERENCES fin.journal_entry(id);
ALTER TABLE fin.journal_entry
    ADD COLUMN IF NOT EXISTS posting_rule_id UUID REFERENCES fin.book_posting_rule(id);

CREATE INDEX IF NOT EXISTS idx_fin_je_book
    ON fin.journal_entry(tenant_id, book_code);
CREATE INDEX IF NOT EXISTS idx_fin_je_derived
    ON fin.journal_entry(derived_from_je_id) WHERE derived_from_je_id IS NOT NULL;

-- Update JE number uniqueness to be per-book
-- Old: uq_fin_je_number (tenant_id, entity_code, je_number)
-- New: per-book JE number uniqueness
-- We create a new index and keep the old one until migration
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_fin_je_number_per_book') THEN
        CREATE UNIQUE INDEX uq_fin_je_number_per_book
            ON fin.journal_entry(tenant_id, entity_code, book_code, je_number);
    END IF;
END $$;

-- fin.gl_balance: balance grain now includes book_code
-- Default 'STAT' for backward compatibility
ALTER TABLE fin.gl_balance
    ADD COLUMN IF NOT EXISTS book_code VARCHAR(20) NOT NULL DEFAULT 'STAT';

-- FK to ledger_book
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fin_gl_balance_book') THEN
        ALTER TABLE fin.gl_balance
            ADD CONSTRAINT fk_fin_gl_balance_book
            FOREIGN KEY (tenant_id, book_code)
            REFERENCES fin.ledger_book(tenant_id, book_code)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- New unique constraint including book_code
-- Old grain: (tenant, entity, account, year, period, cost_center, currency)
-- New grain: + book_code
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_fin_gl_balance_v3') THEN
        CREATE UNIQUE INDEX uq_fin_gl_balance_v3
            ON fin.gl_balance(tenant_id, entity_code, book_code, account_id, fiscal_year,
                              period_number, currency_code,
                              COALESCE(cost_center_id, '00000000-0000-0000-0000-000000000000'),
                              COALESCE(dimension_set_id, '00000000-0000-0000-0000-000000000000'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_gl_balance_book
    ON fin.gl_balance(tenant_id, entity_code, book_code);
CREATE INDEX IF NOT EXISTS idx_fin_gl_balance_book_period
    ON fin.gl_balance(tenant_id, entity_code, book_code, fiscal_year, period_number);

-- ============================================================================
-- fin.consolidation_elimination: add book_code for multi-book consolidation
-- ============================================================================
-- Elimination entries must be book-specific (e.g., IFRS eliminations differ
-- from local GAAP eliminations)
ALTER TABLE fin.consolidation_elimination
    ADD COLUMN IF NOT EXISTS book_code VARCHAR(20) NOT NULL DEFAULT 'STAT';

-- ============================================================================
-- Helper: get active books for an entity
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.get_entity_books(
    p_tenant_id   UUID,
    p_entity_code VARCHAR(20),
    p_as_of_date  DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    book_code           VARCHAR(20),
    book_name           VARCHAR(200),
    category            VARCHAR(20),
    reporting_standard  VARCHAR(30),
    base_currency_code  VARCHAR(3),
    is_primary          BOOLEAN,
    close_mode          VARCHAR(15)
) LANGUAGE sql STABLE AS $$
    SELECT
        lb.book_code,
        lb.book_name,
        lb.category,
        lb.reporting_standard,
        COALESCE(ba.override_currency_code, lb.base_currency_code),
        lb.is_primary,
        lb.close_mode
    FROM fin.book_assignment ba
    JOIN fin.ledger_book lb
        ON lb.tenant_id = ba.tenant_id AND lb.book_code = ba.book_code
    WHERE ba.tenant_id   = p_tenant_id
      AND ba.entity_code = p_entity_code
      AND ba.is_active   = TRUE
      AND lb.is_active   = TRUE
      AND ba.effective_from <= p_as_of_date
      AND (ba.effective_to IS NULL OR ba.effective_to >= p_as_of_date)
    ORDER BY lb.sort_order, lb.book_code;
$$;

-- ============================================================================
-- Helper: trial balance per book
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.get_book_trial_balance(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_book_code     VARCHAR(20),
    p_fiscal_year   SMALLINT,
    p_period_number SMALLINT
) RETURNS TABLE (
    account_id      UUID,
    account_code    VARCHAR(20),
    account_name    VARCHAR(200),
    account_type    VARCHAR(20),
    normal_balance  VARCHAR(10),
    opening_debit   DECIMAL(18,4),
    opening_credit  DECIMAL(18,4),
    period_debit    DECIMAL(18,4),
    period_credit   DECIMAL(18,4),
    closing_debit   DECIMAL(18,4),
    closing_credit  DECIMAL(18,4)
) LANGUAGE sql STABLE AS $$
    SELECT
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        coa.normal_balance,
        COALESCE(SUM(gb.opening_debit), 0),
        COALESCE(SUM(gb.opening_credit), 0),
        COALESCE(SUM(gb.period_debit), 0),
        COALESCE(SUM(gb.period_credit), 0),
        COALESCE(SUM(gb.closing_debit), 0),
        COALESCE(SUM(gb.closing_credit), 0)
    FROM fin.chart_of_accounts coa
    LEFT JOIN fin.gl_balance gb
        ON gb.account_id    = coa.id
       AND gb.tenant_id     = p_tenant_id
       AND gb.entity_code   = p_entity_code
       AND gb.book_code     = p_book_code
       AND gb.fiscal_year   = p_fiscal_year
       AND gb.period_number = p_period_number
    WHERE coa.tenant_id   = p_tenant_id
      AND coa.entity_code = p_entity_code
      AND coa.is_active   = TRUE
      AND (coa.is_group   = FALSE OR EXISTS (
          SELECT 1 FROM fin.gl_balance g2
          WHERE g2.account_id  = coa.id
            AND g2.book_code   = p_book_code
            AND g2.fiscal_year = p_fiscal_year
            AND g2.period_number = p_period_number
      ))
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance
    HAVING COALESCE(SUM(gb.closing_debit), 0) != 0
        OR COALESCE(SUM(gb.closing_credit), 0) != 0
    ORDER BY coa.account_code;
$$;

-- ============================================================================
-- Helper: cross-book comparison for a single account/period
-- ============================================================================
-- Useful for reconciliation between books (e.g., STAT vs TAX differences)
CREATE OR REPLACE FUNCTION fin.compare_books(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_fiscal_year   SMALLINT,
    p_period_number SMALLINT,
    p_account_id    UUID DEFAULT NULL  -- NULL = all accounts
) RETURNS TABLE (
    account_code    VARCHAR(20),
    account_name    VARCHAR(200),
    book_code       VARCHAR(20),
    closing_debit   DECIMAL(18,4),
    closing_credit  DECIMAL(18,4),
    net_balance     DECIMAL(18,4)
) LANGUAGE sql STABLE AS $$
    SELECT
        coa.account_code,
        coa.account_name,
        gb.book_code,
        SUM(gb.closing_debit),
        SUM(gb.closing_credit),
        SUM(gb.closing_debit) - SUM(gb.closing_credit)
    FROM fin.gl_balance gb
    JOIN fin.chart_of_accounts coa ON coa.id = gb.account_id
    WHERE gb.tenant_id     = p_tenant_id
      AND gb.entity_code   = p_entity_code
      AND gb.fiscal_year   = p_fiscal_year
      AND gb.period_number = p_period_number
      AND (p_account_id IS NULL OR gb.account_id = p_account_id)
    GROUP BY coa.account_code, coa.account_name, gb.book_code
    ORDER BY coa.account_code, gb.book_code;
$$;

-- ============================================================================
-- OPERATIONAL SAFETY ENHANCEMENT 1: Per-Book Period Close
-- ============================================================================
-- Books with close_mode = 'INDEPENDENT' maintain their own period status,
-- separate from the master fin.fiscal_period status. This is critical for:
--   - TAX book: tax filing deadlines differ from statutory close
--   - IFRS book: IFRS adjustments may complete after local close
--   - MGMT book: management reporting runs on its own cadence
--
-- Books with close_mode = 'UNIFIED' inherit the master period status and
-- do NOT get rows in this table — they follow fin.fiscal_period directly.
--
-- Period posting guard:
--   - Posting Engine checks: if book has INDEPENDENT close_mode, use
--     book_period_status.status; otherwise use fiscal_period.status
--   - A book's period can be HARD_CLOSED even if the master period is OPEN
--     (e.g., TAX book closed early for filing deadline)
--   - A book's period can be OPEN even if the master period is SOFT_CLOSE
--     (e.g., IFRS adjustments still in progress)
CREATE TABLE IF NOT EXISTS fin.book_period_status (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    book_code       VARCHAR(20) NOT NULL,
    fiscal_year     SMALLINT NOT NULL,
    period_number   SMALLINT NOT NULL,

    -- Period status for this book (mirrors fin.fiscal_period.status semantics)
    status          VARCHAR(20) NOT NULL DEFAULT 'FUTURE'
                    CHECK (status IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),

    -- Transition timestamps
    opened_at       TIMESTAMPTZ,
    soft_closed_at  TIMESTAMPTZ,
    hard_closed_at  TIMESTAMPTZ,
    closed_by       UUID,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- FK to ledger_book
    CONSTRAINT fk_fin_bps_book
        FOREIGN KEY (tenant_id, book_code)
        REFERENCES fin.ledger_book(tenant_id, book_code),

    -- FK to fiscal period (the master period must exist)
    CONSTRAINT fk_fin_bps_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    -- One status per book per period
    CONSTRAINT uq_fin_book_period_status
        UNIQUE (tenant_id, entity_code, book_code, fiscal_year, period_number)
);

CREATE INDEX IF NOT EXISTS idx_fin_bps_book_period
    ON fin.book_period_status(tenant_id, entity_code, book_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_bps_status
    ON fin.book_period_status(status) WHERE status != 'HARD_CLOSE';

COMMENT ON TABLE fin.book_period_status IS
    'Per-book period status for books with close_mode = INDEPENDENT. '
    'Enables TAX, IFRS, and MGMT books to close on their own schedule.';

-- Helper: resolve effective period status for a book
-- Returns the book-specific status if INDEPENDENT, or the master status if UNIFIED
CREATE OR REPLACE FUNCTION fin.get_book_period_status(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_book_code     VARCHAR(20),
    p_fiscal_year   SMALLINT,
    p_period_number SMALLINT
) RETURNS VARCHAR(20) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_close_mode VARCHAR(15);
    v_status     VARCHAR(20);
BEGIN
    -- Determine book's close mode
    SELECT lb.close_mode INTO v_close_mode
    FROM fin.ledger_book lb
    WHERE lb.tenant_id = p_tenant_id AND lb.book_code = p_book_code;

    IF v_close_mode = 'INDEPENDENT' THEN
        -- Use book-specific period status
        SELECT bps.status INTO v_status
        FROM fin.book_period_status bps
        WHERE bps.tenant_id     = p_tenant_id
          AND bps.entity_code   = p_entity_code
          AND bps.book_code     = p_book_code
          AND bps.fiscal_year   = p_fiscal_year
          AND bps.period_number = p_period_number;

        -- If no book_period_status row exists yet, fall back to master
        IF v_status IS NOT NULL THEN
            RETURN v_status;
        END IF;
    END IF;

    -- UNIFIED mode or fallback: use master fiscal_period status
    SELECT fp.status INTO v_status
    FROM fin.fiscal_period fp
    WHERE fp.tenant_id     = p_tenant_id
      AND fp.entity_code   = p_entity_code
      AND fp.fiscal_year   = p_fiscal_year
      AND fp.period_number = p_period_number;

    RETURN COALESCE(v_status, 'FUTURE');
END;
$$;

-- ============================================================================
-- OPERATIONAL SAFETY ENHANCEMENT 2: Derived JE Immutability Guard
-- ============================================================================
-- Journal entries derived from another book (derived_from_je_id IS NOT NULL)
-- are system-generated and must NOT be manually modified or reversed.
-- They can only change if the source JE changes (cascade via posting rules).
--
-- This prevents:
--   - Manual edits to TAX JEs that were auto-derived from STAT
--   - Direct reversal of IFRS-derived JEs (reverse the source instead)
--   - Status tampering on derived JEs
--
-- The trigger fires on UPDATE and blocks changes to derived JEs except:
--   - Status changes driven by the system (posting_rule_id match)
--   - Internal housekeeping columns (updated_at)
CREATE OR REPLACE FUNCTION fin.trg_fn_je_derived_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Only guard JEs that are derived (have a source JE)
    IF OLD.derived_from_je_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Block manual reversal: cannot set is_reversal or reversed_by_id on derived JEs
    IF NEW.is_reversal = TRUE AND OLD.is_reversal = FALSE THEN
        RAISE EXCEPTION
            'Cannot manually reverse a derived journal entry (JE %). '
            'Reverse the source JE % in book % instead.',
            OLD.id, OLD.derived_from_je_id, OLD.book_code;
    END IF;

    -- Block status change to REVERSED unless it's a system-driven cascade
    -- (system cascade sets reversed_by_id to the reversal JE of the source)
    IF NEW.status = 'REVERSED' AND OLD.status != 'REVERSED' THEN
        IF NEW.reversed_by_id IS NULL THEN
            RAISE EXCEPTION
                'Cannot manually change derived JE % to REVERSED. '
                'Reverse the source JE % instead.',
                OLD.id, OLD.derived_from_je_id;
        END IF;
    END IF;

    -- Block mutation of financial content on derived JEs
    IF NEW.total_debit != OLD.total_debit
       OR NEW.total_credit != OLD.total_credit
       OR NEW.currency_code != OLD.currency_code
       OR NEW.posting_date != OLD.posting_date
       OR NEW.fiscal_year != OLD.fiscal_year
       OR NEW.period_number != OLD.period_number
       OR NEW.book_code != OLD.book_code
       OR NEW.accounting_profile_id IS DISTINCT FROM OLD.accounting_profile_id
    THEN
        RAISE EXCEPTION
            'Cannot modify financial content of derived JE %. '
            'Derived JEs are system-managed. Modify the source JE % instead.',
            OLD.id, OLD.derived_from_je_id;
    END IF;

    -- Block severing the derivation chain
    IF NEW.derived_from_je_id IS DISTINCT FROM OLD.derived_from_je_id THEN
        RAISE EXCEPTION
            'Cannot modify derivation chain of JE %. '
            'derived_from_je_id is immutable once set.',
            OLD.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_je_derived_immutable ON fin.journal_entry;
CREATE TRIGGER trg_fin_je_derived_immutable
    BEFORE UPDATE ON fin.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_je_derived_immutable();

COMMENT ON FUNCTION fin.trg_fn_je_derived_immutable() IS
    'Prevents manual modification or reversal of derived journal entries. '
    'Derived JEs (derived_from_je_id NOT NULL) are system-managed and can '
    'only be changed via cascade from the source JE.';

-- ============================================================================
-- OPERATIONAL SAFETY ENHANCEMENT 3: Entity-Book Validation Constraint
-- ============================================================================
-- Ensures that every JE's book_code is actually assigned and active for the
-- JE's entity_code. Prevents posting to a book that hasn't been activated
-- for a given legal entity.
--
-- This catches:
--   - Posting to IFRS book on an entity that only has STAT + TAX
--   - Posting to a book whose assignment has expired (effective_to < posting_date)
--   - Posting to a deactivated book assignment (is_active = FALSE)
CREATE OR REPLACE FUNCTION fin.trg_fn_je_book_assignment_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_assigned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM fin.book_assignment ba
        WHERE ba.tenant_id   = NEW.tenant_id
          AND ba.entity_code = NEW.entity_code
          AND ba.book_code   = NEW.book_code
          AND ba.is_active   = TRUE
          AND ba.effective_from <= NEW.posting_date
          AND (ba.effective_to IS NULL OR ba.effective_to >= NEW.posting_date)
    ) INTO v_assigned;

    IF NOT v_assigned THEN
        RAISE EXCEPTION
            'Book "%" is not assigned or not active for entity "%" on date %. '
            'Check fin.book_assignment for tenant %.',
            NEW.book_code, NEW.entity_code, NEW.posting_date, NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_je_book_assignment_guard ON fin.journal_entry;
CREATE TRIGGER trg_fin_je_book_assignment_guard
    BEFORE INSERT ON fin.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_je_book_assignment_guard();

COMMENT ON FUNCTION fin.trg_fn_je_book_assignment_guard() IS
    'Validates that the book_code on a new journal entry is assigned and '
    'active for the target entity_code as of the posting_date.';

-- ============================================================================
-- OPERATIONAL SAFETY ENHANCEMENT 4: Cross-Book Integrity Audit
-- ============================================================================
-- Diagnostic function that scans for cross-book integrity issues.
-- Designed to run as a scheduled job (e.g., nightly) or on-demand from
-- the admin dashboard. Returns one row per detected issue.
--
-- Checks performed:
--   1. ORPHANED_DERIVATION  — derived JE whose source JE no longer exists
--   2. MISSING_DERIVATION   — source JE has active posting rules but no
--                             corresponding derived JE in the target book
--   3. UNASSIGNED_BOOK      — JE posted to a book not assigned to the entity
--   4. BALANCE_DRIFT        — derived JE total_debit/credit doesn't match
--                             expected value from posting rule (MIRROR only)
--   5. CLOSED_BOOK_POSTING  — JE posted to a book whose period is HARD_CLOSE
--   6. INACTIVE_BOOK        — JE references a deactivated ledger book
CREATE OR REPLACE FUNCTION fin.audit_cross_book_integrity(
    p_tenant_id   UUID,
    p_entity_code VARCHAR(20) DEFAULT NULL  -- NULL = all entities
) RETURNS TABLE (
    issue_type      TEXT,
    severity        TEXT,       -- CRITICAL, WARNING, INFO
    entity_code     VARCHAR(20),
    book_code       VARCHAR(20),
    je_id           UUID,
    je_number       VARCHAR(50),
    related_je_id   UUID,
    related_book    VARCHAR(20),
    rule_code       VARCHAR(50),
    detail          TEXT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    -- 1. ORPHANED_DERIVATION: derived JE points to a non-existent source
    RETURN QUERY
    SELECT
        'ORPHANED_DERIVATION'::TEXT,
        'CRITICAL'::TEXT,
        je.entity_code,
        je.book_code,
        je.id,
        je.je_number,
        je.derived_from_je_id,
        NULL::VARCHAR(20),
        NULL::VARCHAR(50),
        format('Derived JE %s references source JE %s which does not exist',
               je.je_number, je.derived_from_je_id)
    FROM fin.journal_entry je
    WHERE je.tenant_id = p_tenant_id
      AND je.derived_from_je_id IS NOT NULL
      AND (p_entity_code IS NULL OR je.entity_code = p_entity_code)
      AND NOT EXISTS (
          SELECT 1 FROM fin.journal_entry src WHERE src.id = je.derived_from_je_id
      );

    -- 2. MISSING_DERIVATION: source JE has active MIRROR rules but no derived JE
    RETURN QUERY
    SELECT
        'MISSING_DERIVATION'::TEXT,
        'WARNING'::TEXT,
        je.entity_code,
        je.book_code,
        je.id,
        je.je_number,
        NULL::UUID,
        bpr.target_book_code::VARCHAR(20),
        bpr.rule_code::VARCHAR(50),
        format('Source JE %s in book %s has no derived JE in target book %s (rule: %s)',
               je.je_number, je.book_code, bpr.target_book_code, bpr.rule_code)
    FROM fin.journal_entry je
    JOIN fin.book_posting_rule bpr
        ON bpr.tenant_id        = je.tenant_id
       AND bpr.entity_code      = je.entity_code
       AND bpr.source_book_code = je.book_code
       AND bpr.is_active        = TRUE
       AND bpr.amount_strategy != 'SUPPRESS'
    WHERE je.tenant_id = p_tenant_id
      AND je.status    = 'POSTED'
      AND je.derived_from_je_id IS NULL  -- only source JEs
      AND (p_entity_code IS NULL OR je.entity_code = p_entity_code)
      AND (bpr.scope_doc_type IS NULL OR bpr.scope_doc_type = je.doc_type)
      AND NOT EXISTS (
          SELECT 1 FROM fin.journal_entry derived
          WHERE derived.derived_from_je_id = je.id
            AND derived.book_code = bpr.target_book_code
      );

    -- 3. UNASSIGNED_BOOK: JE in a book not assigned to the entity
    RETURN QUERY
    SELECT
        'UNASSIGNED_BOOK'::TEXT,
        'CRITICAL'::TEXT,
        je.entity_code,
        je.book_code,
        je.id,
        je.je_number,
        NULL::UUID,
        NULL::VARCHAR(20),
        NULL::VARCHAR(50),
        format('JE %s posted to book %s which is not assigned to entity %s',
               je.je_number, je.book_code, je.entity_code)
    FROM fin.journal_entry je
    WHERE je.tenant_id = p_tenant_id
      AND (p_entity_code IS NULL OR je.entity_code = p_entity_code)
      AND NOT EXISTS (
          SELECT 1 FROM fin.book_assignment ba
          WHERE ba.tenant_id   = je.tenant_id
            AND ba.entity_code = je.entity_code
            AND ba.book_code   = je.book_code
      );

    -- 4. BALANCE_DRIFT: derived MIRROR JE amounts differ from source
    RETURN QUERY
    SELECT
        'BALANCE_DRIFT'::TEXT,
        'WARNING'::TEXT,
        derived.entity_code,
        derived.book_code,
        derived.id,
        derived.je_number,
        derived.derived_from_je_id,
        src.book_code::VARCHAR(20),
        bpr.rule_code::VARCHAR(50),
        format('Derived JE %s (debit=%s, credit=%s) drifted from source JE %s (debit=%s, credit=%s) under MIRROR rule %s',
               derived.je_number, derived.total_debit, derived.total_credit,
               src.je_number, src.total_debit, src.total_credit, bpr.rule_code)
    FROM fin.journal_entry derived
    JOIN fin.journal_entry src ON src.id = derived.derived_from_je_id
    LEFT JOIN fin.book_posting_rule bpr ON bpr.id = derived.posting_rule_id
    WHERE derived.tenant_id = p_tenant_id
      AND derived.derived_from_je_id IS NOT NULL
      AND (p_entity_code IS NULL OR derived.entity_code = p_entity_code)
      AND bpr.amount_strategy = 'MIRROR'
      AND (derived.total_debit != src.total_debit
           OR derived.total_credit != src.total_credit);

    -- 5. CLOSED_BOOK_POSTING: JE posted to a book whose period is HARD_CLOSE
    RETURN QUERY
    SELECT
        'CLOSED_BOOK_POSTING'::TEXT,
        'CRITICAL'::TEXT,
        je.entity_code,
        je.book_code,
        je.id,
        je.je_number,
        NULL::UUID,
        NULL::VARCHAR(20),
        NULL::VARCHAR(50),
        format('JE %s posted to book %s in period %s/%s which is HARD_CLOSE',
               je.je_number, je.book_code, je.fiscal_year, je.period_number)
    FROM fin.journal_entry je
    JOIN fin.book_period_status bps
        ON bps.tenant_id     = je.tenant_id
       AND bps.entity_code   = je.entity_code
       AND bps.book_code     = je.book_code
       AND bps.fiscal_year   = je.fiscal_year
       AND bps.period_number = je.period_number
    WHERE je.tenant_id = p_tenant_id
      AND je.status    = 'POSTED'
      AND bps.status   = 'HARD_CLOSE'
      AND (p_entity_code IS NULL OR je.entity_code = p_entity_code)
      AND je.posted_at > bps.hard_closed_at;  -- posted AFTER the close

    -- 6. INACTIVE_BOOK: JE references a deactivated ledger book
    RETURN QUERY
    SELECT
        'INACTIVE_BOOK'::TEXT,
        'WARNING'::TEXT,
        je.entity_code,
        je.book_code,
        je.id,
        je.je_number,
        NULL::UUID,
        NULL::VARCHAR(20),
        NULL::VARCHAR(50),
        format('JE %s references book %s which is now inactive (deactivated)',
               je.je_number, je.book_code)
    FROM fin.journal_entry je
    JOIN fin.ledger_book lb
        ON lb.tenant_id = je.tenant_id AND lb.book_code = je.book_code
    WHERE je.tenant_id = p_tenant_id
      AND je.status    = 'CREATED'  -- only un-posted JEs are actionable
      AND lb.is_active = FALSE
      AND (p_entity_code IS NULL OR je.entity_code = p_entity_code);
END;
$$;

COMMENT ON FUNCTION fin.audit_cross_book_integrity(UUID, VARCHAR) IS
    'Diagnostic function that scans for cross-book integrity issues. '
    'Returns one row per detected issue with severity, context, and detail. '
    'Run nightly as a scheduled job or on-demand from admin dashboard.';

-- ============================================================================
-- ENHANCEMENT 5: Book-Aware Posting Idempotency
-- ============================================================================
-- When a single source JE fans out to multiple books, the idempotency key
-- must be book-aware to avoid collisions. A STAT JE and its TAX derivative
-- share the same source doc, so a plain docId+docType key would fail on the
-- second book.
--
-- Composite key format: {source_je_id}:{target_book_code}:{posting_rule_id}
-- This is stored as a generated column on fin.journal_entry for derived JEs,
-- and used by the Posting Engine's no-post-twice check.
ALTER TABLE fin.journal_entry
    ADD COLUMN IF NOT EXISTS book_idempotency_key VARCHAR(200);

-- Unique per tenant+entity: prevents duplicate derived JEs for the same
-- source+book+rule combination
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_fin_je_book_idempotency') THEN
        CREATE UNIQUE INDEX uq_fin_je_book_idempotency
            ON fin.journal_entry(tenant_id, entity_code, book_idempotency_key)
            WHERE book_idempotency_key IS NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN fin.journal_entry.book_idempotency_key IS
    'Book-aware idempotency key for derived JEs. Format: {source_je_id}:{book_code}:{rule_id}. '
    'Prevents duplicate derivations when a source JE fans out to multiple books.';

-- ============================================================================
-- ENHANCEMENT 6: Book-Close Audit Log
-- ============================================================================
-- Immutable audit trail of all period status transitions per book.
-- Critical for:
--   - Audit: who closed/reopened which book and when
--   - Support: diagnosing period close issues
--   - Compliance: proving the close sequence was followed
--
-- Events captured:
--   OPENED, SOFT_CLOSED, HARD_CLOSED, REOPENED, INHERITED_FROM_UNIFIED
CREATE TABLE IF NOT EXISTS fin.book_close_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    book_code       VARCHAR(20) NOT NULL,
    fiscal_year     SMALLINT NOT NULL,
    period_number   SMALLINT NOT NULL,

    -- What happened
    event_type      VARCHAR(30) NOT NULL
                    CHECK (event_type IN (
                        'OPENED',                   -- FUTURE/SOFT_CLOSE → OPEN
                        'SOFT_CLOSED',              -- OPEN → SOFT_CLOSE
                        'HARD_CLOSED',              -- SOFT_CLOSE → HARD_CLOSE
                        'REOPENED',                 -- SOFT_CLOSE → OPEN (exception case)
                        'INHERITED_FROM_UNIFIED'    -- book inherited master period transition
                    )),

    -- Transition detail
    from_status     VARCHAR(20) NOT NULL
                    CHECK (from_status IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),
    to_status       VARCHAR(20) NOT NULL
                    CHECK (to_status IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),

    -- Who and when
    performed_by    UUID,
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Context
    reason          TEXT,
    evidence        JSONB DEFAULT '{}'::JSONB,

    -- FK to ledger_book
    CONSTRAINT fk_fin_bcal_book
        FOREIGN KEY (tenant_id, book_code)
        REFERENCES fin.ledger_book(tenant_id, book_code),

    -- FK to fiscal period
    CONSTRAINT fk_fin_bcal_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    -- Transition must change status
    CONSTRAINT chk_fin_bcal_transition CHECK (from_status != to_status)
);

CREATE INDEX IF NOT EXISTS idx_fin_bcal_book_period
    ON fin.book_close_audit_log(tenant_id, entity_code, book_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_bcal_event
    ON fin.book_close_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_fin_bcal_time
    ON fin.book_close_audit_log(performed_at DESC);

COMMENT ON TABLE fin.book_close_audit_log IS
    'Immutable audit trail of all period status transitions per book. '
    'Captures OPENED, SOFT_CLOSED, HARD_CLOSED, REOPENED, and '
    'INHERITED_FROM_UNIFIED events with actor, timestamp, and evidence.';

-- Trigger: auto-log book_period_status transitions
CREATE OR REPLACE FUNCTION fin.trg_fn_book_period_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event VARCHAR(30);
BEGIN
    -- Determine event type from status transition
    IF NEW.status = 'OPEN' AND (OLD.status = 'FUTURE' OR OLD.status = 'SOFT_CLOSE') THEN
        v_event := CASE WHEN OLD.status = 'SOFT_CLOSE' THEN 'REOPENED' ELSE 'OPENED' END;
    ELSIF NEW.status = 'SOFT_CLOSE' AND OLD.status = 'OPEN' THEN
        v_event := 'SOFT_CLOSED';
    ELSIF NEW.status = 'HARD_CLOSE' AND OLD.status = 'SOFT_CLOSE' THEN
        v_event := 'HARD_CLOSED';
    ELSE
        -- Unexpected transition — still log it
        v_event := 'OPENED';
    END IF;

    INSERT INTO fin.book_close_audit_log (
        tenant_id, entity_code, book_code,
        fiscal_year, period_number,
        event_type, from_status, to_status,
        performed_by, performed_at
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, NEW.book_code,
        NEW.fiscal_year, NEW.period_number,
        v_event, OLD.status, NEW.status,
        NEW.closed_by, now()
    );

    -- Update timestamp on the status row
    NEW.updated_at := now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_book_period_audit ON fin.book_period_status;
CREATE TRIGGER trg_fin_book_period_audit
    BEFORE UPDATE ON fin.book_period_status
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fin.trg_fn_book_period_audit_log();

-- ============================================================================
-- ENHANCEMENT 7: Per-Book Reversal Orchestration
-- ============================================================================
-- SQL function that cascades a reversal from a source JE to all its derived
-- JEs across books. Called by the Posting Engine's reverseWithCascade() method.
--
-- Cascade strategy:
--   1. Validate source JE exists and is POSTED
--   2. Discover all linked derived JEs (derived_from_je_id = source_je_id)
--   3. For each derived JE (in reverse sort_order of target book):
--      a. Create a reversal JE in that book
--      b. Mark the derived JE as REVERSED
--      c. Log the reversal chain
--   4. Finally reverse the source JE itself
--   5. Return the full audit chain
--
-- This function handles the DB-level orchestration. The Posting Engine
-- service layer calls this within a transaction and handles GL balance
-- updates for each reversal.
CREATE OR REPLACE FUNCTION fin.cascade_reversal(
    p_tenant_id       UUID,
    p_source_je_id    UUID,
    p_reversal_prefix VARCHAR(10) DEFAULT 'REV-',
    p_reversed_by     UUID DEFAULT NULL,
    p_reason_code     VARCHAR(50) DEFAULT NULL,
    p_reason_text     TEXT DEFAULT NULL,
    p_correlation_id  UUID DEFAULT NULL
) RETURNS TABLE (
    book_code          VARCHAR(20),
    original_je_id     UUID,
    original_je_number VARCHAR(50),
    reversal_je_id     UUID,
    reversal_je_number VARCHAR(50),
    cascade_order      INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
    v_source          RECORD;
    v_derived         RECORD;
    v_reversal_id     UUID;
    v_reversal_number VARCHAR(50);
    v_order           INTEGER := 0;
    v_line            RECORD;
    v_line_no         SMALLINT;
    v_blocked_book    RECORD;
    v_reason_desc     TEXT;
BEGIN
    -- Build reason description for JE descriptions
    v_reason_desc := '';
    IF p_reason_code IS NOT NULL THEN
        v_reason_desc := format(' [%s]', p_reason_code);
    END IF;
    IF p_reason_text IS NOT NULL THEN
        v_reason_desc := v_reason_desc || format(' %s', p_reason_text);
    END IF;

    -- Validate source JE
    SELECT * INTO v_source
    FROM fin.journal_entry
    WHERE id = p_source_je_id AND tenant_id = p_tenant_id;

    IF v_source IS NULL THEN
        RAISE EXCEPTION 'Source JE % not found for tenant %', p_source_je_id, p_tenant_id;
    END IF;
    IF v_source.status != 'POSTED' THEN
        RAISE EXCEPTION 'Source JE % is %, not POSTED — cannot reverse', p_source_je_id, v_source.status;
    END IF;
    IF v_source.reversed_by_id IS NOT NULL THEN
        RAISE EXCEPTION 'Source JE % already reversed by %', p_source_je_id, v_source.reversed_by_id;
    END IF;
    IF v_source.derived_from_je_id IS NOT NULL THEN
        RAISE EXCEPTION 'JE % is a derived entry. Reverse its source JE % instead.',
            p_source_je_id, v_source.derived_from_je_id;
    END IF;

    -- ── Pre-flight: Period-status validation ──────────────────────────
    -- Fail the entire cascade if ANY book's period is HARD_CLOSE.
    -- Check source JE's book period first.
    SELECT bps.book_code AS blocked_book, bps.status AS blocked_status
    INTO v_blocked_book
    FROM fin.book_period_status bps
    WHERE bps.tenant_id = p_tenant_id
      AND bps.entity_code = v_source.entity_code
      AND bps.book_code = v_source.book_code
      AND bps.fiscal_year = v_source.fiscal_year
      AND bps.period_number = v_source.period_number
      AND bps.status = 'HARD_CLOSE'
    LIMIT 1;

    IF v_blocked_book IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reverse: book % period FY%/P% is HARD_CLOSE',
            v_blocked_book.blocked_book, v_source.fiscal_year, v_source.period_number;
    END IF;

    -- Check all derived JEs' book periods
    SELECT bps.book_code AS blocked_book, bps.status AS blocked_status,
           je.fiscal_year, je.period_number
    INTO v_blocked_book
    FROM fin.journal_entry je
    JOIN fin.book_period_status bps
        ON bps.tenant_id = je.tenant_id
       AND bps.entity_code = je.entity_code
       AND bps.book_code = je.book_code
       AND bps.fiscal_year = je.fiscal_year
       AND bps.period_number = je.period_number
    WHERE je.derived_from_je_id = p_source_je_id
      AND je.tenant_id = p_tenant_id
      AND je.status = 'POSTED'
      AND bps.status = 'HARD_CLOSE'
    LIMIT 1;

    IF v_blocked_book IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reverse: derived book % period FY%/P% is HARD_CLOSE — whole cascade blocked',
            v_blocked_book.blocked_book, v_blocked_book.fiscal_year, v_blocked_book.period_number;
    END IF;

    -- Phase 1: Reverse all derived JEs first (leaves → root)
    -- Ordered by ledger_book.sort_order DESC so higher-sort books reverse first
    FOR v_derived IN
        SELECT je.*, lb.sort_order
        FROM fin.journal_entry je
        JOIN fin.ledger_book lb ON lb.tenant_id = je.tenant_id AND lb.book_code = je.book_code
        WHERE je.derived_from_je_id = p_source_je_id
          AND je.tenant_id = p_tenant_id
          AND je.status = 'POSTED'
        ORDER BY lb.sort_order DESC
    LOOP
        v_order := v_order + 1;
        v_reversal_id := gen_random_uuid();
        v_reversal_number := p_reversal_prefix || v_derived.je_number;

        -- Create reversal JE for derived entry
        INSERT INTO fin.journal_entry (
            id, tenant_id, entity_code, je_number, txn_id, doc_id, doc_type,
            book_code, accounting_profile_id, fiscal_year, period_number,
            posting_date, description, status,
            total_debit, total_credit, currency_code,
            is_reversal, reversal_of_id, posted_by, posted_at,
            derived_from_je_id, posting_rule_id,
            book_idempotency_key
        ) VALUES (
            v_reversal_id, p_tenant_id, v_derived.entity_code,
            v_reversal_number, v_derived.txn_id, v_derived.doc_id,
            v_derived.doc_type || '_REVERSAL',
            v_derived.book_code, v_derived.accounting_profile_id,
            v_derived.fiscal_year, v_derived.period_number,
            CURRENT_DATE,
            format('Cascade reversal of %s (source: %s)%s', v_derived.je_number, v_source.je_number, v_reason_desc),
            'POSTED',
            v_derived.total_debit, v_derived.total_credit, v_derived.currency_code,
            TRUE, v_derived.id, p_reversed_by, now(),
            v_derived.derived_from_je_id, v_derived.posting_rule_id,
            format('%s:%s:REV', v_derived.id, v_derived.book_code)
        );

        -- Create reversed lines (swap debit/credit)
        v_line_no := 0;
        FOR v_line IN
            SELECT * FROM fin.journal_line
            WHERE je_id = v_derived.id AND tenant_id = p_tenant_id
            ORDER BY line_no
        LOOP
            v_line_no := v_line_no + 1;
            INSERT INTO fin.journal_line (
                tenant_id, je_id, line_no, account_id,
                cost_center_id, profit_center_id,
                debit_amount, credit_amount, currency_code,
                description, subledger_type, subledger_ref_id,
                dimension_set_id, tags
            ) VALUES (
                p_tenant_id, v_reversal_id, v_line_no, v_line.account_id,
                v_line.cost_center_id, v_line.profit_center_id,
                v_line.credit_amount, v_line.debit_amount,  -- SWAPPED
                v_line.currency_code,
                'Reversal: ' || COALESCE(v_line.description, ''),
                v_line.subledger_type, v_line.subledger_ref_id,
                v_line.dimension_set_id, v_line.tags
            );
        END LOOP;

        -- Mark derived JE as reversed (allowed by immutability trigger
        -- because we set reversed_by_id)
        UPDATE fin.journal_entry
        SET status = 'REVERSED', reversed_by_id = v_reversal_id
        WHERE id = v_derived.id AND tenant_id = p_tenant_id;

        -- Return this step
        book_code          := v_derived.book_code;
        original_je_id     := v_derived.id;
        original_je_number := v_derived.je_number;
        reversal_je_id     := v_reversal_id;
        reversal_je_number := v_reversal_number;
        cascade_order      := v_order;
        RETURN NEXT;
    END LOOP;

    -- Phase 2: Reverse the source JE itself
    v_order := v_order + 1;
    v_reversal_id := gen_random_uuid();
    v_reversal_number := p_reversal_prefix || v_source.je_number;

    INSERT INTO fin.journal_entry (
        id, tenant_id, entity_code, je_number, txn_id, doc_id, doc_type,
        book_code, accounting_profile_id, fiscal_year, period_number,
        posting_date, description, status,
        total_debit, total_credit, currency_code,
        is_reversal, reversal_of_id, posted_by, posted_at,
        book_idempotency_key
    ) VALUES (
        v_reversal_id, p_tenant_id, v_source.entity_code,
        v_reversal_number, v_source.txn_id, v_source.doc_id,
        v_source.doc_type || '_REVERSAL',
        v_source.book_code, v_source.accounting_profile_id,
        v_source.fiscal_year, v_source.period_number,
        CURRENT_DATE,
        format('Reversal of %s%s', v_source.je_number, v_reason_desc),
        'POSTED',
        v_source.total_debit, v_source.total_credit, v_source.currency_code,
        TRUE, v_source.id, p_reversed_by, now(),
        format('%s:%s:REV', v_source.id, v_source.book_code)
    );

    -- Create reversed lines for source
    v_line_no := 0;
    FOR v_line IN
        SELECT * FROM fin.journal_line
        WHERE je_id = v_source.id AND tenant_id = p_tenant_id
        ORDER BY line_no
    LOOP
        v_line_no := v_line_no + 1;
        INSERT INTO fin.journal_line (
            tenant_id, je_id, line_no, account_id,
            cost_center_id, profit_center_id,
            debit_amount, credit_amount, currency_code,
            description, subledger_type, subledger_ref_id,
            dimension_set_id, tags
        ) VALUES (
            p_tenant_id, v_reversal_id, v_line_no, v_line.account_id,
            v_line.cost_center_id, v_line.profit_center_id,
            v_line.credit_amount, v_line.debit_amount,  -- SWAPPED
            v_line.currency_code,
            'Reversal: ' || COALESCE(v_line.description, ''),
            v_line.subledger_type, v_line.subledger_ref_id,
            v_line.dimension_set_id, v_line.tags
        );
    END LOOP;

    -- Mark source JE as reversed
    UPDATE fin.journal_entry
    SET status = 'REVERSED', reversed_by_id = v_reversal_id
    WHERE id = v_source.id AND tenant_id = p_tenant_id;

    -- Return source step
    book_code          := v_source.book_code;
    original_je_id     := v_source.id;
    original_je_number := v_source.je_number;
    reversal_je_id     := v_reversal_id;
    reversal_je_number := v_reversal_number;
    cascade_order      := v_order;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fin.cascade_reversal(UUID, UUID, VARCHAR, UUID, VARCHAR, TEXT, UUID) IS
    'Orchestrates a cascade reversal: reverses a source JE and all its '
    'derived JEs across books in governed order (leaves → root). '
    'Pre-flight validates that no book period in the chain is HARD_CLOSE. '
    'Captures reason_code, reason_text, and correlation_id for audit. '
    'Returns the full reversal chain for audit trail and GL balance updates.';

-- ============================================================================
-- ENHANCEMENT 8: Audit Log Immutability
-- ============================================================================
-- The book_close_audit_log is append-only. No UPDATE or DELETE allowed.

CREATE OR REPLACE FUNCTION fin.trg_fn_book_close_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'book_close_audit_log is append-only: % operations are not permitted', TG_OP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_bcal_immutable_update ON fin.book_close_audit_log;
CREATE TRIGGER trg_fin_bcal_immutable_update
    BEFORE UPDATE ON fin.book_close_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_book_close_audit_immutable();

DROP TRIGGER IF EXISTS trg_fin_bcal_immutable_delete ON fin.book_close_audit_log;
CREATE TRIGGER trg_fin_bcal_immutable_delete
    BEFORE DELETE ON fin.book_close_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_book_close_audit_immutable();

-- ============================================================================
-- ENHANCEMENT 9: Book-Close Authorization Policy
-- ============================================================================
-- Role gating for period close transitions.
-- Controller → soft close, CFO → hard close, reopen requires elevated approval.

CREATE TABLE IF NOT EXISTS fin.book_close_auth_policy (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,

    -- Scope (NULL = applies to all)
    entity_code     VARCHAR(20),
    book_code       VARCHAR(20),

    -- Transition being governed
    transition_from VARCHAR(20) NOT NULL
                    CHECK (transition_from IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),
    transition_to   VARCHAR(20) NOT NULL
                    CHECK (transition_to IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),

    -- Required authorization
    required_role   VARCHAR(50) NOT NULL,
    requires_second_approval BOOLEAN NOT NULL DEFAULT FALSE,
    second_approval_role     VARCHAR(50),

    -- Metadata
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fin_bcap_transition CHECK (transition_from != transition_to),
    CONSTRAINT chk_fin_bcap_second_approval
        CHECK (NOT requires_second_approval OR second_approval_role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fin_bcap_lookup
    ON fin.book_close_auth_policy(tenant_id, transition_from, transition_to)
    WHERE is_active = TRUE;

COMMENT ON TABLE fin.book_close_auth_policy IS
    'Defines role-based authorization requirements for book period close transitions. '
    'E.g., OPEN→SOFT_CLOSE requires CONTROLLER role, SOFT_CLOSE→HARD_CLOSE requires CFO, '
    'SOFT_CLOSE→OPEN (reopen) requires CFO + second approval.';

-- Helper: check if a transition is authorized for a given role set
CREATE OR REPLACE FUNCTION fin.check_close_authorization(
    p_tenant_id       UUID,
    p_entity_code     VARCHAR(20),
    p_book_code       VARCHAR(20),
    p_from_status     VARCHAR(20),
    p_to_status       VARCHAR(20),
    p_actor_roles     TEXT[]
) RETURNS TABLE (
    authorized        BOOLEAN,
    required_role     VARCHAR(50),
    needs_second      BOOLEAN,
    second_role       VARCHAR(50)
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_policy RECORD;
BEGIN
    -- Find matching policy (most specific first: entity+book > entity > global)
    SELECT p.* INTO v_policy
    FROM fin.book_close_auth_policy p
    WHERE p.tenant_id = p_tenant_id
      AND p.transition_from = p_from_status
      AND p.transition_to = p_to_status
      AND p.is_active = TRUE
      AND (p.entity_code IS NULL OR p.entity_code = p_entity_code)
      AND (p.book_code IS NULL OR p.book_code = p_book_code)
    ORDER BY
        (p.entity_code IS NOT NULL AND p.book_code IS NOT NULL)::INT DESC,
        (p.entity_code IS NOT NULL)::INT DESC,
        (p.book_code IS NOT NULL)::INT DESC
    LIMIT 1;

    -- No policy = allowed by default
    IF v_policy IS NULL THEN
        authorized := TRUE;
        required_role := NULL;
        needs_second := FALSE;
        second_role := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check primary role
    authorized := v_policy.required_role = ANY(p_actor_roles);
    required_role := v_policy.required_role;
    needs_second := v_policy.requires_second_approval;
    second_role := v_policy.second_approval_role;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fin.check_close_authorization IS
    'Checks whether a set of actor roles is authorized for a given period close transition. '
    'Returns the authorization result plus details about required roles and second-approval needs.';

-- ============================================================================
-- ENHANCEMENT 10: Audit Snapshot Persistence
-- ============================================================================
-- Stores nightly cross-book integrity scan results for historical tracking.

CREATE TABLE IF NOT EXISTS fin.cross_book_audit_snapshot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    entity_code     VARCHAR(20),

    -- Snapshot metadata
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    triggered_by    VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
    correlation_id  UUID,

    -- Summary counts
    critical_count  INTEGER NOT NULL DEFAULT 0,
    warning_count   INTEGER NOT NULL DEFAULT 0,
    info_count      INTEGER NOT NULL DEFAULT 0,
    total_count     INTEGER NOT NULL DEFAULT 0,

    -- Rollup arrays for dashboard performance
    affected_books      VARCHAR(20)[] NOT NULL DEFAULT '{}',
    affected_entities   VARCHAR(20)[] NOT NULL DEFAULT '{}',

    -- Full issue detail
    issues          JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Metadata
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_cbas_tenant_time
    ON fin.cross_book_audit_snapshot(tenant_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_cbas_entity
    ON fin.cross_book_audit_snapshot(tenant_id, entity_code, snapshot_at DESC)
    WHERE entity_code IS NOT NULL;

COMMENT ON TABLE fin.cross_book_audit_snapshot IS
    'Persisted results from scheduled cross-book integrity audits. '
    'Each row captures the full issue list as JSONB plus severity counts, '
    'affected_books/entities arrays for dashboard rollups, '
    'and supports historical trend analysis and compliance reporting.';

-- ============================================================================
-- ENHANCEMENT 11: Book-Close Authorization Decision Audit
-- ============================================================================
-- Immutable log of every authorization check for period close transitions.
-- Records both approvals and denials for compliance.

CREATE TABLE IF NOT EXISTS fin.book_close_auth_decision (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    entity_code         VARCHAR(20) NOT NULL,
    book_code           VARCHAR(20) NOT NULL,

    -- Requested transition
    transition_from     VARCHAR(20) NOT NULL
                        CHECK (transition_from IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),
    transition_to       VARCHAR(20) NOT NULL
                        CHECK (transition_to IN ('FUTURE', 'OPEN', 'SOFT_CLOSE', 'HARD_CLOSE')),
    fiscal_year         SMALLINT NOT NULL,
    period_number       SMALLINT NOT NULL,

    -- Policy match
    matched_policy_id   UUID,
    required_role       VARCHAR(50),

    -- Decision
    requested_by        UUID NOT NULL,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_roles         TEXT[] NOT NULL DEFAULT '{}',
    decision            VARCHAR(20) NOT NULL
                        CHECK (decision IN ('APPROVED', 'DENIED', 'PENDING_SECOND')),
    denial_reason       TEXT,

    -- Second approval (if needed)
    second_approver     UUID,
    second_approved_at  TIMESTAMPTZ,
    second_decision     VARCHAR(20)
                        CHECK (second_decision IS NULL OR second_decision IN ('APPROVED', 'DENIED')),

    -- Correlation
    correlation_id      UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fin_bcad_transition CHECK (transition_from != transition_to),
    CONSTRAINT chk_fin_bcad_denial
        CHECK (decision != 'DENIED' OR denial_reason IS NOT NULL),
    CONSTRAINT chk_fin_bcad_second
        CHECK (second_decision IS NULL OR second_approver IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fin_bcad_lookup
    ON fin.book_close_auth_decision(tenant_id, entity_code, book_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_bcad_time
    ON fin.book_close_auth_decision(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_bcad_pending
    ON fin.book_close_auth_decision(tenant_id, decision)
    WHERE decision = 'PENDING_SECOND';

COMMENT ON TABLE fin.book_close_auth_decision IS
    'Immutable audit trail of all book-close authorization decisions. '
    'Records the requested transition, matched policy, actor roles, '
    'and outcome (APPROVED/DENIED/PENDING_SECOND) with denial reason '
    'and optional second-approver details.';

-- Immutability triggers for auth decision log
CREATE OR REPLACE FUNCTION fin.trg_fn_book_close_auth_decision_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Allow UPDATE only to fill in second-approval fields on PENDING_SECOND rows
    IF TG_OP = 'UPDATE' THEN
        IF OLD.decision = 'PENDING_SECOND'
           AND NEW.second_approver IS NOT NULL
           AND NEW.second_decision IS NOT NULL
        THEN
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'book_close_auth_decision is append-only: % operations are not permitted', TG_OP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_bcad_immutable_update ON fin.book_close_auth_decision;
CREATE TRIGGER trg_fin_bcad_immutable_update
    BEFORE UPDATE ON fin.book_close_auth_decision
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_book_close_auth_decision_immutable();

DROP TRIGGER IF EXISTS trg_fin_bcad_immutable_delete ON fin.book_close_auth_decision;
CREATE TRIGGER trg_fin_bcad_immutable_delete
    BEFORE DELETE ON fin.book_close_auth_decision
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_fn_book_close_auth_decision_immutable();
