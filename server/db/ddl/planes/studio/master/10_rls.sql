DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['canonical_party','canonical_party_identifier','canonical_party_relationship','canonical_party_merge'] LOOP
    EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('CREATE POLICY authority_tenant_read ON master.%I FOR SELECT USING (authority_tenant_id=shared.current_tenant_id_soft())',v_table);
    EXECUTE format('CREATE POLICY authority_seed_write ON master.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table);
  END LOOP;
END $$;

ALTER TABLE master.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_relationship FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_self_read ON master.tenant
    FOR SELECT
    USING (id = shared.current_tenant_id_soft());

CREATE POLICY seed_write ON master.tenant
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY tenant_read ON master.tenant_profile
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON master.tenant_profile
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_update ON master.tenant_profile
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON master.tenant_profile
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY endpoint_read ON master.tenant_relationship
    FOR SELECT
    USING (
        from_tenant_id = shared.current_tenant_id_soft()
        OR to_tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY seed_write ON master.tenant_relationship
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

ALTER TABLE master.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.workspace FORCE ROW LEVEL SECURITY;
ALTER TABLE master.module ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.module FORCE ROW LEVEL SECURITY;

CREATE POLICY open_read ON master.workspace FOR SELECT USING (true);
CREATE POLICY seed_write ON master.workspace
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY open_read ON master.module FOR SELECT USING (true);
CREATE POLICY seed_write ON master.module
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE master.address ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address FORCE ROW LEVEL SECURITY;
ALTER TABLE master.address_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address_link FORCE ROW LEVEL SECURITY;
ALTER TABLE master.address_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address_event FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_link FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_email FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_phone ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_phone FORCE ROW LEVEL SECURITY;
ALTER TABLE master.external_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.external_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE master.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.team FORCE ROW LEVEL SECURITY;
ALTER TABLE master.team_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.team_member FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.address
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.address
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.address_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.address_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.address_event
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.address_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.contact_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.contact_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.contact_email
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.contact_email
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.contact_phone
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.contact_phone
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.external_reference
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.external_reference
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON master.team
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON master.team
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON master.team_member
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON master.team_member
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE master.principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_identity_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_identity_binding FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_preference FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_notification_preference FORCE ROW LEVEL SECURITY;
ALTER TABLE master.saved_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.saved_view FORCE ROW LEVEL SECURITY;
ALTER TABLE master.record_bookmark ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.record_bookmark FORCE ROW LEVEL SECURITY;
ALTER TABLE master.brand_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.brand_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.letterhead ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.letterhead FORCE ROW LEVEL SECURITY;
ALTER TABLE master.print_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.print_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.template ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.template FORCE ROW LEVEL SECURITY;
ALTER TABLE master.template_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.template_binding FORCE ROW LEVEL SECURITY;

CREATE POLICY principal_self_read ON master.principal
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_profile_self_access ON master.principal_profile
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal_profile
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_identity_binding_self_read
    ON master.principal_identity_binding
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal_identity_binding
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_ui_profile_self_access ON master.principal_ui_profile
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal_ui_profile
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_ui_preference_self_access
    ON master.principal_ui_preference
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal_ui_preference
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_notification_preference_self_access
    ON master.principal_notification_preference
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON master.principal_notification_preference
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY saved_view_read ON master.saved_view
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            scope IN ('shared', 'system')
            OR (
                scope = 'personal'
                AND owner_principal_id = master.current_principal_id_soft()
            )
        )
    );

CREATE POLICY saved_view_insert ON master.saved_view
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            (
                scope = 'personal'
                AND owner_principal_id = master.current_principal_id_soft()
            )
            OR (
                scope = 'shared'
                AND owner_principal_id IS NULL
                AND created_by = master.current_principal_id_soft()
            )
        )
    );

CREATE POLICY saved_view_update ON master.saved_view
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            (
                scope = 'personal'
                AND owner_principal_id = master.current_principal_id_soft()
            )
            OR (
                scope = 'shared'
                AND created_by = master.current_principal_id_soft()
            )
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            (
                scope = 'personal'
                AND owner_principal_id = master.current_principal_id_soft()
            )
            OR (
                scope = 'shared'
                AND owner_principal_id IS NULL
                AND created_by = master.current_principal_id_soft()
            )
        )
    );

CREATE POLICY seed_write ON master.saved_view
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY record_bookmark_self_read ON master.record_bookmark
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );

CREATE POLICY record_bookmark_self_insert ON master.record_bookmark
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );

CREATE POLICY record_bookmark_self_delete ON master.record_bookmark
    FOR DELETE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );

CREATE POLICY seed_write ON master.record_bookmark
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.brand_profile
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.brand_profile
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.letterhead
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.letterhead
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.print_profile
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.print_profile
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.template
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.template
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.template_binding
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.template_binding
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'principal',
            'principal_profile',
            'principal_identity_binding',
            'principal_ui_profile',
            'principal_ui_preference',
            'principal_notification_preference',
            'saved_view',
            'record_bookmark',
            'external_reference',
            'team',
            'team_member',
            'brand_profile',
            'letterhead',
            'print_profile',
            'template',
            'template_binding'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON master.%I '
                'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
