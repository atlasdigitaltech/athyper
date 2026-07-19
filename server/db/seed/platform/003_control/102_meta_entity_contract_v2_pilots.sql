-- Phase C/D pilot contracts: Journal Entry and Purchase Invoice.
--
-- This is the first authored v2 registry for the two pilot families.  It does
-- not copy display_config.  Legacy entity/field columns remain available to
-- the compatibility adapter during the smoke window, but the compiler's v2
-- contract owns identity, value semantics, relations, surfaces, operations,
-- lifecycle, numbering, and flow discovery for these entities.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM control.entity
         WHERE tenant_id IS NULL
           AND entity_code IN ('journal_entry', 'journal_line',
                              'purchase_invoice', 'purchase_invoice_line')
    ) THEN
        RAISE NOTICE '[102 pilot contracts] Journal Entry / Purchase Invoice entities are not seeded; skipping.';
        RETURN;
    END IF;
END $$;

-- C1/D1: explicit version-level identity, search, data, concurrency, and
-- storage owners.  These JSON objects are the v2 owner; no display_config
-- property is read or merged here.
UPDATE control.entity_version_contract c
   SET source_kind = 'explicit',
       contract_version = 2,
       identity_config = CASE e.entity_code
           WHEN 'journal_entry' THEN jsonb_build_object(
               'primary_key_field', 'id',
               'business_key_fields', jsonb_build_array('code'),
               'natural_key_fields', jsonb_build_array('document_no'),
                'display_identity', jsonb_build_object('title_field', 'code', 'subtitle_field', 'name'),
               'parent', NULL::jsonb,
               'identity_via', NULL::jsonb,
               'list_entity_code', NULL::jsonb,
               'duplicate_check', jsonb_build_object('enabled', false, 'fields', jsonb_build_array(), 'scope', 'tenant'),
               'replacement', NULL::jsonb
           )
           WHEN 'purchase_invoice' THEN jsonb_build_object(
               'primary_key_field', 'id',
               'business_key_fields', jsonb_build_array('code'),
               'natural_key_fields', jsonb_build_array('code'),
               'display_identity', jsonb_build_object('title_field', 'code', 'subtitle_field', 'supplier_invoice_number'),
               'parent', NULL::jsonb,
               'identity_via', NULL::jsonb,
               'list_entity_code', NULL::jsonb,
               'duplicate_check', jsonb_build_object('enabled', true, 'fields', jsonb_build_array('supplier_id', 'supplier_invoice_number'), 'scope', 'company'),
               'replacement', NULL::jsonb
           )
           WHEN 'journal_line' THEN jsonb_build_object(
               'primary_key_field', 'id', 'business_key_fields', jsonb_build_array(),
               'natural_key_fields', jsonb_build_array(),
               'display_identity', jsonb_build_object('title_field', 'id', 'subtitle_field', NULL::jsonb),
               'parent', jsonb_build_object('relation', 'journal_entry'),
               'identity_via', NULL::jsonb, 'list_entity_code', NULL::jsonb,
               'duplicate_check', jsonb_build_object('enabled', false, 'fields', jsonb_build_array(), 'scope', 'tenant'),
               'replacement', NULL::jsonb
           )
           ELSE jsonb_build_object(
               'primary_key_field', 'id', 'business_key_fields', jsonb_build_array(),
               'natural_key_fields', jsonb_build_array(),
               'display_identity', jsonb_build_object('title_field', 'id', 'subtitle_field', NULL::jsonb),
               'parent', jsonb_build_object('relation', 'purchase_invoice'),
               'identity_via', NULL::jsonb, 'list_entity_code', NULL::jsonb,
               'duplicate_check', jsonb_build_object('enabled', false, 'fields', jsonb_build_array(), 'scope', 'tenant'),
               'replacement', NULL::jsonb
           )
       END,
       search_config = CASE e.entity_code
           WHEN 'journal_entry' THEN jsonb_build_object(
               'enabled', true, 'mode', 'both',
               'fields', jsonb_build_array(
                   jsonb_build_object('field', 'code', 'weight', 100),
                   jsonb_build_object('field', 'name', 'weight', 80),
                   jsonb_build_object('field', 'description', 'weight', 40)
               ), 'minimum_query_length', 2, 'operator', 'contains'
           )
           WHEN 'purchase_invoice' THEN jsonb_build_object(
               'enabled', true, 'mode', 'both',
               'fields', jsonb_build_array(
                   jsonb_build_object('field', 'code', 'weight', 100),
                   jsonb_build_object('field', 'supplier_invoice_number', 'weight', 90)
               ), 'minimum_query_length', 2, 'operator', 'contains'
           )
           ELSE jsonb_build_object('enabled', false, 'mode', 'server', 'fields', jsonb_build_array(), 'minimum_query_length', 2, 'operator', 'contains')
       END,
       data_policy = jsonb_build_object(
           'classification', 'internal',
           'retention', jsonb_build_object('days', NULL::integer, 'legal_hold_eligible', true),
           'deletion', jsonb_build_object('anonymize', false),
           'pii_fields', jsonb_build_array()
       ),
       concurrency_config = jsonb_build_object(
           'strategy', 'none', 'rollout', 'observe', 'row_version_field', NULL::jsonb, 'lock_required', false
       ),
       storage_config = jsonb_build_object(
           'discriminator', NULL::jsonb, 'partition', NULL::jsonb,
           'external_source', NULL::jsonb, 'indexes', jsonb_build_array()
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE c.entity_version_id = ev.id
   AND c.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

-- C2/D2: relation structure is canonicalized before fields receive reference
-- type contracts.  A has_many relation owns line/distribution mutation; a
-- belongs_to relation is read-only structure resolved by the records service.
UPDATE control.entity_relation er
   SET relation_code = lower(er.name),
       target_entity_code = lower(er.target_entity),
       source_field = CASE WHEN er.relation_kind = 'belongs_to' THEN er.fk_field ELSE NULL END,
       target_field = COALESCE(er.target_field, er.target_key, 'id'),
       polymorphic_type_field = CASE WHEN er.resolution_kind = 'polymorphic' THEN er.source_type_field ELSE NULL END,
       polymorphic_type_value = CASE WHEN er.resolution_kind = 'polymorphic' THEN er.source_type_value ELSE NULL END,
       polymorphic_id_field = CASE WHEN er.resolution_kind = 'polymorphic' THEN er.source_id_field ELSE NULL END,
       mutation_owner = CASE WHEN er.relation_kind IN ('has_many', 'm2m') THEN 'workspace' ELSE 'read_only' END,
       mutation_permissions = CASE WHEN er.relation_kind IN ('has_many', 'm2m') THEN ARRAY['update']::text[] ELSE ARRAY[]::text[] END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE er.entity_version_id = ev.id
   AND er.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

-- Start every pilot field from a strict scalar contract, then apply the
-- discriminated reference/enum/temporal/money/json contracts below.
UPDATE control.entity_field ef
   SET type_config = jsonb_build_object('kind', 'scalar'),
       semantic_roles = ARRAY[]::text[],
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

-- D3: reference labels are data identity, not UI display_config.  Supplier
-- deliberately resolves to supplier_code because the supplier role table has
-- no name column; its business-partner identity is an outer relation concern.
UPDATE control.entity_field ef
   SET type_config = jsonb_build_object(
       'kind', 'reference',
       'relation', er.relation_code,
       'display', jsonb_build_object(
           'label_field', CASE er.relation_code
               WHEN 'supplier' THEN 'supplier_code'
               WHEN 'company_code' THEN 'name'
               WHEN 'purchase_order' THEN 'code'
               WHEN 'payment_term' THEN 'name'
               WHEN 'journal_entry' THEN 'code'
               WHEN 'gl_account' THEN 'name'
               ELSE 'name'
           END,
           'format', 'label'
       )
   ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
  JOIN control.entity_relation er ON er.entity_version_id = ev.id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND er.tenant_id IS NULL
   AND er.relation_kind = 'belongs_to'
   AND er.source_field = ef.name
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

UPDATE control.entity_field ef
   SET type_config = jsonb_build_object('kind', 'enum', 'domain_code', ef.enum_domain_code)
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
   AND ef.data_type = 'enum'
   AND ef.enum_domain_code IS NOT NULL;

UPDATE control.entity_field ef
   SET type_config = jsonb_build_object(
       'kind', 'temporal',
       'temporal_kind', CASE WHEN ef.data_type = 'date' THEN 'businessDate' ELSE 'instant' END,
       'display_mode', CASE WHEN ef.data_type = 'date' THEN 'date' ELSE 'dateTime' END,
       'affects_posting_period', ef.name IN ('posting_date', 'entry_date')
   )
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
   AND ef.data_type IN ('date', 'datetime', 'timestamp', 'timestamptz');

UPDATE control.entity_field ef
   SET type_config = jsonb_build_object(
       'kind', 'money',
       'currency', jsonb_build_object('source', 'field', 'field',
           CASE WHEN e.entity_code IN ('journal_entry', 'journal_line') THEN
               CASE WHEN EXISTS (
                   SELECT 1 FROM control.entity_field currency_field
                    WHERE currency_field.entity_version_id = ef.entity_version_id
                      AND currency_field.name = 'transaction_currency'
               ) THEN 'transaction_currency' ELSE 'currency_code' END
           ELSE 'currency_code' END),
       'minor_units', 4
   ),
       semantic_roles = CASE
           WHEN ef.name IN ('total_debit', 'total_credit', 'total_amount', 'gross_amount')
             THEN ARRAY['money.primary_amount']::text[]
           ELSE ARRAY[]::text[]
       END
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND (
       (e.entity_code = 'journal_entry' AND ef.name IN ('total_debit', 'total_credit'))
       OR (e.entity_code = 'journal_line' AND ef.name IN ('transaction_debit', 'transaction_credit', 'base_debit', 'base_credit'))
       OR (e.entity_code = 'purchase_invoice' AND ef.name IN ('total_amount', 'tax_amount', 'withholding_tax_amount', 'paid_amount', 'payable_amount', 'advance_deduction_amount', 'retention_amount', 'outstanding_amount'))
       OR (e.entity_code = 'purchase_invoice_line' AND ef.name IN ('unit_price', 'net_amount', 'discount_amount', 'tax_amount', 'gross_amount'))
   );

UPDATE control.entity_field ef
   SET semantic_roles = ARRAY['money.currency']::text[]
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
   AND ef.name IN ('transaction_currency', 'base_currency', 'currency_code', 'base_currency_code');

UPDATE control.entity_field ef
   SET type_config = jsonb_build_object('kind', 'json', 'schema_key', ef.name)
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
   AND ef.data_type IN ('json', 'jsonb');

-- C3/D4: rebuild the pilot surfaces from v2 surface declarations.  The old
-- entity-scoped rows are removed only for these four pilot entities; all other
-- entities remain on the compatibility projection until their own pilot.
DELETE FROM control.entity_field_surface efs
 WHERE efs.entity_surface_id IN (
     SELECT es.id
       FROM control.entity_surface es
       JOIN control.entity e ON e.id = es.entity_id
      WHERE es.tenant_id IS NULL
        AND e.tenant_id IS NULL
        AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
 );

DELETE FROM control.entity_surface es
 USING control.entity e
 WHERE es.entity_id = e.id
   AND es.tenant_id IS NULL
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

WITH definitions(entity_code, surface_key, mode, kind, v2_mode, v2_kind, renderer_key, label, sort_order, config) AS (
    VALUES
      ('journal_entry', 'list',        'list',  'list',                    'list',           'TABLE',      'table',      'Journal Entries', 10, jsonb_build_object('default_surface','table','available_surfaces',jsonb_build_array('table','compact_card','spreadsheet'),'features',jsonb_build_object('saved_views',true,'column_customization',true,'grouping',true,'multi_sort',true,'max_sort_levels',3,'max_page_size',200))),
      ('journal_entry', 'spreadsheet', 'list',  'list',                    'spreadsheet',    'TABLE',      'spreadsheet', 'Journal Spreadsheet', 11, jsonb_build_object('features',jsonb_build_object('column_customization',true,'multi_sort',true))),
      ('journal_entry', 'mobile',      'list',  'list',                    'compact_card',   'CARDS',      'compact_card', 'Journal Mobile', 12, jsonb_build_object('renderer_config',jsonb_build_object('density','compact'))),
      ('journal_entry', 'detail',      'view',  'document_identity_summary','detail',        'DETAIL',     'document',   'Journal Entry', 20, jsonb_build_object('renderer_config',jsonb_build_object('archetype','document_with_items'))),
      ('journal_entry', 'lines',       'view',  'document_lines',            'detail',        'COLLECTION', 'line_items', 'Line Items', 30, jsonb_build_object('renderer_config',jsonb_build_object('relation','lines','line_editor',true))),
      ('journal_entry', 'lifecycle',   'view',  'lifecycle',                 'detail',        'CUSTOM',     'lifecycle',  'Lifecycle', 40, jsonb_build_object()),
      ('journal_entry', 'workflow',    'view',  'workflow',                  'detail',        'CUSTOM',     'workflow',   'Workflow', 50, jsonb_build_object()),
      ('journal_entry', 'create',      'create', 'fields',                   'create',        'FORM',       'form',       'Create Journal Entry', 60, jsonb_build_object()),
      ('journal_entry', 'edit',        'edit',   'fields',                   'edit',         'FORM',       'form',       'Edit Journal Entry', 70, jsonb_build_object()),
      ('journal_entry', 'print',       'print',  'print',                     'print',        'PRINT',      'print',      'Print Journal Entry', 80, jsonb_build_object()),
      ('journal_line',  'line_editor', 'edit',   'line_items',               'line_editor',  'COLLECTION', 'line_editor', 'Journal Line Editor', 10, jsonb_build_object('renderer_config',jsonb_build_object('parent_relation','journal_entry'))),
      ('purchase_invoice', 'list',        'list',  'list',                    'list',           'TABLE',      'table',       'Purchase Invoices', 10, jsonb_build_object('default_surface','table','available_surfaces',jsonb_build_array('table','compact_card','spreadsheet'),'features',jsonb_build_object('saved_views',true,'column_customization',true,'grouping',true,'multi_sort',true,'max_sort_levels',3,'max_page_size',200))),
      ('purchase_invoice', 'spreadsheet', 'list',  'list',                    'spreadsheet',    'TABLE',      'spreadsheet', 'Invoice Spreadsheet', 11, jsonb_build_object('features',jsonb_build_object('column_customization',true,'multi_sort',true))),
      ('purchase_invoice', 'mobile',      'list',  'list',                    'compact_card',   'CARDS',      'compact_card', 'Invoice Mobile', 12, jsonb_build_object('renderer_config',jsonb_build_object('density','compact'))),
      ('purchase_invoice', 'detail',      'view',  'document_identity_summary','detail',        'DETAIL',     'document',    'Purchase Invoice', 20, jsonb_build_object('renderer_config',jsonb_build_object('archetype','document_with_items'))),
      ('purchase_invoice', 'lines',       'view',  'document_lines',           'detail',        'COLLECTION', 'line_items',  'Invoice Lines', 30, jsonb_build_object('renderer_config',jsonb_build_object('relation','lines','line_editor',true,'line_entity','purchase_invoice_line'))),
      ('purchase_invoice', 'accounting',  'view',  'document_accounting',      'detail',        'CUSTOM',     'accounting',  'Accounting Distribution', 35, jsonb_build_object('renderer_config',jsonb_build_object('relation','accounting_distributions','editable',true))),
      ('purchase_invoice', 'matching',    'view',  'document_matching_panel',  'detail',        'CUSTOM',     'matching',    'Matching', 36, jsonb_build_object('renderer_config',jsonb_build_object('relation','lines'))),
      ('purchase_invoice', 'lifecycle',   'view',  'lifecycle',                'detail',        'CUSTOM',     'lifecycle',   'Lifecycle', 40, jsonb_build_object()),
      ('purchase_invoice', 'workflow',    'view',  'workflow',                 'detail',        'CUSTOM',     'workflow',    'Workflow', 50, jsonb_build_object()),
      ('purchase_invoice', 'create',      'create', 'fields',                  'create',        'FORM',       'form',        'Create Purchase Invoice', 60, jsonb_build_object()),
      ('purchase_invoice', 'edit',        'edit',   'fields',                  'edit',         'FORM',       'form',        'Edit Purchase Invoice', 70, jsonb_build_object()),
      ('purchase_invoice', 'print',       'print',  'print',                   'print',        'PRINT',      'print',       'Print Purchase Invoice', 80, jsonb_build_object()),
      ('purchase_invoice_line', 'line_editor', 'edit', 'line_items',           'line_editor',  'COLLECTION', 'line_editor', 'Invoice Line Editor', 10, jsonb_build_object('renderer_config',jsonb_build_object('parent_relation','purchase_invoice','accounting_distribution_relation','distributions')))
)
INSERT INTO control.entity_surface (
    tenant_id, entity_id, entity_version_id, mode, surface_key, kind, placement,
    label, renderer_key, sort_order, is_enabled, config, created_by,
    v2_mode, v2_kind
)
SELECT NULL, e.id, ev.id, d.mode, d.surface_key, d.kind, 'main', d.label,
       d.renderer_key, d.sort_order, true, d.config,
       '00000000-0000-0000-0000-000000000000', d.v2_mode, d.v2_kind
  FROM definitions d
  JOIN control.entity e ON e.entity_code = d.entity_code AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL AND ev.version_no = 1;

WITH bindings(entity_code, surface_key, field_name, sort_order) AS (
    VALUES
      ('journal_entry','list','code',10), ('journal_entry','list','name',20), ('journal_entry','list','status',30), ('journal_entry','list','posting_date',40), ('journal_entry','list','total_debit',50), ('journal_entry','list','total_credit',60),
      ('journal_entry','spreadsheet','code',10), ('journal_entry','spreadsheet','name',20), ('journal_entry','spreadsheet','status',30), ('journal_entry','spreadsheet','posting_date',40), ('journal_entry','spreadsheet','total_debit',50), ('journal_entry','spreadsheet','total_credit',60),
      ('journal_entry','mobile','code',10), ('journal_entry','mobile','name',20), ('journal_entry','mobile','status',30), ('journal_entry','mobile','total_debit',40), ('journal_entry','mobile','total_credit',50),
      ('journal_entry','detail','code',10), ('journal_entry','detail','name',20), ('journal_entry','detail','company_code_id',30), ('journal_entry','detail','document_date',40), ('journal_entry','detail','posting_date',50), ('journal_entry','detail','transaction_currency',60), ('journal_entry','detail','description',70),
      ('journal_entry','create','code',10), ('journal_entry','create','name',20), ('journal_entry','create','company_code_id',30), ('journal_entry','create','book_id',40), ('journal_entry','create','fiscal_period_id',50), ('journal_entry','create','document_date',60), ('journal_entry','create','posting_date',70), ('journal_entry','create','transaction_currency',80), ('journal_entry','create','description',90),
      ('journal_entry','edit','code',10), ('journal_entry','edit','name',20), ('journal_entry','edit','company_code_id',30), ('journal_entry','edit','book_id',40), ('journal_entry','edit','fiscal_period_id',50), ('journal_entry','edit','document_date',60), ('journal_entry','edit','posting_date',70), ('journal_entry','edit','transaction_currency',80), ('journal_entry','edit','description',90),
      ('journal_line','line_editor','line_no',10), ('journal_line','line_editor','gl_account_id',20), ('journal_line','line_editor','transaction_debit',30), ('journal_line','line_editor','transaction_credit',40), ('journal_line','line_editor','description',50),
      ('purchase_invoice','list','code',10), ('purchase_invoice','list','supplier_id',20), ('purchase_invoice','list','supplier_invoice_number',30), ('purchase_invoice','list','supplier_invoice_date',40), ('purchase_invoice','list','posting_date',50), ('purchase_invoice','list','total_amount',60), ('purchase_invoice','list','tax_amount',70), ('purchase_invoice','list','status',80),
      ('purchase_invoice','spreadsheet','code',10), ('purchase_invoice','spreadsheet','supplier_id',20), ('purchase_invoice','spreadsheet','supplier_invoice_number',30), ('purchase_invoice','spreadsheet','supplier_invoice_date',40), ('purchase_invoice','spreadsheet','posting_date',50), ('purchase_invoice','spreadsheet','total_amount',60), ('purchase_invoice','spreadsheet','tax_amount',70), ('purchase_invoice','spreadsheet','status',80),
      ('purchase_invoice','mobile','code',10), ('purchase_invoice','mobile','supplier_id',20), ('purchase_invoice','mobile','total_amount',30), ('purchase_invoice','mobile','status',40),
      ('purchase_invoice','detail','code',10), ('purchase_invoice','detail','invoice_type',20), ('purchase_invoice','detail','company_code_id',30), ('purchase_invoice','detail','supplier_id',40), ('purchase_invoice','detail','supplier_invoice_number',50), ('purchase_invoice','detail','supplier_invoice_date',60), ('purchase_invoice','detail','posting_date',70), ('purchase_invoice','detail','currency_code',80), ('purchase_invoice','detail','total_amount',90), ('purchase_invoice','detail','tax_amount',100), ('purchase_invoice','detail','status',110),
      ('purchase_invoice','create','code',10), ('purchase_invoice','create','invoice_type',20), ('purchase_invoice','create','company_code_id',30), ('purchase_invoice','create','supplier_id',40), ('purchase_invoice','create','supplier_invoice_number',50), ('purchase_invoice','create','supplier_invoice_date',60), ('purchase_invoice','create','posting_date',70), ('purchase_invoice','create','currency_code',80), ('purchase_invoice','create','payment_term_id',90),
      ('purchase_invoice','edit','invoice_type',10), ('purchase_invoice','edit','company_code_id',20), ('purchase_invoice','edit','supplier_id',30), ('purchase_invoice','edit','supplier_invoice_number',40), ('purchase_invoice','edit','supplier_invoice_date',50), ('purchase_invoice','edit','posting_date',60), ('purchase_invoice','edit','currency_code',70), ('purchase_invoice','edit','payment_term_id',80),
      ('purchase_invoice_line','line_editor','line_no',10), ('purchase_invoice_line','line_editor','item_description',20), ('purchase_invoice_line','line_editor','quantity',30), ('purchase_invoice_line','line_editor','unit_price',40), ('purchase_invoice_line','line_editor','net_amount',50), ('purchase_invoice_line','line_editor','tax_amount',60), ('purchase_invoice_line','line_editor','gross_amount',70), ('purchase_invoice_line','line_editor','commodity_category_id',80)
)
INSERT INTO control.entity_field_surface (
    tenant_id, entity_surface_id, entity_field_id, visible_override,
    required_override, readonly_override, sort_order, density,
    renderer_config, created_by
)
SELECT NULL, es.id, ef.id, true, NULL, NULL, b.sort_order, NULL, '{}'::jsonb,
       '00000000-0000-0000-0000-000000000000'
  FROM bindings b
  JOIN control.entity e ON e.entity_code = b.entity_code AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL AND ev.version_no = 1
  JOIN control.entity_surface es ON es.entity_id = e.id AND es.entity_version_id = ev.id
                                  AND es.tenant_id IS NULL AND es.surface_key = b.surface_key
  JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.tenant_id IS NULL
                               AND ef.name = b.field_name AND ef.is_active = true
ON CONFLICT (tenant_id, entity_surface_id, entity_field_id) DO UPDATE
   SET visible_override = EXCLUDED.visible_override,
       sort_order = EXCLUDED.sort_order,
       updated_at = now(),
       updated_by = EXCLUDED.created_by;

-- C4/D5: normalize operation projections for the pilot versions.  The
-- operation rows remain shared permission rows; these columns are the v2
-- projection consumed by the compiler and execution descriptor.
UPDATE control.entity_operation eo
   SET entity_version_id = ev.id,
       operation_code = lower(eo.permission_code),
       label = COALESCE(eo.label, eo.label_override, eo.permission_code),
       record_required = COALESCE(eo.record_required, eo.is_record_required),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL AND ev.version_no = 1
 WHERE eo.tenant_id IS NULL
   AND eo.entity_name IN (e.entity_code, e.name, e.table_name)
   AND e.tenant_id IS NULL
   AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line');

-- C5/D6: pilot readiness assertions. These fail the seed rather than allowing
-- a partially canonical contract to reach the API server.
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM control.entity_version_contract c
      JOIN control.entity_version ev ON ev.id = c.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE c.tenant_id IS NULL AND ev.tenant_id IS NULL AND ev.version_no = 1
       AND e.tenant_id IS NULL
       AND e.entity_code IN ('journal_entry', 'journal_line', 'purchase_invoice', 'purchase_invoice_line')
       AND c.source_kind = 'explicit' AND c.contract_version = 2;
    IF v_count <> 4 THEN
        RAISE EXCEPTION '[102 pilot contracts] expected four explicit v2 version contracts, got %', v_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM control.entity_field ef
          JOIN control.entity_version ev ON ev.id = ef.entity_version_id
          JOIN control.entity e ON e.id = ev.entity_id
         WHERE e.entity_code = 'purchase_invoice'
           AND ef.name = 'supplier_id'
           AND ef.type_config = jsonb_build_object('kind','reference','relation','supplier','display',jsonb_build_object('label_field','supplier_code','format','label'))
    ) THEN
        RAISE EXCEPTION '[102 pilot contracts] Purchase Invoice supplier reference label contract is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM control.entity_field ef
          JOIN control.entity_version ev ON ev.id = ef.entity_version_id
          JOIN control.entity e ON e.id = ev.entity_id
         WHERE e.entity_code = 'purchase_invoice'
           AND ef.name = 'total_amount'
           AND ef.type_config->>'kind' = 'money'
           AND ef.type_config->'currency'->>'field' = 'currency_code'
    ) THEN
        RAISE EXCEPTION '[102 pilot contracts] Purchase Invoice money contract is missing';
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_relation er
      JOIN control.entity_version ev ON ev.id = er.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'purchase_invoice'
       AND er.name IN ('supplier', 'lines', 'accounting_distributions')
       AND er.relation_code IS NOT NULL
       AND er.target_entity_code IS NOT NULL;
    IF v_count <> 3 THEN
        RAISE EXCEPTION '[102 pilot contracts] Purchase Invoice relation graph is incomplete, got %', v_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM control.entity_surface es
        JOIN control.entity e ON e.id = es.entity_id
       WHERE e.entity_code = 'journal_entry' AND es.surface_key = 'lines'
         AND es.v2_mode = 'detail' AND es.v2_kind = 'COLLECTION'
    ) OR NOT EXISTS (
        SELECT 1 FROM control.entity_surface es
        JOIN control.entity e ON e.id = es.entity_id
       WHERE e.entity_code = 'purchase_invoice' AND es.surface_key = 'accounting'
         AND es.v2_mode = 'detail'
    ) THEN
        RAISE EXCEPTION '[102 pilot contracts] document line/accounting surfaces are incomplete';
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_numbering_config n
      JOIN control.entity e ON e.id = n.entity_id
     WHERE n.tenant_id IS NULL
       AND e.entity_code IN ('journal_entry', 'purchase_invoice')
       AND n.is_active = true;
    IF v_count <> 2 THEN
        RAISE EXCEPTION '[102 pilot contracts] expected Journal Entry and Purchase Invoice numbering configs, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_flow f
      JOIN control.entity_version ev ON ev.id = f.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code IN ('journal_entry', 'purchase_invoice')
       AND f.tenant_id IS NULL
       AND f.status = 'active';
    IF v_count < 2 THEN
        RAISE EXCEPTION '[102 pilot contracts] expected active Journal Entry and Purchase Invoice flows, got %', v_count;
    END IF;

    RAISE NOTICE '[102 pilot contracts] Journal Entry and Purchase Invoice v2 pilot registry is ready for smoke validation.';
END $$;
