ALTER TABLE control.business_partner_qualification ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_qualification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_qualification
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.business_partner_qualification
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.business_partner_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_block FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_block
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.business_partner_block
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON control.business_partner_qualification
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON control.business_partner_block
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;
