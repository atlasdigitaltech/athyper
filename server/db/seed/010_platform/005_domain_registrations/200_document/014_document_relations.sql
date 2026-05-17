-- 100_finance/200_document/006_document_relations.sql
-- Purpose: control.entity_relation rows for the three AP document entities:
--            purchase_invoice       (5 relations)
--            purchase_invoice_line  (3 relations)
--            accounting_distribution(4 relations)
-- Pattern: mirrors 004_entity_engine/070_entity_relations.sql — resolves
--          entity_version_id via JOIN on entity_code, so rows for entities
--          that do not exist yet are silently skipped (no error).
-- Depends on: 001_invoice.sql, 004_invoice_line.sql, 005_accounting_distribution.sql
-- Idempotent: ON CONFLICT (entity_version_id, name) DO UPDATE

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    cnt  int;
BEGIN

    -- Soft guard: skip silently if domain entities have not been seeded yet.
    IF NOT EXISTS (
        SELECT 1 FROM control.entity e
        WHERE e.entity_code = 'purchase_invoice' AND e.tenant_id IS NULL
    ) THEN
        RAISE NOTICE '006_document_relations: purchase_invoice entity not found — skipping';
        RETURN;
    END IF;

    INSERT INTO control.entity_relation
        (tenant_id, entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        NULL,
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES

        -- ── purchase_invoice ──────────────────────────────────────────────────
        --
        --  belongs_to supplier   : supplier_id → master.supplier
        --  belongs_to po         : commitment_id → document.purchase_order (optional)
        --  has_many   lines      : 1:N to purchase_invoice_line
        --  belongs_to journal    : ap_je_id → document.journal_entry (optional)
        --  has_many   snapshots  : 1:1 party + address + bank snapshots (cascade)
        --
        ('purchase_invoice', 'supplier',            'belongs_to', 'supplier',                'supplier_id',          'restrict'),
        ('purchase_invoice', 'purchase_order',     'belongs_to', 'purchase_order',           'commitment_id',        'set_null'),
        ('purchase_invoice', 'lines',              'has_many',   'purchase_invoice_line',    'purchase_invoice_id',  'cascade'),
        ('purchase_invoice', 'journal_entry',      'belongs_to', 'journal_entry',            'ap_je_id',             'set_null'),
        ('purchase_invoice', 'payment_term',       'belongs_to', 'payment_term',             'payment_term_id',      'set_null'),

        -- ── purchase_invoice_line ─────────────────────────────────────────────
        --
        --  belongs_to purchase_invoice : parent document (cascade delete)
        --  belongs_to commodity_category: drives accounting profile resolution
        --  has_many   distributions    : 1:N to accounting_distribution
        --                               (polymorphic — source_doc_type = PURCHASE_INVOICE_LINE)
        --
        ('purchase_invoice_line', 'purchase_invoice',   'belongs_to', 'purchase_invoice',        'purchase_invoice_id',  'cascade'),
        ('purchase_invoice_line', 'commodity_category', 'belongs_to', 'commodity_category',           'commodity_category_id',    'set_null'),
        ('purchase_invoice_line', 'distributions',      'has_many',   'accounting_distribution',  'source_line_id',       'cascade'),

        -- ── accounting_distribution ───────────────────────────────────────────
        --
        --  belongs_to purchase_invoice_line : source_line_id (polymorphic;
        --             only when source_doc_type = 'PURCHASE_INVOICE_LINE')
        --  belongs_to gl_account  : resolved GL account after posting
        --  belongs_to cost_center : dimension assignment
        --  belongs_to project     : dimension assignment
        --
        ('accounting_distribution', 'source_invoice_line', 'belongs_to', 'purchase_invoice_line', 'source_line_id',   'cascade'),
        ('accounting_distribution', 'gl_account',          'belongs_to', 'gl_account',             'gl_account_id',   'set_null'),
        ('accounting_distribution', 'cost_center',         'belongs_to', 'cost_center',            'cost_center_id',  'set_null'),
        ('accounting_distribution', 'project',             'belongs_to', 'project',                'project_id',      'set_null')

    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity         e  ON e.entity_code = r.entity AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id  = e.id
                                  AND ev.version_no  = 1
                                  AND ev.tenant_id   IS NULL
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET relation_kind = EXCLUDED.relation_kind,
           target_entity = EXCLUDED.target_entity,
           fk_field = EXCLUDED.fk_field,
           on_delete = EXCLUDED.on_delete,
           updated_at = now(),
           updated_by = v_su;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '006_document_relations: % rows upserted', cnt;

END $$;
