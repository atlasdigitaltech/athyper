ALTER TABLE snapshot.template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.template_version FORCE ROW LEVEL SECURITY;

CREATE POLICY template_version_tenant_read
    ON snapshot.template_version
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY template_version_tenant_insert
    ON snapshot.template_version
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY seed_write ON snapshot.template_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.template_version
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE snapshot.mesh_business_partner_profile_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.mesh_business_partner_profile_received FORCE ROW LEVEL SECURITY;
CREATE POLICY mesh_bp_profile_received_tenant_read
    ON snapshot.mesh_business_partner_profile_received FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY mesh_bp_profile_received_tenant_insert
    ON snapshot.mesh_business_partner_profile_received FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY mesh_bp_profile_received_owner_access
    ON snapshot.mesh_business_partner_profile_received FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['bom', 'bom_component']
    LOOP
        EXECUTE format('ALTER TABLE snapshot.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE snapshot.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_read ON snapshot.%I FOR SELECT '
            'USING (tenant_id = shared.current_tenant_id_soft())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_insert ON snapshot.%I FOR INSERT '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON snapshot.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY['bom', 'bom_component']
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON snapshot.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
ALTER TABLE snapshot.mesh_bank_account_disclosure_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.mesh_bank_account_disclosure_received FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON snapshot.mesh_bank_account_disclosure_received USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON snapshot.mesh_bank_account_disclosure_received FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
