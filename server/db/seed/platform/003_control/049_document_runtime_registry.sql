-- ============================================================================
-- Document-Runtime Registry Seeds (Cleanup Plan v5 — Sprint 3)
--
-- Populates:
--   control.polymorphic_child_binding — parent→child binding catalog
--                                       consumed by /api/document-runtime/
--                                       binding/<code>/records/<parent_id>
--   control.document_lookup           — allow-listed lookup codes consumed
--                                       by /api/document-runtime/lookup/<code>
--
-- This file currently seeds the Purchase Invoice trio of bindings:
--   purchase_invoice__purchase_invoice_line   (FK)
--   purchase_invoice__pricing_component       (polymorphic)
--   purchase_invoice__accounting_distribution (polymorphic)
--
-- And two PI lookups:
--   pi_discount_condition_types   (condition_type filtered to discount kind)
--   pi_tax_groups                 (active tax_group rows)
--
-- Sales Invoice / GR / SES bindings + lookups land in their own seed PRs
-- once those documents come online (proof-of-reuse per v5 §14 P8).
--
-- Depends on: control schema (01q_tables_document_runtime_registry.sql)
-- Run after: 042d_ap_purchase_invoice_contract.sql
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Polymorphic-child bindings (PI)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO control.polymorphic_child_binding (
    binding_code,
    parent_entity_code,
    child_entity_code,
    binding_kind,
    fk_field,
    source_doc_type_value,
    source_doc_id_field,
    source_line_id_field,
    description,
    status,
    metadata,
    created_by
)
VALUES
    -- PI → PIL (regular FK binding via purchase_invoice_id)
    (
        'purchase_invoice__purchase_invoice_line',
        'purchase_invoice',
        'purchase_invoice_line',
        'fk',
        'purchase_invoice_id',
        NULL,
        NULL,
        NULL,
        'Purchase invoice → line items (FK chain on purchase_invoice_id).',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- PI → PC (polymorphic via source_doc_type = PURCHASE_INVOICE_LINE +
    --         source_doc_id = invoice_id). The same binding fetches BOTH
    --         header-scope PC (source_line_id IS NULL) and line-scope PC
    --         (source_line_id = PIL.id) — surfaces split client-side per
    --         amendment 6 in useDocumentChildren.
    (
        'purchase_invoice__pricing_component',
        'purchase_invoice',
        'pricing_component',
        'polymorphic',
        NULL,
        'PURCHASE_INVOICE_LINE',
        'source_doc_id',
        'source_line_id',
        'Purchase invoice pricing components (polymorphic). Single binding '
        'covers BOTH header-scope (source_line_id IS NULL) and line-scope '
        '(source_line_id = PIL.id) rows; UI splits via the headerScope vs '
        'byLineId slices in useDocumentChildren.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- PI → AD (polymorphic; line-scope only by construction —
    --         ad_source_type_chk restricts source_doc_type)
    (
        'purchase_invoice__accounting_distribution',
        'purchase_invoice',
        'accounting_distribution',
        'polymorphic',
        NULL,
        'PURCHASE_INVOICE_LINE',
        'source_doc_id',
        'source_line_id',
        'Purchase invoice accounting distributions (polymorphic). Always '
        'line-scoped — no header-scope AD exists for PI per design plan.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    )
ON CONFLICT (binding_code) DO UPDATE
SET parent_entity_code      = EXCLUDED.parent_entity_code,
    child_entity_code       = EXCLUDED.child_entity_code,
    binding_kind            = EXCLUDED.binding_kind,
    fk_field                = EXCLUDED.fk_field,
    source_doc_type_value   = EXCLUDED.source_doc_type_value,
    source_doc_id_field     = EXCLUDED.source_doc_id_field,
    source_line_id_field    = EXCLUDED.source_line_id_field,
    description             = EXCLUDED.description,
    status                  = EXCLUDED.status,
    metadata                = EXCLUDED.metadata,
    updated_at              = now();


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Document lookup codes (PI)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO control.document_lookup (
    lookup_code,
    child_entity,
    base_filters,
    description,
    status,
    metadata,
    created_by
)
VALUES
    -- Discount drawer's condition-type picker. Server-authoritative filter
    -- forces term_type=discount + active status; caller can add their own
    -- extras but cannot widen this set.
    (
        'pi_discount_condition_types',
        'condition_type',
        '{"term_type":"discount","status":"active"}'::jsonb,
        'Discount-kind condition types for the PI discount drawer. Server-'
        'authoritative filter pins term_type and status; callers may add '
        'extras but cannot widen the set.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- Tax drawer's tax-group picker. Authoritative active filter.
    (
        'pi_tax_groups',
        'tax_group',
        '{"status":"active"}'::jsonb,
        'Active tax groups for the PI tax drawer. Server pins status=active.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    )
ON CONFLICT (lookup_code) DO UPDATE
SET child_entity            = EXCLUDED.child_entity,
    base_filters            = EXCLUDED.base_filters,
    description             = EXCLUDED.description,
    status                  = EXCLUDED.status,
    metadata                = EXCLUDED.metadata,
    updated_at              = now();

COMMIT;
