-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/001_invoice_v2.sql
-- Purpose: Fix entity_field name mismatches and add new fields for purchase_invoice.
-- §G0: Drop any non-standard triggers on entity_field (defensive cleanup)
-- §F1: Rename gross_amount → total_amount
-- §F2: Rename supplier_invoice_number (was vendor_invoice_ref)
-- §F3: Add tax_mode field registration
-- §F4: Add tax_mode_source field registration
-- §F5: Patch Step 1 + Step 2 advance_rules to use corrected field names
-- Idempotent: plain SQL with WHERE NOT EXISTS / WHERE clauses
-- Depends on: 001_invoice.sql (entity_version must exist)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- §G0  Defensive: drop any unexpected triggers on control.entity_field
--      (guards against rogue triggers from prior migration attempts that
--       reference a non-existent "status" column on this table)
-- ---------------------------------------------------------------------------
DO $guard$ DECLARE t text; BEGIN
  FOR t IN
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'control.entity_field'::regclass
       AND NOT tgisinternal
       AND tgname NOT IN ('trg_ef_updated_at', 'trg_ef_flag_defaults')
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(t) || ' ON control.entity_field';
    RAISE NOTICE '001_invoice_v2 §G0: dropped unexpected trigger % from entity_field', t;
  END LOOP;
END $guard$;

-- ---------------------------------------------------------------------------
-- §C0  Remove stale old-name rows that may have been re-inserted by a
--      re-run of 001_invoice.sql before the field-name fix landed.
--      Safe no-op on a clean DB: these names never exist there.
-- ---------------------------------------------------------------------------
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
  AND ef.name       IN ('gross_amount', 'vendor_invoice_ref')
  AND ef.tenant_id  IS NULL;

-- ---------------------------------------------------------------------------
-- §F1  Rename gross_amount → total_amount
-- ---------------------------------------------------------------------------

UPDATE control.entity_field ef
   SET name        = 'total_amount',
       column_name = 'total_amount'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name        = 'gross_amount'
   AND ef.tenant_id  IS NULL;

-- ---------------------------------------------------------------------------
-- §F2  Rename supplier_invoice_number (was vendor_invoice_ref)
-- ---------------------------------------------------------------------------

UPDATE control.entity_field ef
   SET name        = 'supplier_invoice_number',
       column_name = 'supplier_invoice_number'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name        = 'vendor_invoice_ref'
   AND ef.tenant_id  IS NULL;

-- ---------------------------------------------------------------------------
-- §F3  Add tax_mode field (if not exists)
-- ---------------------------------------------------------------------------

INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, data_type, origin,
    label, description, enum_domain_code,
    is_required, is_filterable, is_searchable, is_sortable,
    sort_order, created_by)
SELECT
    NULL,
    ev.id,
    'tax_mode',
    'tax_mode',
    'lookup',
    'standard',
    'Tax Mode',
    'How tax_amount relates to Invoice Total: inclusive (tax within total), exclusive (tax added on top), or no_tax (exempt).',
    'document.purchase_invoice_tax_mode',
    false, true, true, false,
    85,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_field
       WHERE entity_version_id = ev.id
         AND name       = 'tax_mode'
         AND tenant_id IS NULL);

-- ---------------------------------------------------------------------------
-- §F4  Add tax_mode_source field (if not exists)
-- ---------------------------------------------------------------------------

INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, data_type, origin,
    label, description, enum_domain_code,
    is_required, is_filterable, is_searchable, is_sortable,
    sort_order, created_by)
SELECT
    NULL,
    ev.id,
    'tax_mode_source',
    'tax_mode_source',
    'lookup',
    'standard',
    'Tax Mode Source',
    'How tax_mode was determined — for audit trail and UI attribution.',
    'document.purchase_invoice_tax_mode_source',
    false, true, false, false,
    86,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_field
       WHERE entity_version_id = ev.id
         AND name       = 'tax_mode_source'
         AND tenant_id IS NULL);

-- ---------------------------------------------------------------------------
-- §F5  Patch advance_rules: correct field names in the create flow steps
--      Fix Step 1: supplier_invoice_number (was vendor_invoice_ref)
-- ---------------------------------------------------------------------------

UPDATE control.entity_flow_step efs
   SET advance_rule = jsonb_set(
         advance_rule,
         '{required_fields}',
         (SELECT jsonb_agg(
            CASE WHEN val = 'vendor_invoice_ref'
                 THEN to_jsonb('supplier_invoice_number'::text)
                 ELSE to_jsonb(val) END)
          FROM jsonb_array_elements_text(efs.advance_rule->'required_fields') AS val))
  FROM control.entity_flow ef
  JOIN control.entity_version ev ON ev.id = ef.entity_version_id
  JOIN control.entity e          ON e.id  = ev.entity_id
 WHERE efs.flow_id        = ef.id
   AND ef.flow_code       = 'create'
   AND ef.tenant_id      IS NULL
   AND ef.version_no      = 1
   AND efs.step_key       = 'identify'
   AND e.table_schema     = 'document'
   AND e.table_name       = 'purchase_invoice'
   AND e.tenant_id       IS NULL
   AND efs.advance_rule->'required_fields' @> '["vendor_invoice_ref"]'::jsonb;

-- Fix Step 2: gross_amount → total_amount

UPDATE control.entity_flow_step efs
   SET advance_rule = jsonb_set(
         advance_rule,
         '{required_fields}',
         (SELECT jsonb_agg(
            CASE WHEN val = 'gross_amount'
                 THEN to_jsonb('total_amount'::text)
                 ELSE to_jsonb(val) END)
          FROM jsonb_array_elements_text(efs.advance_rule->'required_fields') AS val))
  FROM control.entity_flow ef
  JOIN control.entity_version ev ON ev.id = ef.entity_version_id
  JOIN control.entity e          ON e.id  = ev.entity_id
 WHERE efs.flow_id        = ef.id
   AND ef.flow_code       = 'create'
   AND ef.tenant_id      IS NULL
   AND ef.version_no      = 1
   AND efs.step_key       = 'commercial'
   AND e.table_schema     = 'document'
   AND e.table_name       = 'purchase_invoice'
   AND e.tenant_id       IS NULL
   AND efs.advance_rule->'required_fields' @> '["gross_amount"]'::jsonb;
