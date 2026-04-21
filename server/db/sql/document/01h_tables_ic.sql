-- ============================================================================
-- document/01h_tables_ic.sql
-- Concept: Intercompany — IC agreements, netting batches, elimination records
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql
-- Scope: Intercompany (IC) Engine document tables
-- Domain: intercompany_agreement, intercompany_transaction,
--         netting_batch, ic_elimination
-- Load order: 004g (after 004a_document_journal.sql)
-- ============================================================================

-- ============================================================================
-- §ICA1  document.intercompany_agreement — IC transfer pricing rulebook
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.intercompany_agreement (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL DEFAULT '',
    name                        text            NOT NULL DEFAULT '',
    company_code_id             uuid            NOT NULL,

    -- Natural key
    agreement_number            text            NOT NULL,

    -- Classification
    source_company_code_id      uuid            NOT NULL,
    dest_company_code_id        uuid            NOT NULL,
    agreement_type              text            NOT NULL,
    description                 text,

    -- Transfer pricing
    transfer_pricing_method     text            NOT NULL,
    markup_pct                  numeric(7,4),
    arm_length_basis            text,

    -- Amounts
    currency_code               character(3)    NOT NULL,
    base_currency_code          character(3),
    annual_value                numeric(18,4),
    total_value                 numeric(18,4),

    -- Dates
    effective_from              date            NOT NULL,
    effective_to                date,

    -- Conflict resolution
    priority                    smallint        NOT NULL DEFAULT 0,
    conflict_strategy           text            NOT NULL DEFAULT 'HIGHEST_PRIORITY',

    -- Versioning
    version                     smallint        NOT NULL DEFAULT 1,
    supersedes_id               uuid,

    -- Dimensions
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    site_id                     uuid,
    dimension_set_id            uuid,

    -- Ownership + workflow
    agreement_owner_id          uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    workflow_request_id         uuid,

    -- Tags & Metadata
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft', 'active')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ica_pkey              PRIMARY KEY (id),
    CONSTRAINT ica_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ica_tenant_number_uq  UNIQUE (tenant_id, company_code_id, agreement_number),
    CONSTRAINT ica_number_nonempty   CHECK (btrim(agreement_number) <> ''),
    CONSTRAINT ica_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id),
    CONSTRAINT ica_agreement_type_chk CHECK (agreement_type IN (
        'GOODS','SERVICES','LOAN','ROYALTY','MANAGEMENT_FEE','COST_SHARING','OTHER')),
    CONSTRAINT ica_tp_method_chk     CHECK (transfer_pricing_method IN (
        'CUP','COST_PLUS','RESALE_MINUS','TNMM','PROFIT_SPLIT','COMPARABLE_PROFIT','OTHER')),
    CONSTRAINT ica_markup_chk        CHECK (markup_pct IS NULL OR markup_pct BETWEEN -100 AND 1000),
    CONSTRAINT ica_conflict_chk      CHECK (conflict_strategy IN (
        'HIGHEST_PRIORITY','MOST_SPECIFIC','ERROR_ON_CONFLICT')),
    CONSTRAINT ica_effective_date_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ica_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id),
    CONSTRAINT ica_status_chk        CHECK (status IN (
        'draft','active','suspended','superseded','expired','cancelled')),
    CONSTRAINT ica_priority_chk      CHECK (priority >= 0),
    CONSTRAINT ica_version_chk       CHECK (version >= 1)
);

COMMENT ON TABLE document.intercompany_agreement IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''active'')). IC transfer pricing agreement between two company codes. '
    'OECD methods: CUP, COST_PLUS, RESALE_MINUS, TNMM, PROFIT_SPLIT, COMPARABLE_PROFIT. '
    'Conflict resolution via priority + conflict_strategy. '
    'Version chain via supersedes_id. Status: draft → active → suspended|superseded|expired|cancelled.';


-- ============================================================================
-- §ICA2  document.intercompany_transaction — bilateral IC billing events
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.intercompany_transaction (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL DEFAULT '',
    name                        text            NOT NULL DEFAULT '',
    company_code_id             uuid            NOT NULL,

    -- Natural key
    ic_txn_number               text            NOT NULL,

    -- Parties
    source_company_code_id      uuid            NOT NULL,
    dest_company_code_id        uuid            NOT NULL,

    -- Classification
    txn_type                    text            NOT NULL,

    -- Dates
    document_date               date            NOT NULL,
    posting_date                date            NOT NULL,

    -- Amounts
    currency_code               character(3)    NOT NULL,
    amount                      numeric(18,4)   NOT NULL,

    -- Transfer pricing
    agreement_id                uuid,
    transfer_price              numeric(18,4),
    arm_length_price            numeric(18,4),
    pricing_variance            numeric(18,4)   GENERATED ALWAYS AS (
                                    transfer_price - arm_length_price
                                ) STORED,

    -- Base currency
    base_currency_code          character(3)    NOT NULL,
    exchange_rate               numeric(18,10),
    base_amount                 numeric(18,4),

    -- GL linkage
    source_je_id                uuid,
    dest_je_id                  uuid,

    -- Mirror
    mirror_txn_id               uuid,
    is_mirror                   boolean         NOT NULL DEFAULT false,

    -- Match
    match_status                text            NOT NULL DEFAULT 'UNMATCHED',
    matched_at                  timestamptz,
    discrepancy_amount          numeric(18,4),
    discrepancy_reason          text,

    -- Netting
    netting_batch_id            uuid,

    -- Fiscal scope
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint,

    -- Dimensions
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    site_id                     uuid,
    dimension_set_id            uuid,

    -- Narrative
    description                 text,

    -- Tags & Metadata
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft','created','posted','netted')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Posting
    posted_at                   timestamptz,
    posted_by                   uuid,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ict_pkey              PRIMARY KEY (id),
    CONSTRAINT ict_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ict_tenant_number_uq  UNIQUE (tenant_id, company_code_id, ic_txn_number),
    CONSTRAINT ict_number_nonempty   CHECK (btrim(ic_txn_number) <> ''),
    CONSTRAINT ict_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id),
    CONSTRAINT ict_type_chk          CHECK (txn_type IN (
        'RECHARGE','PURCHASE','SALE','LOAN_DRAWDOWN','LOAN_REPAYMENT',
        'ROYALTY','MANAGEMENT_FEE','COST_ALLOCATION','DIVIDEND','OTHER')),
    CONSTRAINT ict_doc_date_chk      CHECK (document_date <= posting_date),
    CONSTRAINT ict_amount_positive   CHECK (amount > 0),
    CONSTRAINT ict_match_status_chk  CHECK (match_status IN (
        'UNMATCHED','MATCHED','DISPUTED','PARTIALLY_MATCHED')),
    CONSTRAINT ict_status_chk        CHECK (status IN (
        'draft','created','posted','netted','settled','disputed','cancelled','reversed')),
    CONSTRAINT ict_no_self_mirror    CHECK (mirror_txn_id IS DISTINCT FROM id),
    CONSTRAINT ict_fx_rate_chk       CHECK (currency_code = base_currency_code OR exchange_rate IS NOT NULL),
    CONSTRAINT ict_period_chk        CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE document.intercompany_transaction IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''created'',''posted'',''netted'')). IC billing event between two company codes. Dual-currency (transaction + base). '
    'pricing_variance GENERATED (transfer_price - arm_length_price). '
    'Mirror transactions auto-created on counterparty side (is_mirror = true). '
    'Status: draft → created → posted → netted → settled | disputed | reversed.';


-- ============================================================================
-- §ICA3  document.netting_batch — settlement netting header
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.netting_batch (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL DEFAULT '',
    name                        text            NOT NULL DEFAULT '',
    company_code_id             uuid            NOT NULL,

    -- Natural key
    batch_number                text            NOT NULL,

    -- Parties
    company_code_a_id           uuid            NOT NULL,
    company_code_b_id           uuid            NOT NULL,

    -- Dates
    batch_date                  date            NOT NULL,
    cut_off_date                date            NOT NULL,
    settlement_date             date,

    -- Amounts
    currency_code               character(3)    NOT NULL,
    gross_amount_a_to_b         numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount_b_to_a         numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount                numeric(18,4)   GENERATED ALWAYS AS (
                                    gross_amount_a_to_b + gross_amount_b_to_a
                                ) STORED,
    net_amount                  numeric(18,4)   NOT NULL DEFAULT 0,
    net_direction               text            NOT NULL DEFAULT 'ZERO',
    txn_count                   integer         NOT NULL DEFAULT 0,

    -- GL linkage
    settlement_je_id            uuid,

    -- Fiscal scope
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint,

    -- Idempotency
    idempotency_key             text,

    -- Tags & Metadata
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft','calculated','approved')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Settlement audit
    settled_at                  timestamptz,
    settled_by                  uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT nb_pkey               PRIMARY KEY (id),
    CONSTRAINT nb_tenant_id_uq       UNIQUE (tenant_id, id),
    CONSTRAINT nb_tenant_number_uq   UNIQUE (tenant_id, company_code_id, batch_number),
    CONSTRAINT nb_number_nonempty    CHECK (btrim(batch_number) <> ''),
    CONSTRAINT nb_entity_chk         CHECK (company_code_a_id IS DISTINCT FROM company_code_b_id),
    CONSTRAINT nb_direction_chk      CHECK (net_direction IN ('A_TO_B','B_TO_A','ZERO')),
    CONSTRAINT nb_gross_a_nonneg     CHECK (gross_amount_a_to_b >= 0),
    CONSTRAINT nb_gross_b_nonneg     CHECK (gross_amount_b_to_a >= 0),
    CONSTRAINT nb_net_nonneg         CHECK (net_amount >= 0),
    CONSTRAINT nb_txn_count_nonneg   CHECK (txn_count >= 0),
    CONSTRAINT nb_cutoff_chk         CHECK (cut_off_date <= batch_date),
    CONSTRAINT nb_settlement_chk     CHECK (settlement_date IS NULL OR settlement_date >= batch_date),
    CONSTRAINT nb_status_chk         CHECK (status IN (
        'draft','calculated','approved','settled','cancelled')),
    CONSTRAINT nb_period_chk         CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE document.netting_batch IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''calculated'',''approved'')). Bilateral IC netting batch header. gross_amount GENERATED (a_to_b + b_to_a). '
    'net_amount = |a_to_b - b_to_a|; net_direction indicates payer. '
    'Status: draft → calculated → approved → settled | cancelled.';


-- ============================================================================
-- §ICA4  document.ic_elimination — consolidation elimination document
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.ic_elimination (
    -- Identity
    id                              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid            NOT NULL,
    code                            text            NOT NULL DEFAULT '',
    name                            text            NOT NULL DEFAULT '',
    company_code_id                 uuid            NOT NULL,

    -- Natural key
    elimination_code                text            NOT NULL,

    -- Parties
    source_company_code_id          uuid            NOT NULL,
    counterparty_company_code_id    uuid            NOT NULL,

    -- Classification
    elimination_type                text            NOT NULL,
    consolidation_group             text            NOT NULL,

    -- Book + period
    book_id                         uuid            NOT NULL,
    fiscal_year                     smallint        NOT NULL,
    period_number                   smallint        NOT NULL,

    -- Dates
    elimination_date                date            NOT NULL,
    posting_date                    date            NOT NULL,

    -- Amounts
    elimination_amount              numeric(18,4)   NOT NULL,
    currency_code                   character(3)    NOT NULL,
    functional_currency_code        character(3)    NOT NULL,
    exchange_rate                   numeric(18,10),
    functional_amount               numeric(18,4),

    -- Line count
    line_count                      smallint        NOT NULL DEFAULT 0,

    -- GL linkage
    ic_transaction_id               uuid,
    je_id                           uuid,
    reversal_je_id                  uuid,

    -- AI-assisted approval
    decision_score                  numeric(5,4),
    approval_route                  text            NOT NULL DEFAULT 'STANDARD',

    -- Tags & Metadata
    tags                            jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                        jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                          text            NOT NULL DEFAULT 'calculated',
    is_active                       boolean         GENERATED ALWAYS AS (
                                        status IN ('calculated','approved','posted')
                                    ) STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,

    -- Approval + posting audit
    approved_at                     timestamptz,
    approved_by                     uuid,
    posted_at                       timestamptz,
    posted_by                       uuid,

    -- Audit
    created_at                      timestamptz     NOT NULL DEFAULT now(),
    created_by                      uuid            NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT ice_pkey              PRIMARY KEY (id),
    CONSTRAINT ice_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ice_tenant_code_uq    UNIQUE (tenant_id, company_code_id, elimination_code),
    CONSTRAINT ice_code_nonempty     CHECK (btrim(elimination_code) <> ''),
    CONSTRAINT ice_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM counterparty_company_code_id),
    CONSTRAINT ice_type_chk          CHECK (elimination_type IN (
        'REVENUE_EXPENSE','RECEIVABLE_PAYABLE','INVENTORY_MARKUP',
        'IC_PROFIT','MINORITY_INTEREST','INVESTMENT','DIVIDEND','LOAN','OTHER')),
    CONSTRAINT ice_approval_chk      CHECK (approval_route IN ('AUTO','STANDARD','ENHANCED','MANUAL')),
    CONSTRAINT ice_score_chk         CHECK (decision_score IS NULL OR decision_score BETWEEN 0 AND 1),
    CONSTRAINT ice_amount_positive   CHECK (elimination_amount > 0),
    CONSTRAINT ice_date_chk          CHECK (elimination_date <= posting_date),
    CONSTRAINT ice_status_chk        CHECK (status IN (
        'calculated','approved','posted','reversed','rejected','cancelled')),
    CONSTRAINT ice_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT ice_fx_rate_chk       CHECK (currency_code = functional_currency_code OR exchange_rate IS NOT NULL),
    CONSTRAINT ice_no_self_je        CHECK (je_id IS DISTINCT FROM reversal_je_id)
);

COMMENT ON TABLE document.ic_elimination IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''calculated'',''approved'',''posted'')). IC elimination operational document. Produces a JE (source_doc_type = ic_elimination). '
    'AI-assisted: decision_score (0-1) drives approval_route (AUTO/STANDARD/ENHANCED/MANUAL). '
    'Children: ledger.ic_elimination_line. '
    'Status: calculated → approved → posted → reversed | rejected | cancelled.';
