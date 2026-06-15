-- ============================================================================
-- master/08z_condition_type_rls.sql
-- Concept: RLS for master.condition_type (P1)
-- Depends on: 01s_tables_condition_type.sql, 08_rls.sql (base conventions)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.8
--
-- Tenant isolation, with one special policy: every tenant sees the system
-- catalog (tenant_id IS NULL AND is_system=true).
-- ============================================================================

ALTER TABLE master.condition_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.condition_type FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read     ON master.condition_type;
DROP POLICY IF EXISTS tenant_insert   ON master.condition_type;
DROP POLICY IF EXISTS tenant_update   ON master.condition_type;
DROP POLICY IF EXISTS tenant_delete   ON master.condition_type;
DROP POLICY IF EXISTS admin_read      ON master.condition_type;
DROP POLICY IF EXISTS admin_modify    ON master.condition_type;

-- Tenant principal: read own tenant rows AND system catalog
CREATE POLICY tenant_read ON master.condition_type
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id()
           OR (tenant_id IS NULL AND is_system = true));

-- Tenant principal: insert own tenant custom rows (is_system must be false)
CREATE POLICY tenant_insert ON master.condition_type
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND is_system = false);

-- Tenant principal: update own tenant custom rows only
CREATE POLICY tenant_update ON master.condition_type
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()
           AND is_system = false)
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND is_system = false);

-- Tenant principal: delete own tenant custom rows only
CREATE POLICY tenant_delete ON master.condition_type
    FOR DELETE
    USING (tenant_id = shared.current_tenant_id()
           AND is_system = false);

-- Platform admin: read all
CREATE POLICY admin_read ON master.condition_type
    FOR SELECT
    TO athyperadmin
    USING (true);

-- Platform admin: write system catalog
CREATE POLICY admin_modify ON master.condition_type
    FOR ALL
    TO athyperadmin
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- End of 08z_condition_type_rls.sql
-- =============================================================================
