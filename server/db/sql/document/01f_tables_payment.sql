-- ============================================================================
-- document/01f_tables_payment.sql
-- Concept: Payments — payment entries, allocations, remittance outputs
-- Depends on: 04_tables/004d_document_invoice.sql
-- Scope: Payment document tables
-- Domain: payment_entry, payment_entry_allocation,
--         payment_remittance_output, payment_term_discount_result
-- Load order: 004e (after 004d_document_invoice.sql)
-- ============================================================================

-- ============================================================================
-- §11  document.payment_entry  (approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.payment_entry (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural key
    payment_number          text            NOT NULL,

    -- Classification
    payment_type            text            NOT NULL DEFAULT 'STANDARD',
    payment_direction       text            NOT NULL DEFAULT 'OUTBOUND',

    -- Counterparty
    supplier_id             uuid,
    supplier_name           text            NOT NULL,

    -- Payment method + bank
    payment_method_id       uuid            NOT NULL,
    bank_account_id         uuid,
    supplier_bank_link_id   uuid,

    -- Reference numbers
    payment_reference       text,
    bank_reference          text,
    check_number            text,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    value_date              date            NOT NULL DEFAULT CURRENT_DATE,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    payment_amount          numeric(18,4)   NOT NULL,
    base_amount             numeric(18,4),

    -- Payment currency (third leg when paying in a different currency)
    payment_currency_code   character(3),
    payment_exchange_rate   numeric(18,10),
    payment_currency_amount numeric(18,4),

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Posting
    payment_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    -- Reversal
    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,
    reversal_reason         text,

    -- Workflow
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Batch payment
    payment_run_id          uuid,
    is_batch_payment        boolean         NOT NULL DEFAULT false,

    -- Transmission
    is_printed              boolean         NOT NULL DEFAULT false,
    is_transmitted          boolean         NOT NULL DEFAULT false,
    transmission_status     text,

    -- Void
    is_voided               boolean         NOT NULL DEFAULT false,
    voided_at               timestamptz,
    voided_by               uuid,
    void_reason             text,

    -- Bank reconciliation
    cleared_date            date,

    -- Line count + notes
    line_count              smallint        NOT NULL DEFAULT 0,
    notes                   text,

    -- Tags & Metadata
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted',
                                           'transmitted','printed')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pe_pkey              PRIMARY KEY (id),
    CONSTRAINT pe_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pe_tenant_number_uq  UNIQUE (tenant_id, company_code_id, payment_number),
    CONSTRAINT pe_number_nonempty   CHECK (btrim(payment_number) <> ''),
    CONSTRAINT pe_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','transmitted',
        'printed','cleared','reversed','voided','cancelled','rejected')),
    CONSTRAINT pe_type_chk          CHECK (payment_type IN (
        'STANDARD','ADVANCE','RETENTION_RELEASE','PARTIAL','FINAL',
        'DOWN_PAYMENT','URGENT','NETTING')),
    CONSTRAINT pe_direction_chk     CHECK (payment_direction IN ('OUTBOUND','INBOUND')),
    CONSTRAINT pe_amount_pos        CHECK (payment_amount > 0),
    CONSTRAINT pe_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT pe_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT pe_void_chk          CHECK (NOT is_voided OR voided_at IS NOT NULL),
    CONSTRAINT pe_posting_pair_chk  CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.payment_entry IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''posted'',''transmitted'',''printed'')). Approvable AP payment. Accounting driven by control.payment_settlement_rule posting roles. '
    'Settlement posting: Dr AP Trade Payable → Cr Bank + optional Cr Discount Income + Dr/Cr FX.';


-- ============================================================================
-- §11.1  document.payment_entry_allocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.payment_entry_allocation (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent payment
    payment_entry_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Allocated document
    purchase_invoice_id     uuid,
    commitment_id           uuid,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    allocated_amount        numeric(18,4)   NOT NULL,
    discount_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    advance_recovery_amount numeric(18,4)   NOT NULL DEFAULT 0,
    retention_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    net_payment_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                allocated_amount - discount_amount - withholding_tax_amount
                                - advance_recovery_amount - retention_amount
                            ) STORED,

    -- FX
    base_currency_code      character(3),
    exchange_rate           numeric(18,10),
    base_amount             numeric(18,4),
    fx_gain_loss            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Discount
    is_discount_taken       boolean         NOT NULL DEFAULT false,
    discount_due_date       date,
    payment_term_application_id uuid,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (append-only)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pea_pkey                     PRIMARY KEY (id),
    CONSTRAINT pea_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT pea_line_uq                  UNIQUE (payment_entry_id, line_no),
    CONSTRAINT pea_line_no_chk              CHECK (line_no > 0),
    CONSTRAINT pea_allocated_pos            CHECK (allocated_amount > 0),
    CONSTRAINT pea_invoice_or_cmt           CHECK (
        purchase_invoice_id IS NOT NULL OR commitment_id IS NOT NULL),
    CONSTRAINT pea_deductions_lte_allocated CHECK (
        discount_amount + withholding_tax_amount
        + advance_recovery_amount + retention_amount
        <= allocated_amount),
    CONSTRAINT pea_deductions_nonneg        CHECK (
        discount_amount >= 0
        AND withholding_tax_amount >= 0
        AND advance_recovery_amount >= 0
        AND retention_amount >= 0)
);

COMMENT ON TABLE document.payment_entry_allocation IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Invoice/commitment allocation lines for a payment. '
    'net_payment_amount GENERATED. Append-only — void and re-allocate to correct.';


-- ============================================================================
-- §11.2  document.payment_remittance_output
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.payment_remittance_output (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    company_code_id     uuid            NOT NULL,

    -- Natural key
    remittance_number   text            NOT NULL,

    -- Parent payment + supplier
    payment_entry_id    uuid            NOT NULL,
    supplier_id         uuid            NOT NULL,

    -- Amounts
    currency_code       character(3)    NOT NULL,
    total_amount        numeric(18,4)   NOT NULL,
    net_remitted        numeric(18,4)   NOT NULL,

    -- Delivery
    delivery_method     text            NOT NULL DEFAULT 'EMAIL',
    delivered_at        timestamptz,
    delivery_status     text            NOT NULL DEFAULT 'pending',

    -- Render output link
    render_output_id    uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status              text            NOT NULL DEFAULT 'draft',

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT pro_pkey             PRIMARY KEY (id),
    CONSTRAINT pro_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT pro_tenant_number_uq UNIQUE (tenant_id, company_code_id, remittance_number),
    CONSTRAINT pro_delivery_chk     CHECK (delivery_method IN (
        'EMAIL','PORTAL','EDI','FAX','PRINT','API')),
    CONSTRAINT pro_delivery_status_chk CHECK (delivery_status IN (
        'pending','sent','delivered','failed','bounced')),
    CONSTRAINT pro_status_chk       CHECK (status IN (
        'draft','generated','sent','delivered','failed','cancelled'))
);

COMMENT ON TABLE document.payment_remittance_output IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Remittance advice output record per payment. '
    'Links to document.render_output for PDF generation. Delivery status tracked separately.';


-- ============================================================================
-- §PT5  document.payment_term_discount_result — settlement-time discount
-- ============================================================================
-- Moved from 004a_document_payment_terms.sql. Belongs with payment domain.
-- Reversals use is_reversal + reverses_id (append-only).

CREATE TABLE IF NOT EXISTS document.payment_term_discount_result (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,

    -- Payment + invoice context
    payment_id                  uuid            NOT NULL,
    invoice_id                  uuid            NOT NULL,
    commitment_id               uuid,

    -- Term reference
    payment_term_id             uuid,
    discount_tier_id            uuid,

    -- Amounts
    allocated_payment_amount    numeric(18,4)   NOT NULL,
    qualification_date          date            NOT NULL,
    qualified_tier_no           smallint,
    qualified_days_actual       smallint        NOT NULL,
    discount_basis_amount       numeric(18,4)   NOT NULL,
    discount_pct                numeric(5,2),
    discount_amount             numeric(18,4)   NOT NULL,

    -- Result
    application_status          text            NOT NULL,
    is_reversal                 boolean         NOT NULL DEFAULT false,
    reverses_id                 uuid,

    -- Metadata
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (append-only)
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,

    CONSTRAINT ptdr_pkey                PRIMARY KEY (id),
    CONSTRAINT ptdr_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT ptdr_status_chk          CHECK (application_status IN (
        'QUALIFIED','NOT_QUALIFIED','PARTIAL','WAIVED','EXPIRED','REVERSED')),
    CONSTRAINT ptdr_basis_nonneg        CHECK (discount_basis_amount >= 0),
    CONSTRAINT ptdr_alloc_nonneg        CHECK (allocated_payment_amount >= 0),
    CONSTRAINT ptdr_discount_nonneg     CHECK (discount_amount >= 0),
    CONSTRAINT ptdr_days_nonneg         CHECK (qualified_days_actual >= 0),
    CONSTRAINT ptdr_pct_range           CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100),
    CONSTRAINT ptdr_no_self_reverse     CHECK (reverses_id IS DISTINCT FROM id),
    CONSTRAINT ptdr_reversal_ref_chk    CHECK (NOT is_reversal OR reverses_id IS NOT NULL),
    CONSTRAINT ptdr_nonpo_term_ref_chk  CHECK (
        commitment_id IS NOT NULL OR payment_term_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ptdr_payment_invoice_tier_uq
    ON document.payment_term_discount_result (
        payment_id, invoice_id, COALESCE(qualified_tier_no, 0)
    )
    WHERE is_reversal = false;

CREATE UNIQUE INDEX IF NOT EXISTS ptdr_single_reversal_uq
    ON document.payment_term_discount_result (reverses_id)
    WHERE is_reversal = true;

COMMENT ON TABLE document.payment_term_discount_result IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Settlement-time discount realization. Reversals use is_reversal + reverses_id (append-only).';
