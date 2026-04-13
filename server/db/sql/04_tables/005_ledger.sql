-- 04_tables/005_ledger.sql
-- Depends on: 01_schemas, 03_bootstrap_functions (shared.uuidv7)
-- Ledger schema tables. Column order: Identity → Table-specific → Audit.

-- §1  ledger.gl_balance — period-level balance store
-- UPSERT target for PostingService.
-- closing = GENERATED from opening + period (accounting identity enforced).
-- version column for optimistic locking / concurrency control.
-- 3 first-class dimensions + dimension_set for long tail.
CREATE TABLE IF NOT EXISTS ledger.gl_balance (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Account + Book
    gl_account_id    uuid         NOT NULL,
    book_id          uuid         NOT NULL,

    -- Period
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,
    currency_code    character(3) NOT NULL,

    -- First-class dimensions
    cost_center_id   uuid,
    profit_center_id uuid,
    project_id       uuid,

    -- Composite dimensions
    dimension_set_id uuid,

    -- Balances
    opening_debit    numeric(18,4) NOT NULL DEFAULT 0,
    opening_credit   numeric(18,4) NOT NULL DEFAULT 0,
    period_debit     numeric(18,4) NOT NULL DEFAULT 0,
    period_credit    numeric(18,4) NOT NULL DEFAULT 0,
    closing_debit    numeric(18,4) GENERATED ALWAYS AS (opening_debit + period_debit) STORED,
    closing_credit   numeric(18,4) GENERATED ALWAYS AS (opening_credit + period_credit) STORED,

    -- Concurrency
    version          integer      NOT NULL DEFAULT 1,
    last_je_id       uuid,
    last_posted_at   timestamptz,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT gl_balance_pkey PRIMARY KEY (id),
    CONSTRAINT gl_balance_opening_nonneg_chk CHECK (
        opening_debit >= 0 AND opening_credit >= 0
    ),
    CONSTRAINT gl_balance_period_nonneg_chk CHECK (
        period_debit >= 0 AND period_credit >= 0
    ),
    CONSTRAINT gl_balance_version_chk CHECK (version >= 1),
    CONSTRAINT gl_balance_period_range_chk CHECK (period_number BETWEEN 0 AND 16)
);

COMMENT ON TABLE ledger.gl_balance IS
    'Period-level GL balance store. UPSERT target for PostingService. '
    'closing = GENERATED (opening + period) — accounting identity enforced at schema level. '
    'Concurrent-safe via ON CONFLICT DO UPDATE SET period_debit += EXCLUDED.period_debit. '
    '3 first-class dimensions (CC, PC, project) + dimension_set for long tail.';


-- =============================================================================
-- §2  ledger.asset_revaluation_reserve — append-only revaluation/impairment ledger
-- =============================================================================
-- Immutable (insert-only). log.trg_prevent_mutation() blocks UPDATE/DELETE.
-- Rows are inserted as posted fact. Draft staging happens in
-- document.asset_transaction; only when that transaction is posted does
-- the reserve row get inserted. posted_at/posted_by set at insert time.

CREATE TABLE IF NOT EXISTS ledger.asset_revaluation_reserve (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Table-specific (asset + book linkage)
    asset_id                 uuid         NOT NULL,
    asset_book_id            uuid         NOT NULL,
    book_type                text         NOT NULL,

    -- Table-specific (reserve movement)
    reserve_type             text         NOT NULL,
    movement_amount          numeric(18,4) NOT NULL,
    balance_after            numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Table-specific (period context)
    effective_date           date         NOT NULL,
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,

    -- Table-specific (source)
    asset_transaction_id     uuid         NOT NULL,
    reference_je_id          uuid,

    -- Table-specific (valuation detail)
    carrying_amount          numeric(18,4) NOT NULL,
    fair_value               numeric(18,4),
    recoverable_amount       numeric(18,4),
    valuation_method         text,
    appraiser_ref            text,
    notes                    text,

    -- Audit (immutable — created_at/created_by + posted stamps only, no updated_at)
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    posted_at        timestamptz  NOT NULL DEFAULT now(),
    posted_by        uuid         NOT NULL,

    CONSTRAINT asset_reval_reserve_pkey PRIMARY KEY (id),
    CONSTRAINT asset_reval_reserve_tenant_id_uq UNIQUE (tenant_id, id)
);

COMMENT ON TABLE ledger.asset_revaluation_reserve IS
    'APPEND-ONLY ledger entries tracking revaluation surplus and impairment '
    'reserves per asset per book. Immutability enforced by log.trg_prevent_mutation(). '
    'No draft semantics — rows are inserted as posted fact.';


-- ============================================================================
-- TAX + FX ENGINE — Ledger schema tables
-- ============================================================================

-- ── ledger.tax_calculation ───────────────────────────────────────────────────
-- Per-line tax results. Append-only — no UPDATE, no DELETE.
-- No status column: rows born immutable at posting time.
-- Reversals: new row with negative amounts + reverses_calculation_id FK to original.
-- FK to tax_rate_schedule uses tenant-composite for consistent isolation.
CREATE TABLE IF NOT EXISTS ledger.tax_calculation (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,

    -- Table-specific
    company_code_id             uuid            NOT NULL,
    book_id                     uuid            NOT NULL,
    fiscal_period_id            uuid,
    doc_type                    text            NOT NULL,
    doc_id                      uuid            NOT NULL,
    doc_line_id                 uuid,
    doc_line_index              smallint,
    jurisdiction_id             uuid            NOT NULL,
    tax_type_id                 uuid            NOT NULL,
    component_code              text,
    tax_group_id                uuid,
    tax_rate_schedule_id        uuid,
    base_amount                 numeric(18,4)   NOT NULL,
    rate_kind                   text            NOT NULL DEFAULT 'PERCENT',
    rate_value                  numeric(18,6)   NOT NULL,
    calculation_basis           text            NOT NULL DEFAULT 'LINE_NET',
    tax_amount                  numeric(18,4)   NOT NULL,
    rounding_adjustment         numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code               character(3)    NOT NULL,
    base_currency_amount        numeric(18,4),
    exchange_rate               numeric(18,10),
    tax_direction               text            NOT NULL,
    tax_treatment               text            NOT NULL DEFAULT 'STANDARD',
    recoverability_mode         text            NOT NULL DEFAULT 'NONE',
    credit_recovery_pct         numeric(5,2),
    reverse_charge_mode         text            NOT NULL DEFAULT 'NONE',
    is_wht                      boolean         NOT NULL DEFAULT false,
    wht_basis                   text,
    wht_certificate_no          text,
    wht_base_amount             numeric(18,4),
    reference_je_id             uuid,
    reference_je_line_id        uuid,
    idempotency_key             text,
    -- Reversal linkage (append-only — original row never modified)
    reverses_calculation_id     uuid,
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint        NOT NULL,

    -- Audit (immutable — no updated_at)
    posted_at                   timestamptz     NOT NULL DEFAULT now(),
    posted_by                   uuid            NOT NULL,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,

    CONSTRAINT tc_pkey              PRIMARY KEY (id),
    CONSTRAINT tc_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT tc_direction_chk     CHECK (tax_direction IN (
        'PURCHASE','SALE','PAYMENT','IMPORT','EXPORT')),
    CONSTRAINT tc_treatment_chk     CHECK (tax_treatment IN (
        'STANDARD','EXEMPT','ZERO_RATED','REVERSE_CHARGE','WITHHOLDING','NON_TAXABLE')),
    CONSTRAINT tc_rate_kind_chk     CHECK (rate_kind IN ('PERCENT','FIXED','PER_UNIT')),
    CONSTRAINT tc_recover_chk       CHECK (recoverability_mode IN ('FULL','PARTIAL','NONE','CONDITIONAL')),
    CONSTRAINT tc_reverse_chk       CHECK (reverse_charge_mode IN ('NONE','SELF_ASSESS','FULL')),
    CONSTRAINT tc_base_nonneg       CHECK (base_amount >= 0)
);
COMMENT ON TABLE ledger.tax_calculation IS
    'Per-line tax results. Fully append-only — no UPDATE, no DELETE. '
    'No status column: rows born immutable at posting time. '
    'Reversals: new row with negative amounts + reverses_calculation_id FK to original. '
    'FK to tax_rate_schedule uses tenant-composite (tenant_id, tax_rate_schedule_id).';


-- ── ledger.tax_credit_movement ───────────────────────────────────────────────
-- Append-only movement ledger. Each posting, reversal, amendment, carry-forward
-- is a separate immutable row. aggregate.tax_credit_summary materializes period snapshot.
CREATE TABLE IF NOT EXISTS ledger.tax_credit_movement (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,

    -- Table-specific
    company_code_id             uuid            NOT NULL,
    book_id                     uuid            NOT NULL,
    jurisdiction_id             uuid            NOT NULL,
    tax_type_id                 uuid            NOT NULL,
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint        NOT NULL,
    movement_type               text            NOT NULL,
    -- Amounts (positive = credit/receivable, negative = debit/payable)
    input_amount                numeric(18,4)   NOT NULL DEFAULT 0,
    output_amount               numeric(18,4)   NOT NULL DEFAULT 0,
    wht_deducted_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    wht_suffered_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    -- Source references
    source_tax_calculation_id   uuid,
    source_movement_id          uuid,
    currency_code               character(3)    NOT NULL,
    reason                      text,
    reference                   text,

    -- Audit (immutable — created_at/created_by only)
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,

    CONSTRAINT tcm_pkey             PRIMARY KEY (id),
    CONSTRAINT tcm_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT tcm_type_chk         CHECK (movement_type IN (
        'POSTING','REVERSAL','AMENDMENT','CARRY_FORWARD','ADJUSTMENT')),
    CONSTRAINT tcm_period_chk       CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT tcm_reversal_ref     CHECK (
        movement_type NOT IN ('REVERSAL','AMENDMENT') OR source_movement_id IS NOT NULL)
);
COMMENT ON TABLE ledger.tax_credit_movement IS
    'Append-only movement entries. Each posting, reversal, amendment, '
    'carry-forward is a separate immutable row. '
    'aggregate.tax_credit_summary materializes the period snapshot from movements.';


-- ── ledger.fx_revaluation_line ───────────────────────────────────────────────
-- Immutable lines created during an FX revaluation run.
-- Corrections require a new revaluation run (which auto-reverses the previous).
CREATE TABLE IF NOT EXISTS ledger.fx_revaluation_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    run_id                  uuid            NOT NULL,
    line_no                 smallint        NOT NULL,
    gl_account_id           uuid            NOT NULL,
    currency_code           character(3)    NOT NULL,
    balance_type            text            NOT NULL,
    -- Source identity for audit trail
    source_entity_type      text,
    source_entity_id        uuid,
    source_doc_id           uuid,
    counterparty_type       text,
    counterparty_id         uuid,
    original_balance        numeric(18,4)   NOT NULL,
    original_functional     numeric(18,4)   NOT NULL,
    original_rate           numeric(18,10)  NOT NULL,
    closing_rate            numeric(18,10)  NOT NULL,
    revalued_functional     numeric(18,4)   NOT NULL,
    unrealized_gain_loss    numeric(18,4)   NOT NULL,
    cost_center_id          uuid,
    profit_center_id        uuid,
    dimension_set_id        uuid,

    -- Audit (immutable)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT fxrl_pkey                PRIMARY KEY (id),
    CONSTRAINT fxrl_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT fxrl_run_line_uq         UNIQUE (run_id, line_no),
    CONSTRAINT fxrl_balance_type_chk    CHECK (balance_type IN (
        'AR','AP','BANK','INTERCOMPANY','LOAN','OTHER')),
    CONSTRAINT fxrl_source_type_chk     CHECK (source_entity_type IS NULL
        OR source_entity_type IN (
            'OPEN_AP_ITEM','OPEN_AR_ITEM','BANK_BALANCE','IC_LOAN','GL_MONETARY_BALANCE')),
    CONSTRAINT fxrl_counterparty_chk    CHECK (counterparty_type IS NULL
        OR counterparty_type IN ('SUPPLIER','CUSTOMER','INTERCOMPANY','BANK')),
    CONSTRAINT fxrl_line_no_chk         CHECK (line_no > 0),
    CONSTRAINT fxrl_rate_positive       CHECK (original_rate > 0 AND closing_rate > 0)
);
COMMENT ON TABLE ledger.fx_revaluation_line IS
    'Immutable revaluation line per open item/balance. Created during the run; '
    'never modified. source_entity_type/id enables full audit trail and replay. '
    'Corrections: create a new run — auto-reversal handles the prior run.';


-- ── ledger.consolidation_elimination ─────────────────────────────────────────
-- IC elimination entries. source/dest company via UUID FKs (authoritative).
-- Text entity codes kept as denormalized display cache only.
CREATE TABLE IF NOT EXISTS ledger.consolidation_elimination (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    company_code_id         uuid            NOT NULL,
    book_id                 uuid            NOT NULL,
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    elimination_type        text            NOT NULL,
    -- UUID FK references (authoritative)
    source_company_code_id  uuid            NOT NULL,
    dest_company_code_id    uuid            NOT NULL,
    amount                  numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,
    reference_je_id         uuid,
    status                  text            NOT NULL DEFAULT 'calculated',
    posted_at               timestamptz,
    posted_by               uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ce_pkey              PRIMARY KEY (id),
    CONSTRAINT ce_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ce_type_chk          CHECK (elimination_type IN (
        'IC_REVENUE_EXPENSE','IC_RECEIVABLE_PAYABLE','IC_PROFIT',
        'MINORITY_INTEREST','INVESTMENT')),
    CONSTRAINT ce_status_chk        CHECK (status IN ('calculated','posted','reviewed')),
    CONSTRAINT ce_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT ce_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id)
);
COMMENT ON TABLE ledger.consolidation_elimination IS
    'IC elimination entries. source/dest as UUID FKs to company_code (authoritative). '
    'Text entity codes kept as denormalized display cache. '
    'ce_entity_chk ensures source != dest via UUID comparison.';


-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Ledger tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §BL1  ledger.commitment_schedule — periodic payment / milestone schedule
-- ============================================================================
-- Payment plan or milestone schedule for a commitment. Each row = one
-- scheduled payment date + amount. Tracks planned vs actual timing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.commitment_schedule (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent commitment
    commitment_id           uuid            NOT NULL,

    -- Line sequencing
    schedule_no             smallint        NOT NULL,

    -- Schedule type
    schedule_type           text            NOT NULL DEFAULT 'PERIODIC',
    milestone_name          text,

    -- Dates
    due_date                date            NOT NULL,
    expected_date           date,
    actual_date             date,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    scheduled_amount        numeric(18,4)   NOT NULL,
    fulfilled_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_amount        numeric(18,4)   GENERATED ALWAYS AS (
                                scheduled_amount - fulfilled_amount
                            ) STORED,
    base_amount             numeric(18,4),
    exchange_rate           numeric(18,10),

    -- Budget linkage (narrows to allocation for period-level reservation)
    budget_allocation_id    uuid,

    -- Fiscal period
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Retention tracking
    is_retention            boolean         NOT NULL DEFAULT false,
    retention_release_date  date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'pending',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('pending','partially_fulfilled')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cs_pkey                  PRIMARY KEY (id),
    CONSTRAINT cs_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT cs_commitment_seq_uq     UNIQUE (commitment_id, schedule_no),
    CONSTRAINT cs_status_chk            CHECK (status IN (
        'pending','partially_fulfilled','fulfilled','skipped','cancelled')),
    CONSTRAINT cs_type_chk              CHECK (schedule_type IN (
        'PERIODIC','MILESTONE','ADVANCE','RETENTION','FINAL','IRREGULAR')),
    CONSTRAINT cs_amount_nonneg         CHECK (scheduled_amount >= 0),
    CONSTRAINT cs_fulfilled_nonneg      CHECK (fulfilled_amount >= 0),
    CONSTRAINT cs_fulfilled_lte_sched   CHECK (fulfilled_amount <= scheduled_amount),
    CONSTRAINT cs_period_chk            CHECK (period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE ledger.commitment_schedule IS
    'Payment plan / milestone schedule for a commitment. Each row = one scheduled '
    'installment or milestone. remaining_amount = GENERATED (scheduled - fulfilled). '
    'is_retention marks retention-clause rows for deferred release. '
    'budget_allocation_id enables period-level budget reservation at schedule grain.';


-- ============================================================================
-- §BL2  ledger.commitment_fulfillment — consumption / drawdown against commitment
-- ============================================================================
-- Records actual fulfillment events: goods received, services accepted, payment.
-- Immutable (append-only). Reversals: new row with is_reversal = true.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.commitment_fulfillment (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent commitment and optional schedule line
    commitment_id           uuid            NOT NULL,
    schedule_id             uuid,

    -- Fulfillment event
    fulfillment_type        text            NOT NULL,
    reference_doc_type      text,
    reference_doc_id        uuid,
    reference_line_id       uuid,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    amount                  numeric(18,4)   NOT NULL,
    base_amount             numeric(18,4),
    exchange_rate           numeric(18,10),

    -- Fiscal period
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    fulfillment_date        date            NOT NULL,

    -- Flags
    is_partial              boolean         NOT NULL DEFAULT false,
    is_reversal             boolean         NOT NULL DEFAULT false,
    reverses_id             uuid,

    -- Notes
    notes                   text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (immutable — no updated_at)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT cf_pkey                  PRIMARY KEY (id),
    CONSTRAINT cf_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT cf_type_chk              CHECK (fulfillment_type IN (
        'GRN','SERVICE_RECEIPT','PAYMENT','MILESTONE_COMPLETE','PARTIAL_DELIVERY',
        'INVOICE_MATCH','ADVANCE_RECOVERY','RETENTION_RELEASE')),
    CONSTRAINT cf_amount_nonneg         CHECK (amount >= 0),
    CONSTRAINT cf_period_chk            CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT cf_no_self_reversal      CHECK (reverses_id IS DISTINCT FROM id),
    CONSTRAINT cf_reversal_ref_chk      CHECK (
        NOT is_reversal OR reverses_id IS NOT NULL)
);

COMMENT ON TABLE ledger.commitment_fulfillment IS
    'APPEND-ONLY fulfillment events against a commitment. Each row = goods receipt, '
    'service acceptance, payment, or milestone completion. '
    'Reversals: new row with is_reversal = true + reverses_id → original row. '
    'No UPDATE, no DELETE — enforced by log.trg_prevent_mutation().';


-- ============================================================================
-- §BL3  ledger.budget_transaction — budget reservation & release ledger
-- ============================================================================
-- Immutable movement ledger for all budget actions. Append-only.
-- Every RESERVE/COMMIT/CONSUME/RELEASE/TRANSFER/ADJUSTMENT creates one row.
-- Idempotency key prevents duplicate processing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.budget_transaction (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Target allocation
    budget_allocation_id    uuid            NOT NULL,

    -- Movement
    txn_type                text            NOT NULL,
    direction               text            NOT NULL,     -- DEBIT = reduces available; CREDIT = restores
    amount                  numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Period context
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    effective_date          date            NOT NULL DEFAULT CURRENT_DATE,

    -- Source document
    source_doc_type         text,
    source_doc_id           uuid,
    commitment_id           uuid,

    -- State snapshots (allocation amounts before/after)
    previous_state          jsonb           NOT NULL,
    resulting_state         jsonb           NOT NULL,

    -- Idempotency + expiry
    idempotency_key         text,
    expires_at              timestamptz,

    -- Audit context
    reason                  text,
    performed_by            uuid            NOT NULL,
    performed_at            timestamptz     NOT NULL DEFAULT now(),

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (immutable — no updated_at)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT btr_pkey                 PRIMARY KEY (id),
    CONSTRAINT btr_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT btr_idempotency_uq       UNIQUE (idempotency_key),
    CONSTRAINT btr_type_chk             CHECK (txn_type IN (
        'RESERVE','COMMIT','CONSUME','RELEASE',
        'TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','CARRY_FORWARD','LAPSE')),
    CONSTRAINT btr_direction_chk        CHECK (direction IN ('DEBIT','CREDIT')),
    CONSTRAINT btr_amount_pos           CHECK (amount > 0),
    CONSTRAINT btr_period_chk           CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT btr_state_obj_chk        CHECK (
        jsonb_typeof(previous_state) = 'object'
        AND jsonb_typeof(resulting_state) = 'object')
);

COMMENT ON TABLE ledger.budget_transaction IS
    'IMMUTABLE (append-only) movement ledger for all budget lifecycle events. '
    'txn_type: RESERVE → COMMIT → CONSUME → RELEASE; TRANSFER_IN/OUT; ADJUSTMENT; CARRY_FORWARD; LAPSE. '
    'direction: DEBIT = reduces available balance; CREDIT = restores available balance. '
    'previous_state / resulting_state capture allocation amounts before and after. '
    'idempotency_key prevents duplicate processing.';


-- ============================================================================
-- §BL4  ledger.budget_transfer — inter-allocation transfer
-- ============================================================================
-- Formalises movement of budget authority between allocations.
-- Creates paired budget_transaction rows (TRANSFER_OUT + TRANSFER_IN).
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.budget_transfer (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parties
    from_allocation_id      uuid            NOT NULL,
    to_allocation_id        uuid            NOT NULL,

    -- Transfer details
    amount                  numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,
    fiscal_year             smallint        NOT NULL,
    transfer_date           date            NOT NULL,
    reason                  text            NOT NULL,
    notes                   text,

    -- Paired transaction references (set on approval/completion)
    from_txn_id             uuid,
    to_txn_id               uuid,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'pending',
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT btx_pkey                 PRIMARY KEY (id),
    CONSTRAINT btx_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT btx_status_chk           CHECK (status IN (
        'pending','approved','rejected','completed','reversed')),
    CONSTRAINT btx_amount_pos           CHECK (amount > 0),
    CONSTRAINT btx_no_self_transfer     CHECK (from_allocation_id IS DISTINCT FROM to_allocation_id),
    CONSTRAINT btx_reason_nonempty      CHECK (btrim(reason) <> ''),
    CONSTRAINT btx_approval_consistent  CHECK (
        (status IN ('pending','rejected') AND approved_at IS NULL AND approved_by IS NULL)
        OR (status NOT IN ('pending','rejected') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    )
);

COMMENT ON TABLE ledger.budget_transfer IS
    'Formalised inter-allocation budget transfer. Approved transfers create paired '
    'ledger.budget_transaction rows: TRANSFER_OUT from source + TRANSFER_IN to dest. '
    'Status lifecycle: pending → approved → completed | rejected | reversed.';


-- ============================================================================
-- §BL5  ledger.budget_balance — period-level budget balance store (UPSERT)
-- ============================================================================
-- Materialised period snapshot. UPSERT target for budget service.
-- One row per (allocation, fiscal_year, period_number). Tracks opening/movement/closing.
-- version for optimistic concurrency. closing_amount is GENERATED.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.budget_balance (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Source allocation
    budget_allocation_id    uuid            NOT NULL,

    -- Period key
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Balance buckets
    opening_amount          numeric(18,4)   NOT NULL DEFAULT 0,
    reserved_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    consumed_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    adjusted_amount         numeric(18,4)   NOT NULL DEFAULT 0,

    -- closing = opening - reserved - consumed + released + adjusted
    closing_amount          numeric(18,4)   GENERATED ALWAYS AS (
                                opening_amount
                                - reserved_amount
                                - consumed_amount
                                + released_amount
                                + adjusted_amount
                            ) STORED,

    -- Concurrency
    version                 integer         NOT NULL DEFAULT 1,
    last_txn_id             uuid,
    last_updated_at         timestamptz,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bb_pkey                      PRIMARY KEY (id),
    CONSTRAINT bb_tenant_id_uq              UNIQUE (tenant_id, id),
    CONSTRAINT bb_allocation_period_uq      UNIQUE (budget_allocation_id, fiscal_year, period_number),
    CONSTRAINT bb_period_chk                CHECK (period_number BETWEEN 0 AND 16),
    CONSTRAINT bb_version_chk               CHECK (version >= 1),
    CONSTRAINT bb_opening_nonneg            CHECK (opening_amount >= 0),
    CONSTRAINT bb_reserved_nonneg           CHECK (reserved_amount >= 0),
    CONSTRAINT bb_consumed_nonneg           CHECK (consumed_amount >= 0),
    CONSTRAINT bb_released_nonneg           CHECK (released_amount >= 0)
);

COMMENT ON TABLE ledger.budget_balance IS
    'Period-level budget balance store. UPSERT target for budget lifecycle service. '
    'closing_amount = GENERATED (opening - reserved - consumed + released + adjusted). '
    'period_number 0 = annual / YTD summary row. '
    'Concurrent-safe via ON CONFLICT DO UPDATE with version increment. '
    'One row per (allocation, fiscal_year, period_number).';


-- ============================================================================
-- §BL6  ledger.planning_output — model-generated period output rows
-- ============================================================================
-- UPSERT target for planning calculation engine. One row per
-- (model, fiscal_year, period_number, gl_account, dimension_set).
-- Partial unique index (see below) handles nullable dimension columns.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.planning_output (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Source model + formula
    planning_model_id       uuid            NOT NULL,
    formula_id              uuid,

    -- Account
    gl_account_id           uuid,

    -- Period
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Amounts
    planned_amount          numeric(18,4)   NOT NULL DEFAULT 0,
    prior_year_amount       numeric(18,4),
    variance_amount         numeric(18,4)   GENERATED ALWAYS AS (
                                planned_amount - COALESCE(prior_year_amount, 0)
                            ) STORED,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    dimension_set_id        uuid,

    -- Driver inputs used (snapshot)
    driver_values           jsonb,

    -- Approval
    is_approved             boolean         NOT NULL DEFAULT false,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Concurrency
    version                 integer         NOT NULL DEFAULT 1,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT po_pkey                  PRIMARY KEY (id),
    CONSTRAINT po_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT po_period_chk            CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT po_version_chk           CHECK (version >= 1)
);

-- Partial unique index for planning_output — handles nullable dimension columns.
CREATE UNIQUE INDEX IF NOT EXISTS ux_po_model_period_dim ON ledger.planning_output (
    planning_model_id,
    fiscal_year,
    period_number,
    COALESCE(gl_account_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cost_center_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(profit_center_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id,         '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(dimension_set_id,   '00000000-0000-0000-0000-000000000000'::uuid)
);

COMMENT ON TABLE ledger.planning_output IS
    'UPSERT target for planning calculation engine. One row per '
    '(model, year, period, account, dimension combination). '
    'variance_amount = GENERATED (planned - prior_year). '
    'Unique constraint via ux_po_model_period_dim partial index (handles NULLs). '
    'driver_values JSON snapshot enables audit/replay of calculation inputs.';


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Ledger tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §INV1  ledger.inventory_balance
-- Real-time on-hand quantity and value per item/warehouse/lot/serial position.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.inventory_balance (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Company scope
    company_code_id     uuid            NOT NULL,

    -- Position key
    item_id             uuid            NOT NULL,
    warehouse_id        uuid            NOT NULL,
    lot_number          text,
    serial_number       text,

    -- Stock position
    quantity_on_hand    numeric(18,4)   NOT NULL DEFAULT 0,
    unit_cost           numeric(18,4)   NOT NULL DEFAULT 0,
    total_value         numeric(18,4)   GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    currency_code       character(3)    NOT NULL,

    -- Movement linkage (last event that changed this position)
    last_movement_at    timestamptz,
    last_movement_id    uuid,

    -- Concurrency
    version             integer         NOT NULL DEFAULT 1,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ib_pkey          PRIMARY KEY (id),
    CONSTRAINT ib_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT ib_unit_cost_chk CHECK (unit_cost >= 0),
    CONSTRAINT ib_version_chk   CHECK (version >= 1),
    CONSTRAINT ib_currency_chk  CHECK (btrim(currency_code::text) <> '')
);

COMMENT ON TABLE ledger.inventory_balance IS
    'Real-time on-hand quantity and value per item/warehouse/lot/serial position. '
    'Mutable — updated by movement PostingService. Optimistic-locked via version column. '
    'Negative quantity_on_hand permitted when warehouse.is_negative_stock_allowed = true; '
    'no hard non-negative CHECK here. Natural key uniqueness enforced by four partial '
    'unique indexes (see 07_indexes/005_ledger.sql).';


-- ============================================================================
-- §INV2  ledger.inventory_movement
-- Single source of truth for all inventory quantity changes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.inventory_movement (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Company scope
    company_code_id     uuid            NOT NULL,

    -- Position key
    item_id             uuid            NOT NULL,
    warehouse_id        uuid            NOT NULL,

    -- Movement classification (inline CHECK — see §6.9 of spec)
    movement_type       text            NOT NULL,

    -- Quantity & cost (signed — positive = IN, negative = OUT)
    quantity            numeric(18,4)   NOT NULL,
    unit_cost           numeric(18,4)   NOT NULL DEFAULT 0,
    total_value         numeric(18,4)   GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    currency_code       character(3)    NOT NULL,

    -- Lot / serial
    lot_number          text,
    serial_number       text,

    -- Source document linkage
    ref_doc_type        text,
    ref_doc_id          uuid,

    -- Transfer linkage (both required for TRANSFER_OUT / TRANSFER_IN)
    source_warehouse_id uuid,
    dest_warehouse_id   uuid,

    -- Reversal chain (required when movement_type = 'REVERSAL')
    reversal_of_id      uuid,

    -- Execution metadata
    performed_at        timestamptz     NOT NULL DEFAULT now(),
    performed_by        uuid            NOT NULL,
    notes               text,

    -- GL posting fields — NULL at INSERT; enriched once within same posting txn
    reference_je_id     uuid,
    posted_at           timestamptz,
    posted_by           uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (insert-only — no updated_at/updated_by)
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,

    CONSTRAINT im_pkey                  PRIMARY KEY (id),
    CONSTRAINT im_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT im_movement_type_chk     CHECK (movement_type IN (
                                            'RECEIPT',
                                            'ISSUE_SALES',
                                            'ISSUE_PRODUCTION',
                                            'TRANSFER_OUT',
                                            'TRANSFER_IN',
                                            'ADJUSTMENT',
                                            'SCRAP',
                                            'RETURN',
                                            'OPENING_BALANCE',
                                            'REVERSAL'
                                        )),
    CONSTRAINT im_unit_cost_chk         CHECK (unit_cost >= 0),
    CONSTRAINT im_currency_chk          CHECK (btrim(currency_code::text) <> ''),
    CONSTRAINT im_reversal_ref_chk      CHECK (movement_type <> 'REVERSAL' OR reversal_of_id IS NOT NULL),
    CONSTRAINT im_no_self_reversal      CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT im_transfer_wh_chk       CHECK (
                                            movement_type NOT IN ('TRANSFER_OUT', 'TRANSFER_IN')
                                            OR (source_warehouse_id IS NOT NULL AND dest_warehouse_id IS NOT NULL)
                                        ),
    CONSTRAINT im_posting_pair_chk      CHECK (
                                            (posted_at IS NULL) = (posted_by IS NULL)
                                        )
);

COMMENT ON TABLE ledger.inventory_movement IS
    'Single source of truth for all inventory quantity changes. '
    'Effectively immutable: core business columns sealed at INSERT. '
    'Posting fields (reference_je_id, posted_at, posted_by) enriched once '
    'within the same posting transaction. Corrections via REVERSAL rows only. '
    'Signed quantity: positive = IN, negative = OUT.';


-- ============================================================================
-- §INV3  ledger.inventory_valuation_layer
-- Cost layers for FIFO / weighted-average / standard-cost / specific-id.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.inventory_valuation_layer (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Position key
    item_id                 uuid            NOT NULL,
    warehouse_id            uuid            NOT NULL,

    -- Layer metadata
    layer_date              date            NOT NULL,
    receipt_movement_id     uuid            NOT NULL,

    -- Layer quantities
    original_qty            numeric(18,4)   NOT NULL,
    remaining_qty           numeric(18,4)   NOT NULL,

    -- Cost
    unit_cost               numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Consumption flag
    is_consumed             boolean         NOT NULL DEFAULT false,

    -- Lot / serial (mirrors receipt movement for layer lookup efficiency)
    lot_number              text,
    serial_number           text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ivl_pkey               PRIMARY KEY (id),
    CONSTRAINT ivl_tenant_id_uq       UNIQUE (tenant_id, id),
    CONSTRAINT ivl_currency_chk       CHECK (btrim(currency_code::text) <> ''),
    CONSTRAINT ivl_original_qty_pos   CHECK (original_qty > 0),
    CONSTRAINT ivl_remaining_nonneg   CHECK (remaining_qty >= 0),
    CONSTRAINT ivl_remaining_lte_orig CHECK (remaining_qty <= original_qty),
    CONSTRAINT ivl_unit_cost_nonneg   CHECK (unit_cost >= 0),
    CONSTRAINT ivl_consumed_sync_chk  CHECK (is_consumed = (remaining_qty = 0))
);

COMMENT ON TABLE ledger.inventory_valuation_layer IS
    'Cost layers for FIFO/weighted-average/standard-cost/specific-identification costing. '
    'One row per stock receipt. remaining_qty decrements as issue movements consume the layer. '
    'FIFO scan uses partial index on (is_consumed = false) ordered by layer_date ASC. '
    'Mutable (remaining_qty / is_consumed updated by PostingService on issue).';


-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — Ledger tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §IC1  ledger.ic_elimination_line — immutable debit/credit lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger.ic_elimination_line (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    elimination_id              uuid            NOT NULL,
    company_code_id             uuid            NOT NULL,
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint        NOT NULL,
    line_no                     smallint        NOT NULL,
    gl_account_id               uuid            NOT NULL,
    debit_amount                numeric(18,4)   NOT NULL DEFAULT 0,
    credit_amount               numeric(18,4)   NOT NULL DEFAULT 0,
    functional_debit            numeric(18,4)   NOT NULL DEFAULT 0,
    functional_credit           numeric(18,4)   NOT NULL DEFAULT 0,
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    site_id                     uuid,
    dimension_set_id            uuid,
    description                 text,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,

    CONSTRAINT icel_pkey             PRIMARY KEY (id),
    CONSTRAINT icel_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT icel_elim_line_uq     UNIQUE (elimination_id, line_no),
    CONSTRAINT icel_polarity_chk     CHECK (
        (debit_amount > 0 AND credit_amount = 0)
        OR (debit_amount = 0 AND credit_amount > 0)
    ),
    CONSTRAINT icel_nonneg_chk       CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CONSTRAINT icel_func_polarity_chk CHECK (
        (debit_amount > 0 AND functional_debit > 0)
        OR (credit_amount > 0 AND functional_credit > 0)
    ),
    CONSTRAINT icel_func_nonneg_chk  CHECK (functional_debit >= 0 AND functional_credit >= 0),
    CONSTRAINT icel_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT icel_period_chk       CHECK (period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE ledger.ic_elimination_line IS
    'Immutable debit/credit child lines of document.ic_elimination. '
    'Strict polarity: exactly one side > 0 (mirrors journal_line). '
    'Append-only: no updated_at/updated_by. Corrections via header reversal.';


-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — ENHANCE ledger.consolidation_elimination
-- ══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS ic_elimination_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS consolidation_group text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS functional_currency_code character(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,10); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS functional_amount numeric(18,4); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS line_count smallint NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS decision_score numeric(5,4); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS approval_route text NOT NULL DEFAULT 'STANDARD'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS reversal_je_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS approved_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS approved_by uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
