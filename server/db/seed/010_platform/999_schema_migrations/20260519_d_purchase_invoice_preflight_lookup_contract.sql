-- =============================================================================
-- 20260519_d_purchase_invoice_preflight_lookup_contract.sql
-- Purpose: Repair purchase_invoice preflight dimensions so option loading is
--          driven by explicit enum lookup domains, not stale text metadata.
-- =============================================================================

DO $$
DECLARE
    v_su constant uuid := '00000000-0000-0000-0000-000000000000';
    v_updated integer := 0;
BEGIN
    WITH expected(entity_code, field_name, domain_code) AS (
        VALUES
            ('purchase_invoice', 'invoice_type',   'document.purchase_invoice_type'),
            ('purchase_invoice', 'invoice_source', 'document.purchase_invoice_source')
    )
    UPDATE control.entity_field ef
       SET data_type = 'enum',
           ui_type = 'select',
           enum_domain_code = expected.domain_code,
           enum_config = NULL,
           validation = NULL,
           updated_at = now(),
           updated_by = v_su
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
      JOIN expected ON expected.entity_code = COALESCE(e.entity_code, e.name)
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND ev.status = 'EFFECTIVE'
       AND ef.is_active = true
       AND ef.name = expected.field_name
       AND (
           ef.data_type IS DISTINCT FROM 'enum'
           OR ef.ui_type IS DISTINCT FROM 'select'
           OR ef.enum_domain_code IS DISTINCT FROM expected.domain_code
           OR ef.enum_config IS NOT NULL
           OR ef.validation IS NOT NULL
       );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'purchase_invoice preflight lookup contract repaired: % field row(s)', v_updated;
END $$;
