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

