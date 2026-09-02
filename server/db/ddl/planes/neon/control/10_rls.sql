ALTER TABLE control.subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.subscription_plan FORCE ROW LEVEL SECURITY;

CREATE POLICY open_read ON control.subscription_plan FOR SELECT USING (true);
CREATE POLICY seed_write ON control.subscription_plan
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.owner_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type FORCE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose FORCE ROW LEVEL SECURITY;

CREATE POLICY accessible_read ON control.owner_type
    FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY seed_write ON control.owner_type
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY accessible_read ON control.owner_type_purpose
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
              FROM control.owner_type ot
             WHERE ot.id = owner_type_id
               AND (
                   ot.tenant_id IS NULL
                   OR ot.tenant_id = shared.current_tenant_id_soft()
               )
        )
    );

CREATE POLICY seed_write ON control.owner_type_purpose
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

ALTER TABLE control.org_unit_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.org_unit_type FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.org_unit_type FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.org_unit_type FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.risk_source_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.risk_source_config FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.risk_source_config
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.risk_source_config
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.business_partner_qualification ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_qualification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_qualification
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.business_partner_qualification
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.supplier_preference_designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.supplier_preference_designation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.supplier_preference_designation
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.supplier_preference_designation
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.customer_account_designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.customer_account_designation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.customer_account_designation
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.customer_account_designation
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
        CREATE POLICY admin_access ON control.supplier_preference_designation
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON control.customer_account_designation
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON control.business_partner_block
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE control.formula_expression ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression FORCE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression_version FORCE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table FORCE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table_row FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.formula_expression
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.formula_expression
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.formula_expression_version
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.formula_expression_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.rate_table
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.rate_table
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.rate_table_row
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.rate_table_row
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.item_inventory_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.item_inventory_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.item_inventory_policy
FOR ALL
USING (tenant_id = shared.current_tenant_id_soft())
WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON control.item_inventory_policy
FOR ALL TO CURRENT_USER
USING (true)
WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON control.item_inventory_policy
        FOR ALL TO athyperadmin
        USING (true)
        WITH CHECK (true);
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'planning_model', 'planning_driver', 'planning_driver_dependency'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON control.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format(
            'CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY admin_access ON control.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE control.budget_control_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.budget_control_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY budget_control_policy_tenant_access
    ON control.budget_control_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY budget_control_policy_seed_write
    ON control.budget_control_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.payment_execution_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.payment_execution_profile FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_execution_profile_tenant_access
    ON control.payment_execution_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY payment_execution_profile_seed_write
    ON control.payment_execution_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.asset_class_book_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.asset_class_book_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_class_book_policy_tenant_access
    ON control.asset_class_book_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY asset_class_book_policy_seed_write
    ON control.asset_class_book_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.commodity_code_classification_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.commodity_code_classification_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY commodity_code_classification_policy_tenant_access
    ON control.commodity_code_classification_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY commodity_code_classification_policy_seed_write
    ON control.commodity_code_classification_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'commodity_category_buy_policy',
        'commodity_category_sell_policy',
        'commodity_category_inventory_policy'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON control.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'commodity_category_buy_policy',
            'commodity_category_sell_policy',
            'commodity_category_inventory_policy'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON control.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;

ALTER TABLE control.procurement_match_tolerance_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.procurement_match_tolerance_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY procurement_match_tolerance_tenant_access
    ON control.procurement_match_tolerance_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY procurement_match_tolerance_seed_write
    ON control.procurement_match_tolerance_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.fx_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fx_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY fx_policy_tenant_access
    ON control.fx_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY fx_policy_seed_write
    ON control.fx_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.dimension_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.dimension_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY dimension_policy_tenant_access
    ON control.dimension_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY dimension_policy_admin_access
    ON control.dimension_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.dimension_policy_allowed_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.dimension_policy_allowed_value FORCE ROW LEVEL SECURITY;

CREATE POLICY dimension_policy_allowed_value_tenant_access
    ON control.dimension_policy_allowed_value FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY dimension_policy_allowed_value_admin_access
    ON control.dimension_policy_allowed_value FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'tax_rate_schedule',
        'tax_group',
        'tax_group_component',
        'tax_resolution_rule',
        'wht_threshold_config'
    ] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL USING '
            || '(tenant_id = shared.current_tenant_id_soft()) WITH CHECK '
            || '(tenant_id = shared.current_tenant_id())',
            v_table || '_tenant_access', v_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL TO CURRENT_USER '
            || 'USING (true) WITH CHECK (true)',
            v_table || '_foundation_owner_access', v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'accounting_profile_policy',
        'accounting_profile_event',
        'accounting_profile_entry',
        'accounting_profile_assignment',
        'posting_role_account_assignment',
        'cross_book_posting_policy',
        'cross_book_account_assignment'
    ] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL USING '
            || '(tenant_id = shared.current_tenant_id_soft()) WITH CHECK '
            || '(tenant_id = shared.current_tenant_id())',
            v_table || '_tenant_access', v_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL TO CURRENT_USER '
            || 'USING (true) WITH CHECK (true)',
            v_table || '_foundation_owner_access', v_table
        );
    END LOOP;
END;
$$;

ALTER TABLE control.fiscal_calendar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_config FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_config_tenant_access
    ON control.fiscal_calendar_config FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY fiscal_calendar_config_admin_access
    ON control.fiscal_calendar_config FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.fiscal_calendar_period_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_period_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_period_rule_tenant_access
    ON control.fiscal_calendar_period_rule FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY fiscal_calendar_period_rule_admin_access
    ON control.fiscal_calendar_period_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.company_fiscal_calendar_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.company_fiscal_calendar_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY company_fiscal_calendar_assignment_tenant_access
    ON control.company_fiscal_calendar_assignment FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY company_fiscal_calendar_assignment_admin_access
    ON control.company_fiscal_calendar_assignment FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'mesh_business_partner_profile_inbox',
        'mesh_business_partner_profile_processing_attempt',
        'mesh_business_partner_profile_projection',
        'mesh_workforce_claim_inbox',
        'mesh_workforce_claim_processing_attempt'
    ] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY %I ON control.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table || '_tenant_access', v_table);
        EXECUTE format('CREATE POLICY %I ON control.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table || '_owner_access', v_table);
    END LOOP;
END;
$$;
ALTER TABLE control.mesh_business_partner_account_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.mesh_business_partner_account_link FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.mesh_business_partner_account_link USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.mesh_business_partner_account_link FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.mesh_bank_account_disclosure_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.mesh_bank_account_disclosure_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.mesh_bank_account_disclosure_inbox USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.mesh_bank_account_disclosure_inbox FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.mesh_bank_account_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.mesh_bank_account_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.mesh_bank_account_projection USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.mesh_bank_account_projection FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.customer_credit_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.customer_credit_review FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.customer_credit_review USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.customer_credit_review FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.customer_lifecycle_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.customer_lifecycle_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.customer_lifecycle_event USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.customer_lifecycle_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.business_partner_mutation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_mutation_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_mutation_evidence FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY seed_write ON control.business_partner_mutation_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.business_partner_decision_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_decision_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_decision_scope USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.business_partner_decision_scope FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['external_workforce_rate_card','external_workforce_rate'] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_access ON control.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END;
$$;
