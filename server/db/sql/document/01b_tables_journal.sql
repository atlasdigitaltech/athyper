-- ============================================================================
-- document/01b_tables_journal.sql
-- Concept: Journal Entries — GL postings, FX revaluation runs, accounting distributions
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql
-- Scope: Journal / GL / FX document tables + accounting distribution
-- Domain: journal_entry, journal_line, journal_line_reference,
--         fx_revaluation_run, accounting_distribution
-- Load order: 004a (after 004_document.sql)
-- ============================================================================

-- ============================================================================
-- JOURNAL ENTRY / LINE / LINE REFERENCE
-- ============================================================================

-- ============================================================================
-- §JE  document.journal_entry — the posting event
-- ============================================================================
-- Status lifecycle: draft → created → posted → reversed
-- All amounts cached from lines (trigger-synced on draft→created)
-- Immutable after posted (except status→reversed and reversed_by_id)

CREATE TABLE IF NOT EXISTS document.journal_entry (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Book + Period (UUID FKs)
    book_id          uuid         NOT NULL,
    fiscal_period_id uuid         NOT NULL,
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,

    -- Numbering
    je_number        text         NOT NULL,

    -- Dates
    document_date    date         NOT NULL,
    posting_date     date         NOT NULL,

    -- Source document
    source_doc_type  text         NOT NULL,
    source_doc_id    uuid,

    -- Amounts (CACHED from lines — not authoritative)
    transaction_currency character(3) NOT NULL,
    base_currency    character(3)     NOT NULL,
    total_debit      numeric(18,4) NOT NULL DEFAULT 0,
    total_credit     numeric(18,4) NOT NULL DEFAULT 0,
    line_count       smallint     NOT NULL DEFAULT 0,

    -- Description
    description      text,

    -- Reversal chain
    is_reversal      boolean      NOT NULL DEFAULT false,
    reversal_of_id   uuid,
    reversed_by_id   uuid,

    -- Auto-reversal
    is_auto_reverse  boolean      NOT NULL DEFAULT false,
    auto_reverse_date date,

    -- Cross-book derivation
    derived_from_je_id   uuid,
    posting_rule_id      uuid,
    book_idempotency_key text,

    -- Closed-period support
    prior_period_flag      boolean  NOT NULL DEFAULT false,
    original_period_year   smallint,
    original_period_number smallint,
    close_override_id      uuid,

    -- Posting metadata
    posted_at        timestamptz,
    posted_by        uuid,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'created', 'posted')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT journal_entry_pkey PRIMARY KEY (id),
    CONSTRAINT journal_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT journal_entry_tenant_number_uq
        UNIQUE (tenant_id, company_code_id, je_number),
    CONSTRAINT je_balanced_chk CHECK (total_debit = total_credit),
    CONSTRAINT je_doc_date_chk CHECK (document_date <= posting_date),
    CONSTRAINT je_auto_reverse_chk CHECK (NOT is_auto_reverse OR auto_reverse_date IS NOT NULL),
    CONSTRAINT je_no_self_ref CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT je_prior_period_chk CHECK (
        NOT prior_period_flag
        OR (original_period_year IS NOT NULL AND original_period_number IS NOT NULL)
    ),
    CONSTRAINT je_number_nonempty CHECK (btrim(je_number) <> '')
);

-- Idempotency for cross-book derived JEs
CREATE UNIQUE INDEX IF NOT EXISTS je_idempotency_uq
    ON document.journal_entry (tenant_id, book_idempotency_key)
    WHERE book_idempotency_key IS NOT NULL;

COMMENT ON TABLE document.journal_entry IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''created'',''posted'')). Journal entry header. Status lifecycle: draft → created → posted → reversed. '
    'Amounts cached from lines (trigger-synced). Immutable after posted. '
    'document_date = business event date, posting_date = GL period assignment.';


-- ============================================================================
-- §JL  document.journal_line — debit/credit lines
-- ============================================================================
-- Dual-currency: transaction amounts (document currency) + base amounts
-- Strict polarity: exactly one side > 0.
-- Denormalized company_code_id, book_id, fiscal_period_id from header.

CREATE TABLE IF NOT EXISTS document.journal_line (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent journal entry
    journal_entry_id uuid         NOT NULL,

    -- Denormalized from header (trigger-synced on INSERT)
    company_code_id  uuid         NOT NULL,
    book_id          uuid         NOT NULL,
    fiscal_period_id uuid         NOT NULL,
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,
    posting_date     date         NOT NULL,

    -- Line sequencing
    line_no          smallint     NOT NULL,

    -- Account
    gl_account_id    uuid         NOT NULL,

    -- Transaction amounts (document currency)
    transaction_currency character(3) NOT NULL,
    transaction_debit    numeric(18,4) NOT NULL DEFAULT 0,
    transaction_credit   numeric(18,4) NOT NULL DEFAULT 0,

    -- Base amounts (company functional currency)
    base_currency    character(3)     NOT NULL,
    base_debit       numeric(18,4) NOT NULL DEFAULT 0,
    base_credit      numeric(18,4) NOT NULL DEFAULT 0,
    exchange_rate    numeric(18,10),

    -- First-class dimensions
    cost_center_id   uuid,
    profit_center_id uuid,
    project_id       uuid,
    site_id          uuid,

    -- Composite dimensions
    dimension_set_id uuid,

    -- Party (counterparty)
    party_type       text,
    party_id         uuid,

    -- Subledger
    subledger_type   text,

    -- Narrative
    description      text,

    -- Source traceability
    source_doc_line_id uuid,

    -- Posting
    posted_at        timestamptz,
    posted_by        uuid,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT journal_line_pkey PRIMARY KEY (id),
    CONSTRAINT journal_line_je_line_uq UNIQUE (tenant_id, journal_entry_id, line_no),
    CONSTRAINT jl_txn_nonneg_chk CHECK (transaction_debit >= 0 AND transaction_credit >= 0),
    CONSTRAINT jl_txn_polarity_chk CHECK (
        (transaction_debit > 0 AND transaction_credit = 0)
        OR (transaction_debit = 0 AND transaction_credit > 0)
    ),
    CONSTRAINT jl_base_nonneg_chk CHECK (base_debit >= 0 AND base_credit >= 0),
    CONSTRAINT jl_base_polarity_chk CHECK (
        (base_debit > 0 AND base_credit = 0)
        OR (base_debit = 0 AND base_credit > 0)
    ),
    CONSTRAINT jl_side_match_chk CHECK (
        (transaction_debit > 0 AND base_debit > 0)
        OR (transaction_credit > 0 AND base_credit > 0)
    ),
    CONSTRAINT jl_fx_rate_chk CHECK (
        transaction_currency = base_currency OR exchange_rate IS NOT NULL
    ),
    CONSTRAINT jl_party_chk CHECK (
        (party_type IS NULL AND party_id IS NULL)
        OR (party_type IS NOT NULL AND party_id IS NOT NULL)
    )
);

COMMENT ON TABLE document.journal_line IS
    'ARCHETYPE=C;SCOPE=T. Journal entry debit/credit lines. Dual-currency: transaction + base amounts. '
    'Strict polarity: exactly one side > 0. Denormalized header fields for query perf.';


-- ============================================================================
-- §JLR  document.journal_line_reference — allocation / application tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.journal_line_reference (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent line
    journal_line_id  uuid         NOT NULL,

    -- Reference target (polymorphic)
    ref_type         text         NOT NULL,
    ref_doc_type     text         NOT NULL,
    ref_doc_id       uuid         NOT NULL,
    ref_doc_line_id  uuid,
    ref_doc_number   text,

    -- Allocation amount
    allocated_amount numeric(18,4) NOT NULL,
    currency_code    character(3) NOT NULL,
    base_amount      numeric(18,4),

    -- Settlement tracking
    is_full_settlement boolean    NOT NULL DEFAULT false,
    settlement_date  date,

    -- Narrative
    description      text,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (append-only — no updated_at)
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,

    CONSTRAINT journal_line_reference_pkey PRIMARY KEY (id),
    CONSTRAINT jlr_amount_pos_chk CHECK (allocated_amount > 0)
);

-- G3: Widened uniqueness — include ref_doc_line_id for line-level allocation.
-- Old: UNIQUE (tenant_id, journal_line_id, ref_doc_type, ref_doc_id)
--   Problem: one JE line can't allocate to two lines of the same invoice.
-- New: adds COALESCE(ref_doc_line_id, sentinel) so (JE-line, INV-001, line-1)
--   and (JE-line, INV-001, line-2) are distinct rows.
CREATE UNIQUE INDEX IF NOT EXISTS jlr_line_ref_uq
    ON document.journal_line_reference (
        tenant_id,
        journal_line_id,
        ref_doc_type,
        ref_doc_id,
        COALESCE(ref_doc_line_id, '00000000-0000-0000-0000-000000000000')
    );

COMMENT ON TABLE document.journal_line_reference IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Allocation/application tracking. 1:N child of journal_line. Handles payment '
    'allocation, credit note application, netting, advance clearing, PO matching, '
    'and asset capitalization.';


-- ============================================================================
-- TAX + FX ENGINE — document.fx_revaluation_run
-- ============================================================================
-- Period-end FX revaluation run header. Lines in ledger.fx_revaluation_line.

CREATE TABLE IF NOT EXISTS document.fx_revaluation_run (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Company + book scope
    company_code_id         uuid            NOT NULL,
    book_id                 uuid            NOT NULL,

    -- Period
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Dates
    revaluation_date        date            NOT NULL,
    posting_date            date,

    -- Rate
    rate_type_used          text            NOT NULL DEFAULT 'PERIOD_END',
    rate_source             text            NOT NULL DEFAULT 'MANUAL',
    functional_currency     character(3)    NOT NULL,

    -- Amounts
    total_unrealized_gain   numeric(18,4)   NOT NULL DEFAULT 0,
    total_unrealized_loss   numeric(18,4)   NOT NULL DEFAULT 0,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                total_unrealized_gain - total_unrealized_loss
                            ) STORED,
    line_count              integer         NOT NULL DEFAULT 0,

    -- GL linkage
    revaluation_je_id       uuid,
    reversal_je_id          uuid,
    is_auto_reversed        boolean         NOT NULL DEFAULT true,
    auto_reverse_date       date,
    idempotency_key         text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','calculated','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fxrr_pkey            PRIMARY KEY (id),
    CONSTRAINT fxrr_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT fxrr_status_chk      CHECK (status IN (
        'draft','calculated','posted','reversed','cancelled')),
    CONSTRAINT fxrr_gain_nonneg     CHECK (total_unrealized_gain >= 0),
    CONSTRAINT fxrr_loss_nonneg     CHECK (total_unrealized_loss >= 0),
    CONSTRAINT fxrr_period_chk      CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT fxrr_reverse_chk     CHECK (NOT is_auto_reversed OR auto_reverse_date IS NOT NULL)
);

COMMENT ON TABLE document.fx_revaluation_run IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''calculated'',''posted'')). Period-end FX revaluation run header. net_amount GENERATED. '
    'Lines stored in ledger.fx_revaluation_line (immutable). '
    'Auto-reversal creates a reversal JE on auto_reverse_date (first day of next period).';


-- ============================================================================
-- §12  document.accounting_distribution — split-charge distribution
-- ============================================================================
-- Moved from 004b_document_p2p.sql. Used by requisition, commitment,
-- invoice, GR, and SES lines. Not used by payment entries.

CREATE TABLE IF NOT EXISTS document.accounting_distribution (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Source document (polymorphic)
    source_doc_type         text            NOT NULL,
    source_doc_id           uuid            NOT NULL,
    source_line_id          uuid            NOT NULL,

    -- Distribution sequencing
    distribution_no         smallint        NOT NULL,

    -- Split basis
    distribution_basis      text            NOT NULL DEFAULT 'PERCENT',
    split_pct               numeric(7,4),
    split_amount            numeric(18,4),
    split_quantity          numeric(18,4),

    -- Distributed amount
    distributed_amount      numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Engine-aligned resolution inputs (drives control.resolve_entry_account())
    account_source          text            NOT NULL DEFAULT 'FROM_CATEGORY',
    posting_role_code       text,
    account_code            text,
    account_lookup_key      text,
    account_fallback        text,
    gl_account_id           uuid,
    business_intent_id      uuid,
    spend_category_id       uuid,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- CapEx flag
    is_capex                boolean         NOT NULL DEFAULT false,
    asset_class_id          uuid,

    -- Tax override
    tax_treatment_override  text,

    -- Budget linkage
    budget_allocation_id    uuid,
    budget_check_result     text,

    -- Encumbrance
    encumbrance_je_id       uuid,

    -- Narrative
    description             text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ad_pkey              PRIMARY KEY (id),
    CONSTRAINT ad_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ad_line_dist_uq      UNIQUE (
        source_doc_type, source_doc_id, source_line_id, distribution_no),
    CONSTRAINT ad_dist_no_chk       CHECK (distribution_no > 0),
    CONSTRAINT ad_basis_chk         CHECK (distribution_basis IN (
        'PERCENT','AMOUNT','QUANTITY')),
    CONSTRAINT ad_pct_chk           CHECK (
        distribution_basis <> 'PERCENT'
        OR (split_pct IS NOT NULL AND split_pct > 0)),
    CONSTRAINT ad_amount_chk        CHECK (
        distribution_basis <> 'AMOUNT' OR split_amount IS NOT NULL),
    CONSTRAINT ad_qty_chk           CHECK (
        distribution_basis <> 'QUANTITY' OR split_quantity IS NOT NULL),
    CONSTRAINT ad_distributed_nonneg CHECK (distributed_amount >= 0),
    CONSTRAINT ad_source_type_chk   CHECK (source_doc_type IN (
        'PURCHASE_REQUISITION_LINE',
        'COMMITMENT_LINE',
        'PURCHASE_INVOICE_LINE',
        'GOODS_RECEIPT_LINE',
        'SERVICE_ENTRY_SHEET_LINE')),
    CONSTRAINT ad_source_chk        CHECK (account_source IN (
        'POSTING_ROLE','FIXED','FROM_INTENT','FROM_CATEGORY')),
    CONSTRAINT ad_posting_role_req  CHECK (
        account_source <> 'POSTING_ROLE' OR posting_role_code IS NOT NULL),
    CONSTRAINT ad_fixed_req         CHECK (
        account_source <> 'FIXED'
        OR gl_account_id IS NOT NULL OR account_code IS NOT NULL),
    CONSTRAINT ad_intent_req        CHECK (
        account_source <> 'FROM_INTENT' OR business_intent_id IS NOT NULL),
    CONSTRAINT ad_category_req      CHECK (
        account_source <> 'FROM_CATEGORY' OR spend_category_id IS NOT NULL),
    CONSTRAINT ad_budget_chk        CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'passed','warned','override','blocked','exempt')),
    CONSTRAINT ad_tax_override_chk  CHECK (tax_treatment_override IS NULL OR
        tax_treatment_override IN (
            'STANDARD','ZERO_RATED','EXEMPT','REVERSE_CHARGE','OUT_OF_SCOPE'))
);

COMMENT ON TABLE document.accounting_distribution IS
    'ARCHETYPE=C;SCOPE=T. Split-charge distribution. account_source drives control.resolve_entry_account() at posting time. '
    'Default: FROM_CATEGORY (spend_category → intent → GL). '
    'POSTING_ROLE for system rows (GRIR_CLEARING, PRICE_VARIANCE, ADVANCE_PREPAID, AP_TRADE, AP_RETENTION). '
    'PAYMENT_ENTRY excluded – payments allocate AP liabilities, not P&L charges.';
