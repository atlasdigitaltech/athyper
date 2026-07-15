-- Populates:
--   control.polymorphic_child_binding â€” parentâ†’child catalog used by
--                                       /api/document-runtime/binding/<code>/records/<parent_id>
--   control.document_lookup           â€” allow-listed codes used by
--                                       /api/document-runtime/lookup/<code>
-- PI child relations are still seeded in 043_control_entity_relation_contract.sql; this file removes the legacy
-- binding rows that used to duplicate them. Run after 042d_ap_purchase_invoice_contract.sql.

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- Â§1 PI polymorphic-child bindings

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
    -- PI â†’ PIL (regular FK binding via purchase_invoice_id)
    (
        'purchase_invoice__purchase_invoice_line',
        'purchase_invoice',
        'purchase_invoice_line',
        'fk',
        'purchase_invoice_id',
        NULL,
        NULL,
        NULL,
        'Purchase invoice â†’ line items (FK chain on purchase_invoice_id).',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- PI â†’ PC (polymorphic via source_doc_type = purchase_invoice_line +
    --         source_doc_id = invoice_id). The same binding fetches BOTH
    --         header-scope PC (source_line_id IS NULL) and line-scope PC
    --         (source_line_id = PIL.id) â€” surfaces split client-side per
    --         amendment 6 in useDocumentChildren.
    (
        'purchase_invoice__pricing_component',
        'purchase_invoice',
        'pricing_component',
        'polymorphic',
        NULL,
        'purchase_invoice_line',
        'source_doc_id',
        'source_line_id',
        'Purchase invoice pricing components (polymorphic). Single binding '
        'covers BOTH header-scope (source_line_id IS NULL) and line-scope '
        '(source_line_id = PIL.id) rows; UI splits via the headerScope vs '
        'byLineId slices in useDocumentChildren. metadata.record_filter '
        'excludes superseded history rows so the UI only shows active PCs.',
        'active',
        -- record_filter: BFF appends `filter.superseded_by_id=null` so the
        -- records API returns only active rows (superseded_by_id IS NULL).
        -- Without this filter, every Edit-as-supersession leaves a v1
        -- history row that shows alongside the v2 active row in the UI.
        '{"record_filter": {"superseded_by_id": "null"}}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- PI â†’ AD (polymorphic; line-scope only by construction â€”
    --         ad_source_type_chk restricts source_doc_type)
    (
        'purchase_invoice__accounting_distribution',
        'purchase_invoice',
        'accounting_distribution',
        'polymorphic',
        NULL,
        'purchase_invoice_line',
        'source_doc_id',
        'source_line_id',
        'Purchase invoice accounting distributions (polymorphic). Always '
        'line-scoped â€” no header-scope AD exists for PI per design plan.',
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

-- The child relation facts above have moved to control.entity_relation.
-- Delete these legacy rows after the historical upsert so re-running old
-- seed order does not leave a second source of truth behind.
DELETE FROM control.polymorphic_child_binding
 WHERE binding_code IN (
    'purchase_invoice__purchase_invoice_line',
    'purchase_invoice__pricing_component',
    'purchase_invoice__accounting_distribution'
 );


-- Â§2 PI document_lookup codes

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
    -- Charge drawer's condition-type picker. Server-authoritative filter
    -- forces term_type=charge + active status.
    (
        'pi_charge_condition_types',
        'condition_type',
        '{"term_type":"charge","status":"active"}'::jsonb,
        'Charge-kind condition types for the PI charge drawer. Server-'
        'authoritative filter pins term_type and status; callers may add '
        'extras but cannot widen the set.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- Tax drawer's condition-type writer value. Tax group is selected
    -- separately; the PC row still needs a condition_type_id FK.
    (
        'pi_tax_condition_types',
        'condition_type',
        '{"term_type":"tax","status":"active"}'::jsonb,
        'Tax-kind condition types for the PI tax drawer. Server-'
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
    ),
    -- WS-D: WHT drawer's condition-type picker. Mirrors pi_tax_condition_types
    -- but filters term_type='withholding'.
    (
        'pi_wht_condition_types',
        'condition_type',
        '{"term_type":"withholding","status":"active"}'::jsonb,
        'Withholding-kind condition types for the PI WHT drawer. Server pins '
        'term_type and status; callers cannot widen.',
        'active',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    -- WS-D: WHT drawer's tax-group picker. Returns the same set as
    -- pi_tax_groups; the client-side toWhtGroupOptions adapter filters
    -- to rows whose metadata advertises wht_basis + rate_schedule_id
    -- (populated by the per-tenant WHT tax_group seeds). This keeps the
    -- lookup contract simple while letting the seed layer mark which
    -- groups are WHT-compatible.
    (
        'pi_wht_groups',
        'tax_group',
        '{"status":"active"}'::jsonb,
        'Active tax groups for the PI WHT drawer. Server pins status=active; '
        'client adapter filters by metadata.wht_basis presence.',
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



