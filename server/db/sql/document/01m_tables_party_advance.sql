-- ============================================================================
-- document/01m_tables_party_advance.sql
-- Phase 2: Party advance and retention balance tracking for non-PO invoices.
--
-- §PAB  document.party_advance_balance
--   Running balance per tenant / company / supplier / currency.
--   currency_code is part of the natural key — USD, EUR, MYR etc. are kept
--   separate.  Balance moves on posted financial events only.
--
-- Idempotent upgrade path:
--   First run  → CREATE TABLE includes currency_code from the start.
--   Upgrade run (Phase 2 v1 table lacks currency_code) →
--     ALTER TABLE ADD COLUMN IF NOT EXISTS, drop old 3-col unique constraint,
--     recreate 4-col constraint, rebuild ix_pab_company with currency_code.
--
-- Load order: after 01e_tables_invoice.sql, 01l_tables_invoice_infra.sql
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- §1  Create table (fresh install)
-- ──────────────────────────────────────────────────────────────────────────────
-- Constraints only applied by CREATE TABLE; ALTER TABLE below handles upgrades.

CREATE TABLE IF NOT EXISTS document.party_advance_balance (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,
    currency_code           text            NOT NULL DEFAULT '',

    advance_balance         numeric(18,4)   NOT NULL DEFAULT 0,
    retention_balance       numeric(18,4)   NOT NULL DEFAULT 0,
    advance_invoice_count   integer         NOT NULL DEFAULT 0,
    retention_invoice_count integer         NOT NULL DEFAULT 0,

    last_updated_at         timestamptz     NOT NULL DEFAULT now(),
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,

    CONSTRAINT pab_pkey           PRIMARY KEY (id),
    CONSTRAINT pab_advance_nneg   CHECK (advance_balance   >= 0),
    CONSTRAINT pab_retention_nneg CHECK (retention_balance >= 0),
    CONSTRAINT pab_adv_cnt_nneg   CHECK (advance_invoice_count   >= 0),
    CONSTRAINT pab_ret_cnt_nneg   CHECK (retention_invoice_count >= 0)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- §2  Upgrade path: add currency_code if missing from Phase 2 v1 schema
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE document.party_advance_balance
    ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT '';

-- ──────────────────────────────────────────────────────────────────────────────
-- §3  Unique constraint — drop old 3-column version, add 4-column version
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop the old pab_scope_uq that lacked currency_code (safe if already dropped)
ALTER TABLE document.party_advance_balance
    DROP CONSTRAINT IF EXISTS pab_scope_uq;

-- Add the correct 4-column constraint (idempotent via DO block)
DO $$ BEGIN
    ALTER TABLE document.party_advance_balance
        ADD CONSTRAINT pab_scope_uq
        UNIQUE (tenant_id, company_code_id, supplier_id, currency_code);
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists with correct definition
END $$;

-- Currency length check (3-char ISO codes; empty string tolerated until back-fill)
DO $$ BEGIN
    ALTER TABLE document.party_advance_balance
        ADD CONSTRAINT pab_currency_len
        CHECK (char_length(currency_code) = 3 OR currency_code = '');
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- §4  Indexes — drop and recreate ix_pab_company so currency_code is included
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ix_pab_supplier
    ON document.party_advance_balance (tenant_id, supplier_id);

-- Drop old 2-column version before recreating with currency_code
DROP INDEX IF EXISTS document.ix_pab_company;
CREATE INDEX ix_pab_company
    ON document.party_advance_balance (tenant_id, company_code_id, currency_code);

-- ──────────────────────────────────────────────────────────────────────────────
-- §5  Relax pta_deduction_needs_commitment
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE document.payment_term_application
    DROP CONSTRAINT IF EXISTS pta_deduction_needs_commitment;

COMMENT ON TABLE document.party_advance_balance IS
    'ARCHETYPE=BALANCE;SCOPE=T. Running advance/retention balance per '
    'supplier + company + currency. Populated on posted financial events only '
    '(invoice posting/reversal in advance-balance.service.ts).';
