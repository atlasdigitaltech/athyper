-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Commitment (Purchase Order backing entity) â€” shell + field discipline.
-- Batch 6A.1. Matches the P2P plan Â§D pattern used by receipt / service_sheet /
-- delivery_note / purchase_requisition in 042_control_entity_field_contract.sql.
--
-- Physical DDL: document.commitment (01c_tables_commitment.sql).
-- `purchase_order` is a view over commitment; its own field contract lives in
-- 042i_po_purchase_order_contract.sql. This file governs the underlying entity so
-- polymorphic children (schedule_line, pricing_component, accounting_distribution)
-- resolve through descriptor lookups without falling through to the generic
-- pg_catalog auto-loop.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


-- Block 1 â€” hide system-managed, lifecycle-managed, computed, and
-- versioning fields.
UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'commitment'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      -- Auto-generated identity
      'code', 'name',
      -- Fiscal derivation (from posting_date on demand)
      'fiscal_year', 'period_number',
      -- Base currency and FX snapshot are resolved from company_code + rate table
      'base_currency_code', 'exchange_rate', 'fx_rate_snapshot',
      -- Amount roll-ups from commitment_line + downstream fulfilment
      'scheduled_amount', 'fulfilled_amount', 'released_amount',
      'invoiced_amount', 'paid_amount',
      -- Server-set budget check + encumbrance journal
      'budget_check_result', 'encumbrance_je_id',
      -- Approval state (lifecycle owns)
      'workflow_request_id', 'approved_at', 'approved_by',
      -- Lifecycle
      'status', 'is_active', 'status_changed_at', 'status_changed_by',
      'terminal_status', 'status_source',
      -- Universal versioning
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at',
      -- Provisional draft columns (server-managed by draft-promote flow)
      'draft_expires_at', 'draft_started_at', 'draft_started_by',
      -- Server metadata blob
      'metadata'
  );


-- Block 2 â€” unblock user-input business fields with group_keys.
UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    -- Identification / parties
    ('commitment_type',           'general'),
    ('order_type',                'general'),
    ('company_code_id',           'general'),
    ('party_type',                'general'),
    ('party_id',                  'general'),
    ('responsible_person_id',     'general'),
    ('requested_by',              'general'),
    -- Dates
    ('document_date',             'dates'),
    ('effective_date',            'dates'),
    ('expiry_date',               'dates'),
    -- Financial
    ('currency_code',             'financial'),
    ('fx_policy',                 'financial'),
    -- Amounts (only total_amount is user-editable; the roll-ups are hidden above)
    ('total_amount',              'amounts'),
    -- Chain
    ('parent_commitment_id',      'chain'),
    ('renewal_terms',             'chain'),
    ('renewal_count',             'chain'),
    ('renewed_from_id',           'chain'),
    ('release_sequence_no',       'chain'),
    -- Payment
    ('payment_term_id',           'payment'),
    -- Provisional flag (user-selectable for draft-only commitments)
    ('is_provisional',            'provisional'),
    -- Notes / tags
    ('tags',                      'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'commitment'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- Block 3 â€” enum data_type + enum_domain_code registrations.
-- commitment_type / order_type / fx_policy are text CHECK constraints in DDL;
-- bind to their lookup_domain to drive picker vocabulary. party_type is
-- open text (no DDL constraint) â€” left as free text.
UPDATE control.entity_field ef
SET data_type        = 'lookup',
    ui_type          = 'select',
    enum_domain_code = f.domain,
    cardinality      = 'one',
    updated_at       = now()
FROM (VALUES
    ('commitment_type', 'document.commitment_type'),
    ('order_type',      'document.purchase_order_type'),
    ('fx_policy',       'document.commitment_fx_policy')
) AS f(name, domain),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'commitment'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- Block 4 â€” mark cache/roll-up amount fields as computed with service origin.
-- Documents that these values are refreshed by commitment_line/downstream
-- fulfilment triggers and must not be written directly by the UI.
UPDATE control.entity_field ef
SET is_computed  = true,
    is_read_only = true,
    compute_mode = 'service',
    updated_at   = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'commitment'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'scheduled_amount', 'fulfilled_amount', 'released_amount',
      'invoiced_amount', 'paid_amount'
  );


-- Block 5 â€” mark is_active as generated (STORED expression in DDL).
UPDATE control.entity_field ef
SET is_computed  = true,
    is_read_only = true,
    compute_mode = 'generated',
    updated_at   = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'commitment'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'is_active';


-- ============================================================================
-- Purchase Order line contract (commitment_line) â€” Phase 3 lockdown
-- Blocks 6-13 encode:
--   B6  â€” rollup lockdown (received/invoiced/released quantities and amounts)
--   B7  â€” per-field editable_in_status (26 authoring fields)
--   B8  â€” conditional visibility/required (asset, WHT, warehouse, storage, etc.)
--   B9  â€” 5 creation-scenario cascades (PR, contract, catalog, item, supplier)
--   B10 â€” entity feature_flags (gross rule, currency parity, multi-supplier)
--   B11 â€” scoped pickers (warehouse, supplier, addresses)
--   B12 â€” contract assertions C1-C13
--   B13 â€” Trigger Ownership Matrix lockdown (jurisdictions + schedule child)
-- ============================================================================


-- â”€â”€ Block 6 â€” commitment_line rollup lockdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Explicit allowlist (C4 audit fix): only the 4 named rollups are locked here.
-- net_amount / tax_amount / gross_amount / withholding_tax_amount are already
-- covered by the shared foundation contract (042p) with compute_mode='generated'
-- or 'pricing_components'.
UPDATE control.entity_field ef
   SET is_read_only = true,
       is_computed  = true,
       compute_mode = 'service',
       editability  = jsonb_build_object(
           'editableOnCreate', false,
           'editableOnEdit',   false,
           'editable_in_status', to_jsonb(ARRAY[]::text[]),
           'reason', 'Service-managed rollup from downstream events.'
       ),
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'commitment_line'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name IN ('received_quantity','invoiced_quantity','released_quantity','released_amount');


-- â”€â”€ Block 7 â€” line field editability by PARENT commitment.status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Status names must appear in control.lifecycle_state for lifecycle 'commitment'.
-- commitment_line.status is operational (open/partially_received/...) and is
-- NOT referenced here.
-- Trigger-owned fields (to_/from_tax_jurisdiction_id) are excluded â€” see Block 13.
WITH field_rules(field_name, allowed_statuses, reason) AS (
    VALUES
    ('item_id',                  ARRAY['draft','pending_approval'],                    'Item locks after submit.'),
    ('item_description',         ARRAY['draft','pending_approval'],                    'Description locks after submit.'),
    ('procurement_type',         ARRAY['draft'],                                       'Drives line_type + tax defaults; locked at submit.'),
    ('line_type',                ARRAY['draft'],                                       'Drives contract/catalog/noncatalog defaulting.'),
    ('commodity_category_id',    ARRAY['draft','pending_approval'],                    'Commodity drives GL account and tax.'),
    ('business_intent_id',       ARRAY['draft','pending_approval'],                    'Intent gates spend classification.'),
    ('asset_class_id',           ARRAY['draft','pending_approval'],                    'CAPEX classification; finance role.'),
    ('uom_code',                 ARRAY['draft','pending_approval'],                    'UoM change requires re-price.'),
    ('quantity',                 ARRAY['draft','pending_approval'],                    'Post-approval quantity change requires revise.'),
    ('unit_price',               ARRAY['draft','pending_approval'],                    'Post-approval price change requires revise.'),
    ('price_unit',               ARRAY['draft','pending_approval'],                    'Pricing basis; locked at submit.'),
    ('currency_code',            ARRAY['draft'],                                       'Currency drives FX snapshot.'),
    ('over_delivery_tolerance',  ARRAY['draft','pending_approval','active','partially_fulfilled'], 'Tolerance can be widened during fulfillment within policy cap.'),
    ('under_delivery_tolerance', ARRAY['draft','pending_approval','active','partially_fulfilled'], 'Same as over.'),
    ('tax_group_id',             ARRAY['draft','pending_approval'],                    'Tax group locks at submit.'),
    ('withholding_tax_group_id', ARRAY['draft','pending_approval'],                    'WHT group locks at submit.'),
    ('required_by_date',         ARRAY['draft','pending_approval'],                    'Post-approval reschedule requires revise op.'),
    ('site_id',                  ARRAY['draft','pending_approval'],                    'Site drives warehouse/tax.'),
    ('warehouse_id',             ARRAY['draft','pending_approval','active'],           'Warehouse reroute allowed pre-fulfillment.'),
    ('storage_location',         ARRAY['draft','pending_approval','active','partially_fulfilled'], 'Storage location may change during receipt.'),
    ('shipto_address_id',        ARRAY['draft','pending_approval','active'],           'Ship-to change allowed pre-fulfillment. Cascades trigger update to to_tax_jurisdiction_id.'),
    ('billto_address_id',        ARRAY['draft','pending_approval'],                    'Bill-to locks after submit.'),
    ('billfrom_address_id',      ARRAY['draft','pending_approval'],                    'Bill-from locks after submit.'),
    ('supplier_id',              ARRAY['draft','pending_approval'],                    'Multi-supplier PO override; locks at submit.'),
    ('shipfrom_address_id',      ARRAY['draft','pending_approval'],                    'Dropship origin; locks at submit. Cascades trigger update to from_tax_jurisdiction_id.'),
    ('remitto_address_id',       ARRAY['draft','pending_approval'],                    'Finance remittance; locks at submit.')
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
           'editable_in_status', to_jsonb(fr.allowed_statuses),
           'reason', fr.reason
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM field_rules fr,
       control.entity_version ev,
       control.entity e
 WHERE ef.entity_version_id = ev.id
   AND ev.entity_id = e.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'commitment_line'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name = fr.field_name;


-- â”€â”€ Block 8 â€” conditional visibility/required â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- F3 audit fix: warehouse_id gets a single merged JSON object (required_when +
-- lock_when) rather than two rows that could non-deterministically merge.
WITH cond(field_name, visibility_json) AS (
    VALUES
    ('asset_class_id',           '{"required_when":{"field":"commodity_category_id","predicate":"joined:is_capex=true"}}'::jsonb),
    ('withholding_tax_group_id', '{"required_when":{"field":"supplier_id","predicate":"joined:is_wht_registered=true"}}'::jsonb),
    ('warehouse_id',             jsonb_build_object(
                                     'required_when', jsonb_build_object(
                                         'field', 'procurement_type',
                                         'eq',    'goods'
                                     ),
                                     'lock_when', jsonb_build_object(
                                         'joined_field', 'commodity_category.is_regulated',
                                         'eq',           true
                                     ),
                                     'lock_reason', 'regulated_commodity_requires_revise'
                                 )),
    ('storage_location',         '{"required_when":{"field":"warehouse_id","predicate":"joined:requires_storage_location=true"}}'::jsonb),
    ('shipfrom_address_id',      '{"required_when":{"header_flag":"is_dropship","eq":true}}'::jsonb),
    ('remitto_address_id',       '{"required_when":{"field":"supplier_id","predicate":"joined:has_factoring=true"}}'::jsonb)
)
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb) || cond.visibility_json,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM cond,
       control.entity_version ev,
       control.entity e
 WHERE ef.entity_version_id = ev.id
   AND ev.entity_id = e.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'commitment_line'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name = cond.field_name;


-- â”€â”€ Block 9 â€” creation-scenario cascades (5 scenarios) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Scenarios per design Â§4:
--   1. From PR line              â†’ hydrate 12 fields
--   2. From contract line        â†’ hard-lock pricing/tax/supplier
--   3. From catalog (punchout)   â†’ soft-lock unit_price with variance warn
--   4. From item master          â†’ classification-only hydrate
--   5. From item + supplier price â†’ unit_price from price list with warn

-- Scenario 1 â€” from PR line
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'on_source_change', jsonb_build_array(
           jsonb_build_object(
             'sources',  jsonb_build_array('requisition_line_id'),
             'action',   'rederive',
             'mode',     'if_empty_or_derived',
             'resolver', 'purchase_requisition_line.snapshot',
             'layers',   jsonb_build_array('server_on_save'),
             'message',  'Filled from purchase requisition line'
           )
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN (
       'item_id','item_description','procurement_type','line_type',
       'commodity_category_id','business_intent_id','uom_code','quantity',
       'currency_code','required_by_date','site_id','warehouse_id'
   );

-- Scenario 2 â€” from contract line (hard-locks)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'on_source_change', jsonb_build_array(
           jsonb_build_object(
             'sources',   jsonb_build_array('parent_contract_line_id'),
             'action',    'rederive_and_lock',
             'mode',      'always',
             'resolver',  'contract_line.snapshot_pricing',
             'layers',    jsonb_build_array('server_on_save'),
             'message',   'Pricing locked by contract'
           )
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN (
       'unit_price','price_unit','currency_code','tax_group_id',
       'over_delivery_tolerance','under_delivery_tolerance','supplier_id',
       'billfrom_address_id','remitto_address_id'
   );

-- Scenario 3 â€” from catalog (punchout / hosted) â€” soft-lock pricing with variance warn
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'on_source_change', jsonb_build_array(
           jsonb_build_object(
             'sources',  jsonb_build_array('item_id'),
             'action',   'rederive',
             'mode',     'if_empty_or_derived',
             'resolver', 'catalog_line.snapshot_pricing',
             'layers',   jsonb_build_array('client_on_change','server_on_save'),
             'condition', jsonb_build_object('line_type_eq', 'catalog'),
             'message',  'Filled from catalog'
           ),
           jsonb_build_object(
             'sources',  jsonb_build_array('item_id'),
             'action',   'warn_variance',
             'threshold_source', 'match_tolerance_config',
             'threshold_lookup', jsonb_build_object(
                 'entity_name',    'purchase_order',
                 'match_type',     'commitment_price',
                 'tolerance_type', 'price_pct'
             ),
             'layers',   jsonb_build_array('client_on_change'),
             'condition', jsonb_build_object('line_type_eq', 'catalog'),
             'message',  'Unit price exceeds catalog variance policy'
           )
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN ('unit_price','price_unit','currency_code','tax_group_id');

-- Scenario 4 â€” from item master (noncatalog) â€” classification-only hydrate
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'on_source_change', jsonb_build_array(
           jsonb_build_object(
             'sources',  jsonb_build_array('item_id'),
             'action',   'rederive',
             'mode',     'if_empty_or_derived',
             'resolver', 'item.default_metadata',
             'layers',   jsonb_build_array('client_on_change','server_on_save'),
             'condition', jsonb_build_object('line_type_eq', 'noncatalog'),
             'message',  'Filled from item master'
           )
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN (
       'item_description','procurement_type','commodity_category_id',
       'business_intent_id','asset_class_id','uom_code','tax_group_id',
       'over_delivery_tolerance','under_delivery_tolerance'
   );

-- Scenario 5 â€” from item + supplier price list â€” soft-lock unit_price with warn
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'on_source_change', jsonb_build_array(
           jsonb_build_object(
             'sources',  jsonb_build_array('item_id','supplier_id','quantity'),
             'action',   'rederive',
             'mode',     'if_empty_or_derived',
             'resolver', 'supplier_price_list.effective_price',
             'layers',   jsonb_build_array('client_on_change','server_on_save'),
             'message',  'Filled from supplier price list'
           ),
           jsonb_build_object(
             'sources',  jsonb_build_array('item_id','supplier_id'),
             'action',   'warn_variance',
             'threshold_source', 'match_tolerance_config',
             'threshold_lookup', jsonb_build_object(
                 'entity_name',    'purchase_order',
                 'match_type',     'commitment_price',
                 'tolerance_type', 'price_pct'
             ),
             'layers',   jsonb_build_array('client_on_change'),
             'message',  'Unit price exceeds supplier list variance policy'
           )
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'unit_price';


-- â”€â”€ Block 10 â€” entity feature flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--   commitment_gross_excludes_wht : commitment gross = net + tax (WHT applied
--                                   at payment-time, not at commitment). DDL
--                                   fix (A1) is gated on tax working-group
--                                   sign-off; the flag is set now so downstream
--                                   consumers can already branch.
--   multi_currency_lines          : disallow line.currency â‰  header.currency
--                                   unless explicitly opted in per-entity.
--   multi_supplier                : disallow line.supplier â‰  header.party unless
--                                   opted in (feeds line supplier picker scope).
UPDATE control.entity e
   SET feature_flags = COALESCE(e.feature_flags, '{}'::jsonb)
                       || jsonb_build_object(
                           'commitment_gross_excludes_wht', true,
                           'multi_currency_lines',          false,
                           'multi_supplier',                false
                       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE e.entity_code IN ('commitment','purchase_order')
   AND e.tenant_id IS NULL;


-- â”€â”€ Block 11 â€” canonical reference display + scoped picker configs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A reference picker needs more than a target entity. Selected UUIDs are
-- rendered through reference_config.label_field and ui_hint.display; omitting
-- either lets edit/detail surfaces fall back to the stored UUID. Keep the
-- display contract and dependency scope together so later seed reruns cannot
-- leave a field in a half-configured state.
WITH reference_fields(field_name, reference_patch, lookup_patch) AS (
    VALUES
    ('item_id',
     jsonb_build_object(
         'target_entity', 'item', 'target_field', 'id', 'value_field', 'id',
         'label_field', 'name', 'display_field', 'name', 'code_field', 'code',
         'picker', jsonb_build_object('code_field', 'code', 'show_code', true)
     ),
     jsonb_build_object('default_order', jsonb_build_array('code','name','id'))),
    ('site_id',
     jsonb_build_object(
         'target_entity', 'site', 'target_field', 'id', 'value_field', 'id',
         'label_field', 'name', 'display_field', 'name', 'code_field', 'code',
         'picker', jsonb_build_object('code_field', 'code', 'show_code', true)
     ),
     jsonb_build_object('default_order', jsonb_build_array('code','name','id'))),
    ('warehouse_id',
     jsonb_build_object(
         'target_entity', 'warehouse', 'target_field', 'id', 'value_field', 'id',
         'label_field', 'name', 'display_field', 'name', 'code_field', 'code',
         'picker', jsonb_build_object('code_field', 'code', 'show_code', true)
     ),
     jsonb_build_object(
         'scope', jsonb_build_object(
             'kind', 'field_equal', 'source_field', 'site_id', 'target_field', 'site_id'
         )
     )),
    ('supplier_id',
     jsonb_build_object(
         'target_entity', 'supplier', 'target_field', 'id', 'value_field', 'id',
         'label_field', 'name', 'display_field', 'name', 'code_field', 'supplier_code',
         'picker', jsonb_build_object('code_field', 'supplier_code', 'show_code', true)
     ),
     jsonb_build_object(
         'scope', jsonb_build_object(
             'kind', 'header_party_or_flag', 'header_field', 'party_id', 'flag_field', 'multi_supplier'
         )
     )),
    ('shipto_address_id',
     jsonb_build_object(
         'target_entity', 'v_site_address', 'target_field', 'address_id', 'value_field', 'address_id',
         'label_field', 'formatted_address', 'display_field', 'formatted_address',
         'code_field', 'code', 'description_field', 'name'
     ),
     jsonb_build_object(
         'scope', jsonb_build_object(
             'kind', 'site_or_company_addresses', 'source_field', 'site_id'
         )
     )),
    ('billto_address_id',
     jsonb_build_object(
         'target_entity', 'v_company_code_address', 'target_field', 'address_id', 'value_field', 'address_id',
         'label_field', 'formatted_address', 'display_field', 'formatted_address',
         'code_field', 'code', 'description_field', 'name'
     ),
     jsonb_build_object(
         'scope', jsonb_build_object(
             'kind', 'company_code_addresses', 'header_field', 'company_code_id'
         )
     )),
    ('billfrom_address_id',
     jsonb_build_object(
         'target_entity', 'v_supplier_address', 'target_field', 'address_id', 'value_field', 'address_id',
         'label_field', 'formatted_address', 'display_field', 'formatted_address',
         'code_field', 'code', 'description_field', 'name'
     ),
     jsonb_build_object('scope', jsonb_build_object('kind', 'supplier_addresses', 'source_field', 'supplier_id'))),
    ('shipfrom_address_id',
     jsonb_build_object(
         'target_entity', 'v_supplier_address', 'target_field', 'address_id', 'value_field', 'address_id',
         'label_field', 'formatted_address', 'display_field', 'formatted_address',
         'code_field', 'code', 'description_field', 'name'
     ),
     jsonb_build_object('scope', jsonb_build_object('kind', 'supplier_addresses', 'source_field', 'supplier_id'))),
    ('remitto_address_id',
     jsonb_build_object(
         'target_entity', 'v_supplier_address', 'target_field', 'address_id', 'value_field', 'address_id',
         'label_field', 'formatted_address', 'display_field', 'formatted_address',
         'code_field', 'code', 'description_field', 'name'
     ),
     jsonb_build_object('scope', jsonb_build_object('kind', 'supplier_addresses', 'source_field', 'supplier_id')))
)
UPDATE control.entity_field ef
   SET reference_config = COALESCE(ef.reference_config, '{}'::jsonb) || rf.reference_patch,
       lookup_config    = COALESCE(ef.lookup_config, '{}'::jsonb) || rf.lookup_patch,
       ui_hint          = COALESCE(ef.ui_hint, '{}'::jsonb)
                          || jsonb_build_object(
                               'display',
                               COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                               || jsonb_build_object(
                                    'renderer', 'reference_label',
                                    'format', 'label_code'
                                  )
                             ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM reference_fields rf,
       control.entity_version ev,
       control.entity e
 WHERE ef.entity_version_id = ev.id
   AND ev.entity_id = e.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = rf.field_name;


-- â”€â”€ Block 13 â€” Trigger Ownership lockdown (A2, A3 resolutions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Formal declaration of the Trigger Ownership Matrix.
--
-- A2 audit: DB triggers and resolver defaults must not overlap. Fields listed
-- here are OWNED by DB triggers; resolver-driven defaults are forbidden.
-- A3 audit: to_/from_tax_jurisdiction_id are stamped by
-- trg_cl_derive_ship_jurisdictions (06z_ap_p0_triggers.sql). Making them
-- editable would risk silent overwrite on the next address change.
--
-- Contract:
--   1. is_computed=true, compute_mode='trigger', is_read_only=true
--   2. editability.editable_in_status = [] (no manual edit in any status)
--   3. defaults.on_source_change cleared (no resolver overlap)
--   4. ui_hint documents derived_from source_field + derivation_trigger
UPDATE control.entity_field ef
   SET is_read_only = true,
       is_computed  = true,
       compute_mode = 'trigger',
       editability  = jsonb_build_object(
           'editableOnCreate', false,
           'editableOnEdit',   false,
           'editable_in_status', to_jsonb(ARRAY[]::text[]),
           'reason', 'Derived by DB trigger from ship address; changes to the address cascade automatically.'
       ),
       defaults = NULL,
       ui_hint  = COALESCE(ef.ui_hint, '{}'::jsonb)
                  || jsonb_build_object(
                      'derived_from', CASE ef.name
                          WHEN 'to_tax_jurisdiction_id'   THEN 'shipto_address_id.tax_jurisdiction_id'
                          WHEN 'from_tax_jurisdiction_id' THEN 'shipfrom_address_id.tax_jurisdiction_id'
                      END,
                      'derivation_trigger', 'trg_cl_derive_ship_jurisdictions'
                  ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN ('to_tax_jurisdiction_id','from_tax_jurisdiction_id');

-- Register the three managed children on commitment_line.
--
--   schedule_line              â€” DB trigger for both default create + refresh
--                                 (kept: canonical, stable, well-tested).
--   accounting_distribution    â€” service-owned defaults + refresh
--                                 (applyCommitmentLineDefaults +
--                                  refreshCommitmentLineChildren in
--                                  commitment-line-defaults.service.ts).
--                                except_by_lookup=NULL â€” AD ownership is
--                                discriminated by the existing account_source
--                                column enum ('OVERRIDE' â†’ user-owned).
--   pricing_component          â€” resolver-owned copy at insert time
--                                 (contract_line.snapshot_pricing resolver +
--                                  copyPricingComponentsFromContractLine
--                                  service). Refresh via
--                                  refreshCommitmentLineChildren. Except-by-
--                                  default policy read from lookup domain
--                                  'pricing_component.origin_ownership'.
--
-- error_code_on_orphan values match the SQLSTATE codes raised by the
-- BLOCK-DELETE triggers in
-- server/db/ddl/document/06yzz_commitment_line_child_guards.sql.
UPDATE control.entity e
   SET feature_flags = COALESCE(e.feature_flags, '{}'::jsonb)
                       || jsonb_build_object(
                           'create_graph', jsonb_build_object(
                               'transactional', true,
                               'children', jsonb_build_array(
                                   jsonb_build_object(
                                       'child_entity', 'accounting_distribution',
                                       'writer', 'accounting_distribution.replace',
                                       'mode', 'replace_default'
                                   ),
                                   jsonb_build_object(
                                       'child_entity', 'schedule_line',
                                       'writer', 'schedule_line.supersede',
                                       'mode', 'supersede_default',
                                       'draft_mapping', jsonb_build_object(
                                           'scheduled_date', 'required_by_date',
                                           'scheduled_quantity', 'quantity',
                                           'scheduled_amount', 'net_amount',
                                           'currency_code', 'currency_code'
                                       )
                                   )
                               )
                           ),
                           'trigger_managed_children', jsonb_build_array(
                               jsonb_build_object(
                                   'child_entity',         'schedule_line',
                                   'trigger_name',         'trg_commitment_line_default_schedule',
                                   'refresh_trigger',      'trg_commitment_line_refresh_default_schedule',
                                   'writer_precedence',    'writer_wins_via_metadata_source',
                                   'error_code_on_orphan', 'CL010'
                               ),
                               jsonb_build_object(
                                   'child_entity',         'accounting_distribution',
                                   'trigger_name',         NULL,
                                   'refresh_trigger',      NULL,
                                   'service_name',         'applyCommitmentLineDefaults',
                                   'refresh_service_name', 'refreshCommitmentLineChildren',
                                   'writer_precedence',    'service_wins_via_account_source',
                                   'error_code_on_orphan', 'CL011'
                               ),
                               jsonb_build_object(
                                   'child_entity',         'pricing_component',
                                   'trigger_name',         NULL,
                                   'refresh_trigger',      NULL,
                                   'service_name',         'copyPricingComponentsFromContractLine',
                                   'refresh_service_name', 'refreshCommitmentLineChildren',
                                   'writer_precedence',    'resolver_owned_via_contract_line.snapshot_pricing',
                                   'except_by_lookup',     'pricing_component.origin_ownership',
                                   'error_code_on_orphan', 'CL012'
                               )
                           )
                       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL;


-- â”€â”€ Block 12 â€” contract assertions (C1-C13) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
DECLARE
    v_bad_count integer;
    v_bad_field text;
    v_bad_status text;
    -- 26 authoring fields (jurisdictions removed vs. prior draft; those are
    -- now trigger-owned per Block 13)
    v_authoring_fields text[] := ARRAY[
        'item_id','item_description','procurement_type','line_type',
        'commodity_category_id','business_intent_id','asset_class_id',
        'uom_code','quantity','unit_price','price_unit','currency_code',
        'over_delivery_tolerance','under_delivery_tolerance',
        'tax_group_id','withholding_tax_group_id',
        'required_by_date','site_id','warehouse_id','storage_location',
        'shipto_address_id','billto_address_id','billfrom_address_id',
        'supplier_id','shipfrom_address_id','remitto_address_id'
    ];
    v_trigger_owned_fields text[] := ARRAY[
        'to_tax_jurisdiction_id','from_tax_jurisdiction_id'
    ];
BEGIN
    -- C1 â€” editable_in_status references only canonical commitment states
    SELECT count(*), min(ef.name), min(s) INTO v_bad_count, v_bad_field, v_bad_status
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
      CROSS JOIN LATERAL jsonb_array_elements_text(ef.editability -> 'editable_in_status') s
     WHERE e.tenant_id IS NULL AND ev.version_no = 1
       AND e.entity_code IN ('commitment','commitment_line','purchase_order')
       AND s NOT IN (SELECT ls.code FROM control.lifecycle_state ls
                       JOIN control.lifecycle lc ON lc.id = ls.lifecycle_id
                      WHERE lc.code = 'commitment' AND lc.tenant_id IS NULL);
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C1: field % references non-canonical status %', v_bad_field, v_bad_status;
    END IF;

    -- C2 â€” 26 authoring fields all have editable_in_status on commitment_line
    -- NOT EXISTS scope: `asset_class_id` (and others) are inserted by the
    -- shared foundation contract 042p across 5 line-type entities; the LEFT
    -- JOIN pattern would trip on rows from purchase_invoice_line etc. that
    -- don't carry editable_in_status.
    SELECT count(*), min(x.f) INTO v_bad_count, v_bad_field
      FROM unnest(v_authoring_fields) AS x(f)
     WHERE NOT EXISTS (
         SELECT 1
           FROM control.entity_field ef
           JOIN control.entity_version ev ON ev.id = ef.entity_version_id
           JOIN control.entity e ON e.id = ev.entity_id
          WHERE e.entity_code = 'commitment_line'
            AND e.tenant_id IS NULL
            AND ev.version_no = 1
            AND ef.name = x.f
            AND ef.editability ? 'editable_in_status'
     );
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C2: authoring field % missing editable_in_status on commitment_line', v_bad_field;
    END IF;

    -- C3 â€” entity_operation.permission_code exists
    SELECT count(*), min(eo.permission_code) INTO v_bad_count, v_bad_field
      FROM control.entity_operation eo
     WHERE eo.entity_name IN ('purchase_order','commitment','commitment_line')
       AND NOT EXISTS (SELECT 1 FROM shared.permission p WHERE p.code = eo.permission_code);
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C3: undefined permission % (% rows)', v_bad_field, v_bad_count;
    END IF;

    -- C4 â€” rollup allowlist locked
    SELECT count(*), min(ef.name) INTO v_bad_count, v_bad_field
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'commitment_line' AND e.tenant_id IS NULL AND ev.version_no = 1
       AND ef.name IN ('received_quantity','invoiced_quantity','released_quantity','released_amount')
       AND (ef.is_read_only = false OR ef.compute_mode IS DISTINCT FROM 'service');
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C4: rollup field % not locked read-only+service', v_bad_field;
    END IF;

    -- C5 â€” feature_flags present
    SELECT count(*) INTO v_bad_count
      FROM control.entity e
     WHERE e.tenant_id IS NULL
       AND e.entity_code IN ('commitment','purchase_order')
       AND NOT (e.feature_flags ? 'commitment_gross_excludes_wht'
            AND e.feature_flags ? 'multi_currency_lines'
            AND e.feature_flags ? 'multi_supplier');
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C5: % entity missing feature_flags', v_bad_count;
    END IF;

    -- C6 â€” state_mask.record_status canonical
    SELECT count(*), min(elsm.record_status) INTO v_bad_count, v_bad_status
      FROM control.entity_lifecycle_state_mask elsm
     WHERE elsm.tenant_id IS NULL AND elsm.entity_name = 'purchase_order'
       AND elsm.record_status NOT IN (
           SELECT ls.code FROM control.lifecycle_state ls
             JOIN control.lifecycle lc ON lc.id = ls.lifecycle_id
            WHERE lc.code = 'commitment' AND lc.tenant_id IS NULL);
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C6: state_mask non-canonical status %', v_bad_status;
    END IF;

    -- C7 â€” lookup_config.scope.source_field points at sibling
    SELECT count(*), min(ef.name) INTO v_bad_count, v_bad_field
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'commitment_line' AND e.tenant_id IS NULL AND ev.version_no = 1
       AND ef.lookup_config -> 'scope' ->> 'source_field' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.entity_field sib
                        WHERE sib.entity_version_id = ef.entity_version_id
                          AND sib.name = ef.lookup_config -> 'scope' ->> 'source_field');
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C7: field % scope.source_field points to missing sibling', v_bad_field;
    END IF;

    -- C8 â€” action_code format
    SELECT count(*), min(ear.action_code) INTO v_bad_count, v_bad_field
      FROM control.entity_action_rule ear
     WHERE ear.entity_code = 'purchase_order'
       AND ear.action_code !~ '^[A-Z_]+\.[A-Z_]+$';
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C8: action_code % not in <SURFACE>.<VERB> form', v_bad_field;
    END IF;

    -- C9 â€” action_rule.required_permission exists
    SELECT count(*), min(ear.required_permission) INTO v_bad_count, v_bad_field
      FROM control.entity_action_rule ear
     WHERE ear.entity_code = 'purchase_order'
       AND ear.required_permission IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM shared.permission p WHERE p.code = ear.required_permission);
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C9: undefined permission %', v_bad_field;
    END IF;

    -- C10 â€” canEdit sanity vs EDIT_VERBS (useDocumentAffordance Gate 2)
    SELECT count(*), min(ear.status || ':' || ear.action_code) INTO v_bad_count, v_bad_field
      FROM control.entity_action_rule ear
      JOIN control.entity_lifecycle_state_mask elsm
        ON elsm.entity_name = ear.entity_code AND elsm.record_status = ear.status
       AND elsm.tenant_id IS NULL
     WHERE ear.entity_code = 'purchase_order'
       AND split_part(ear.action_code, '.', 2) IN
           ('ADD','REPLACE','OVERRIDE','DELETE','EDIT','SUBMIT','APPROVE','REJECT','HOLD','RESUME','POST','REVERSE','CANCEL')
       AND ear.capability IN ('allowed','requires_permission')
       AND elsm.can_edit = false;
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C10: EDIT_VERB action % allowed where can_edit=false', v_bad_field;
    END IF;

    -- C11 â€” Trigger-owned fields are locked read-only + compute_mode='trigger'
    -- Scope-safe: NOT EXISTS against commitment_line only (same reason as C2).
    SELECT count(*), min(x.f) INTO v_bad_count, v_bad_field
      FROM unnest(v_trigger_owned_fields) AS x(f)
     WHERE NOT EXISTS (
         SELECT 1
           FROM control.entity_field ef
           JOIN control.entity_version ev ON ev.id = ef.entity_version_id
           JOIN control.entity e ON e.id = ev.entity_id
          WHERE e.entity_code = 'commitment_line'
            AND e.tenant_id IS NULL
            AND ev.version_no = 1
            AND ef.name = x.f
            AND ef.is_read_only = true
            AND ef.is_computed = true
            AND ef.compute_mode = 'trigger'
     );
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C11: trigger-owned field % not locked on commitment_line (needs is_read_only, is_computed, compute_mode=trigger)', v_bad_field;
    END IF;

    -- C12 â€” Trigger-owned fields carry NO defaults.on_source_change
    -- (prevents resolver/trigger overlap)
    SELECT count(*), min(ef.name) INTO v_bad_count, v_bad_field
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'commitment_line' AND e.tenant_id IS NULL AND ev.version_no = 1
       AND ef.name = ANY(v_trigger_owned_fields)
       AND ef.defaults IS NOT NULL
       AND ef.defaults ? 'on_source_change';
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C12: trigger-owned field % has resolver defaults â€” overlap forbidden', v_bad_field;
    END IF;

    -- C13 â€” Authoring allowlist and trigger-owned list are disjoint
    IF (SELECT count(*) FROM unnest(v_authoring_fields) a
         WHERE a = ANY(v_trigger_owned_fields)) > 0 THEN
        RAISE EXCEPTION 'C13: authoring allowlist and trigger-owned list overlap';
    END IF;

    -- â”€â”€ C14-C21: trigger_managed_children integrity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    -- C14 â€” non-null trigger_name entries reference real triggers
    SELECT count(*), min(child.value ->> 'trigger_name') INTO v_bad_count, v_bad_field
      FROM control.entity e
      CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
     WHERE e.tenant_id IS NULL AND e.entity_code = 'commitment_line'
       AND (child.value ->> 'trigger_name') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = child.value ->> 'trigger_name');
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C14: trigger_managed_children references missing trigger %', v_bad_field;
    END IF;

    -- C15 â€” non-null refresh_trigger entries reference real triggers
    SELECT count(*), min(child.value ->> 'refresh_trigger') INTO v_bad_count, v_bad_field
      FROM control.entity e
      CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
     WHERE e.tenant_id IS NULL AND e.entity_code = 'commitment_line'
       AND (child.value ->> 'refresh_trigger') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = child.value ->> 'refresh_trigger');
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C15: trigger_managed_children references missing refresh trigger %', v_bad_field;
    END IF;

    -- C16 â€” error_code_on_orphan values are unique across children
    SELECT count(*) INTO v_bad_count
      FROM (
          SELECT child.value ->> 'error_code_on_orphan' AS code, count(*) AS n
            FROM control.entity e
            CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
           WHERE e.entity_code = 'commitment_line' AND e.tenant_id IS NULL
             AND (child.value ->> 'error_code_on_orphan') IS NOT NULL
           GROUP BY 1
          HAVING count(*) > 1
      ) dup;
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C16: duplicate error_code_on_orphan in trigger_managed_children';
    END IF;

    -- C17 â€” pc_origin_ownership lookup domain exists with metadata.ownership
    IF NOT EXISTS (
        SELECT 1 FROM control.lookup_value
         WHERE domain_code = 'pricing_component.origin_ownership'
           AND status = 'active' AND metadata ? 'ownership'
    ) THEN
        RAISE EXCEPTION 'C17: pc_origin_ownership lookup missing or malformed';
    END IF;

    -- C18 â€” every child_entity referenced exists in control.entity
    SELECT count(*), min(child.value ->> 'child_entity') INTO v_bad_count, v_bad_field
      FROM control.entity e
      CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
     WHERE e.tenant_id IS NULL AND e.entity_code = 'commitment_line'
       AND NOT EXISTS (
           SELECT 1 FROM control.entity ce
            WHERE ce.entity_code = child.value ->> 'child_entity' AND ce.tenant_id IS NULL
       );
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C18: trigger_managed_children references missing child entity %', v_bad_field;
    END IF;

    -- C19 â€” service-owned children (trigger_name=NULL) MUST declare service_name
    SELECT count(*), min(child.value ->> 'child_entity') INTO v_bad_count, v_bad_field
      FROM control.entity e
      CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
     WHERE e.tenant_id IS NULL AND e.entity_code = 'commitment_line'
       AND (child.value ->> 'trigger_name') IS NULL
       AND (child.value ->> 'service_name') IS NULL;
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C19: service-owned child % missing service_name', v_bad_field;
    END IF;

    -- C20 â€” except_by_lookup values (when set) reference real lookup domains
    SELECT count(*), min(child.value ->> 'except_by_lookup') INTO v_bad_count, v_bad_field
      FROM control.entity e
      CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
     WHERE e.tenant_id IS NULL AND e.entity_code = 'commitment_line'
       AND (child.value ->> 'except_by_lookup') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM control.lookup_domain WHERE code = child.value ->> 'except_by_lookup'
       );
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C20: except_by_lookup references missing lookup domain %', v_bad_field;
    END IF;

    -- C21 â€” modeling assumption: PC rows with source_doc_type='commitment_line'
    -- reference existing commitment_line rows (verifies the contract-line PC
    -- storage assumption used by commitment-line-pc-copy.service.ts).
    SELECT count(*), min(pc.source_line_id::text) INTO v_bad_count, v_bad_field
      FROM document.pricing_component pc
     WHERE pc.source_doc_type = 'commitment_line'
       AND NOT EXISTS (
           SELECT 1 FROM document.commitment_line cl
            WHERE cl.tenant_id = pc.tenant_id AND cl.id = pc.source_line_id
       );
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'C21: % pricing_component rows reference missing commitment_line (sample: %)', v_bad_count, v_bad_field;
    END IF;
END $$;


-- Commitment line copy behavior. Mirrors the metadata vocabulary already used
-- by journal_entry copy: field-level ui_hint.copy_policy decides what the UI
-- may prefill, while server-side copy owns child remapping/reset.
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb)
           || jsonb_build_object(
                'copy', jsonb_build_object(
                    'enabled', true,
                    'target_status', 'open',
                    'child_relations', jsonb_build_array(
                        'accounting_distributions',
                        'pricing_components',
                        'schedules'
                    ),
                    'copy_strategy', 'controlled_clone'
                )
              ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commitment_line'
       AND tenant_id IS NULL;

    WITH policies(field_name, policy) AS (
        VALUES
        -- Identity / source / lifecycle
        ('id','reset'),
        ('tenant_id','reset'),
        ('company_code_id','derive'),
        ('commitment_id','reparent'),
        ('line_no','regenerate'),
        ('requisition_line_id','exclude'),
        ('parent_contract_line_id','preserve'),
        ('status','target_status'),
        ('created_at','reset'),
        ('created_by','reset'),
        ('updated_at','reset'),
        ('updated_by','reset'),

        -- Authoring inputs
        ('item_id','preserve'),
        ('item_description','preserve'),
        ('procurement_type','preserve'),
        ('line_type','preserve'),
        ('commodity_category_id','preserve'),
        ('business_intent_id','preserve'),
        ('classification_decision','preserve'),
        ('asset_class_id','preserve'),
        ('uom_code','preserve'),
        ('quantity','preserve'),
        ('unit_price','preserve'),
        ('price_unit','preserve'),
        ('currency_code','preserve'),
        ('over_delivery_tolerance','preserve'),
        ('under_delivery_tolerance','preserve'),
        ('tax_group_id','preserve'),
        ('withholding_tax_group_id','preserve'),
        ('to_tax_jurisdiction_id','preserve'),
        ('from_tax_jurisdiction_id','preserve'),
        ('required_by_date','preserve'),
        ('site_id','preserve'),
        ('warehouse_id','preserve'),
        ('storage_location','preserve'),
        ('shipto_address_id','preserve'),
        ('billto_address_id','preserve'),
        ('billfrom_address_id','preserve'),
        ('supplier_id','preserve'),
        ('shipfrom_address_id','preserve'),
        ('remitto_address_id','preserve'),

        -- Derived / fulfillment caches
        ('net_amount','derive'),
        ('tax_amount','derive'),
        ('withholding_tax_amount','derive'),
        ('gross_amount','derive'),
        ('received_quantity','reset'),
        ('invoiced_quantity','reset'),
        ('released_quantity','reset'),
        ('released_amount','reset')
    )
    UPDATE control.entity_field ef
       SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
           || jsonb_build_object('copy_policy', p.policy),
           updated_at = now(),
           updated_by = v_su
      FROM policies p
      JOIN control.entity e ON e.entity_code = 'commitment_line'
                            AND e.tenant_id IS NULL
      JOIN control.entity_version ev ON ev.entity_id = e.id
                                    AND ev.version_no = 1
                                    AND ev.tenant_id IS NULL
     WHERE ef.entity_version_id = ev.id
       AND ef.name = p.field_name;
END $$;




