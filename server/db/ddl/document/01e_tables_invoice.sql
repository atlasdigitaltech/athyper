-- ============================================================================
-- document/01e_tables_invoice.sql
-- Concept: Purchase Invoices - AP invoice lifecycle, matching, tax snapshots
-- Depends on: 04_tables/004b_document_commitment.sql, 04_tables/003b_master_finance.sql
-- Scope: Invoice document tables
-- Domain: purchase_invoice, purchase_invoice_line,
--         invoice_tax_snapshot,
--         invoice_match_case, match_exception,
--         payment_term_application (belongs with invoice domain)
--
-- Identity now uses direct document header fields and live master joins.
-- invoice_tax_snapshot remains because it captures tax determination.
-- Load order: 004d (after 004c_document_p2p.sql)
-- ============================================================================

-- ============================================================================
-- §9  document.purchase_invoice  (approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_invoice (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Request / approval
    requested_by            uuid            NOT NULL,
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Versioning (universal)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Lifecycle
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted',
                                           'partially_paid','on_hold')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit / extension
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Invoice classification
    invoice_source          text            NOT NULL DEFAULT 'po_based',
    invoice_type            text            NOT NULL DEFAULT 'standard',
    supplier_id             uuid,
    commitment_id           uuid,
    supplier_invoice_number text            NOT NULL,

    -- Dates
    supplier_invoice_date   date            NOT NULL,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    received_date           date            NOT NULL DEFAULT CURRENT_DATE,
    baseline_date           date,
    due_date                date,

    -- Tax / matching
    tax_mode                text            NOT NULL DEFAULT 'exclusive',
    match_type              text            NOT NULL DEFAULT 'three_way',
    match_status            text            NOT NULL DEFAULT 'unmatched',

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    fx_rate_snapshot        jsonb,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    payable_amount          numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                                - advance_deduction_amount - retention_amount
                            ) STORED,
    retention_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    advance_deduction_amount numeric(18,4)  NOT NULL DEFAULT 0,
    paid_amount             numeric(18,4)   NOT NULL DEFAULT 0,
    outstanding_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                                - advance_deduction_amount - retention_amount - paid_amount
                            ) STORED,

    -- Fiscal / budget / posting links
    payment_term_id         uuid,
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    budget_check_result     text,
    ap_je_id                uuid,

    CONSTRAINT pi_pkey              PRIMARY KEY (id),
    CONSTRAINT pi_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pi_tenant_code_uq    UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT pi_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT pi_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','partially_paid',
        'fully_paid','on_hold','reversed','cancelled','rejected')),
    CONSTRAINT pi_source_chk        CHECK (invoice_source IN (
        'po_based','contract_based','non_po','one_time_supplier')),
    CONSTRAINT pi_type_chk          CHECK (invoice_type IN (
        'standard','credit_note','debit_note','advance','retention_release',
        'self_billed','final')),
    CONSTRAINT pi_tax_mode_chk      CHECK (tax_mode IN ('exclusive','inclusive','out_of_scope')),
    CONSTRAINT pi_match_type_chk    CHECK (match_type IN (
        'three_way','two_way','no_match','evaluated_receipt')),
    CONSTRAINT pi_match_status_chk  CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception')),
    CONSTRAINT pi_commitment_req    CHECK (
        invoice_source NOT IN ('po_based','contract_based')
        OR commitment_id IS NOT NULL),
    CONSTRAINT pi_amount_chk        CHECK (total_amount >= 0),
    CONSTRAINT pi_tax_nonneg        CHECK (tax_amount >= 0),
    CONSTRAINT pi_wht_nonneg        CHECK (withholding_tax_amount >= 0),
    CONSTRAINT pi_retention_nonneg  CHECK (retention_amount >= 0),
    CONSTRAINT pi_advance_nonneg    CHECK (advance_deduction_amount >= 0),
    CONSTRAINT pi_paid_nonneg       CHECK (paid_amount >= 0),
    CONSTRAINT pi_currency_triad_chk CHECK (
        status = 'draft'
        OR (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0)
        )),
    CONSTRAINT pi_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT pi_budget_chk        CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'passed','warned','override','blocked','exempt')),
    CONSTRAINT pi_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT pi_status_source_chk CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT pi_version_self_chk  CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.purchase_invoice IS
    'ARCHETYPE=B;SCOPE=T. Phase 1 reset AP invoice header. name is the operational headline; description, posting flags, reversal flags, subtotal/discount/freight/misc fields, and header dimensions are removed.';


-- ============================================================================
-- §9.1  document.purchase_invoice_line
-- ============================================================================

COMMENT ON COLUMN document.purchase_invoice.fx_rate_snapshot IS
    'Explains how exchange_rate was resolved by fx.resolve_rate: identity, spot, commitment_fixed, reference_document, or manual_override.';

CREATE TABLE IF NOT EXISTS document.purchase_invoice_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Parent
    purchase_invoice_id     uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Source line links
    commitment_line_id      uuid,
    receipt_line_id         uuid,
    service_sheet_line_id   uuid,

    -- Item / classification
    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    line_type               text            NOT NULL DEFAULT 'noncatalog',
    commodity_category_id   uuid,
    business_intent_id      uuid,
    classification_decision jsonb,
    asset_class_id          uuid,

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount            numeric(18,4)   GENERATED ALWAYS AS (
                                ((quantity * unit_price) / NULLIF(price_unit, 0))
                                + tax_amount - withholding_tax_amount
                            ) STORED,
    required_by_date        date,

    -- Tax determination
    tax_group_id            uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id  uuid,
    from_tax_jurisdiction_id uuid,

    -- Address bundle
    site_id                 uuid,
    warehouse_id            uuid,
    storage_location        text,
    shipto_address_id       uuid,
    billto_address_id       uuid,
    billfrom_address_id     uuid,
    supplier_id             uuid,
    shipfrom_address_id     uuid,
    remitto_address_id      uuid,

    -- Match tracking
    matched_quantity        numeric(18,4)   NOT NULL DEFAULT 0,
    match_status            text            NOT NULL DEFAULT 'unmatched',

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
    CONSTRAINT pil_tax_nonneg       CHECK (tax_amount >= 0),
    CONSTRAINT pil_wht_nonneg       CHECK (withholding_tax_amount >= 0),
    CONSTRAINT pil_proc_type_chk    CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT pil_line_type_chk    CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT pil_match_status_chk CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception'))
);

COMMENT ON TABLE document.purchase_invoice_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Purchase invoice origination lines. Phase 1 reset removes line status, notes, metadata, row_version, discount fields, and tax-resolution audit columns.';


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

    -- WS-SNAPSHOT (D8 immutability) — capture the determination context
    -- so historical JE/JV behavior remains stable if upstream
    -- tax_rate_schedule / tax_jurisdiction rows mutate later. These are
    -- snapshot copies, NOT FKs that would propagate downstream edits.
    tax_section_code        text,
    jurisdiction_id         uuid,
    wht_basis               text,           -- copy of tax_rate_schedule.wht_basis at post time

    -- Capture audit (append-only)
    captured_at             timestamptz     NOT NULL DEFAULT now(),
    captured_by             uuid            NOT NULL,

    CONSTRAINT its_pkey             PRIMARY KEY (id),
    CONSTRAINT its_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT its_tax_rate_nonneg  CHECK (tax_rate >= 0),
    CONSTRAINT its_base_nonneg      CHECK (tax_base_amount >= 0),
    -- wht_basis must align with is_withholding (WS-SNAPSHOT)
    CONSTRAINT its_wht_basis_chk    CHECK (wht_basis IS NULL OR is_withholding = true)
);

COMMENT ON TABLE document.invoice_tax_snapshot IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Frozen tax determination at invoice time. '
    'Create only where legal/regulatory requirements mandate it. '
    'Otherwise posted tax facts in ledger.tax_calculation are authoritative. '
    'WS-SNAPSHOT: tax_section_code + jurisdiction_id + wht_basis are snapshot '
    'copies (NOT FKs) so historical determinations stay stable across upstream '
    'schedule/jurisdiction mutations.';


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
    match_type              text            NOT NULL DEFAULT 'three_way',
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
        'three_way','two_way','no_match','evaluated_receipt')),
    CONSTRAINT imc_result_chk   CHECK (match_result IN (
        'pending','matched','matched_with_tolerance',
        'exception','force_matched','rejected')),
    CONSTRAINT imc_status_chk   CHECK (status IN (
        'pending','in_progress','completed','exception','resolved','cancelled')),
    CONSTRAINT imc_exception_nonneg CHECK (exception_count >= 0)
);

COMMENT ON TABLE document.invoice_match_case IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Three-way match result envelope per invoice. '
    'One row per invoice (1:1 UNIQUE). Exceptions tracked in document.match_exception.';


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
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Per-line match variances requiring resolution. Clean matches are tracked on '
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
    'ARCHETYPE=C;SCOPE=T. Invoice × clause evaluation result. One row per invoice × clause (× line) evaluation.';


-- ============================================================================
-- document.wht_certificate — WHT certificate issuance lifecycle
-- ============================================================================
-- R7-C: certificate issued to a supplier documenting WHT deducted during a period.
-- Required for IN-TDS (Form 16A) and PH-EWT (BIR Form 2307) and similar regimes.
-- source_transaction_ids: array of payment / JE UUIDs contributing to this cert.
-- Lifecycle: draft → issued → voided. Corrections create a new cert (void + reissue).
CREATE TABLE IF NOT EXISTS document.wht_certificate (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL DEFAULT '',
    name                    text        NOT NULL DEFAULT '',

    -- Issuer + recipient
    company_code_id         uuid        NOT NULL,
    counterparty_id         uuid        NOT NULL,   -- supplier / principal receiving cert

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
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. R7-C: WHT certificate lifecycle (India Form 16A, Philippines BIR 2307, etc.). '
    'Issued by company to supplier documenting WHT deducted in period_from–period_to. '
    'Corrections: void existing cert (status=voided, void_reason) then create new cert '
    'with superseded_by_id pointing back to the voided cert. '
    'source_transaction_ids: payment / JE UUIDs contributing WHT to this certificate.';
