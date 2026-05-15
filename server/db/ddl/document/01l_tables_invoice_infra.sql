-- ============================================================================
-- document/01l_tables_invoice_infra.sql
-- Phase 0+1: Infrastructure tables for the AP invoice write engine
--   1. document.command_log          — idempotency log for AP write operations
--   2. control.match_tolerance_config — AP/AR match tolerance per entity/company
--   3. master.numbering_series        — per-company sequential number generator
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING
-- Load order: 01l (after 01e_tables_invoice.sql)
-- ============================================================================


-- ============================================================================
-- §CL  document.command_log — idempotency table for write operations
-- ============================================================================
-- Callers supply an Idempotency-Key header. The BFF relay stores the key in
-- the request body; the runtime handler inserts here BEFORE doing work.
-- ON CONFLICT DO NOTHING + re-fetch lets the caller safely retry.

CREATE TABLE IF NOT EXISTS document.command_log (
    -- Identity
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,

    -- Deduplicate key (tenant, operation, caller-supplied key)
    operation        text        NOT NULL,
    idempotency_key  text        NOT NULL,

    -- Result state
    status           text        NOT NULL DEFAULT 'processing',
    result           jsonb,
    error_code       text,
    error_message    text,

    -- Correlation
    principal_id     uuid,

    -- Audit
    created_at       timestamptz NOT NULL DEFAULT now(),
    completed_at     timestamptz,

    CONSTRAINT cmdl_pkey      PRIMARY KEY (id),
    CONSTRAINT cmdl_dedup_uq  UNIQUE (tenant_id, operation, idempotency_key),
    CONSTRAINT cmdl_status_chk CHECK (status IN ('processing', 'done', 'error'))
);

COMMENT ON TABLE document.command_log IS
    'ARCHETYPE=INFRA;SCOPE=T. Idempotency log for AP invoice write operations. '
    'Callers insert with ON CONFLICT DO NOTHING; retry-safe by re-fetching existing row. '
    'Rows older than 30 days can be purged by a maintenance cron.';

CREATE INDEX IF NOT EXISTS ix_cl_tenant_op
    ON document.command_log (tenant_id, operation, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_cl_cleanup
    ON document.command_log (created_at)
    WHERE status IN ('done', 'error');


-- ============================================================================
-- §MTC  control.match_tolerance_config — AP matching tolerances
-- ============================================================================
-- Defines how much variance is acceptable when matching invoice quantities/
-- amounts against PO commitment lines or goods receipts.
-- Tolerance types:
--   quantity_pct  — percentage over/under on quantity  (e.g. 3.00 = 3%)
--   price_pct     — percentage over/under on unit price (e.g. 2.00 = 2%)
--   amount_abs    — absolute monetary deviation         (e.g. 5.00 = $5)
-- Resolution priority: company-specific > tenant-wide > NULL (global default)

CREATE TABLE IF NOT EXISTS control.match_tolerance_config (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,                               -- NULL = global default
    company_code_id  uuid,                               -- NULL = all companies in tenant

    entity_name      text        NOT NULL DEFAULT 'purchase_invoice',
    match_type       text        NOT NULL,               -- 'three_way' | 'two_way' | 'no_match'
    tolerance_type   text        NOT NULL,               -- 'quantity_pct' | 'price_pct' | 'amount_abs'
    tolerance_value  numeric(10,4) NOT NULL,

    is_active        boolean     NOT NULL DEFAULT true,

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT mtc_pkey          PRIMARY KEY (id),
    CONSTRAINT mtc_match_chk     CHECK (match_type IN ('three_way','two_way','no_match','evaluated_receipt')),
    CONSTRAINT mtc_type_chk      CHECK (tolerance_type IN ('quantity_pct','price_pct','amount_abs')),
    CONSTRAINT mtc_value_pos_chk CHECK (tolerance_value >= 0),
    CONSTRAINT mtc_scope_chk     CHECK (
        company_code_id IS NULL OR tenant_id IS NOT NULL
    )
);

COMMENT ON TABLE control.match_tolerance_config IS
    'Per-company or tenant-wide AP matching tolerances. '
    'Resolution: company-specific > tenant-wide > global (tenant_id IS NULL). '
    'quantity_pct and price_pct are percentages (3.00 = 3%). amount_abs is absolute currency.';


-- ============================================================================
-- §NS  master.numbering_series — per-company sequential number generator
-- ============================================================================
-- Avoids race conditions in number generation by using SELECT FOR UPDATE.
-- Supports any document type (invoice, payment, PO, etc.) per company.
-- The application calls fn_next_document_number() which atomically increments
-- last_number and returns the formatted number string.

CREATE TABLE IF NOT EXISTS master.numbering_series (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,
    company_code_id  uuid        NOT NULL,

    document_type    text        NOT NULL,               -- 'purchase_invoice' | 'payment_entry' | 'journal_entry' | 'purchase_order'
    prefix           text        NOT NULL DEFAULT '',    -- e.g. 'PI', 'PAY', 'JE', 'PO'
    fiscal_year      smallint,                           -- NULL = rolling (not reset per year)
    last_number      integer     NOT NULL DEFAULT 0,
    padding          smallint    NOT NULL DEFAULT 5,     -- zero-pad width

    is_active        boolean     NOT NULL DEFAULT true,

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT ns_pkey      PRIMARY KEY (id),
    CONSTRAINT ns_scope_uq  UNIQUE (tenant_id, company_code_id, document_type, fiscal_year),
    CONSTRAINT ns_pad_chk   CHECK (padding BETWEEN 3 AND 10),
    CONSTRAINT ns_num_chk   CHECK (last_number >= 0)
);

COMMENT ON TABLE master.numbering_series IS
    'Per-company document number generator. fn_next_document_number() uses SELECT FOR UPDATE '
    'to atomically increment last_number and return the formatted string. '
    'fiscal_year=NULL means the series rolls over without annual reset.';

CREATE INDEX IF NOT EXISTS ix_ns_lookup
    ON master.numbering_series (tenant_id, company_code_id, document_type, fiscal_year)
    WHERE is_active = true;
