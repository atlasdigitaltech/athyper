-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
ALTER TABLE authz.permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.permission FORCE ROW LEVEL SECURITY;

CREATE POLICY published_read ON authz.permission
    FOR SELECT USING (status = 'published');
CREATE POLICY seed_write ON authz.permission
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE authz.plane_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.plane_membership FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.scope_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.scope_target FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.role ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.role FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.role_permission FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.principal_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.principal_group FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.group_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.group_member FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.group_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.group_role FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.deny_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.deny_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.delegation ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.delegation FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.delegation_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.delegation_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.override ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.override FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.record_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.record_acl FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.trusted_device ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.trusted_device FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON authz.plane_membership
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.plane_membership
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.scope_target
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.scope_target
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.role
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.role
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.role_permission
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.role_permission
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.principal_group
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.principal_group
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.group_member
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.group_member
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.group_role
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.group_role
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.deny_rule
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.deny_rule
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.delegation
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.delegation
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.delegation_grant
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.delegation_grant
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.override
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.override
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON authz.record_acl
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON authz.record_acl
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY trusted_device_self_read ON authz.trusted_device
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );

CREATE POLICY trusted_device_self_insert ON authz.trusted_device
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
        AND revoked_at IS NULL
        AND revoked_by IS NULL
        AND revocation_reason IS NULL
    );

CREATE POLICY trusted_device_self_update ON authz.trusted_device
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );

CREATE POLICY seed_write ON authz.trusted_device
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'permission',
            'plane_membership',
            'scope_target',
            'role',
            'role_permission',
            'principal_group',
            'group_member',
            'group_role',
            'deny_rule',
            'delegation',
            'delegation_grant',
            'override',
            'record_acl',
            'trusted_device'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON authz.%I '
                'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;

-- Athyper-published and reconciled authorization projections.
DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['application_projection','projection_provider','projection_scope'] LOOP EXECUTE format('ALTER TABLE authz.%I ENABLE ROW LEVEL SECURITY',v_table); EXECUTE format('ALTER TABLE authz.%I FORCE ROW LEVEL SECURITY',v_table); EXECUTE format('CREATE POLICY projection_tenant_read ON authz.%I FOR SELECT USING (tenant_id=shared.current_tenant_id_soft())',v_table); EXECUTE format('CREATE POLICY projection_seed_write ON authz.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table); END LOOP; END $$;

ALTER TABLE authz.entity_operation_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.entity_operation_binding FORCE ROW LEVEL SECURITY;
ALTER TABLE authz.entity_operation_scope_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.entity_operation_scope_binding FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_operation_binding_published_read ON authz.entity_operation_binding FOR SELECT
USING (status='published' AND effective_from<=now()
  AND (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft()));
CREATE POLICY entity_operation_binding_seed_write ON authz.entity_operation_binding
FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY entity_operation_scope_binding_published_read ON authz.entity_operation_scope_binding FOR SELECT
USING (EXISTS(SELECT 1 FROM authz.entity_operation_binding b
  WHERE b.id=entity_operation_binding_id AND b.status='published' AND b.effective_from<=now()
    AND (b.tenant_id IS NULL OR b.tenant_id=shared.current_tenant_id_soft())));
CREATE POLICY entity_operation_scope_binding_seed_write ON authz.entity_operation_scope_binding
FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY entity_operation_binding_admin_access ON authz.entity_operation_binding
        FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY entity_operation_scope_binding_admin_access ON authz.entity_operation_scope_binding
        FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END; $$;
