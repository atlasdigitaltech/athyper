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
