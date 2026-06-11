-- ============================================================================
-- 020z_field_group_purchase_invoice.sql
-- Field groups + per-field group_key assignments for purchase_invoice header.
--
-- Maps the canonical sections from docs/specs/purchase_invoice_field_design.md §2
-- to UI sections so the form renders in grouped panels instead of a flat grid
-- (resolves the [neon-descriptor-health] "groupedForms is enabled but no
-- fieldGroups are defined" warning).
--
-- Pattern: define new field_group rows, then UPDATE entity_field.group_key
-- per field. The runtime reads top-level group_key; legacy code also reads
-- ui_hint.group_key, so we set both for back-compat.
--
-- Depends on: 020_field_group.sql (base groups), 042_entity_field.sql (rows)
-- ============================================================================

-- ── 1) PI-specific field groups (idempotent) ────────────────────────────────
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('general',
     'General',
     'Invoice identity, classification, and source.',
     ARRAY['DOCUMENT'],
      50, 2, 'half'),

    ('parties',
     'Parties & Commitment',
     'Company code, supplier, and source commitment / PO link.',
     ARRAY['DOCUMENT'],
      60, 2, 'half'),

    ('currency',
     'Currency & FX',
     'Transaction currency, base currency, and exchange rate.',
     ARRAY['DOCUMENT'],
     580, 3, 'half'),

    ('amounts',
     'Amounts',
     'Header amounts: subtotal, discount, freight, misc, tax, WHT, advance, retention, totals.',
     ARRAY['DOCUMENT'],
     600, 3, 'half'),

    ('hold',
     'Hold',
     'Operational hold reason (visible only while status = on_hold).',
     ARRAY['DOCUMENT'],
     695, 1, 'full'),

    ('fiscal',
     'Fiscal Scope',
     'Fiscal year and posting period.',
     ARRAY['DOCUMENT'],
     710, 2, 'half'),

    ('payment',
     'Payment Terms',
     'Payment terms and method for settlement.',
     ARRAY['DOCUMENT'],
     720, 2, 'half'),

    ('annotations',
     'Notes & Tags',
     'Operational notes and tags. Editable through the active lifecycle.',
     ARRAY['DOCUMENT'],
     800, 1, 'full'),

    -- ── Conditional sections (visible based on invoice_type) ───────────────
    ('credit_note',
     'Credit Note Details',
     'Fields specific to credit-note invoices.',
     ARRAY['DOCUMENT'],
     750, 2, 'half'),

    ('debit_note',
     'Debit Note Details',
     'Fields specific to debit-note invoices.',
     ARRAY['DOCUMENT'],
     760, 2, 'half'),

    ('advance',
     'Advance Payment Details',
     'Fields specific to advance-payment invoices.',
     ARRAY['DOCUMENT'],
     770, 2, 'half'),

    ('retention_release',
     'Retention Release Details',
     'Fields specific to retention-release invoices.',
     ARRAY['DOCUMENT'],
     780, 2, 'half')

ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- ── 2) Per-field group_key assignment for purchase_invoice ─────────────────
-- Mirrors the matrix in docs/specs/purchase_invoice_field_design.md §2.
-- Sets both ef.group_key (top-level) and ef.ui_hint.group_key (legacy) so
-- whichever reader picks up first finds the same value.
WITH pi_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET group_key  = m.group_key,
       ui_hint    = COALESCE(ef.ui_hint, '{}'::jsonb)
                      || jsonb_build_object('group_key', m.group_key),
       updated_at = now()
  FROM (VALUES
    -- §2.1 General — identity, source, type
    ('document_no',              'general'),
    ('fiscal_document_number',   'general'),
    ('description',              'general'),
    ('invoice_source',           'general'),
    ('invoice_type',             'general'),
    ('is_reversal',              'general'),
    ('reversal_of_id',           'general'),

    -- §2.1 Parties — company code, supplier, commitment
    ('company_code_id',          'parties'),
    ('supplier_id',              'parties'),
    ('supplier_invoice_number',  'parties'),
    ('supplier_invoice_date',    'parties'),
    ('commitment_id',            'parties'),

    -- §2.2 Dates
    ('invoice_date',             'dates'),
    ('posting_date',             'dates'),
    ('received_date',            'dates'),
    ('baseline_date',            'dates'),
    ('due_date',                 'dates'),

    -- §2.3 Currency & FX
    ('currency_code',            'currency'),
    ('base_currency_code',       'currency'),
    ('exchange_rate',            'currency'),

    -- §2.4 Amounts
    ('discount_amount',          'amounts'),
    ('freight_amount',           'amounts'),
    ('misc_charges_amount',      'amounts'),
    ('total_amount',             'amounts'),
    ('net_amount',               'amounts'),
    ('payable_amount',           'amounts'),
    ('paid_amount',              'amounts'),
    ('outstanding_amount',       'amounts'),
    ('advance_deduction_amount', 'amounts'),
    ('retention_amount',         'amounts'),
    ('retention_pct',            'amounts'),

    -- §2.5 Tax
    ('tax_mode',                 'tax'),
    ('tax_mode_source',          'tax'),
    ('tax_amount',               'tax'),
    ('withholding_tax_amount',   'tax'),

    -- §2.6 Matching
    ('match_type',               'matching'),
    ('match_status',             'matching'),

    -- §2.6 Hold (conditional — visible only when status='on_hold')
    ('hold_reason',              'hold'),

    -- §2.7 Dimensions
    ('cost_center_id',           'dimensions'),
    ('profit_center_id',         'dimensions'),
    ('project_id',               'dimensions'),
    ('site_id',                  'dimensions'),
    ('budget_allocation_id',     'dimensions'),
    ('budget_check_result',      'dimensions'),

    -- §2.8 Fiscal scope
    ('fiscal_year',              'fiscal'),
    ('period_number',            'fiscal'),

    -- Payment terms & method
    ('payment_term_id',          'payment'),
    ('payment_method_id',        'payment'),

    -- §2.9 Annotations
    ('notes',                    'annotations'),
    ('tags',                     'annotations'),

    -- Conditional credit-note section
    ('credited_invoice_id',      'credit_note'),
    ('credit_reason',            'credit_note'),
    ('credit_reference',         'credit_note'),
    ('credit_note_date',         'credit_note'),
    ('credit_note_name',         'credit_note'),

    -- Conditional debit-note section
    ('debited_invoice_id',       'debit_note'),
    ('debit_reason',             'debit_note'),
    ('debit_note_number',        'debit_note'),
    ('debit_note_date',          'debit_note'),
    ('debit_note_name',          'debit_note'),

    -- Conditional advance section
    ('advance_type',             'advance'),
    ('recovery_method',          'advance'),
    ('advance_request_reference','advance'),
    ('advance_request_date',     'advance'),
    ('advance_name',             'advance'),

    -- Conditional retention-release section
    ('retention_invoice_id',     'retention_release'),
    ('release_type',             'retention_release'),
    ('application_strategy',     'retention_release'),
    ('release_request_reference','retention_release'),
    ('release_date',             'retention_release'),
    ('release_name',             'retention_release')
  ) AS m(field_name, group_key)
 WHERE ef.entity_version_id = (SELECT version_id FROM pi_version)
   AND ef.name = m.field_name;
