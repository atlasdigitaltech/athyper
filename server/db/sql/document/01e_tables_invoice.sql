-- ============================================================================
-- document/01e_tables_invoice.sql
-- Concept: Purchase Invoices — AP invoice lifecycle, matching, party snapshots
-- Depends on: 04_tables/004b_document_commitment.sql, 04_tables/003b_master_finance.sql
-- Scope: Invoice document tables
-- Domain: purchase_invoice, purchase_invoice_line,
--         invoice_party_snapshot, invoice_address_snapshot,
--         invoice_bank_snapshot, invoice_tax_snapshot,
--         invoice_match_case, match_exception,
--         payment_term_application (belongs with invoice domain)
-- Load order: 004d (after 004c_document_p2p.sql)
-- ============================================================================

-- ============================================================================
-- §9  document.purchase_invoice  (approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_invoice (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural keys
    invoice_number          text            NOT NULL,
    fiscal_document_number  text,

    -- Classification
    invoice_source          text            NOT NULL DEFAULT 'PO_BASED',
    invoice_type            text            NOT NULL DEFAULT 'STANDARD',
    description             text,

    -- Counterparty
    supplier_id             uuid,
    supplier_invoice_number text            NOT NULL,
    supplier_invoice_date   date            NOT NULL,

    -- Parent commitment
    commitment_id           uuid,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    received_date           date            NOT NULL DEFAULT CURRENT_DATE,
    baseline_date           date,
    due_date                date,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),

    subtotal_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    discount_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    freight_amount          numeric(18,4)   NOT NULL DEFAULT 0,
    misc_charges_amount     numeric(18,4)   NOT NULL DEFAULT 0,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    payable_amount          numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                            ) STORED,

    -- Payment terms
    payment_term_id         uuid,
    term_snapshot           jsonb,
    payment_method_id       uuid,

    -- Advance deduction
    advance_deduction_amount numeric(18,4)  NOT NULL DEFAULT 0,

    -- Retention (AP Retention Payable — liability, NOT receivable asset)
    retention_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    retention_pct           numeric(5,2),

    -- Payment tracking
    paid_amount             numeric(18,4)   NOT NULL DEFAULT 0,
    outstanding_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                                - advance_deduction_amount - retention_amount - paid_amount
                            ) STORED,

    -- Budget
    budget_allocation_id    uuid,
    budget_check_result     text,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Posting
    ap_je_id                uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    -- Matching
    match_type              text            NOT NULL DEFAULT 'THREE_WAY',
    match_status            text            NOT NULL DEFAULT 'unmatched',

    -- Reversal / credit note
    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,
    is_credit_note          boolean         NOT NULL DEFAULT false,

    -- Workflow
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Hold
    is_on_hold              boolean         NOT NULL DEFAULT false,
    hold_reason             text,

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
                                           'partially_paid','on_hold')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pi_pkey              PRIMARY KEY (id),
    CONSTRAINT pi_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pi_tenant_number_uq  UNIQUE (tenant_id, company_code_id, invoice_number),
    CONSTRAINT pi_number_nonempty   CHECK (btrim(invoice_number) <> ''),
    CONSTRAINT pi_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','partially_paid',
        'fully_paid','on_hold','reversed','cancelled','rejected')),
    CONSTRAINT pi_source_chk        CHECK (invoice_source IN (
        'PO_BASED','CONTRACT_BASED','NON_PO','ONE_TIME_VENDOR')),
    CONSTRAINT pi_type_chk          CHECK (invoice_type IN (
        'STANDARD','CREDIT_NOTE','DEBIT_NOTE','ADVANCE','RETENTION_RELEASE',
        'PROFORMA','SELF_BILLED','DOWN_PAYMENT','FINAL')),
    CONSTRAINT pi_match_type_chk    CHECK (match_type IN (
        'THREE_WAY','TWO_WAY','NO_MATCH','EVALUATED_RECEIPT')),
    CONSTRAINT pi_match_status_chk  CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception')),
    CONSTRAINT pi_commitment_req    CHECK (
        invoice_source NOT IN ('PO_BASED','CONTRACT_BASED')
        OR commitment_id IS NOT NULL),
    CONSTRAINT pi_amount_chk        CHECK (total_amount >= 0 OR is_credit_note),
    CONSTRAINT pi_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT pi_budget_chk        CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'PASSED','WARNED','OVERRIDE','BLOCKED','EXEMPT')),
    CONSTRAINT pi_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT pi_retention_chk     CHECK (
        retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT pi_posting_pair_chk  CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.purchase_invoice IS
    'Approvable AP invoice. Four sources: PO_BASED, CONTRACT_BASED, NON_PO, ONE_TIME_VENDOR. '
    'Vendor identity frozen in invoice_party_snapshot + invoice_address_snapshot + invoice_bank_snapshot. '
    'Tax determined by existing engine; tax_amount is a display cache. '
    'Retention creates AP Retention Payable (liability), not a receivable asset.';


-- ============================================================================
-- §9.1  document.purchase_invoice_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_invoice_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    purchase_invoice_id     uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Source line links
    commitment_line_id      uuid,
    goods_receipt_line_id   uuid,
    ses_line_id             uuid,

    -- Item
    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    spend_category_id       uuid,
    business_intent_id      uuid,

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,

    -- Discounts
    discount_pct            numeric(5,2)    DEFAULT 0,
    discount_amount         numeric(18,4)   DEFAULT 0,

    -- Tax
    tax_group_id            uuid,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_group_id uuid,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    gross_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Asset
    is_asset                boolean         NOT NULL DEFAULT false,
    asset_category_id       uuid,

    -- Match tracking
    matched_quantity        numeric(18,4)   NOT NULL DEFAULT 0,
    match_status            text            NOT NULL DEFAULT 'unmatched',

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pil_pkey             PRIMARY KEY (id),
    CONSTRAINT pil_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT pil_line_uq          UNIQUE (purchase_invoice_id, line_no),
    CONSTRAINT pil_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT pil_qty_nonzero      CHECK (quantity <> 0),
    CONSTRAINT pil_price_nonneg     CHECK (unit_price >= 0),
    CONSTRAINT pil_price_unit_pos   CHECK (price_unit > 0),
    CONSTRAINT pil_proc_type_chk    CHECK (procurement_type IN (
        'goods','services','mixed','freight','misc')),
    CONSTRAINT pil_match_status_chk CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception')),
    CONSTRAINT pil_tax_nonneg       CHECK (tax_amount >= 0),
    CONSTRAINT pil_wht_nonneg       CHECK (withholding_tax_amount >= 0),
    CONSTRAINT pil_discount_chk     CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100)
);


-- ============================================================================
-- §5.3  document.invoice_party_snapshot  (identity only; address is separate)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.invoice_party_snapshot (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent invoice
    purchase_invoice_id uuid            NOT NULL,

    -- Party
    supplier_id         uuid,
    party_name          text            NOT NULL,
    tax_registration_no text,
    legal_entity_name   text,
    country_code        character(2),

    is_one_time_vendor  boolean         NOT NULL DEFAULT false,

    -- Contact
    contact_name        text,
    contact_email       text,
    contact_phone       text,

    -- Capture audit (append-only)
    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ips_pkey         PRIMARY KEY (id),
    CONSTRAINT ips_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ips_invoice_uq   UNIQUE (purchase_invoice_id)
);


-- ============================================================================
-- §5.4  document.invoice_address_snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.invoice_address_snapshot (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent invoice
    purchase_invoice_id uuid            NOT NULL,
    address_type        text            NOT NULL,

    -- Address
    address_line_1      text            NOT NULL,
    address_line_2      text,
    city                text,
    state_province      text,
    postal_code         text,
    country_code        character(2)    NOT NULL,

    -- Capture audit (append-only)
    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT ias_pkey             PRIMARY KEY (id),
    CONSTRAINT ias_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT ias_invoice_type_uq  UNIQUE (purchase_invoice_id, address_type),
    CONSTRAINT ias_type_chk         CHECK (address_type IN (
        'SUPPLIER','REMIT_TO','BILLING','DELIVERY'))
);


-- ============================================================================
-- §5.5  document.invoice_bank_snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.invoice_bank_snapshot (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent invoice
    purchase_invoice_id uuid            NOT NULL,

    -- Bank details
    bank_name           text            NOT NULL,
    bank_country_code   character(2),
    account_holder_name text            NOT NULL,
    account_number      text,
    iban                text,
    swift_bic           text,
    routing_number      text,
    bank_branch         text,

    -- Capture audit (append-only)
    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT ibs_pkey         PRIMARY KEY (id),
    CONSTRAINT ibs_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ibs_invoice_uq   UNIQUE (purchase_invoice_id),
    CONSTRAINT ibs_account_chk  CHECK (account_number IS NOT NULL OR iban IS NOT NULL)
);


-- ============================================================================
-- §5.6  document.invoice_tax_snapshot  (only where legally required)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.invoice_tax_snapshot (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent invoice
    purchase_invoice_id     uuid            NOT NULL,
    invoice_line_id         uuid,

    -- Tax determination
    tax_group_id            uuid            NOT NULL,
    tax_component_code      text            NOT NULL,
    tax_rate_schedule_id    uuid,
    tax_base_amount         numeric(18,4)   NOT NULL,
    tax_rate                numeric(7,4)    NOT NULL,
    tax_amount              numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Flags
    is_recoverable          boolean         NOT NULL DEFAULT true,
    is_withholding          boolean         NOT NULL DEFAULT false,

    -- Capture audit (append-only)
    captured_at             timestamptz     NOT NULL DEFAULT now(),
    captured_by             uuid            NOT NULL,

    CONSTRAINT its_pkey             PRIMARY KEY (id),
    CONSTRAINT its_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT its_tax_rate_nonneg  CHECK (tax_rate >= 0),
    CONSTRAINT its_base_nonneg      CHECK (tax_base_amount >= 0)
);

COMMENT ON TABLE document.invoice_tax_snapshot IS
    'Frozen tax determination at invoice time. '
    'Create only where legal/regulatory requirements mandate it. '
    'Otherwise posted tax facts in ledger.tax_calculation are authoritative.';


-- ============================================================================
-- §10.1  document.invoice_match_case
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.invoice_match_case (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Invoice + commitment link
    purchase_invoice_id     uuid            NOT NULL,
    commitment_id           uuid,

    -- Match result
    match_type              text            NOT NULL DEFAULT 'THREE_WAY',
    match_result            text            NOT NULL DEFAULT 'pending',

    -- Variances
    total_quantity_variance numeric(18,4)   NOT NULL DEFAULT 0,
    total_price_variance    numeric(18,4)   NOT NULL DEFAULT 0,
    total_amount_variance   numeric(18,4)   NOT NULL DEFAULT 0,

    -- Exception summary
    has_exceptions          boolean         NOT NULL DEFAULT false,
    exception_count         smallint        NOT NULL DEFAULT 0,

    -- Match event
    matched_at              timestamptz,
    matched_by              uuid,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'pending',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT imc_pkey         PRIMARY KEY (id),
    CONSTRAINT imc_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT imc_invoice_uq   UNIQUE (tenant_id, purchase_invoice_id),
    CONSTRAINT imc_type_chk     CHECK (match_type IN (
        'THREE_WAY','TWO_WAY','NO_MATCH','EVALUATED_RECEIPT')),
    CONSTRAINT imc_result_chk   CHECK (match_result IN (
        'pending','matched','matched_with_tolerance',
        'exception','force_matched','rejected')),
    CONSTRAINT imc_status_chk   CHECK (status IN (
        'pending','in_progress','completed','exception','resolved','cancelled')),
    CONSTRAINT imc_exception_nonneg CHECK (exception_count >= 0)
);


-- ============================================================================
-- §10.2  document.match_exception  (per-line; independent workflow routing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.match_exception (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    invoice_match_case_id   uuid            NOT NULL,
    invoice_line_id         uuid            NOT NULL,

    -- Exception detail
    exception_type          text            NOT NULL,
    exception_subtype       text,

    -- Variance amounts
    expected_value          numeric(18,4),
    actual_value            numeric(18,4),
    variance_amount         numeric(18,4)   NOT NULL,
    variance_pct            numeric(7,4),
    currency_code           character(3)    NOT NULL,

    -- Tolerance
    tolerance_pct           numeric(5,2),
    tolerance_amount        numeric(18,4),
    is_within_tolerance     boolean         NOT NULL DEFAULT false,

    -- Resolution
    resolution_type         text,
    resolution_notes        text,
    resolved_by             uuid,
    resolved_at             timestamptz,

    -- Workflow
    workflow_request_id     uuid,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT me_pkey          PRIMARY KEY (id),
    CONSTRAINT me_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT me_type_chk      CHECK (exception_type IN (
        'PRICE_VARIANCE','QUANTITY_VARIANCE','AMOUNT_VARIANCE',
        'MISSING_RECEIPT','DUPLICATE_INVOICE','TAX_VARIANCE',
        'FX_VARIANCE','RETENTION_VARIANCE','ADVANCE_RECOVERY_MISMATCH')),
    CONSTRAINT me_status_chk    CHECK (status IN (
        'open','pending_approval','approved','rejected',
        'force_matched','written_off','cancelled')),
    CONSTRAINT me_resolution_chk CHECK (resolution_type IS NULL OR resolution_type IN (
        'ACCEPTED','FORCE_MATCHED','CREDIT_NOTE_REQUESTED','WRITTEN_OFF',
        'PRICE_ADJUSTMENT','QUANTITY_ADJUSTMENT','REJECTED')),
    CONSTRAINT me_resolved_pair_chk CHECK (
        (resolved_by IS NULL) = (resolved_at IS NULL))
);

COMMENT ON TABLE document.match_exception IS
    'Per-line match variances requiring resolution. Clean matches are tracked on '
    'purchase_invoice_line.match_status + matched_quantity only.';


-- ============================================================================
-- §PT4  document.payment_term_application — invoice × clause evaluation result
-- ============================================================================
-- Moved from 004a_document_payment_terms.sql. Belongs with invoice domain.
-- One row per invoice × clause (× line) evaluation.

CREATE TABLE IF NOT EXISTS document.payment_term_application (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,

    -- Invoice + commitment context
    invoice_id                  uuid            NOT NULL,
    invoice_line_id             uuid,
    commitment_id               uuid,

    -- Term reference
    payment_term_id             uuid,
    clause_id                   uuid,
    term_snapshot               jsonb,
    clause_snapshot             jsonb,

    -- Evaluation result
    application_status          text            NOT NULL DEFAULT 'APPLIED',
    clause_type                 text            NOT NULL,
    clause_code                 text            NOT NULL,

    -- Amounts
    calculated_basis_amount     numeric(18,4)   NOT NULL,
    default_pct                 numeric(5,2),
    applied_pct                 numeric(5,2),
    default_amount              numeric(18,4)   NOT NULL,
    applied_amount              numeric(18,4)   NOT NULL,

    -- Edit flags
    is_user_editable            boolean         NOT NULL DEFAULT false,
    evaluation_sequence_no      integer         NOT NULL,
    running_total_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_balance_amount    numeric(18,4)   NOT NULL DEFAULT 0,
    is_effective                boolean         NOT NULL DEFAULT true,

    -- Reversal / supersession
    reversed_by_application_id  uuid,
    superseded_by_application_id uuid,

    -- Override reason
    system_reason_code          text,
    manual_override_reason      text,

    -- Override workflow
    workflow_request_id         uuid,
    override_requested_by       uuid,
    override_requested_at       timestamptz,
    override_decision           text,
    override_decided_by         uuid,
    override_decided_at         timestamptz,

    -- Due date fields
    schedule_id                 uuid,
    base_event_date             date,
    days_applied                smallint,
    resolved_due_date           date,

    -- Metadata
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT pta_pkey                     PRIMARY KEY (id),
    CONSTRAINT pta_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT pta_status_chk               CHECK (application_status IN (
        'APPLIED','SKIPPED','CLAMPED','EXHAUSTED','NOT_YET_ELIGIBLE')),
    CONSTRAINT pta_clause_type_chk          CHECK (clause_type IN (
        'ADVANCE','ADVANCE_RECOVERY','RETENTION','RETENTION_RELEASE','DUE_DATE')),
    CONSTRAINT pta_system_reason_chk        CHECK (system_reason_code IS NULL
        OR system_reason_code IN (
        'CEILING_CLAMPED','CEILING_REACHED','THRESHOLD_NOT_MET',
        'CAP_EXHAUSTED','CATCH_UP','FLEXIBILITY_APPLIED')),
    CONSTRAINT pta_override_decision_chk    CHECK (override_decision IS NULL
        OR override_decision IN ('approve','reject','escalate')),
    CONSTRAINT pta_term_snap_chk            CHECK (
        term_snapshot IS NULL OR jsonb_typeof(term_snapshot) = 'object'),
    CONSTRAINT pta_clause_snap_chk          CHECK (
        clause_snapshot IS NULL OR jsonb_typeof(clause_snapshot) = 'object'),
    CONSTRAINT pta_basis_nonneg             CHECK (calculated_basis_amount >= 0),
    CONSTRAINT pta_default_amt_nonneg       CHECK (default_amount >= 0),
    CONSTRAINT pta_applied_nonneg           CHECK (applied_amount >= 0),
    CONSTRAINT pta_running_nonneg           CHECK (running_total_amount >= 0),
    CONSTRAINT pta_remaining_nonneg         CHECK (remaining_balance_amount >= 0),
    CONSTRAINT pta_eval_seq_positive        CHECK (evaluation_sequence_no > 0),
    CONSTRAINT pta_override_reason_chk      CHECK (
        manual_override_reason IS NOT NULL
        OR system_reason_code IS NOT NULL
        OR (
            (applied_pct IS NULL OR default_pct IS NULL OR applied_pct = default_pct)
            AND applied_amount = default_amount
        )),
    CONSTRAINT pta_no_self_reverse          CHECK (reversed_by_application_id IS DISTINCT FROM id),
    CONSTRAINT pta_no_self_supersede        CHECK (superseded_by_application_id IS DISTINCT FROM id),
    CONSTRAINT pta_reversal_effective_chk   CHECK (
        reversed_by_application_id IS NULL OR is_effective = false),
    CONSTRAINT pta_override_consistency_chk CHECK (
        override_decision IS NULL
        OR (override_decided_by IS NOT NULL AND override_decided_at IS NOT NULL)),
    CONSTRAINT pta_deduction_needs_commitment CHECK (
        commitment_id IS NOT NULL
        OR clause_type NOT IN ('ADVANCE','ADVANCE_RECOVERY','RETENTION','RETENTION_RELEASE')),
    CONSTRAINT pta_schedule_needs_commitment CHECK (
        schedule_id IS NULL OR commitment_id IS NOT NULL),
    CONSTRAINT pta_due_date_req_chk CHECK (
        clause_type <> 'DUE_DATE' OR resolved_due_date IS NOT NULL),
    CONSTRAINT pta_due_date_no_clause_chk CHECK (
        clause_type <> 'DUE_DATE' OR clause_id IS NULL),
    CONSTRAINT pta_due_date_code_chk CHECK (
        clause_type <> 'DUE_DATE' OR clause_code = 'DUE_DATE'),
    CONSTRAINT pta_due_date_base_chk CHECK (
        clause_type <> 'DUE_DATE' OR base_event_date IS NOT NULL),
    CONSTRAINT pta_nonpo_snapshot_chk CHECK (
        commitment_id IS NOT NULL OR term_snapshot IS NOT NULL),
    CONSTRAINT pta_nonpo_term_ref_chk CHECK (
        commitment_id IS NOT NULL OR payment_term_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS pta_invoice_clause_uq
    ON document.payment_term_application (
        invoice_id, clause_code,
        COALESCE(invoice_line_id, '00000000-0000-0000-0000-000000000000'),
        evaluation_sequence_no
    );

COMMENT ON TABLE document.payment_term_application IS
    'Invoice × clause evaluation result. One row per invoice × clause (× line) evaluation.';


-- ============================================================================
-- document.wht_certificate — WHT certificate issuance lifecycle
-- ============================================================================
-- R7-C: certificate issued to a vendor documenting WHT deducted during a period.
-- Required for IN-TDS (Form 16A) and PH-EWT (BIR Form 2307) and similar regimes.
-- source_transaction_ids: array of payment / JE UUIDs contributing to this cert.
-- Lifecycle: draft → issued → voided. Corrections create a new cert (void + reissue).
CREATE TABLE IF NOT EXISTS document.wht_certificate (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Issuer + recipient
    company_code_id         uuid        NOT NULL,
    counterparty_id         uuid        NOT NULL,   -- vendor / principal receiving cert

    -- Tax classification
    tax_type_id             uuid        NOT NULL,
    section_code            text,                   -- e.g. '194C', 'EWT-professional'

    -- Certificate identity
    certificate_no          text        NOT NULL,   -- issuer-assigned sequential number
    certificate_series      text,                   -- optional: series prefix per tax type

    -- Period covered
    period_from             date        NOT NULL,
    period_to               date        NOT NULL,

    -- Amounts
    gross_amount            numeric(18,4) NOT NULL,
    wht_amount              numeric(18,4) NOT NULL,
    currency_code           character(3)  NOT NULL,

    -- Source traceability
    source_transaction_ids  uuid[]      NOT NULL DEFAULT '{}',

    -- Lifecycle
    status                  text        NOT NULL DEFAULT 'draft',
    issued_at               timestamptz,
    issued_by               uuid,
    voided_at               timestamptz,
    voided_by               uuid,
    void_reason             text,
    superseded_by_id        uuid,   -- FK → document.wht_certificate(id); set on reissue

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT whtc_pkey              PRIMARY KEY (id),
    CONSTRAINT whtc_tenant_cert_uq    UNIQUE (tenant_id, company_code_id, certificate_no),
    CONSTRAINT whtc_period_order      CHECK (period_to >= period_from),
    CONSTRAINT whtc_gross_nonneg      CHECK (gross_amount >= 0),
    CONSTRAINT whtc_wht_nonneg        CHECK (wht_amount >= 0),
    CONSTRAINT whtc_wht_lte_gross     CHECK (wht_amount <= gross_amount),
    CONSTRAINT whtc_status_chk        CHECK (status IN ('draft', 'issued', 'voided')),
    CONSTRAINT whtc_issued_state      CHECK (
        status <> 'issued' OR issued_at IS NOT NULL),
    CONSTRAINT whtc_voided_state      CHECK (
        status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)),
    CONSTRAINT whtc_cert_nonempty     CHECK (btrim(certificate_no) <> '')
);

COMMENT ON TABLE document.wht_certificate IS
    'R7-C: WHT certificate lifecycle (India Form 16A, Philippines BIR 2307, etc.). '
    'Issued by company to vendor documenting WHT deducted in period_from–period_to. '
    'Corrections: void existing cert (status=voided, void_reason) then create new cert '
    'with superseded_by_id pointing back to the voided cert. '
    'source_transaction_ids: payment / JE UUIDs contributing WHT to this certificate.';
