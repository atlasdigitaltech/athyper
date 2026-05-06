-- ============================================================================
-- document/01p_tables_bank_recon.sql
-- Phase 5: Bank Statement Import & Reconciliation — reconciliation case tables
--
-- Two tables:
--   document.bank_recon_case      — one reconciliation case grouping one or more
--                                   payment_entry + bank_statement_line pairs
--   document.bank_recon_case_line — append-only M:N bridge:
--                                   side='payment'   → payment_entry_id IS NOT NULL
--                                   side='statement' → bank_statement_line_id IS NOT NULL
--
-- difference_amount is SIGNED:
--   difference_amount = SUM(payment side amounts) − SUM(statement side amounts)
--   Positive → books > bank (e.g. overpayment, bank not yet settled)
--   Negative → bank > books (e.g. bank charge, FX gain not recorded)
--   The sign drives the Dr/Cr direction when bank-recon-posting.service creates the JE.
--
-- Canonical matching state is conveyed by bank_recon_case_line rows (M:N).
-- bank_statement_line.recon_case_id is a convenience shortcut only.
--
-- FK constraints are in document/03_constraints.sql.
-- ============================================================================

-- ============================================================================
-- §BRC  document.bank_recon_case
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.bank_recon_case (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    bank_account_id         uuid            NOT NULL,

    -- Human-readable reference (app-generated, e.g. "RC-2024-001")
    case_number             text            NOT NULL,

    -- Case type — determines posting template used at sign-off
    case_type               text            NOT NULL,

    -- Matching confidence (0.0000 – 1.0000)
    -- Set by auto-matcher; 1.0 for manual cases
    confidence_score        numeric(5,4)    NOT NULL DEFAULT 1.0,

    -- Status lifecycle: open → matched → signed_off | voided
    status                  text            NOT NULL DEFAULT 'open',

    -- Signed difference at time of matching (see sign convention above)
    difference_amount       numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code           character(3)    NOT NULL,

    -- JE created at sign-off for bank_charge or fx_difference cases
    sign_off_je_id          uuid,

    -- Timestamps
    matched_at              timestamptz,
    signed_off_at           timestamptz,
    signed_off_by           uuid,

    -- Notes
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT brc_pkey                 PRIMARY KEY (id),
    CONSTRAINT brc_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT brc_case_number_uq       UNIQUE (tenant_id, bank_account_id, case_number),
    CONSTRAINT brc_case_type_chk        CHECK (case_type IN (
                                            'exact_match', 'amount_match', 'near_match',
                                            'manual', 'exception',
                                            'bank_charge', 'fx_difference')),
    CONSTRAINT brc_status_chk           CHECK (status IN (
                                            'open', 'matched', 'signed_off', 'voided')),
    CONSTRAINT brc_confidence_rng_chk   CHECK (confidence_score BETWEEN 0 AND 1),
    CONSTRAINT brc_signoff_pair_chk     CHECK (
                                            (signed_off_at IS NULL) = (signed_off_by IS NULL))
);

COMMENT ON TABLE document.bank_recon_case IS
    'ARCHETYPE=B;SCOPE=T. Reconciliation case grouping payment_entry rows with '
    'bank_statement_line rows. Canonical M:N matching via bank_recon_case_line. '
    'difference_amount is signed: positive means books > bank; negative means bank > books. '
    'bank_charge and fx_difference cases get a JE posted at sign-off. '
    'FK constraints in 03_constraints.sql.';


-- ============================================================================
-- §BRCL  document.bank_recon_case_line
-- ============================================================================
-- Append-only: once created, rows are never updated or deleted.
-- Correct a wrong match by voiding the case and creating a new one.

CREATE TABLE IF NOT EXISTS document.bank_recon_case_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    bank_recon_case_id      uuid            NOT NULL,

    -- Side discriminator
    side                    text            NOT NULL,

    -- Exactly one of these is NOT NULL, determined by side
    payment_entry_id        uuid,
    bank_statement_line_id  uuid,

    -- Amount attributed to this side-line (for split scenarios)
    amount                  numeric(18,4)   NOT NULL,

    -- Notes
    notes                   text,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT brcl_pkey            PRIMARY KEY (id),
    CONSTRAINT brcl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT brcl_side_chk        CHECK (side IN ('payment', 'statement')),
    CONSTRAINT brcl_side_xor_chk    CHECK (
        (side = 'payment'   AND payment_entry_id       IS NOT NULL
                            AND bank_statement_line_id IS NULL)
        OR
        (side = 'statement' AND bank_statement_line_id IS NOT NULL
                            AND payment_entry_id       IS NULL)
    )
);

COMMENT ON TABLE document.bank_recon_case_line IS
    'ARCHETYPE=D;SCOPE=T. Append-only M:N bridge between bank_recon_case and '
    'payment_entry (side=payment) or bank_statement_line (side=statement). '
    'Splits are expressed by multiple side=statement rows with partial amounts. '
    'Never updated or deleted — void the case to undo a match. '
    'FK constraints in 03_constraints.sql.';
