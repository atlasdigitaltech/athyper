-- 04_tables/010_aggregate.sql
-- Depends on: 01_schemas, 03_bootstrap_functions (shared.uuidv7)
-- Aggregate schema tables: pre-computed summaries materialized from ledger movements.

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
    'Period-level tax position snapshot in aggregate schema. '
    'Materialized from ledger.tax_credit_movement — rebuildable at any time. '
    'last_rebuilt_at tracks freshness. carry_forward_in captures prior-period balance. '
    'Filing lifecycle: draft → posted → filed → closed.';
