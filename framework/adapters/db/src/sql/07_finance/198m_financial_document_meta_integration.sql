/* ============================================================================
   Athyper v2.2 — Financial Document Registry ↔ Meta Engine Integration

   Upgrades the financial document registry (198_financial_document_registry.sql)
   to integrate with the Athyper meta engine:

   1. fin.doc_status_mapping — Meta-driven canonical status mapping table
      replaces the hardcoded fin.map_canonical_status() function.
   2. entity_name column on fin.financial_document — links each row to its
      meta.entity registration by logical name.
   3. Updated triggers use the mapping table instead of hardcoded CASE logic.
   4. Backward-compatible: original CHECK constraints remain for data safety,
      but new doc types are added via mapping table rows (no DDL needed).

   Dependencies:
     - 198_financial_document_registry.sql (base table)
     - 300_meta_entity_registration.sql (meta.entity rows)
     - 317_seed_finance_document_lifecycles.sql (lifecycle definitions)
   ============================================================================ */

-- ============================================================================
-- 1. fin.doc_status_mapping — Meta-driven canonical status mapping
-- Replaces fin.map_canonical_status() with a data-driven lookup.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.doc_status_mapping (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name     text NOT NULL,           -- meta.entity.name (e.g., 'PurchaseInvoice')
    doc_type        varchar(30) NOT NULL,    -- financial_document.doc_type value
    source_status   varchar(30) NOT NULL,    -- status in the source table
    canonical_status varchar(20) NOT NULL,   -- normalized status for financial_document.status

    -- Ordering for ambiguous mappings (highest priority wins)
    priority        int NOT NULL DEFAULT 0,

    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL DEFAULT 'system',

    CONSTRAINT doc_status_mapping_uniq UNIQUE (entity_name, doc_type, source_status),
    CONSTRAINT doc_status_mapping_canonical_chk CHECK (
        canonical_status IN (
            'DRAFT','IN_REVIEW','APPROVED','POSTING_PENDING',
            'POSTED','PARTIALLY_SETTLED','SETTLED',
            'REVERSED','VOIDED','CANCELLED','FAILED'
        )
    )
);

COMMENT ON TABLE fin.doc_status_mapping IS
  'Meta-driven mapping from source table statuses to canonical financial document registry statuses. Replaces hardcoded fin.map_canonical_status() function.';

CREATE INDEX IF NOT EXISTS idx_doc_status_mapping_lookup
    ON fin.doc_status_mapping (entity_name, doc_type, source_status);

-- Seed mappings for existing document types
INSERT INTO fin.doc_status_mapping (entity_name, doc_type, source_status, canonical_status) VALUES
    -- Purchase Invoice
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'DRAFT',          'DRAFT'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'SUBMITTED',      'IN_REVIEW'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'APPROVED',       'APPROVED'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'POSTED',         'POSTED'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'PARTIALLY_PAID', 'PARTIALLY_SETTLED'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'PAID',           'SETTLED'),
    ('PurchaseInvoice', 'PURCHASE_INVOICE', 'CANCELLED',      'CANCELLED'),

    -- Payment Entry
    ('PaymentEntry', 'PAYMENT_ENTRY', 'DRAFT',       'DRAFT'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'SUBMITTED',   'IN_REVIEW'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'APPROVED',    'APPROVED'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'POSTED',      'POSTED'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'RECONCILED',  'SETTLED'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'CANCELLED',   'CANCELLED'),
    ('PaymentEntry', 'PAYMENT_ENTRY', 'VOIDED',      'VOIDED'),

    -- Manual Journal Entry
    ('ManualJournalEntry', 'JOURNAL_ENTRY', 'CREATED',  'DRAFT'),
    ('ManualJournalEntry', 'JOURNAL_ENTRY', 'POSTED',   'POSTED'),
    ('ManualJournalEntry', 'JOURNAL_ENTRY', 'REVERSED', 'REVERSED'),

    -- Credit Note (future)
    ('CreditNote', 'CREDIT_NOTE', 'DRAFT',     'DRAFT'),
    ('CreditNote', 'CREDIT_NOTE', 'SUBMITTED', 'IN_REVIEW'),
    ('CreditNote', 'CREDIT_NOTE', 'APPROVED',  'APPROVED'),
    ('CreditNote', 'CREDIT_NOTE', 'POSTED',    'POSTED'),
    ('CreditNote', 'CREDIT_NOTE', 'APPLIED',   'SETTLED'),
    ('CreditNote', 'CREDIT_NOTE', 'CANCELLED', 'CANCELLED'),

    -- Debit Note (future)
    ('DebitNote', 'DEBIT_NOTE', 'DRAFT',     'DRAFT'),
    ('DebitNote', 'DEBIT_NOTE', 'SUBMITTED', 'IN_REVIEW'),
    ('DebitNote', 'DEBIT_NOTE', 'APPROVED',  'APPROVED'),
    ('DebitNote', 'DEBIT_NOTE', 'POSTED',    'POSTED'),
    ('DebitNote', 'DEBIT_NOTE', 'CANCELLED', 'CANCELLED'),

    -- Accrual Document (future)
    ('AccrualDocument', 'ACCRUAL', 'DRAFT',    'DRAFT'),
    ('AccrualDocument', 'ACCRUAL', 'POSTED',   'POSTED'),
    ('AccrualDocument', 'ACCRUAL', 'REVERSED', 'REVERSED'),

    -- Reclass Document (future)
    ('ReclassDocument', 'RECLASS', 'DRAFT',    'DRAFT'),
    ('ReclassDocument', 'RECLASS', 'POSTED',   'POSTED'),
    ('ReclassDocument', 'RECLASS', 'REVERSED', 'REVERSED'),

    -- FX Revaluation (future)
    ('FxRevaluation', 'FX_REVALUATION', 'DRAFT',    'DRAFT'),
    ('FxRevaluation', 'FX_REVALUATION', 'POSTED',   'POSTED'),
    ('FxRevaluation', 'FX_REVALUATION', 'REVERSED', 'REVERSED'),

    -- IC Elimination (future)
    ('IcElimination', 'IC_ELIMINATION', 'DRAFT',    'DRAFT'),
    ('IcElimination', 'IC_ELIMINATION', 'POSTED',   'POSTED'),
    ('IcElimination', 'IC_ELIMINATION', 'REVERSED', 'REVERSED')

ON CONFLICT (entity_name, doc_type, source_status) DO NOTHING;


-- ============================================================================
-- 2. Add entity_name column to fin.financial_document
-- Links each registry row to its meta.entity registration.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'fin' AND table_name = 'financial_document' AND column_name = 'entity_name'
    ) THEN
        ALTER TABLE fin.financial_document
            ADD COLUMN entity_name text;

        COMMENT ON COLUMN fin.financial_document.entity_name IS
            'Logical entity key matching meta.entity.name. Links registry to meta engine.';

        CREATE INDEX IF NOT EXISTS idx_fin_doc_entity_name
            ON fin.financial_document (tenant_id, entity_name);
    END IF;
END $$;

-- Backfill entity_name from existing doc_type values
UPDATE fin.financial_document SET entity_name = CASE doc_type
    WHEN 'PURCHASE_INVOICE' THEN 'PurchaseInvoice'
    WHEN 'PAYMENT_ENTRY'    THEN 'PaymentEntry'
    WHEN 'JOURNAL_ENTRY'    THEN 'ManualJournalEntry'
    WHEN 'CREDIT_NOTE'      THEN 'CreditNote'
    WHEN 'DEBIT_NOTE'       THEN 'DebitNote'
    WHEN 'ACCRUAL'          THEN 'AccrualDocument'
    WHEN 'RECLASS'          THEN 'ReclassDocument'
    WHEN 'FX_REVALUATION'   THEN 'FxRevaluation'
    WHEN 'IC_ELIMINATION'   THEN 'IcElimination'
    ELSE doc_type  -- fallback for any unmapped types
END
WHERE entity_name IS NULL;


-- ============================================================================
-- 3. Meta-driven canonical status lookup function
-- Replaces the hardcoded fin.map_canonical_status() with a table-driven lookup.
-- Falls back to 'DRAFT' if no mapping found (preserves existing behavior).
-- ============================================================================
DROP FUNCTION IF EXISTS fin.map_canonical_status(text, text) CASCADE;
CREATE OR REPLACE FUNCTION fin.map_canonical_status(
    p_doc_type  text,
    p_source_status text
) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT COALESCE(
        (SELECT m.canonical_status
         FROM fin.doc_status_mapping m
         WHERE m.doc_type = p_doc_type
           AND m.source_status = p_source_status
         ORDER BY m.priority DESC
         LIMIT 1),
        'DRAFT'
    )
$$;

COMMENT ON FUNCTION fin.map_canonical_status(text, text) IS
    'Table-driven canonical status resolution. Reads from fin.doc_status_mapping. Falls back to DRAFT if unmapped.';


-- ============================================================================
-- 4. Updated triggers: populate entity_name on sync
-- ============================================================================

-- Purchase Invoice trigger — adds entity_name
DROP FUNCTION IF EXISTS fin.trg_sync_financial_document_invoice() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_sync_financial_document_invoice()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO fin.financial_document (
        tenant_id, doc_id, txn_id, doc_type, doc_no,
        entity_code, entity_name, source_module, source_table, source_ref_id,
        status, source_status,
        doc_date, posting_date,
        currency_code, total_amount,
        counterparty_type, counterparty_id,
        je_id, posted_at, posted_by,
        created_by, created_at, updated_by, updated_at
    ) VALUES (
        NEW.tenant_id,
        NEW.id,
        NEW.txn_id,
        'PURCHASE_INVOICE',
        NEW.invoice_number,
        NEW.entity_code,
        'PurchaseInvoice',                 -- meta.entity.name
        'finance.accounting',
        'fin.purchase_invoice',
        NEW.id,
        fin.map_canonical_status('PURCHASE_INVOICE', NEW.status),
        NEW.status,
        NEW.invoice_date,
        NEW.posting_date,
        NEW.currency_code,
        NEW.total_amount,
        'SUPPLIER',
        NEW.supplier_id,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
        status        = fin.map_canonical_status('PURCHASE_INVOICE', NEW.status),
        source_status = NEW.status,
        posting_date  = NEW.posting_date,
        total_amount  = NEW.total_amount,
        je_id         = NEW.je_id,
        posted_at     = NEW.posted_at,
        posted_by     = NEW.posted_by,
        updated_by    = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at    = NEW.updated_at,
        void_reason_code = CASE WHEN NEW.status = 'CANCELLED' THEN 'CANCELLED_BY_USER' ELSE null END;

    RETURN NEW;
END;
$$;

-- Payment Entry trigger — adds entity_name
DROP FUNCTION IF EXISTS fin.trg_sync_financial_document_payment() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_sync_financial_document_payment()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO fin.financial_document (
        tenant_id, doc_id, txn_id, doc_type, doc_no,
        entity_code, entity_name, source_module, source_table, source_ref_id,
        status, source_status,
        doc_date, posting_date,
        currency_code, total_amount,
        counterparty_type, counterparty_id,
        je_id, posted_at, posted_by,
        created_by, created_at, updated_by, updated_at
    ) VALUES (
        NEW.tenant_id,
        NEW.id,
        NEW.txn_id,
        'PAYMENT_ENTRY',
        NEW.payment_number,
        NEW.entity_code,
        'PaymentEntry',                         -- meta.entity.name
        'finance.payments',
        'fin.payment_entry',
        NEW.id,
        fin.map_canonical_status('PAYMENT_ENTRY', NEW.status),
        NEW.status,
        NEW.payment_date,
        NEW.payment_date,
        NEW.currency_code,
        NEW.total_amount,
        'SUPPLIER',
        NEW.supplier_id,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
        status        = fin.map_canonical_status('PAYMENT_ENTRY', NEW.status),
        source_status = NEW.status,
        total_amount  = NEW.total_amount,
        je_id         = NEW.je_id,
        posted_at     = NEW.posted_at,
        posted_by     = NEW.posted_by,
        updated_by    = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at    = NEW.updated_at,
        void_reason_code = CASE
            WHEN NEW.status = 'VOIDED' THEN 'VOIDED'
            WHEN NEW.status = 'CANCELLED' THEN 'CANCELLED_BY_USER'
            ELSE null
        END;

    RETURN NEW;
END;
$$;

-- Journal Entry trigger — adds entity_name
DROP FUNCTION IF EXISTS fin.trg_sync_financial_document_je() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_sync_financial_document_je()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_book_code varchar(20);
BEGIN
    IF NEW.doc_id = NEW.id OR NEW.doc_type LIKE 'MANUAL%' THEN
        BEGIN
            v_book_code := NEW.book_code;
        EXCEPTION WHEN undefined_column THEN
            v_book_code := null;
        END;

        INSERT INTO fin.financial_document (
            tenant_id, doc_id, txn_id, doc_type, doc_no,
            entity_code, entity_name, source_module, source_table, source_ref_id,
            status, source_status,
            doc_date, posting_date,
            currency_code, total_amount,
            counterparty_type, counterparty_id,
            je_id, book_code, posted_at, posted_by,
            created_by, created_at, updated_at
        ) VALUES (
            NEW.tenant_id,
            NEW.id,
            NEW.txn_id,
            'JOURNAL_ENTRY',
            NEW.je_number,
            NEW.entity_code,
            'ManualJournalEntry',               -- meta.entity.name
            'finance.accounting',
            'fin.journal_entry',
            NEW.id,
            fin.map_canonical_status('JOURNAL_ENTRY', NEW.status),
            NEW.status,
            NEW.posting_date,
            NEW.posting_date,
            NEW.currency_code,
            NEW.total_debit,
            'INTERNAL',
            null,
            NEW.id,
            v_book_code,
            NEW.posted_at,
            NEW.posted_by,
            NEW.posted_by,
            NEW.created_at,
            coalesce(NEW.posted_at, NEW.created_at)
        )
        ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
            status        = fin.map_canonical_status('JOURNAL_ENTRY', NEW.status),
            source_status = NEW.status,
            book_code     = v_book_code,
            posted_at     = NEW.posted_at,
            posted_by     = NEW.posted_by,
            updated_at    = coalesce(NEW.posted_at, now());
    END IF;

    RETURN NEW;
END;
$$;


-- ============================================================================
-- 5. Utility view: registry enriched with meta entity metadata
-- Joins financial_document with meta.entity for UI consumption.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_financial_document_enriched CASCADE;
CREATE OR REPLACE VIEW fin.v_financial_document_enriched AS
SELECT
    fd.*,
    me.module_id            AS meta_module_id,
    me.kind                 AS meta_entity_kind,
    me.governance_level     AS meta_governance_level,
    me.engine_tag           AS meta_engine_tag,
    me.entity_short         AS meta_entity_short,
    me.display_config       AS meta_display_config
FROM fin.financial_document fd
LEFT JOIN meta.entity me
    ON me.name = fd.entity_name
    AND me.tenant_id = fd.tenant_id;

COMMENT ON VIEW fin.v_financial_document_enriched IS
    'Financial document registry enriched with meta.entity metadata for UI rendering and governance queries.';
