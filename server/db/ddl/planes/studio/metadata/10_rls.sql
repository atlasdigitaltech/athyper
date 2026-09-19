ALTER TABLE metadata.entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_tenant_read ON metadata.entity
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_tenant_insert ON metadata.entity
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY entity_tenant_update ON metadata.entity
    FOR UPDATE TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_change_set FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_change_set_tenant_read ON metadata.entity_change_set
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_change_set_tenant_insert ON metadata.entity_change_set
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY entity_change_set_tenant_update ON metadata.entity_change_set
    FOR UPDATE TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE metadata.entity_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_release FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_release_tenant_read ON metadata.entity_release
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_release_tenant_insert ON metadata.entity_release
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND published_by = master.current_principal_id_soft()
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON metadata.entity
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON metadata.entity_change_set
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON metadata.entity_release
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE metadata.entity_class_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_class_profile FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_class_profile_read ON metadata.entity_class_profile
    FOR SELECT TO athyperapp USING (true);

ALTER TABLE metadata.entity_runtime_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_runtime_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_field FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_key FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_key_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_key_field FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_search_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_search_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_search_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_search_field FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation_target FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_relation_field FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'entity_runtime_profile',
        'entity_field',
        'entity_key',
        'entity_key_field',
        'entity_search_profile',
        'entity_search_field',
        'entity_relation',
        'entity_relation_target',
        'entity_relation_field'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp '
            'USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp '
            'WITH CHECK (tenant_id = shared.current_tenant_id() '
            'AND created_by = master.current_principal_id_soft())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp '
            'USING (tenant_id = shared.current_tenant_id_soft())',
            v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'entity_class_profile',
            'entity_runtime_profile',
            'entity_field',
            'entity_key',
            'entity_key_field',
            'entity_search_profile',
            'entity_search_field',
            'entity_relation',
            'entity_relation_target',
            'entity_relation_field'
        ] LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON metadata.%I '
                'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'entity_surface', 'entity_surface_section', 'entity_surface_field_binding', 'entity_surface_component_binding', 'entity_operation',
        'entity_operation_permission'
    ] LOOP
        EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id = shared.current_tenant_id() AND created_by = master.current_principal_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft())', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format('CREATE POLICY admin_access ON metadata.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'entity_surface_operation', 'entity_operation_rule', 'entity_flow', 'entity_flow_step',
        'entity_policy_binding', 'entity_field_policy_binding', 'entity_contract_test_case'
    ] LOOP
        EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id = shared.current_tenant_id() AND created_by = master.current_principal_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft())', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format('CREATE POLICY admin_access ON metadata.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['entity_lifecycle_binding','entity_lifecycle_operation_binding'] LOOP
    EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft())',v_table);
    EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft())',v_table);
    EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())',v_table);
    EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id=shared.current_tenant_id_soft())',v_table);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN EXECUTE format('CREATE POLICY admin_access ON metadata.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',v_table); END IF;
  END LOOP;
END $$;

ALTER TABLE metadata.entity_numbering_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_numbering_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_numbering_binding_read ON metadata.entity_numbering_binding
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_numbering_binding_write ON metadata.entity_numbering_binding
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY entity_numbering_binding_seed_write ON metadata.entity_numbering_binding
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE metadata.entity_operation_scope_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_operation_scope_binding FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_operation_scope_binding_read
    ON metadata.entity_operation_scope_binding
    FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

CREATE POLICY entity_operation_scope_binding_write
    ON metadata.entity_operation_scope_binding
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY entity_operation_scope_binding_seed_write
    ON metadata.entity_operation_scope_binding
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
