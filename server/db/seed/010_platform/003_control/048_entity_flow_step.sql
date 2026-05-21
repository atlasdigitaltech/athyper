-- Table-owned seed for control.entity_flow_step
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/200_document/006_document_patches.sql
-- ============================================================


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
