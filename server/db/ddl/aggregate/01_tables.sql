-- ============================================================================
-- aggregate/01_tables.sql
-- Concept: Materialized Aggregates — pre-computed roll-up tables
-- Depends on: 04_tables/005_ledger.sql
-- Aggregate schema tables: pre-computed summaries materialized from ledger movements.
-- ============================================================================

-- ── aggregate.tax_credit_summary ─────────────────────────────────────────────
-- Period-level tax position snapshot materialized from ledger.tax_credit_movement.
-- Rebuildable: last_rebuilt_at tracks freshness.
-- Filing lifecycle: draft → posted → filed → closed.
CREATE TABLE IF NOT EXISTS aggregate.tax_credit_summary (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    company_code_id     uuid            NOT NULL,
    jurisdiction_id     uuid            NOT NULL,
    tax_type_id         uuid            NOT NULL,
    book_id             uuid            NOT NULL,
    fiscal_year         smallint        NOT NULL,
    period_number       smallint        NOT NULL,
    -- Aggregated balances (computed from movements)
    input_credits       numeric(18,4)   NOT NULL DEFAULT 0,
    output_liability    numeric(18,4)   NOT NULL DEFAULT 0,
    net_position        numeric(18,4)   GENERATED ALWAYS AS (input_credits - output_liability) STORED,
    wht_deducted        numeric(18,4)   NOT NULL DEFAULT 0,
    wht_suffered        numeric(18,4)   NOT NULL DEFAULT 0,
    adjustment_total    numeric(18,4)   NOT NULL DEFAULT 0,
    carry_forward_in    numeric(18,4)   NOT NULL DEFAULT 0,
    movement_count      integer         NOT NULL DEFAULT 0,
    currency_code       character(3)    NOT NULL,
    -- Filing lifecycle
    is_reconciled       boolean         NOT NULL DEFAULT false,
    reconciled_at       timestamptz,
    reconciled_by       uuid,
    filed_at            timestamptz,
    filing_reference    text,
    -- Rebuild tracking
    last_rebuilt_at     timestamptz     NOT NULL DEFAULT now(),
    version             integer         NOT NULL DEFAULT 1,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'draft',
    posted_at           timestamptz,
    posted_by           uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tcs_pkey             PRIMARY KEY (id),
    CONSTRAINT tcs_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT tcs_period_uq        UNIQUE (tenant_id, company_code_id, jurisdiction_id,
                                            tax_type_id, book_id, fiscal_year, period_number),
    CONSTRAINT tcs_status_chk       CHECK (status IN ('draft','posted','filed','closed')),
    CONSTRAINT tcs_input_nonneg     CHECK (input_credits >= 0),
    CONSTRAINT tcs_output_nonneg    CHECK (output_liability >= 0),
    CONSTRAINT tcs_wht_nonneg       CHECK (wht_deducted >= 0 AND wht_suffered >= 0),
    CONSTRAINT tcs_period_chk       CHECK (period_number BETWEEN 1 AND 16)
);
COMMENT ON TABLE aggregate.tax_credit_summary IS
    'ARCHETYPE=B;SCOPE=T;PENDING_ACTIVE_SET. Period-level tax position snapshot in aggregate schema. '
    'Materialized from ledger.tax_credit_movement — rebuildable at any time. '
    'last_rebuilt_at tracks freshness. carry_forward_in captures prior-period balance. '
    'Filing lifecycle: draft → posted → filed → closed. '
    'Finance owner to confirm active-set (likely status IN (''draft'',''posted'')) before is_active generated column is added.';


-- ============================================================================
-- aggregate.wht_supplier_accumulator — per-supplier YTD WHT accumulation
-- ============================================================================
-- Idempotency: drop old table name if it still exists (renamed from wht_vendor_accumulator)
DROP TABLE IF EXISTS aggregate.wht_vendor_accumulator CASCADE;
-- R7-B: tracks YTD payment totals per supplier per jurisdiction+tax_type per period.
-- Required for threshold-based WHT activation (India TDS section-wise,
-- Philippines EWT, etc.) where WHT only applies after cumulative payments
-- exceed the control.wht_threshold_config.threshold_amount.
-- Updated atomically when payments post; version column provides optimistic lock.
CREATE TABLE IF NOT EXISTS aggregate.wht_supplier_accumulator (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Accumulation key
    company_code_id     uuid        NOT NULL,
    counterparty_id     uuid        NOT NULL,   -- FK → master.principal (supplier principal)
    jurisdiction_id     uuid        NOT NULL,
    tax_type_id         uuid        NOT NULL,
    section_code        text,                   -- NULL = applies to all sections
    fiscal_year         smallint    NOT NULL,

    -- Accumulated totals (updated on each payment posting)
    ytd_payment_amount  numeric(18,4) NOT NULL DEFAULT 0,
    ytd_wht_amount      numeric(18,4) NOT NULL DEFAULT 0,

    -- Threshold tracking
    threshold_reached   boolean     NOT NULL DEFAULT false,
    threshold_reached_at timestamptz,

    -- Optimistic lock
    version             integer     NOT NULL DEFAULT 1,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT wva_pkey             PRIMARY KEY (id),
    CONSTRAINT wva_natural_uq       UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, counterparty_id,
        jurisdiction_id, tax_type_id, section_code, fiscal_year),
    CONSTRAINT wva_ytd_pay_nonneg   CHECK (ytd_payment_amount >= 0),
    CONSTRAINT wva_ytd_wht_nonneg   CHECK (ytd_wht_amount >= 0),
    CONSTRAINT wva_version_pos      CHECK (version > 0),
    CONSTRAINT wva_year_chk         CHECK (fiscal_year BETWEEN 2000 AND 2099)
);

COMMENT ON TABLE aggregate.wht_supplier_accumulator IS
    'ARCHETYPE=C;SCOPE=T. Pure accumulator — no status/lifecycle. '
    'R7-B: per-supplier per-fiscal-year WHT accumulator. '
    'Tracks YTD payments and WHT deducted to determine when threshold-based WHT activates '
    '(control.wht_threshold_config). Updated atomically on payment posting. '
    'version column provides optimistic concurrency lock for concurrent payment batches.';
