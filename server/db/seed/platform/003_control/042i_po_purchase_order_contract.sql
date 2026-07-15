-- ============================================================================
-- Purchase Order â€” logical field surface for document.purchase_order view.
--
-- Follows purchase_invoice conventions (042d):
--   Â§1 Ensure PI-shared field_groups exist (idempotent â€” PI seeds them first)
--   Â§2 Base entity_field INSERT (thin â€” name/label/data_type/cardinality/â€¦)
--   Â§3 group_key + ui_hint assignment
-- Reset the authoring fields after the broad view-projection cleanup above.
-- This makes the contract idempotent even when the generic field seed runs
-- before 042i and marks view columns read-only.
WITH editable_fields(name) AS (
    VALUES
        ('name'),
        ('order_type'),
        ('company_code_id'),
        ('party_id'),
        ('requested_by'),
        ('responsible_person_id'),
        ('document_date'),
        ('effective_date'),
        ('expiry_date'),
        ('currency_code'),
        ('base_currency_code'),
        ('exchange_rate'),
        ('fx_policy'),
        ('payment_term_id')
)
UPDATE control.entity_field ef
   SET is_read_only  = false,
       is_computed   = false,
       is_write_once = false,
       compute_mode  = NULL,
       visibility    = NULL,
       ui_type       = NULL,
       is_active     = true,
       updated_at    = now(),
       updated_by    = '00000000-0000-0000-0000-000000000000'
  FROM editable_fields f
  JOIN control.entity e
    ON e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = f.name;
--   Â§4 Editability gates       â€” {"editable_in_status":[â€¦], "reason":"â€¦"}
--   Â§5 Reference/lookup configs â€” ref_entity + company-code picker scope
--   Â§6 Read-only, computed, write-once flags
--   Â§7 Contract assertion
--
-- Physical DDL lives at server/db/ddl/document/{01c_tables_commitment.sql,07_views.sql}.
-- Run after 040/041/042/042d; before 043/044/046.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

UPDATE control.entity
   SET create_mode = 'EARLY_DRAFT',
       draft_ttl_hours = 24,
       numbering_strategy = 'AUTO_ON_PROMOTE',
       updated_at = now()
 WHERE tenant_id IS NULL
   AND entity_code = 'purchase_order';

-- §1 Base entity_field seeds (20 header fields) — now depends on shared group definitions from 020 and PI header contracts.


-- â”€â”€ Â§2 Base entity_field seeds (20 header fields) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.entity_field (
    entity_version_id,
    name,
    column_name,
    label,
    data_type,
    cardinality,
    origin,
    enum_domain_code,
    is_required,
    is_filterable,
    is_searchable,
    is_sortable,
    validation,
    sort_order,
    created_by
)
SELECT
    ev.id,
    f.name,
    f.column_name,
    f.label,
    f.data_type,
    f.cardinality,
    'standard',
    f.enum_domain_code,
    f.is_required,
    f.is_filterable,
    f.is_searchable,
    f.is_sortable,
    f.validation,
    f.sort_order,
    '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- â”€â”€â”€ Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('code',                 'code',                 'PO Number',           'text',            'one',         NULL::text,                           false, true,  true,  true,  '{"max_length":50}'::jsonb,  10),
    ('name',                 'name',                 'Name',                'text',            'one',         NULL::text,                           true,  true,  true,  true,  '{"max_length":200}'::jsonb, 20),
    ('status',               'status',               'Status',              'lifecycle_state', 'one',         NULL::text,                           true,  true,  false, true,  NULL::jsonb,                 30),

    -- â”€â”€â”€ General â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('order_type',           'order_type',           'Order Type',          'enum',            'one',         'document.purchase_order_type'::text, true,  true,  false, true,  NULL::jsonb,                 40),

    -- â”€â”€â”€ Parties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('company_code_id',      'company_code_id',      'Company Code',        'reference',       'one',         NULL::text,                           true,  true,  false, true,  '{"ref_entity":"company_code"}'::jsonb, 50),
    ('party_id',             'party_id',             'Supplier',            'reference',       'one',         NULL::text,                           true,  true,  true,  true,  '{"ref_entity":"supplier"}'::jsonb,     60),
    ('requested_by',         'requested_by',         'On Behalf Of',        'reference',       'one',         NULL::text,                           true,  true,  false, true,  '{"ref_entity":"principal"}'::jsonb,    70),
    ('responsible_person_id','responsible_person_id','Buyer',               'reference',       'zero_or_one', NULL::text,                           false, true,  false, true,  '{"ref_entity":"principal"}'::jsonb,    80),
    ('approved_by',          'approved_by',          'Approved By',         'reference',       'zero_or_one', NULL::text,                           false, true,  false, false, '{"ref_entity":"principal"}'::jsonb,    90),

    -- â”€â”€â”€ Dates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('document_date',        'document_date',        'Document Date',       'date',            'one',         NULL::text,                           true,  true,  false, true,  NULL::jsonb,                 100),
    ('effective_date',       'effective_date',       'Effective Date',      'date',            'one',         NULL::text,                           true,  true,  false, true,  NULL::jsonb,                 110),
    ('expiry_date',          'expiry_date',          'Expiry Date',         'date',            'zero_or_one', NULL::text,                           false, true,  false, true,  NULL::jsonb,                 120),

    -- â”€â”€â”€ Fiscal (derived from document_date; advisory) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('fiscal_year',          'fiscal_year',          'Fiscal Year',         'integer',         'zero_or_one', NULL::text,                           false, true,  false, true,  '{"min":1900,"max":9999}'::jsonb, 130),
    ('period_number',        'period_number',        'Period',              'integer',         'zero_or_one', NULL::text,                           false, true,  false, true,  '{"min":1,"max":16}'::jsonb,      140),

    -- â”€â”€â”€ Currency & FX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('currency_code',        'currency_code',        'Currency',            'text',            'one',         NULL::text,                           true,  true,  false, true,  '{"max_length":3}'::jsonb,   150),
    ('base_currency_code',   'base_currency_code',   'Base Currency',       'text',            'one',         NULL::text,                           true,  false, false, false, '{"max_length":3}'::jsonb,   160),
    ('exchange_rate',        'exchange_rate',        'Exchange Rate',       'numeric',         'zero_or_one', NULL::text,                           false, false, false, false, '{"min":0}'::jsonb,          170),
    ('fx_rate_snapshot',     'fx_rate_snapshot',     'FX Snapshot',         'json',            'zero_or_one', NULL::text,                           false, false, false, false, NULL::jsonb,                 180),
    ('fx_policy',            'fx_policy',            'FX Policy',           'text',            'one',         NULL::text,                           false, false, false, false, '{"max_length":32}'::jsonb,  190),

    -- â”€â”€â”€ Payment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('payment_term_id',      'payment_term_id',      'Payment Terms',       'reference',       'zero_or_one', NULL::text,                           false, true,  false, true,  '{"ref_entity":"payment_term"}'::jsonb, 200)
) AS f(
    name,
    column_name,
    label,
    data_type,
    cardinality,
    enum_domain_code,
    is_required,
    is_filterable,
    is_searchable,
    is_sortable,
    validation,
    sort_order
)
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_order'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name       = EXCLUDED.column_name,
    label             = EXCLUDED.label,
    data_type         = EXCLUDED.data_type,
    ui_type           = NULL,
    cardinality       = EXCLUDED.cardinality,
    origin            = EXCLUDED.origin,
    enum_domain_code  = EXCLUDED.enum_domain_code,
    enum_config       = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required       = EXCLUDED.is_required,
    is_filterable     = EXCLUDED.is_filterable,
    is_searchable     = EXCLUDED.is_searchable,
    is_sortable       = EXCLUDED.is_sortable,
    is_read_only      = false,
    is_computed       = false,
    is_write_once     = false,
    compute_mode      = NULL,
    visibility        = NULL,
    validation        = EXCLUDED.validation,
    sort_order        = EXCLUDED.sort_order,
    is_active         = true,
    updated_at        = now(),
    updated_by        = EXCLUDED.created_by;

-- Supplier identity is role-backed through supplier_app_index. Keep the PO
-- header reference contract aligned with the line-level supplier field.
UPDATE control.entity_field ef
   SET reference_config = jsonb_build_object(
         'target_entity', 'supplier',
         'target_field', 'id',
         'value_field', 'id',
         'label_field', 'name',
         'display_field', 'name',
         'code_field', 'supplier_code',
         'picker', jsonb_build_object('code_field', 'supplier_code', 'show_code', true)
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'party_id';


-- â”€â”€ Â§2b Purge legacy fields no longer part of the PO header contract â”€â”€â”€â”€â”€â”€â”€
-- (buyer_id, delivery_site, delivery_date, order_date, document_no, payment_terms,
--  supplier_id, tax_amount, total_amount, notes were on the prior 042i seed.)
DELETE FROM control.entity_field ef
USING control.entity_version ev,
      control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id         = e.id
  AND e.table_schema = 'document'
  AND e.table_name   = 'purchase_order'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
  AND ef.name IN (
      'document_no',
      'supplier_id',
      'order_date',
      'delivery_date',
      'total_amount',
      'tax_amount',
      'payment_terms',
      'delivery_site',
      'buyer_id',
      'notes'
  );


-- The generic DDL introspection seed sees document.purchase_order as a view over
-- document.commitment and may register projection/system columns such as
-- party_type, release_sequence_no, and fulfillment rollups. Keep those columns
-- available on the record row for header/identity/amount surfaces, but remove
-- them from the generic Details fields surface and workspace draft masks.
WITH po_contract_fields(name) AS (
    VALUES
        ('code'),
        ('name'),
        ('status'),
        ('order_type'),
        ('company_code_id'),
        ('party_id'),
        ('requested_by'),
        ('responsible_person_id'),
        ('approved_by'),
        ('document_date'),
        ('effective_date'),
        ('expiry_date'),
        ('fiscal_year'),
        ('period_number'),
        ('currency_code'),
        ('base_currency_code'),
        ('exchange_rate'),
        ('fx_rate_snapshot'),
        ('fx_policy'),
        ('payment_term_id')
)
UPDATE control.entity_field ef
   SET group_key    = NULL,
       is_required  = false,
       is_read_only = true,
       is_active    = CASE WHEN ef.name IN ('id','tenant_id') THEN true ELSE false END,
       visibility   = COALESCE(ef.visibility, '{}'::jsonb)
                      || jsonb_build_object('hidden', true),
       ui_hint      = COALESCE(ef.ui_hint, '{}'::jsonb)
                      || jsonb_build_object(
                          'hidden', true,
                          'display', jsonb_build_object('hidden', true)
                      ),
       editability  = jsonb_build_object(
           'editableOnCreate', false,
           'editableOnEdit',   false,
           'editable_in_status', to_jsonb(ARRAY[]::text[]),
           'reason', 'Projection/system field; not part of the purchase order authoring surface.'
       ),
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_order'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND NOT EXISTS (
       SELECT 1 FROM po_contract_fields pcf WHERE pcf.name = ef.name
   );
-- â”€â”€ Â§3 Field group assignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Every authoring field lands in a single 'general' section to reduce
-- vertical scroll on the Details tab. sort_order (set in Â§2) drives the
-- in-section ordering. If a caller wants sub-headings later, split by
-- introducing new group_keys â€” not by scattering across the current 7
-- generic groups.
UPDATE control.entity_field ef
   SET group_key  = 'purchase_order_general',
       ui_hint    = COALESCE(ef.ui_hint, '{}'::jsonb)
                    || jsonb_build_object('group_key', 'purchase_order_general'),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN (
       'code','name','status','order_type',
       'company_code_id','party_id','requested_by','responsible_person_id','approved_by',
       'document_date','effective_date','expiry_date',
       'fiscal_year','period_number',
       'currency_code','base_currency_code','exchange_rate','fx_rate_snapshot','fx_policy',
       'payment_term_id'
   );

-- â”€â”€ Â§3b Default `requested_by` and `responsible_person_id` to the acting
-- user on create. Runtime resolves `kind:'current_actor'` via
-- packages/shared/business-domain/cascade â†’ applyCascadeDefaults(..., session={actor_id}).
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind', 'current_actor',
             'apply_on', jsonb_build_array('create')
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN ('requested_by','responsible_person_id');


-- â”€â”€ Â§4 Editability gates (PI-parity encoding) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
WITH field_rules(field_name, allowed_statuses, reason) AS (
    VALUES
    ('name',                  ARRAY['draft'],                                        'Document name locks after submit.'),
    ('order_type',            ARRAY['draft'],                                        'Order type drives expiry-date requirement and workflow route; locked at submit.'),
    ('company_code_id',       ARRAY['draft'],                                        'Company code drives base currency and GL scope.'),
    ('party_id',              ARRAY['draft'],                                        'Supplier locks at submit; cascades default currency and payment terms.'),
    ('requested_by',          ARRAY['draft'],                                        'Requester locks at submit; defaults to created_by.'),
    ('responsible_person_id', ARRAY['draft','pending_approval'],                     'Responsible person can be reassigned while the PO is in flight.'),
    ('document_date',         ARRAY['draft'],                                        'Document date drives fiscal_year / period_number derivation.'),
    ('effective_date',        ARRAY['draft'],                                        'Effective date is the commitment start; locks at submit.'),
    ('expiry_date',           ARRAY['draft','pending_approval'],                     'Expiry date can be extended during review.'),
    ('currency_code',         ARRAY['draft'],                                        'Currency drives FX snapshot and tax engine (mirrors purchase_invoice).'),
    ('base_currency_code',    ARRAY['draft'],                                        'Base currency comes from the company code; only draft edits via re-scope.'),
    ('exchange_rate',         ARRAY['draft'],                                        'FX rate captured at submit; correction requires revise. commitment lifecycle has no rejected state.'),
    ('fx_policy',             ARRAY['draft'],                                        'FX policy drives downstream P2P documents.'),
    ('payment_term_id',       ARRAY['draft'],                                        'Payment terms drive due_date; locked after submit. commitment lifecycle has no rejected state.')
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
           'editable_in_status', to_jsonb(fr.allowed_statuses),
           'reason', fr.reason
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM field_rules fr
  JOIN control.entity e
    ON e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = fr.field_name;


-- â”€â”€ Â§5 Reference / picker configs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- FK-target metadata used by the reference picker and inline resolvers.
UPDATE control.entity_field ef
   SET reference_config = COALESCE(ef.reference_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'ref_entity',    'company_code',
                               'display_field', 'name',
                               'code_field',    'code'
                          ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'company_code_id';

UPDATE control.entity_field ef
   SET reference_config = COALESCE(ef.reference_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'ref_entity',    'supplier',
                               'display_field', 'name',
                               'code_field',    'code'
                          ),
       lookup_config    = COALESCE(ef.lookup_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'filters', jsonb_build_object('is_active', true)
                          ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'party_id';

UPDATE control.entity_field ef
   SET reference_config = COALESCE(ef.reference_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'ref_entity',    'payment_terms',
                               'display_field', 'name'
                          ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'payment_term_id';

-- Principal-typed fields: scope the picker to principals with access to the
-- selected company_code. Encoded in lookup_config so the runtime lookup handler
-- can perform the auth_group_role join (assignment_scope_type='company_code',
-- scope_ref_id = form.company_code_id).
-- ref_role_group_code is intentionally NOT set â€” deferred until the role
-- taxonomy for requester / buyer is finalised.
UPDATE control.entity_field ef
   SET reference_config = COALESCE(ef.reference_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'ref_entity',    'principal',
                               'display_field', 'name'
                          ),
       lookup_config    = COALESCE(ef.lookup_config, '{}'::jsonb)
                          || jsonb_build_object(
                               'scope', jsonb_build_object(
                                   'kind',         'company_code_access',
                                   'source_field', 'company_code_id'
                               )
                          ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN ('requested_by','responsible_person_id','approved_by');


-- â”€â”€ Â§6 Read-only / computed / write-once flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- code: numbering-service allocated; never user-editable on create/edit.
-- status: workflow-managed; badge only.
-- fiscal_year, period_number: trigger-derived from document_date.
-- fx_rate_snapshot: resolver-populated; audit surface.
-- approved_by: workflow-populated; hidden until set (see Â§7 visibility).
UPDATE control.entity_field ef
   SET is_read_only = true,
       editability  = jsonb_build_object(
           'editableOnCreate', false,
           'editableOnEdit',   false,
           'editable_in_status', to_jsonb(ARRAY[]::text[]),
           'reason', 'System-managed field.'
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN ('code','status','fiscal_year','period_number','fx_rate_snapshot','approved_by');

UPDATE control.entity_field ef
   SET is_computed  = true,
       compute_mode = 'trigger',
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN ('fiscal_year','period_number');


-- â”€â”€ Â§6a P5 party_config on entity.feature_flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Declares the polymorphic-party projection for the purchase_order view so
-- callers can derive the (party_type, party_field) discriminator + the
-- target entity of the party pointer from metadata instead of hardcoding
-- 'SUPPLIER' / 'party_id' / 'supplier' literals.
UPDATE control.entity e
   SET feature_flags = COALESCE(e.feature_flags, '{}'::jsonb)
                       || jsonb_build_object(
                            'party_config', jsonb_build_object(
                                'discriminator_field', 'party_type',
                                'discriminator_value', 'SUPPLIER',
                                'party_field',         'party_id',
                                'party_target',        'supplier'
                            )
                       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL;


-- â”€â”€ Â§6b P5 primary-field markers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- currency_code is the header's canonical transaction currency; drives the
-- shared line-item runtime detectCurrencyField() replacement.
UPDATE control.entity_field ef
   SET is_primary_currency = true,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'currency_code';


-- â”€â”€ Â§6b2 Supplier-cascade defaults for currency + payment terms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Mirrors the PI pattern (042d Â§12). When the user picks a supplier
-- (party_id + party_type='SUPPLIER' on PO), currency_code and payment_term_id
-- rederive from the supplier's company-code profile via the shared resolvers
-- registered in server/db/seed/_generated/resolver-contracts.json. Users can
-- override; a warn fires if they change supplier / company_code after an
-- explicit override.

-- payment_term_id â€” rederive from supplier default
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources',  jsonb_build_array('party_id'),
            'action',   'rederive',
            'mode',     'if_empty_or_derived',
            'resolver', 'supplier.default_payment_term',
            'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
            'message',  'Filled from supplier default'
          ),
          jsonb_build_object(
            'sources', jsonb_build_array('party_id'),
            'action',  'warn',
            'layers',  jsonb_build_array('client_on_change'),
            'when',    jsonb_build_object('target_was_user_overridden', true),
            'message', 'Supplier changed â€” verify payment term'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'payment_term_id';

-- currency_code â€” rederive from (supplier, company_code) profile
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources',  jsonb_build_array('party_id', 'company_code_id'),
            'action',   'rederive',
            'mode',     'if_empty_or_derived',
            'resolver', 'supplier.default_currency',
            'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
            'message',  'Filled from supplier company-code profile'
          ),
          jsonb_build_object(
            'sources', jsonb_build_array('party_id', 'company_code_id'),
            'action',  'warn',
            'layers',  jsonb_build_array('client_on_change'),
            'when',    jsonb_build_object('target_was_user_overridden', true),
            'message', 'Supplier or company code changed â€” verify currency'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'currency_code';


-- â”€â”€ Â§6c Hide fields already surfaced by the header bar / KPI strip â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- These fields render in the document header composer (PO Number badge,
-- status pill, fiscal_year / period chips, total_amount emphasized card) so
-- repeating them in the Details form is visual noise. They remain on the
-- record and stay readable via the runtime API â€” only their form surface is
-- suppressed via visibility.hideIn.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit", "detail"]}'::jsonb,
       ui_hint    = COALESCE(ef.ui_hint, '{}'::jsonb)
                    || jsonb_build_object(
                        'display', jsonb_build_object('hide_in', to_jsonb(ARRAY['create','edit','detail']))
                    ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name IN (
       'code',              -- PO Number â€” badge on the header bar
       'status',            -- Status pill on the header bar
       'fiscal_year',       -- KPI chip on the header bar
       'period_number',     -- KPI chip on the header bar
       'fx_rate_snapshot',  -- Rendered inline via fx_exchange_rate widget
       'fx_policy',         -- Contextual info in the FX widget popover
       'total_amount'       -- Emphasized card in amount_summary_fields
   );


-- â”€â”€ Â§7 Visibility rule for approved_by â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
UPDATE control.entity_field ef
   SET visibility = jsonb_build_object(
           'when', jsonb_build_object('field','approved_by','notNull',true)
       ),
       ui_hint    = COALESCE(ef.ui_hint, '{}'::jsonb)
                    || jsonb_build_object(
                        'display', jsonb_build_object(
                            'visible_when', jsonb_build_object('field','approved_by','notNull',true)
                        )
                    ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'purchase_order'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'approved_by';


-- â”€â”€ Â§7b Document-runtime surfaces (Phase B, seed-driven) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Declares the surfaces attached to the runtime descriptor by
-- buildDocumentRuntimeSurfaces() â€” identity summary is auto-appended
-- code-side for procurement entities.
UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'line_ui_variant', 'procure',
                             'line_entity_code', 'commitment_line',
                             'document_runtime', jsonb_build_object(
                                 'surfaces', jsonb_build_array(
                                     jsonb_build_object(
                                         'kind',      'document_lines',
                                         'key',       'purchase_order__document_lines',
                                         'label',     'Lines',
                                         'order',     1010,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'relations', jsonb_build_object(
                                                 'lines',             'lines',
                                                 'pricingComponents', 'pricing_components',
                                                 'distributions',     'accounting_distributions',
                                                 'schedules',         'schedules'
                                             ),
                                             'source_doc_type',                   'commitment_line',
                                             'condition_type_lookup_code',        'pi_discount_condition_types',
                                             'charge_condition_type_lookup_code', 'pi_charge_condition_types',
                                             'tax_condition_type_lookup_code',    'pi_tax_condition_types',
                                             'tax_group_lookup_code',             'pi_tax_groups',
                                             'wht_condition_type_lookup_code',    'pi_wht_condition_types',
                                             'wht_group_lookup_code',             'pi_wht_groups'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'kind',      'document_components',
                                         'key',       'purchase_order__document_components',
                                         'label',     'Components',
                                         'order',     1020,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'source_doc_type',                   'commitment_line',
                                             'condition_type_lookup_code',        'pi_discount_condition_types',
                                             'charge_condition_type_lookup_code', 'pi_charge_condition_types',
                                             'tax_condition_type_lookup_code',    'pi_tax_condition_types',
                                             'tax_group_lookup_code',             'pi_tax_groups',
                                             'wht_condition_type_lookup_code',    'pi_wht_condition_types',
                                             'wht_group_lookup_code',             'pi_wht_groups'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'kind',      'document_accounting',
                                         'key',       'purchase_order__document_accounting',
                                         'label',     'Accounting',
                                         'order',     1030,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'mode',                  'commitment_preview',
                                             'posting_strategy_code', 'commitment'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'kind',      'document_schedules',
                                         'key',       'purchase_order__document_schedules',
                                         'label',     'Schedules',
                                         'order',     1040,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'relation',        'schedules',
                                             'source_doc_type', 'commitment_line'
                                         )
                                     )
                                 )
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_order'
   AND tenant_id IS NULL;


-- â”€â”€ Â§8 Contract assertion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
DECLARE
    v_missing_count integer;
BEGIN
    WITH required_fields(name) AS (
        VALUES
            ('code'),
            ('name'),
            ('status'),
            ('order_type'),
            ('company_code_id'),
            ('party_id'),
            ('requested_by'),
            ('responsible_person_id'),
            ('approved_by'),
            ('document_date'),
            ('effective_date'),
            ('expiry_date'),
            ('fiscal_year'),
            ('period_number'),
            ('currency_code'),
            ('base_currency_code'),
            ('exchange_rate'),
            ('fx_rate_snapshot'),
            ('fx_policy'),
            ('payment_term_id')
    )
    SELECT count(*)
    INTO v_missing_count
    FROM required_fields rf
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.entity e
        JOIN control.entity_version ev ON ev.entity_id = e.id
        JOIN control.entity_field ef   ON ef.entity_version_id = ev.id
        WHERE e.tenant_id IS NULL
          AND e.table_schema = 'document'
          AND e.table_name   = 'purchase_order'
          AND ev.version_no  = 1
          AND ef.tenant_id  IS NULL
          AND ef.name = rf.name
    );

    IF v_missing_count > 0 THEN
        RAISE EXCEPTION 'Purchase order contract missing % required fields', v_missing_count;
    END IF;
END $$;

COMMIT;


