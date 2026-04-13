-- ============================================================================
-- 004a_document_payment_terms.sql
-- PAYMENT TERMS - document schema tables
-- Tables:   document.payment_term_application  (PT4)
--           document.payment_term_discount_result (PT5)
--           document.commitment (ALTER - adds payment_term columns) (D)
-- Depends:  04_tables/003d_master_payment_terms.sql
--           04_tables/004_document.sql (document.commitment base table)
-- ============================================================================

-- ============================================================================
-- 004a_document_payment_terms.sql
-- PAYMENT TERMS — document schema tables
-- Tables:   document.payment_term_application  (§PT4)
--           document.payment_term_discount_result (§PT5)
--           document.commitment (ALTER — adds payment_term columns) (§D)
-- Depends:  04_tables/003d_master_payment_terms.sql (master payment term tables)
--           04_tables/004_document.sql (document.commitment base table)
-- ============================================================================

-- PART C â€” DOCUMENT TABLES (document schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.payment_term_application (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    invoice_id                  uuid            NOT NULL,
    invoice_line_id             uuid,
    commitment_id               uuid,
    payment_term_id             uuid,
    clause_id                   uuid,
    term_snapshot               jsonb,
    clause_snapshot             jsonb,
    application_status          text            NOT NULL DEFAULT 'APPLIED',
    clause_type                 text            NOT NULL,
    clause_code                 text            NOT NULL,
    calculated_basis_amount     numeric(18,4)   NOT NULL,
    default_pct                 numeric(5,2),
    applied_pct                 numeric(5,2),
    default_amount              numeric(18,4)   NOT NULL,
    applied_amount              numeric(18,4)   NOT NULL,
    is_user_editable            boolean         NOT NULL DEFAULT false,
    evaluation_sequence_no      integer         NOT NULL,
    running_total_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_balance_amount    numeric(18,4)   NOT NULL DEFAULT 0,
    is_effective                boolean         NOT NULL DEFAULT true,
    reversed_by_application_id  uuid,
    superseded_by_application_id uuid,
    system_reason_code          text,
    manual_override_reason      text,
    workflow_request_id         uuid,
    override_requested_by       uuid,
    override_requested_at       timestamptz,
    override_decision           text,
    override_decided_by         uuid,
    override_decided_at         timestamptz,
    schedule_id                 uuid,
    base_event_date             date,
    days_applied                smallint,
    resolved_due_date           date,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
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
    'Invoice Ã— clause evaluation result. One row per invoice Ã— clause (Ã— line) evaluation.';


CREATE TABLE IF NOT EXISTS document.payment_term_discount_result (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    payment_id                  uuid            NOT NULL,
    invoice_id                  uuid            NOT NULL,
    commitment_id               uuid,
    payment_term_id             uuid,
    discount_tier_id            uuid,
    allocated_payment_amount    numeric(18,4)   NOT NULL,
    qualification_date          date            NOT NULL,
    qualified_tier_no           smallint,
    qualified_days_actual       smallint        NOT NULL,
    discount_basis_amount       numeric(18,4)   NOT NULL,
    discount_pct                numeric(5,2),
    discount_amount             numeric(18,4)   NOT NULL,
    application_status          text            NOT NULL,
    is_reversal                 boolean         NOT NULL DEFAULT false,
    reverses_id                 uuid,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
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
    'Settlement-time discount realization. Reversals use is_reversal + reverses_id (append-only).';


-- ============================================================================
-- PART D â€” COMMITMENT HEADER ADDITIONS
-- ============================================================================

ALTER TABLE document.commitment
    ADD COLUMN IF NOT EXISTS payment_term_id             uuid,
    ADD COLUMN IF NOT EXISTS payment_term_version        smallint,
    ADD COLUMN IF NOT EXISTS payment_term_snapshot        jsonb,
    ADD COLUMN IF NOT EXISTS payment_term_selected_at     timestamptz,
    ADD COLUMN IF NOT EXISTS payment_term_selected_by     uuid;

DO $$ BEGIN
    ALTER TABLE document.commitment ADD CONSTRAINT cmt_pt_snapshot_chk
        CHECK (payment_term_snapshot IS NULL OR jsonb_typeof(payment_term_snapshot) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment ADD CONSTRAINT cmt_pt_all_req_chk
        CHECK (payment_term_id IS NULL OR (
            payment_term_version IS NOT NULL
            AND payment_term_snapshot IS NOT NULL
            AND payment_term_selected_at IS NOT NULL
            AND payment_term_selected_by IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
