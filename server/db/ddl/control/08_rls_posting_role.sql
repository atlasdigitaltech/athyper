ALTER TABLE control.posting_role_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.posting_role_alias FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posting_role_alias_read ON control.posting_role_alias;
DROP POLICY IF EXISTS posting_role_alias_insert ON control.posting_role_alias;
DROP POLICY IF EXISTS posting_role_alias_update ON control.posting_role_alias;
DROP POLICY IF EXISTS posting_role_alias_delete ON control.posting_role_alias;
DROP POLICY IF EXISTS posting_role_alias_admin ON control.posting_role_alias;
CREATE POLICY posting_role_alias_read ON control.posting_role_alias FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY posting_role_alias_insert ON control.posting_role_alias FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY posting_role_alias_update ON control.posting_role_alias FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY posting_role_alias_delete ON control.posting_role_alias FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY posting_role_alias_admin ON control.posting_role_alias FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

ALTER TABLE control.posting_role_account_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.posting_role_account_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pram_read ON control.posting_role_account_map;
DROP POLICY IF EXISTS pram_insert ON control.posting_role_account_map;
DROP POLICY IF EXISTS pram_update ON control.posting_role_account_map;
DROP POLICY IF EXISTS pram_delete ON control.posting_role_account_map;
DROP POLICY IF EXISTS pram_admin ON control.posting_role_account_map;
CREATE POLICY pram_read ON control.posting_role_account_map FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY pram_insert ON control.posting_role_account_map FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY pram_update ON control.posting_role_account_map FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY pram_delete ON control.posting_role_account_map FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY pram_admin ON control.posting_role_account_map FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

