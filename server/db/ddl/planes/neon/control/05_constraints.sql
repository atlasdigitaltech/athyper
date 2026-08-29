ALTER TABLE control.rounding_context
    ADD CONSTRAINT rounding_context_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
            REFERENCES master.company_code(tenant_id, id);

ALTER TABLE control.owner_type
    ADD CONSTRAINT owner_type_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE control.owner_type_purpose
    ADD CONSTRAINT owner_type_purpose_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE control.org_unit_type
    ADD CONSTRAINT org_unit_type_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;
ALTER TABLE control.org_unit_type
    ADD CONSTRAINT org_unit_type_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE control.risk_source_config
    ADD CONSTRAINT risk_source_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT risk_source_config_source_fk
        FOREIGN KEY (source_code) REFERENCES master.risk_source(code) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_connector_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.formula_expression
    ADD CONSTRAINT formula_expression_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE control.formula_expression_version
    ADD CONSTRAINT formula_expression_version_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT formula_expression_version_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE control.rate_table
    ADD CONSTRAINT rate_table_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT rate_table_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE control.rate_table_row
    ADD CONSTRAINT rate_table_row_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT rate_table_row_table_fk
    FOREIGN KEY (tenant_id, rate_table_id)
    REFERENCES control.rate_table (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE control.formula_expression
    ADD CONSTRAINT formula_expression_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.formula_expression_version
    ADD CONSTRAINT formula_expression_version_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_version_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_version_published_by_fk
    FOREIGN KEY (published_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.rate_table
    ADD CONSTRAINT rate_table_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.rate_table_row
    ADD CONSTRAINT rate_table_row_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_row_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_item_fk
    FOREIGN KEY (tenant_id, company_code_id, item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE CASCADE;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_status_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_active_range_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        item_id WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    )
    WHERE (status = 'active');

ALTER TABLE control.planning_model
    ADD CONSTRAINT planning_model_company_fk FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_currency_fk FOREIGN KEY (base_currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_based_on_fk FOREIGN KEY (tenant_id, based_on_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.planning_driver
    ADD CONSTRAINT planning_driver_model_fk FOREIGN KEY (tenant_id, planning_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_driver_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_driver_formula_fk FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_driver_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.planning_driver_dependency
    ADD CONSTRAINT planning_dependency_model_fk FOREIGN KEY (tenant_id, planning_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_driver_fk
    FOREIGN KEY (tenant_id, planning_model_id, planning_driver_id)
    REFERENCES control.planning_driver (tenant_id, planning_model_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_depends_on_fk
    FOREIGN KEY (tenant_id, planning_model_id, depends_on_driver_id)
    REFERENCES control.planning_driver (tenant_id, planning_model_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.budget_control_policy
    ADD CONSTRAINT budget_control_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT budget_control_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_override_fk
        FOREIGN KEY (override_policy_definition_id)
        REFERENCES control.policy_definition(id),
    ADD CONSTRAINT budget_control_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.budget_control_policy(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        policy_code WITH =,
        (COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (COALESCE(source_document_type, '*')) WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.payment_execution_profile
    ADD CONSTRAINT payment_execution_profile_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT payment_execution_profile_connector_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.asset_class_book_policy
    ADD CONSTRAINT asset_class_book_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT asset_class_book_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_asset_class_fk
        FOREIGN KEY (tenant_id, asset_class_id)
        REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_ledger_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.asset_class_book_policy
    ADD CONSTRAINT asset_class_book_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        asset_class_id WITH =,
        ledger_book_id WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.commodity_code_classification_policy
    ADD CONSTRAINT commodity_code_classification_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT commodity_code_classification_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commodity_code_classification_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commodity_code_classification_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.commodity_category_buy_policy
    ADD CONSTRAINT cc_buy_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_buy_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_supplier_profile_fk
        FOREIGN KEY (
            tenant_id, company_code_id, company_code_supplier_profile_id
        ) REFERENCES master.company_code_supplier_profile(
            tenant_id, company_code_id, id
        ),
    ADD CONSTRAINT cc_buy_policy_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.commodity_category_sell_policy
    ADD CONSTRAINT cc_sell_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_sell_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_customer_profile_fk
        FOREIGN KEY (
            tenant_id, company_code_id, company_code_customer_profile_id
        ) REFERENCES master.company_code_customer_profile(
            tenant_id, company_code_id, id
        ),
    ADD CONSTRAINT cc_sell_policy_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.commodity_category_inventory_policy
    ADD CONSTRAINT cc_inventory_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_inventory_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

-- Active policy intervals cannot overlap. Nullable scope coordinates use
-- separate partial exclusions so NULL tenant-level scopes remain protected.
ALTER TABLE control.commodity_category_inventory_policy
    ADD CONSTRAINT cc_inventory_tenant_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_inventory_company_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL);

ALTER TABLE control.commodity_category_buy_policy
    ADD CONSTRAINT cc_buy_tenant_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_buy_company_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL
             AND company_code_supplier_profile_id IS NULL),
    ADD CONSTRAINT cc_buy_supplier_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_supplier_profile_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_supplier_profile_id IS NOT NULL),
    ADD CONSTRAINT cc_buy_tenant_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NULL),
    ADD CONSTRAINT cc_buy_company_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NOT NULL
             AND company_code_supplier_profile_id IS NULL),
    ADD CONSTRAINT cc_buy_supplier_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_supplier_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default
             AND company_code_supplier_profile_id IS NOT NULL);

ALTER TABLE control.commodity_category_sell_policy
    ADD CONSTRAINT cc_sell_tenant_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_sell_company_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL
             AND company_code_customer_profile_id IS NULL),
    ADD CONSTRAINT cc_sell_customer_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_customer_profile_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_customer_profile_id IS NOT NULL),
    ADD CONSTRAINT cc_sell_tenant_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NULL),
    ADD CONSTRAINT cc_sell_company_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NOT NULL
             AND company_code_customer_profile_id IS NULL),
    ADD CONSTRAINT cc_sell_customer_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_customer_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default
             AND company_code_customer_profile_id IS NOT NULL);

ALTER TABLE control.procurement_match_tolerance_policy
    ADD CONSTRAINT procurement_match_tolerance_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT procurement_match_tolerance_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.procurement_match_tolerance_policy
    ADD CONSTRAINT procurement_match_tolerance_tenant_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        match_type WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT procurement_match_tolerance_company_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        match_type WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL);

ALTER TABLE control.fx_policy
    ADD CONSTRAINT fx_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fx_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT fx_policy_ledger_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT fx_policy_pivot_currency_fk
        FOREIGN KEY (pivot_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT fx_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.fx_policy(tenant_id, id),
    ADD CONSTRAINT fx_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fx_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fx_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.fx_policy
    ADD CONSTRAINT fx_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        transaction_context WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.dimension_policy
    ADD CONSTRAINT dimension_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT dimension_policy_dimension_type_fk
        FOREIGN KEY (tenant_id, dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT dimension_policy_account_fk
        FOREIGN KEY (tenant_id, scope_account_id)
        REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT dimension_policy_book_fk
        FOREIGN KEY (tenant_id, scope_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT dimension_policy_depends_type_fk
        FOREIGN KEY (tenant_id, depends_on_dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_exclusive_type_fk
        FOREIGN KEY (tenant_id, mutually_exclusive_dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.dimension_policy(tenant_id, id),
    ADD CONSTRAINT dimension_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dimension_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dimension_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

-- Identical active scopes may not overlap in time. Tenant-global and more
-- specific scopes remain distinct coordinates and are resolved by specificity.
ALTER TABLE control.dimension_policy
    ADD CONSTRAINT dimension_policy_active_scope_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        dimension_type_id WITH =,
        COALESCE(company_code_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_account_class::text, '*') WITH =,
        COALESCE(scope_account_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_subledger_type::text, '*') WITH =,
        COALESCE(scope_book_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_document_type, '*') WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.dimension_policy_allowed_value
    ADD CONSTRAINT dimension_policy_allowed_value_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT dimension_policy_allowed_value_policy_fk
        FOREIGN KEY (tenant_id, policy_id, dimension_type_id)
        REFERENCES control.dimension_policy(tenant_id, id, dimension_type_id)
        ON DELETE CASCADE,
    ADD CONSTRAINT dimension_policy_allowed_value_value_fk
        FOREIGN KEY (tenant_id, dimension_type_id, dimension_value_id)
        REFERENCES master.dimension_value(tenant_id, dimension_type_id, id),
    ADD CONSTRAINT dimension_policy_allowed_value_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_rate_schedule
    ADD CONSTRAINT tax_rate_schedule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_rate_schedule_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_tax_type_fk
        FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_currency_fk
        FOREIGN KEY (rate_currency) REFERENCES shared.currency(code),
    ADD CONSTRAINT tax_rate_schedule_uom_fk
        FOREIGN KEY (rate_uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT tax_rate_schedule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_rate_schedule
    ADD CONSTRAINT tax_rate_schedule_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        jurisdiction_id WITH =,
        tax_type_id WITH =,
        tax_direction WITH =,
        component_code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.tax_group
    ADD CONSTRAINT tax_group_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_group_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_group_rounding_rule_fk
        FOREIGN KEY (tenant_id, rounding_rule_id) REFERENCES control.rounding_rule(tenant_id, id),
    ADD CONSTRAINT tax_group_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_group_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_group_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_group_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_group
    ADD CONSTRAINT tax_group_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.tax_group_component
    ADD CONSTRAINT tax_group_component_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_group_component_group_fk
        FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_group_component_schedule_fk
        FOREIGN KEY (tenant_id, tax_rate_schedule_id) REFERENCES control.tax_rate_schedule(tenant_id, id),
    ADD CONSTRAINT tax_group_component_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_resolution_rule
    ADD CONSTRAINT tax_resolution_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_resolution_rule_company_fk
        FOREIGN KEY (tenant_id, scope_company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_billto_fk
        FOREIGN KEY (tenant_id, scope_billto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_shipto_fk
        FOREIGN KEY (tenant_id, scope_shipto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_billfrom_fk
        FOREIGN KEY (tenant_id, scope_billfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_shipfrom_fk
        FOREIGN KEY (tenant_id, scope_shipfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_commodity_category_fk
        FOREIGN KEY (tenant_id, scope_commodity_category_id) REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_tax_group_fk
        FOREIGN KEY (tenant_id, resolved_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_resolution_rule
    ADD CONSTRAINT tax_resolution_rule_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.wht_threshold_config
    ADD CONSTRAINT wht_threshold_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT wht_threshold_config_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_tax_type_fk
        FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_currency_fk
        FOREIGN KEY (threshold_currency) REFERENCES shared.currency(code),
    ADD CONSTRAINT wht_threshold_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.wht_threshold_config
    ADD CONSTRAINT wht_threshold_config_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        jurisdiction_id WITH =,
        tax_type_id WITH =,
        COALESCE(section_code, '') WITH =,
        threshold_mode WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.accounting_profile_policy
    ADD CONSTRAINT accounting_profile_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_policy_profile_fk
        FOREIGN KEY (tenant_id, accounting_profile_id)
        REFERENCES master.accounting_profile(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_policy
    ADD CONSTRAINT accounting_profile_policy_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        accounting_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.accounting_profile_event
    ADD CONSTRAINT accounting_profile_event_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_event_policy_fk
        FOREIGN KEY (tenant_id, accounting_profile_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT accounting_profile_event_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_entry
    ADD CONSTRAINT accounting_profile_entry_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_entry_event_fk
        FOREIGN KEY (tenant_id, accounting_profile_event_id)
        REFERENCES control.accounting_profile_event(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT accounting_profile_entry_condition_type_fk
        FOREIGN KEY (tenant_id, condition_type_id)
        REFERENCES master.condition_type(tenant_id, id),
    ADD CONSTRAINT accounting_profile_entry_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_assignment
    ADD CONSTRAINT accounting_profile_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_policy_fk
        FOREIGN KEY (tenant_id, accounting_profile_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_assignment
    ADD CONSTRAINT accounting_profile_assignment_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(business_intent_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(flow_code, '') WITH =,
        COALESCE(document_type_code, '') WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.posting_role_account_assignment
    ADD CONSTRAINT posting_role_account_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT posting_role_account_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_gl_account_fk
        FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_assignment_id)
        REFERENCES control.posting_role_account_assignment(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.posting_role_account_assignment
    ADD CONSTRAINT posting_role_account_assignment_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        ledger_book_id WITH =,
        posting_role_code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.cross_book_posting_policy
    ADD CONSTRAINT cross_book_posting_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cross_book_posting_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_source_book_fk
        FOREIGN KEY (tenant_id, source_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_target_book_fk
        FOREIGN KEY (tenant_id, target_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_intent_fk
        FOREIGN KEY (tenant_id, scope_business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_policy_id)
        REFERENCES control.cross_book_posting_policy(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cross_book_posting_policy
    ADD CONSTRAINT cross_book_posting_policy_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        source_book_id WITH =,
        target_book_id WITH =,
        COALESCE(scope_document_type_code, '') WITH =,
        COALESCE(scope_business_intent_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.cross_book_account_assignment
    ADD CONSTRAINT cross_book_account_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cross_book_account_assignment_policy_fk
        FOREIGN KEY (tenant_id, cross_book_posting_policy_id)
        REFERENCES control.cross_book_posting_policy(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT cross_book_account_assignment_source_account_fk
        FOREIGN KEY (tenant_id, source_gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT cross_book_account_assignment_target_account_fk
        FOREIGN KEY (tenant_id, target_gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT cross_book_account_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.fiscal_calendar_config
    ADD CONSTRAINT fiscal_calendar_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fiscal_calendar_config_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.fiscal_calendar_period_rule
    ADD CONSTRAINT fiscal_calendar_period_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fiscal_calendar_period_rule_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fiscal_calendar_period_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.company_fiscal_calendar_assignment
    ADD CONSTRAINT company_fiscal_calendar_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_active_year_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        int4range(
            effective_fiscal_year_from::integer,
            COALESCE(effective_fiscal_year_to::integer + 1, 10000),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE master.fiscal_period
    ADD CONSTRAINT fiscal_period_calendar_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id);

ALTER TABLE control.business_partner_qualification
    ADD CONSTRAINT business_partner_qualification_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_capability_fk
    FOREIGN KEY (tenant_id, commodity_capability_id)
    REFERENCES master.business_partner_commodity_capability (tenant_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_risk_fk
    FOREIGN KEY (tenant_id, risk_assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.supplier_preference_designation
    ADD CONSTRAINT supplier_preference_designation_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_commodity_fk
    FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_revoked_by_fk
    FOREIGN KEY (tenant_id, revoked_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_preference_designation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.business_partner_block
    ADD CONSTRAINT business_partner_block_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_blocked_by_fk
    FOREIGN KEY (tenant_id, blocked_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_lifted_by_fk
    FOREIGN KEY (tenant_id, lifted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.mesh_business_partner_profile_inbox
    ADD CONSTRAINT mesh_bp_profile_inbox_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_inbox_received_by_fk FOREIGN KEY (tenant_id, received_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.mesh_business_partner_profile_processing_attempt
    ADD CONSTRAINT mesh_bp_profile_attempt_inbox_fk FOREIGN KEY (tenant_id, inbox_event_id)
    REFERENCES control.mesh_business_partner_profile_inbox (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_attempt_processed_by_fk FOREIGN KEY (tenant_id, processed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.mesh_business_partner_profile_projection
    ADD CONSTRAINT mesh_bp_profile_projection_snapshot_fk FOREIGN KEY (tenant_id, current_snapshot_id)
    REFERENCES snapshot.mesh_business_partner_profile_received (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_projection_event_fk FOREIGN KEY (tenant_id, last_inbox_event_id)
    REFERENCES control.mesh_business_partner_profile_inbox (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_projection_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE control.mesh_business_partner_account_link
  ADD CONSTRAINT mesh_bp_account_link_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_projection_fk FOREIGN KEY(tenant_id,profile_projection_id) REFERENCES control.mesh_business_partner_profile_projection(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_external_fk FOREIGN KEY(tenant_id,external_reference_id) REFERENCES master.external_reference(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_request_fk FOREIGN KEY(tenant_id,onboarding_request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_reviewed_by_fk FOREIGN KEY(tenant_id,reviewed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bp_account_link_terminated_by_fk FOREIGN KEY(tenant_id,terminated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE control.mesh_bank_account_disclosure_inbox
  ADD CONSTRAINT mesh_bank_disclosure_inbox_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_disclosure_inbox_actor_fk FOREIGN KEY(tenant_id,received_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE control.mesh_bank_account_projection
  ADD CONSTRAINT mesh_bank_account_projection_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_account_projection_link_fk FOREIGN KEY(tenant_id,account_link_id) REFERENCES control.mesh_business_partner_account_link(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_account_projection_snapshot_fk FOREIGN KEY(tenant_id,current_snapshot_id) REFERENCES snapshot.mesh_bank_account_disclosure_received(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_account_projection_inbox_fk FOREIGN KEY(tenant_id,last_inbox_event_id) REFERENCES control.mesh_bank_account_disclosure_inbox(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_account_projection_actor_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE control.customer_credit_review
  ADD CONSTRAINT customer_credit_review_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES master.customer(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_reviewed_by_fk FOREIGN KEY(tenant_id,reviewed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE control.customer_lifecycle_event
  ADD CONSTRAINT customer_lifecycle_event_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_lifecycle_event_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_lifecycle_event_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES master.customer(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_lifecycle_event_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_lifecycle_event_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_lifecycle_event_actor_fk FOREIGN KEY(tenant_id,occurred_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE control.external_workforce_rate_card
    ADD CONSTRAINT external_workforce_rate_card_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.external_workforce_rate
    ADD CONSTRAINT external_workforce_rate_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_fk FOREIGN KEY (tenant_id, rate_card_id) REFERENCES control.external_workforce_rate_card(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES master.job(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.external_workforce_rate
    ADD CONSTRAINT external_workforce_rate_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        rate_card_id WITH =,
        COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(worker_classification, '') WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');
