-- 100_finance/200_document/004_purchase_order.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Order
--          (document.purchase_order)
-- Module: BUY (Buying)
-- Depends on: LookupDomain/document/purchase_order.sql
--             (domain: document.purchase_order_type)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'purchase_order', 'PO', 'purchase_order',
    'DOCUMENT', 'system', 'ent', 'view',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_order',
    'Purchase Order', 'Purchase Orders', 'shopping-cart', 'orange',
    '{"is_approvable":true,"has_workflow":true,"document_category":"purchasing","allow_on_behalf_of":false,"has_lines":true,"auto_number":true,"write_facade":"PurchaseOrderFacade","backing_source":"commitment+commitment_procurement"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_order'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (13 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',    'document_no',    'PO Number',         'text',    'one',         NULL::text,                              true,  true,  '{"max_length":50}'::jsonb,    10),
    ('order_type',     'order_type',     'Order Type',        'enum',    'one',         'document.purchase_order_type'::text,    true,  true,  NULL::jsonb,                   20),
    ('status',         'status',         'Status',            'lifecycle_state', 'one',  NULL::text,                              true,  true,  NULL::jsonb,                   30),
    ('supplier_id',    'supplier_id',    'Supplier',          'reference', 'one',         NULL::text,                              true,  true,  '{"ref_entity":"supplier"}'::jsonb, 40),
    ('order_date',     'order_date',     'Order Date',        'date',    'one',         NULL::text,                              true,  true,  NULL::jsonb,                   50),
    ('delivery_date',  'delivery_date',  'Expected Delivery', 'date',    'zero_or_one', NULL::text,                              false, true,  NULL::jsonb,                   60),
    ('currency_code',  'currency_code',  'Currency',          'text',    'one',         NULL::text,                              true,  true,  '{"max_length":3}'::jsonb,     70),
    ('total_amount',   'total_amount',   'Total Amount',      'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,            80),
    ('tax_amount',     'tax_amount',     'Tax Amount',        'decimal', 'zero_or_one', NULL::text,                              false, false, '{"min":0}'::jsonb,            90),
    ('payment_terms',  'payment_terms',  'Payment Terms',     'enum',    'zero_or_one', 'master.party_payment_terms'::text,      false, false, NULL::jsonb,                  100),
    ('delivery_site',  'delivery_site',  'Delivery Site',     'reference','zero_or_one', NULL::text,                              false, false, '{"ref_entity":"site"}'::jsonb, 110),
    ('buyer_id',       'buyer_id',       'Buyer',             'reference', 'zero_or_one', NULL::text,                              false, true,  '{"ref_entity":"principal"}'::jsonb, 120),
    ('notes',          'notes',          'Notes',             'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":1000}'::jsonb, 130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix data_type 'ref' → 'reference' on already-seeded rows ────────────────
UPDATE control.entity_field ef
SET data_type = 'reference'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'delivery_site'
  AND ef.data_type = 'ref';

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── Converge backing_type + write_facade for existing rows (idempotent) ───────
-- Required after document.purchase_order became a VIEW over
-- commitment + commitment_procurement. Write operations route through
-- PurchaseOrderFacade. 'view' is pre-seeded in entity.backing_type lookup.
UPDATE control.entity
SET backing_type = 'view',
    feature_flags = feature_flags
                    || '{"write_facade":"PurchaseOrderFacade","backing_source":"commitment+commitment_procurement"}'::jsonb
WHERE table_schema = 'document'
  AND table_name = 'purchase_order'
  AND tenant_id IS NULL
  AND (backing_type <> 'view' OR NOT (feature_flags ? 'write_facade'));

-- ── 4. display_config ─────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'document',
    'title_field',        'document_no',
    'subtitle_field',     'supplier_id',
    'list_columns',       '["document_no","status","supplier_id","order_date","delivery_date","total_amount","currency_code"]'::jsonb,
    'default_sort_field', 'order_date',
    'default_sort_order', 'desc',
    'status_field_names', '["status"]'::jsonb,
    'document_header', jsonb_build_object(
        'number_field',   'document_no',
        'status_field',   'status',
        'type_label',     'PURCHASE ORDER',
        'total_label',    'ORDER TOTAL',
        'date_label',     'ORDER DATE',
        'party_id_field', 'supplier_id',
        'amount_field',   'total_amount',
        'currency_field', 'currency_code',
        'date_field',     'order_date',
        'due_date_field', 'delivery_date'
    )
)
WHERE table_schema = 'document' AND table_name = 'purchase_order'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- Backfill the document renderer contract on already-seeded databases.
UPDATE control.entity
SET entity_class = 'DOCUMENT',
    feature_flags = CASE
            WHEN jsonb_typeof(feature_flags) = 'object' THEN feature_flags
            ELSE '{}'::jsonb
        END
        || jsonb_build_object(
            'is_approvable', true,
            'has_workflow', true,
            'has_lines', true,
            'write_facade', 'PurchaseOrderFacade',
            'backing_source', 'commitment+commitment_procurement'
        ),
    display_config =
        (COALESCE(display_config, '{}'::jsonb) - 'document_header')
        || jsonb_build_object(
            'detail_renderer', 'document',
            'title_field', 'document_no',
            'subtitle_field', 'supplier_id',
            'list_columns', '["document_no","status","supplier_id","order_date","delivery_date","total_amount","currency_code"]'::jsonb,
            'default_sort_field', 'order_date',
            'default_sort_order', 'desc',
            'status_field_names', '["status"]'::jsonb,
            'document_header',
                CASE
                    WHEN jsonb_typeof(display_config -> 'document_header') = 'object'
                    THEN display_config -> 'document_header'
                    ELSE '{}'::jsonb
                END
                || jsonb_build_object(
                    'number_field', 'document_no',
                    'status_field', 'status',
                    'type_label', 'PURCHASE ORDER',
                    'total_label', 'ORDER TOTAL',
                    'date_label', 'ORDER DATE',
                    'party_id_field', 'supplier_id',
                    'amount_field', 'total_amount',
                    'currency_field', 'currency_code',
                    'date_field', 'order_date',
                    'due_date_field', 'delivery_date'
                )
        ),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE table_schema = 'document'
  AND table_name = 'purchase_order'
  AND tenant_id IS NULL
  AND (
      entity_class IS DISTINCT FROM 'DOCUMENT'
      OR COALESCE(feature_flags ->> 'is_approvable', '') <> 'true'
      OR COALESCE(feature_flags ->> 'has_workflow', '') <> 'true'
      OR COALESCE(display_config ->> 'detail_renderer', '') <> 'document'
      OR COALESCE(display_config #>> '{document_header,status_field}', '') <> 'status'
  );

-- ── 5. Natural key ────────────────────────────────────────────────────────────
UPDATE control.entity
SET identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['document_no']::text[]), true)
WHERE table_schema = 'document' AND table_name = 'purchase_order'
  AND tenant_id IS NULL
  AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(identity_config->'natural_key_fields') = 'array' THEN identity_config->'natural_key_fields' ELSE '[]'::jsonb END), 0) = 0;
-- ── 6. Backfill: rename deprecated feature_flag key to canonical name ─────────
UPDATE control.entity
SET feature_flags = (feature_flags - 'has_line_items') || '{"has_lines":true}'::jsonb
WHERE table_schema = 'document' AND table_name = 'purchase_order'
  AND tenant_id IS NULL
  AND feature_flags ? 'has_line_items';
