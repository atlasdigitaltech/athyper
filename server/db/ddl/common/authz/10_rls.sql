DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['application_projection','projection_provider','projection_scope'] LOOP EXECUTE format('ALTER TABLE authz.%I ENABLE ROW LEVEL SECURITY',v_table); EXECUTE format('ALTER TABLE authz.%I FORCE ROW LEVEL SECURITY',v_table); EXECUTE format('CREATE POLICY projection_tenant_read ON authz.%I FOR SELECT USING (tenant_id=shared.current_tenant_id_soft())',v_table); EXECUTE format('CREATE POLICY projection_seed_write ON authz.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table); END LOOP; END $$;

ALTER TABLE authz.entity_operation_scope_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.entity_operation_scope_binding FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_operation_scope_binding_published_read ON authz.entity_operation_scope_binding FOR SELECT
USING (
    status = 'published'
    AND effective_from <= now()
    AND (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())
);
CREATE POLICY entity_operation_scope_binding_seed_write ON authz.entity_operation_scope_binding
FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY entity_operation_scope_binding_admin_access ON authz.entity_operation_scope_binding
        FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END; $$;
