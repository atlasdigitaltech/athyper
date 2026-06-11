-- ============================================================================
-- 042_entity_field_rules_pi_line_and_ad.sql
-- Sprint 1 — extend field-level editability + computed flags to
--   document.purchase_invoice_line
--   document.accounting_distribution
--
-- Source of truth: control.entity_field.editability JSONB column.
-- Predicate vocabulary: editable_in_status (array of allowed PARENT statuses).
--
-- Parent-status semantics (server-side in records.route.ts):
--   - purchase_invoice_line: status is read from parent document.purchase_invoice.
--   - accounting_distribution: status is read from parent doc via source_doc_id
--     when source_doc_type='PURCHASE_INVOICE_LINE' (other source types fall
--     through to no-gate enforcement until they're wired in a later sprint).
--
-- Note on DB-level immutability:
--   trg_pil_immutability_guard already raises P0001 if any line is mutated
--   while parent.status NOT IN ('draft','proforma'). The field-level rules
--   below are defense-in-depth at the API layer so callers get a clean
--   400 FIELD_LOCKED_BY_STATUS instead of a 500 from the trigger.
-- ============================================================================


-- ── 1) Purchase Invoice Line — editable_in_status (parent gate) ─────────────
WITH pil_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    -- Identity / parent — locked from first submit
    ('purchase_invoice_id', jsonb_build_array('draft')::jsonb,
        'Parent invoice link is set at line creation and cannot be reassigned.'),
    ('line_no',             jsonb_build_array('draft')::jsonb,
        'Line number is assigned at creation and is immutable thereafter.'),
    -- Item classification — editable until submit, then locked
    ('item_id',             jsonb_build_array('draft','rejected')::jsonb,
        'Item link drives accounting category + posting profile.'),
    ('item_description',    jsonb_build_array('draft','rejected')::jsonb,
        'Description is part of the legal invoice record once submitted.'),
    ('procurement_type',    jsonb_build_array('draft','rejected')::jsonb,
        'Procurement type drives matching and GL category.'),
    ('commodity_category_id', jsonb_build_array('draft','rejected')::jsonb,
        'Commodity category drives account derivation and budget mapping.'),
    ('business_intent_id',  jsonb_build_array('draft','rejected')::jsonb,
        'Business intent drives accounting profile resolution.'),
    ('unspsc_code',         jsonb_build_array('draft','rejected')::jsonb,
        'UNSPSC code is part of procurement audit record.'),
    ('hs_code',             jsonb_build_array('draft','rejected')::jsonb,
        'HS code is part of customs/trade compliance record.'),
    -- Quantity & pricing — locked once submitted (line totals roll up to header)
    ('uom_code',            jsonb_build_array('draft','rejected')::jsonb,
        'UoM drives quantity matching and GR receipt processing.'),
    ('quantity',            jsonb_build_array('draft','rejected')::jsonb,
        'Quantity changes header totals; locked after submit.'),
    ('unit_price',          jsonb_build_array('draft','rejected')::jsonb,
        'Unit price changes header totals; locked after submit.'),
    ('price_unit',          jsonb_build_array('draft','rejected')::jsonb,
        'Price denominator changes the computed net amount.'),
    ('discount_pct',        jsonb_build_array('draft','rejected')::jsonb,
        'Discount percent changes header subtotal.'),
    ('discount_amount',     jsonb_build_array('draft','rejected')::jsonb,
        'Discount amount changes header subtotal.'),
    -- Tax — locked once submitted
    ('tax_amount',          jsonb_build_array('draft','rejected')::jsonb,
        'Tax amount changes header tax total.'),
    ('withholding_tax_amount', jsonb_build_array('draft','rejected')::jsonb,
        'WHT amount changes header WHT total.'),
    -- Retention — locked once submitted
    ('retention_pct',       jsonb_build_array('draft','rejected')::jsonb,
        'Retention percent changes retention liability calculation.'),
    ('retention_amount',    jsonb_build_array('draft','rejected')::jsonb,
        'Retention amount changes the AP Retention Payable.'),
    -- Dimensions — locked once submitted (drives GL posting dimensions)
    ('cost_center_id',      jsonb_build_array('draft','rejected')::jsonb,
        'Cost centre drives GL posting; locked after submit.'),
    ('profit_center_id',    jsonb_build_array('draft','rejected')::jsonb,
        'Profit centre drives GL posting; locked after submit.'),
    ('project_id',          jsonb_build_array('draft','rejected')::jsonb,
        'Project drives GL posting; locked after submit.'),
    ('site_id',             jsonb_build_array('draft','rejected')::jsonb,
        'Site drives GL posting; locked after submit.'),
    -- Asset interlock — locked once submitted
    ('is_asset',            jsonb_build_array('draft','rejected')::jsonb,
        'Asset flag drives CapEx posting and fixed asset entry.'),
    ('asset_category_id',   jsonb_build_array('draft','rejected')::jsonb,
        'Asset class drives fixed asset book and depreciation.')
  ) AS rule(field_name, allowed_statuses, reason)
 WHERE ef.entity_version_id = (SELECT version_id FROM pil_version)
   AND ef.name = rule.field_name;


-- ── 2) Purchase Invoice Line — computed-field flags ─────────────────────────
-- Constraint ef_computed_chk requires compute_mode IS NOT NULL when
-- is_computed=true. Semantic values used:
--   'generated' — PostgreSQL GENERATED ALWAYS AS STORED columns
--   'trigger'   — maintained by a DB trigger function
--   'service'   — maintained by application service code
UPDATE control.entity_field ef
   SET is_computed  = true,
       compute_mode = f.mode,
       updated_at   = now()
  FROM (VALUES
    -- net_amount: DDL GENERATED ALWAYS AS (qty*price/NULLIF(price_unit,0))
    ('net_amount',       'generated'),
    -- gross_amount: NOT NULL DEFAULT 0, recomputed in invoice-lines.handler.ts
    -- and by tax-calculation.service when tax/discount changes
    ('gross_amount',     'service'),
    -- match_status, matched_quantity: invoice-match.service writes
    ('match_status',     'service'),
    ('matched_quantity', 'service')
  ) AS f(field_name, mode)
 WHERE ef.entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice_line'
          AND e.tenant_id IS NULL
          AND ev.version_no  = 1
   )
   AND ef.name = f.field_name
   AND COALESCE(ef.is_computed, false) = false;


-- ── 3) Purchase Invoice Header — computed-field flags ───────────────────────
UPDATE control.entity_field ef
   SET is_computed  = true,
       compute_mode = f.mode,
       updated_at   = now()
  FROM (VALUES
    -- Trigger-maintained: fn_refresh_purchase_invoice_totals called from
    -- trg_pil_sync_header on every line mutation
    ('total_amount',  'trigger'),     -- column total_amount, labeled "Gross Amount"
    ('net_amount',    'trigger'),     -- column subtotal_amount, labeled "Net Amount"
    ('tax_amount',    'trigger'),
    ('line_count',    'trigger'),
    -- DB-generated columns (refuses non-DEFAULT writes at the DB level)
    ('payable_amount',     'generated'),
    ('outstanding_amount', 'generated'),
    -- Service-maintained
    ('paid_amount',   'service'),     -- payment-posting.service from posted allocations
    ('match_status',  'service')      -- invoice-match.service writes the header roll-up
  ) AS f(field_name, mode)
 WHERE ef.entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
          AND ev.version_no  = 1
   )
   AND ef.name = f.field_name
   AND COALESCE(ef.is_computed, false) = false;


-- ── 4) Accounting Distribution — editable_in_status (parent gate) ───────────
-- For source_doc_type='PURCHASE_INVOICE_LINE', editability tracks the parent
-- invoice's status. AD rows have no own lifecycle.
WITH ad_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    -- Split definition — locked once parent invoice is submitted
    ('distribution_basis',  jsonb_build_array('draft','rejected')::jsonb,
        'Split basis changes the AD amount/qty allocation contract.'),
    ('split_pct',           jsonb_build_array('draft','rejected')::jsonb,
        'Percent splits must sum to 100 across the source line; locks at submit.'),
    ('split_amount',        jsonb_build_array('draft','rejected')::jsonb,
        'Amount splits change posting allocations; locks at submit.'),
    -- Account resolution — locked once parent invoice is submitted
    ('account_source',      jsonb_build_array('draft','rejected')::jsonb,
        'Account source drives resolve_entry_account(); locks at submit.'),
    ('gl_account_id',       jsonb_build_array('draft','rejected')::jsonb,
        'Explicit GL account locks at submit to preserve audit trail.'),
    ('account_code',        jsonb_build_array('draft','rejected')::jsonb,
        'Account code is an alternate FIXED-source input; locks at submit.'),
    ('business_intent_id',  jsonb_build_array('draft','rejected')::jsonb,
        'Business intent drives FROM_INTENT account resolution.'),
    ('commodity_category_id', jsonb_build_array('draft','rejected')::jsonb,
        'Commodity category drives FROM_CATEGORY account resolution.'),
    -- Dimensions — locked once parent invoice is submitted
    ('cost_center_id',      jsonb_build_array('draft','rejected')::jsonb,
        'Cost centre drives GL posting; locks at submit.'),
    ('profit_center_id',    jsonb_build_array('draft','rejected')::jsonb,
        'Profit centre drives GL posting; locks at submit.'),
    ('project_id',          jsonb_build_array('draft','rejected')::jsonb,
        'Project drives GL posting; locks at submit.'),
    ('site_id',             jsonb_build_array('draft','rejected')::jsonb,
        'Site drives GL posting; locks at submit.'),
    -- CapEx interlock — locked once parent invoice is submitted
    ('is_capex',            jsonb_build_array('draft','rejected')::jsonb,
        'CapEx flag controls fixed asset capitalization on posting.'),
    ('asset_class_id',      jsonb_build_array('draft','rejected')::jsonb,
        'Asset class drives fixed asset book; locks at submit.'),
    -- Narrative
    ('description',         jsonb_build_array('draft','rejected','on_hold')::jsonb,
        'Split text is annotative; editable while parent invoice is correctable.')
  ) AS rule(field_name, allowed_statuses, reason)
 WHERE ef.entity_version_id = (SELECT version_id FROM ad_version)
   AND ef.name = rule.field_name;


-- ── 5) Accounting Distribution — computed-field flags ───────────────────────
-- distributed_amount: maintained by the posting engine (invoice-posting.service)
--                     from basis × line amount.
-- budget_check_result: set by budget service.
-- account_lookup_key, account_fallback: already is_read_only=true (engine inputs).
UPDATE control.entity_field ef
   SET is_computed  = true,
       compute_mode = f.mode,
       updated_at   = now()
  FROM (VALUES
    ('distributed_amount',  'service'),
    ('budget_check_result', 'service')
  ) AS f(field_name, mode)
 WHERE ef.entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'accounting_distribution'
          AND e.tenant_id IS NULL
          AND ev.version_no  = 1
   )
   AND ef.name = f.field_name
   AND COALESCE(ef.is_computed, false) = false;
