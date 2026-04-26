-- =============================================================================
-- 023_entity_field_fixes.sql
-- Fixes two categories of entity_field seed errors:
--
-- §1  payment_term_id ref_entity: 'payment_terms' → 'payment_term' (singular)
--     The entity is registered as 'payment_term' in control.entity; the plural
--     form caused 404 "Entity not found" when the detail page resolved refs.
--
-- §2  Remove spurious 'name', 'code', 'description' entity_field rows seeded
--     by 000_common_fields.sql for MASTER-class entities whose backing tables
--     do not actually have those columns (e.g. profile/junction tables like
--     company_code_supplier_profile, company_code_customer_profile).
--     The missing column caused listHandler ORDER BY "name" → 500.
--
-- Idempotent: UPDATE is a no-op when already correct; DELETE targets only
-- mismatched rows via information_schema.columns cross-check.
-- =============================================================================

DO $$
DECLARE
  updated int;
  deleted int;
BEGIN

  -- ── §1  Fix payment_term_id ref_entity ──────────────────────────────────────
  UPDATE control.entity_field ef
     SET validation = jsonb_set(ef.validation, '{ref_entity}', '"payment_term"')
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE ef.entity_version_id = ev.id
     AND e.table_schema  = 'document'
     AND e.table_name    = 'purchase_invoice'
     AND e.tenant_id    IS NULL
     AND ef.name         = 'payment_term_id'
     AND ef.tenant_id   IS NULL
     AND ef.validation->>'ref_entity' = 'payment_terms';

  GET DIAGNOSTICS updated = ROW_COUNT;
  RAISE NOTICE '023 §1: payment_term_id ref_entity corrected (% rows updated)', updated;

  -- ── §2  Remove spurious name/code/description fields for tables lacking them ─
  -- Targets entity_field rows where column_name does not exist in the backing
  -- table. Uses information_schema.columns as the authoritative source.
  DELETE FROM control.entity_field ef
  USING control.entity_version ev
  JOIN  control.entity e ON e.id = ev.entity_id
  WHERE ef.entity_version_id = ev.id
    AND ef.name        IN ('name', 'code', 'description')
    AND ef.tenant_id   IS NULL
    AND ef.origin       = 'standard'
    AND NOT EXISTS (
      SELECT 1
        FROM information_schema.columns ic
       WHERE ic.table_schema = e.table_schema
         AND ic.table_name   = e.table_name
         AND ic.column_name  = ef.column_name
    );

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RAISE NOTICE '023 §2: removed % spurious name/code/description entity_field rows', deleted;

END $$;
