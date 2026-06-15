-- ============================================================================
-- document/08u_pricing_component_rls.sql
-- Concept: RLS for document.pricing_component
-- Depends on: 01u_tables_pricing_component.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §3.3
-- Pattern: matches §8/§9 in 08_rls.sql
-- ============================================================================

ALTER TABLE document.pricing_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.pricing_component FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON document.pricing_component;
DROP POLICY IF EXISTS tenant_insert ON document.pricing_component;
DROP POLICY IF EXISTS tenant_update ON document.pricing_component;
DROP POLICY IF EXISTS admin_read    ON document.pricing_component;

-- Tenant principal: read own tenant rows
CREATE POLICY tenant_read ON document.pricing_component
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id());

-- Tenant principal: insert own tenant rows
CREATE POLICY tenant_insert ON document.pricing_component
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- Tenant principal: update own tenant rows (immutability + supersede-only enforced at trigger)
CREATE POLICY tenant_update ON document.pricing_component
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- No tenant_delete — PC rows are never deleted (audit trail).

-- Platform admin: read all
CREATE POLICY admin_read ON document.pricing_component
    FOR SELECT
    TO athyperadmin
    USING (true);


-- =============================================================================
-- End of 08u_pricing_component_rls.sql
-- =============================================================================
