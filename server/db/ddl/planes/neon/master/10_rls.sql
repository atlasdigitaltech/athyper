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

ALTER TABLE master.legal_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.legal_entity FORCE ROW LEVEL SECURITY;
ALTER TABLE master.company_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code FORCE ROW LEVEL SECURITY;
ALTER TABLE master.organization_tax_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.organization_tax_registration FORCE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization FORCE ROW LEVEL SECURITY;
ALTER TABLE master.procurement_organization_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.procurement_organization_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.sales_organization_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.sales_organization_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization_company_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization_company_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.operating_organization_capability FORCE ROW LEVEL SECURITY;
ALTER TABLE master.org_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.org_unit FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.legal_entity FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.legal_entity FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.company_code FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.company_code FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.organization_tax_registration FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.organization_tax_registration FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.operating_organization FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.operating_organization FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.procurement_organization_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.procurement_organization_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.sales_organization_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.sales_organization_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.operating_organization_company_assignment FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.operating_organization_company_assignment FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.operating_organization_capability FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.operating_organization_capability FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.org_unit FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.org_unit FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE master.profit_center ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.profit_center FORCE ROW LEVEL SECURITY;
ALTER TABLE master.cost_center ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.cost_center FORCE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_value FORCE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_set FORCE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_set_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_set_item FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.profit_center FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.profit_center FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.cost_center FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.cost_center FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.dimension_type FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.dimension_type FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON master.dimension_value FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.dimension_value FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

-- Dimension combinations are application-readable but can only be created by
-- the context-bound resolver. Direct application DML is not granted.
CREATE POLICY tenant_read ON master.dimension_set FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON master.dimension_set FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_read ON master.dimension_set_item FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_write ON master.dimension_set_item FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

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
            'template_binding',
            'legal_entity',
            'company_code',
            'organization_tax_registration',
            'operating_organization',
            'procurement_organization_profile',
            'sales_organization_profile',
            'operating_organization_company_assignment',
            'operating_organization_capability',
            'org_unit',
            'profit_center',
            'cost_center',
            'dimension_type',
            'dimension_value',
            'dimension_set',
            'dimension_set_item'
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

-- Neon fixed-asset foundation.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_class', 'asset', 'asset_book', 'asset_component'
    ]
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    ALTER TABLE master.asset_assignment_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE master.asset_assignment_history FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_read
        ON master.asset_assignment_history
        FOR SELECT
        USING (tenant_id = shared.current_tenant_id_soft());
    CREATE POLICY tenant_insert
        ON master.asset_assignment_history
        FOR INSERT
        WITH CHECK (tenant_id = shared.current_tenant_id());
    CREATE POLICY seed_write
        ON master.asset_assignment_history
        FOR ALL TO CURRENT_USER
        USING (true) WITH CHECK (true);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'asset_class', 'asset', 'asset_book', 'asset_component',
            'asset_assignment_history'
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

-- Canonical business-partner identity and thin commercial roles.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner', 'supplier', 'customer'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY',
            v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I FORCE ROW LEVEL SECURITY',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'business_partner', 'supplier', 'customer'
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

-- Neon tax-master identity catalogs.
ALTER TABLE master.condition_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.condition_type FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.condition_type FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.condition_type FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_access ON master.condition_type '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['tax_jurisdiction', 'tax_type']
    LOOP
        EXECUTE format(
            'ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR SELECT '
            'USING (tenant_id = shared.current_tenant_id_soft())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY['tax_jurisdiction', 'tax_type']
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

-- Neon payment-term aggregate.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'payment_method',
        'payment_term', 'payment_term_clause',
        'payment_term_discount_tier'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY',
            v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I FORCE ROW LEVEL SECURITY',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'payment_method',
            'payment_term', 'payment_term_clause',
            'payment_term_discount_tier'
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

-- Neon operational banking foundation.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_account', 'bank_account_link',
        'bank_account_house_config'
    ]
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'bank_account', 'bank_account_link',
            'bank_account_house_config'
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

-- Neon accounting foundation.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'accounting_profile', 'chart_of_account', 'gl_account', 'ledger_book',
        'company_code_chart_assignment', 'company_code_book_assignment',
        'fiscal_period', 'fx_rate', 'company_code_dimension_default',
        'company_code_gl_account'
    ]
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'accounting_profile', 'chart_of_account', 'gl_account', 'ledger_book',
            'company_code_chart_assignment', 'company_code_book_assignment',
            'fiscal_period', 'fx_rate', 'company_code_dimension_default',
            'company_code_gl_account'
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
ALTER TABLE master.business_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.business_intent FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.business_intent
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON master.business_intent
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_access ON master.business_intent '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner_alias',
        'business_partner_relationship',
        'business_partner_governance_relation',
        'business_partner_identifier',
        'business_partner_tax_registration',
        'business_partner_commodity_capability',
        'business_partner_industry_classification',
        'business_partner_operating_organization_assignment',
        'company_code_supplier_profile',
        'company_code_customer_profile',
        'legal_entity_internal_partner_link',
        'intercompany_trading_pair',
        'contact_person_identity_link'
    ] LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;

ALTER TABLE master.person ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person FORCE ROW LEVEL SECURITY;
ALTER TABLE master.person_sensitive_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person_sensitive_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.site ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.site FORCE ROW LEVEL SECURITY;
ALTER TABLE master.career_band ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.career_band FORCE ROW LEVEL SECURITY;
ALTER TABLE master.career_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.career_level FORCE ROW LEVEL SECURITY;
ALTER TABLE master.designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.designation FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job_family FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job_function ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job_function FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_grade ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_grade FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job FORCE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar_day FORCE ROW LEVEL SECURITY;
ALTER TABLE master.shift_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.shift_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern_day FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_component FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_group FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure_line FORCE ROW LEVEL SECURITY;
ALTER TABLE master.statutory_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.statutory_scheme FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE master.position ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.position FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee_leave_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee_leave_enrollment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee_statutory_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee_statutory_enrollment FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'person', 'person_sensitive_profile', 'site',
        'career_band', 'career_level', 'designation', 'job_family',
        'job_function', 'pay_grade', 'job', 'holiday_calendar',
        'holiday_calendar_day', 'shift_type', 'work_pattern',
        'work_pattern_day', 'pay_component', 'pay_group', 'pay_structure',
        'pay_structure_line', 'statutory_scheme', 'leave_type', 'leave_plan',
        'leave_plan_rule', 'position', 'employee', 'employment',
        'work_assignment', 'employee_leave_enrollment',
        'employee_statutory_enrollment'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I '
            'FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I '
            'FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;

ALTER TABLE master.warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.warehouse FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.warehouse
FOR ALL
USING (tenant_id = shared.current_tenant_id_soft())
WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON master.warehouse
FOR ALL TO CURRENT_USER
USING (true)
WITH CHECK (true);

ALTER TABLE master.party_risk_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_assessment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_dimension_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_dimension_score FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_driver ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_driver FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_mitigation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_mitigation FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_review_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_review_event FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'party_risk_assessment',
        'party_risk_dimension_score',
        'party_risk_evidence',
        'party_risk_driver',
        'party_risk_mitigation',
        'party_risk_review_event'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I '
            'FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I '
            'FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'commodity_category', 'product', 'item', 'commodity_code_assignment',
        'catalog', 'catalog_item', 'catalog_price', 'bom', 'bom_component'
    ]
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'commodity_category', 'product', 'item', 'commodity_code_assignment',
            'catalog', 'catalog_item', 'catalog_price', 'bom', 'bom_component'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON master.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['project', 'project_wbs', 'project_item']
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY admin_access ON master.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE master.compensation_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.compensation_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.compensation_assignment FOR ALL
USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON master.compensation_assignment FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    CREATE POLICY admin_access ON master.compensation_assignment FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
END IF; END $$;

ALTER TABLE master.certification_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.certification_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.certification FORCE ROW LEVEL SECURITY;

CREATE POLICY certification_type_admin_write
  ON master.certification_type
  FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY certification_type_tenant_read
  ON master.certification_type
  FOR SELECT TO PUBLIC
  USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY certification_type_tenant_write
  ON master.certification_type
  FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY certification_admin_write
  ON master.certification
  FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY certification_tenant_read
  ON master.certification
  FOR SELECT TO PUBLIC
  USING (
    shared.current_tenant_id_soft() IS NOT NULL
    AND tenant_id = shared.current_tenant_id_soft()
  );
CREATE POLICY certification_tenant_write
  ON master.certification
  FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());


ALTER TABLE master.organization_amendment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.organization_amendment FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_amendment_tenant_read ON master.organization_amendment FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY organization_amendment_seed_owner ON master.organization_amendment FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

ALTER TABLE master.external_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.external_worker FORCE ROW LEVEL SECURITY;
CREATE POLICY external_worker_tenant_access ON master.external_worker FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY external_worker_seed_write ON master.external_worker FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Publication resolves configured tenant-local service identities for target jobs.
CREATE POLICY publication_service_principal_read ON master.principal
  FOR SELECT TO athyper_publication_service
  USING (tenant_id=shared.current_tenant_id_soft() AND principal_type='service_account');

ALTER TABLE master.bank_provisional_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_provisional_reference FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.bank_provisional_reference FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON master.bank_provisional_reference FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
