-- ============================================================================
-- document/01o_tables_bank_statement.sql
-- Phase 5: Bank Statement Import & Reconciliation — statement tables
--
-- Two tables:
--   document.bank_statement      — one imported statement file per bank account period
--   document.bank_statement_line — one transaction row per statement line (mutable:
--                                  recon_status + recon_case_id are updated during matching)
--
-- Dedup strategy:
--   File-level: UNIQUE (tenant_id, bank_account_id, source_hash) WHERE source_hash IS NOT NULL
--   Line-level:  UNIQUE (tenant_id, bank_statement_id, idempotency_key) — prefers bank FITID
--                when available; falls back to SHA-256(raw_data) + ':' + line_no
--
-- Sign convention for amount on bank_statement_line:
--   Positive (+) = credit to company bank account (money in)
--   Negative (−) = debit from company bank account (money out)
--   This mirrors the customer's perspective, not the bank's ledger side.
--
-- FK constraints are in document/03_constraints.sql (avoids circular dep with bank_recon_case).
-- ============================================================================

-- ============================================================================
-- §BST  document.bank_statement
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.bank_statement (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    bank_account_id         uuid            NOT NULL,

    -- Natural reference
    statement_ref           text,

    -- Period
    period_start_date       date            NOT NULL,
    period_end_date         date            NOT NULL,

    -- Balances (from file header or manual entry)
    opening_balance         numeric(18,4),
    closing_balance         numeric(18,4),
    currency_code           character(3)    NOT NULL,

    -- Import metadata
    line_count              integer         NOT NULL DEFAULT 0,
    source_format           text            NOT NULL DEFAULT 'csv',
    source_hash             text,

    -- Status lifecycle: imported → matching → signed_off → archived
    status                  text            NOT NULL DEFAULT 'imported',

    -- Sign-off
    sign_off_je_id          uuid,
    signed_off_at           timestamptz,
    signed_off_by           uuid,

    -- Notes + metadata
    notes                   text,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bst_pkey             PRIMARY KEY (id),
    CONSTRAINT bst_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT bst_period_chk       CHECK (period_end_date >= period_start_date),
    CONSTRAINT bst_status_chk       CHECK (status IN (
                                        'imported', 'matching', 'signed_off', 'archived')),
    CONSTRAINT bst_format_chk       CHECK (source_format IN (
                                        'csv', 'ofx', 'mt940', 'bai2', 'manual')),
    CONSTRAINT bst_signoff_pair_chk CHECK (
                                        (signed_off_at IS NULL) = (signed_off_by IS NULL))
);

-- Partial unique index: PostgreSQL requires CREATE UNIQUE INDEX (not inline CONSTRAINT) for WHERE predicates.
-- File-level dedup: same file body cannot be imported twice for the same bank account.
CREATE UNIQUE INDEX IF NOT EXISTS bst_source_hash_uq
    ON document.bank_statement (tenant_id, bank_account_id, source_hash)
    WHERE source_hash IS NOT NULL;

COMMENT ON TABLE document.bank_statement IS
    'ARCHETYPE=B;SCOPE=T. One imported bank statement file per bank account period. '
    'Status lifecycle: imported→matching→signed_off→archived. '
    'Dedup via source_hash (SHA-256 of raw file). '
    'FK constraints in 03_constraints.sql.';


-- ============================================================================
-- §BSL  document.bank_statement_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.bank_statement_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    bank_statement_id       uuid            NOT NULL,

    -- Position within statement
    line_no                 integer         NOT NULL,

    -- Transaction details
    transaction_date        date            NOT NULL,
    value_date              date,
    description             text            NOT NULL DEFAULT '',
    reference_number        text,
    counterparty_name       text,
    counterparty_account    text,

    -- Amount: positive = credit (money in), negative = debit (money out)
    amount                  numeric(18,4)   NOT NULL,
    running_balance         numeric(18,4),
    currency_code           character(3)    NOT NULL,

    -- Transaction classification
    transaction_type        text            NOT NULL DEFAULT 'payment',

    -- Dedup: FITID from OFX preferred; fallback = SHA-256(raw_data) || ':' || line_no
    idempotency_key         text,

    -- Reconciliation state (mutable — updated by matching engine)
    recon_status            text            NOT NULL DEFAULT 'unmatched',
    recon_case_id           uuid,

    -- Raw source record for audit trail
    raw_data                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz,

    CONSTRAINT bsl_pkey                 PRIMARY KEY (id),
    CONSTRAINT bsl_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT bsl_stmt_line_uq         UNIQUE (tenant_id, bank_statement_id, line_no),
    CONSTRAINT bsl_tx_type_chk          CHECK (transaction_type IN (
                                            'payment', 'receipt', 'fee', 'interest',
                                            'fx', 'transfer', 'reversal', 'other')),
    CONSTRAINT bsl_recon_status_chk     CHECK (recon_status IN (
                                            'unmatched', 'matched', 'split',
                                            'exception', 'excluded'))
);

-- Partial unique index: line-level dedup.
-- FITID from OFX preferred; fallback = SHA-256(raw_data) || ':' || line_no.
-- WHERE predicate requires CREATE UNIQUE INDEX, not inline CONSTRAINT.
CREATE UNIQUE INDEX IF NOT EXISTS bsl_idempotency_uq
    ON document.bank_statement_line (tenant_id, bank_statement_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE document.bank_statement_line IS
    'ARCHETYPE=D;SCOPE=T. One transaction row per imported bank statement line. '
    'amount sign: positive = credit to company account (money in), negative = debit (money out). '
    'recon_status and recon_case_id are mutable (updated by matching engine and manual reconciliation). '
    'idempotency_key: bank FITID when available; else SHA-256(raw_data)||'':''||line_no. '
    'FK constraints in 03_constraints.sql.';
