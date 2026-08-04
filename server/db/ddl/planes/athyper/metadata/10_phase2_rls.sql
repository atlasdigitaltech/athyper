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
