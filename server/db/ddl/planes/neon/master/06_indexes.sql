CREATE INDEX tenant_active_lookup_idx
    ON master.tenant (realm_key, code)
    WHERE status = 'active';

CREATE INDEX tenant_subscription_plan_idx
    ON master.tenant (subscription_plan_id)
    WHERE subscription_plan_id IS NOT NULL;

CREATE INDEX tenant_relationship_from_idx
    ON master.tenant_relationship
       (from_tenant_id, relationship_type, status);

CREATE INDEX tenant_relationship_to_idx
    ON master.tenant_relationship
       (to_tenant_id, relationship_type, status);

CREATE INDEX module_workspace_idx ON master.module (workspace_id);

CREATE INDEX address_tenant_status_idx
    ON master.address (tenant_id, status);

CREATE INDEX address_country_idx
    ON master.address (tenant_id, country_code)
    WHERE country_code IS NOT NULL;

CREATE INDEX address_kind_idx
    ON master.address (tenant_id, address_kind)
    WHERE address_kind IS NOT NULL;

CREATE INDEX address_state_region_idx
    ON master.address (tenant_id, state_region_code)
    WHERE state_region_code IS NOT NULL;

CREATE INDEX address_timezone_idx
    ON master.address (tenant_id, timezone_code)
    WHERE timezone_code IS NOT NULL;

CREATE INDEX address_duplicate_candidate_idx
    ON master.address
       (tenant_id, country_code, postal_code, lower(line1), lower(city))
    WHERE status = 'active' AND line1 IS NOT NULL;

CREATE UNIQUE INDEX address_normalized_hash_uq
    ON master.address (tenant_id, normalized_hash)
    WHERE status = 'active';

CREATE INDEX address_link_usage_status_idx
    ON master.address_link (tenant_id, usage_status, purpose, role_qualifier);

CREATE INDEX address_link_owner_idx
    ON master.address_link
       (tenant_id, owner_type_id, owner_id, purpose, role_qualifier);

CREATE INDEX address_link_address_idx
    ON master.address_link (tenant_id, address_id);

CREATE INDEX address_link_owner_type_fk_idx
    ON master.address_link (owner_type_id);

CREATE UNIQUE INDEX address_link_current_primary_uq
    ON master.address_link
       (tenant_id, owner_type_id, owner_id, purpose, role_qualifier)
    NULLS NOT DISTINCT
    WHERE is_primary AND effective_until IS NULL;

CREATE UNIQUE INDEX contact_link_value_uq
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type, value, purpose, role_qualifier)
    NULLS NOT DISTINCT
    WHERE status = 'active' AND effective_until IS NULL;

CREATE UNIQUE INDEX contact_link_one_primary_uq
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type, purpose, role_qualifier)
    NULLS NOT DISTINCT
    WHERE is_primary AND status = 'active' AND effective_until IS NULL;

CREATE INDEX contact_link_owner_idx
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type, purpose);

CREATE INDEX contact_link_owner_type_fk_idx
    ON master.contact_link (owner_type_id);

CREATE INDEX contact_link_verified_idx
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type)
    WHERE is_verified AND status = 'active';

CREATE INDEX contact_email_domain_idx
    ON master.contact_link
       (tenant_id, lower(split_part(value, '@', 2)))
    WHERE channel_type = 'email' AND status = 'active';

CREATE INDEX contact_email_bounce_idx
    ON master.contact_email (tenant_id, last_bounce_at DESC)
    WHERE bounce_count > 0;

CREATE INDEX contact_phone_tenant_fk_idx
    ON master.contact_phone (tenant_id);

CREATE UNIQUE INDEX principal_external_ref_uq
    ON master.principal (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX principal_tenant_status_type_idx
    ON master.principal (tenant_id, status, principal_type);

CREATE INDEX principal_tenant_name_idx
    ON master.principal (tenant_id, lower(name));

CREATE INDEX principal_identity_binding_principal_idx
    ON master.principal_identity_binding
       (tenant_id, principal_id, status);

CREATE UNIQUE INDEX principal_identity_binding_primary_uq
    ON master.principal_identity_binding (tenant_id, principal_id)
    WHERE is_primary AND status = 'active';

CREATE INDEX principal_identity_binding_resolution_idx
    ON master.principal_identity_binding
       (tenant_id, provider_code, realm_key, subject_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX principal_identity_binding_service_client_uq
    ON master.principal_identity_binding
       (tenant_id, provider_code, realm_key, service_client_id)
    WHERE status = 'active' AND service_client_id IS NOT NULL;

CREATE INDEX principal_identity_binding_sync_queue_idx
    ON master.principal_identity_binding
       (sync_status, synced_at, tenant_id)
    WHERE sync_status IN ('pending', 'drift', 'error');

CREATE INDEX principal_ui_preference_lookup_idx
    ON master.principal_ui_preference
       (tenant_id, principal_id, surface_code);

CREATE INDEX principal_notification_preference_lookup_idx
    ON master.principal_notification_preference
       (tenant_id, principal_id, event_code)
    WHERE status = 'active';

CREATE UNIQUE INDEX saved_view_active_code_uq
    ON master.saved_view
       (tenant_id, scope, owner_principal_id, surface_code, entity_code, code)
    NULLS NOT DISTINCT
    WHERE status = 'active';

CREATE UNIQUE INDEX saved_view_active_name_uq
    ON master.saved_view
       (tenant_id, scope, owner_principal_id, surface_code, entity_code, name)
    NULLS NOT DISTINCT
    WHERE status = 'active';

CREATE INDEX saved_view_owner_idx
    ON master.saved_view
       (tenant_id, owner_principal_id, surface_code, entity_code)
    WHERE status = 'active' AND owner_principal_id IS NOT NULL;

CREATE INDEX saved_view_surface_entity_idx
    ON master.saved_view (tenant_id, surface_code, entity_code, name)
    WHERE status = 'active';

CREATE INDEX record_bookmark_principal_recent_idx
    ON master.record_bookmark
       (tenant_id, principal_id, created_at DESC);

CREATE INDEX external_reference_owner_idx
    ON master.external_reference
       (tenant_id, owner_type_id, owner_id, source_system_code);

CREATE INDEX external_reference_active_owner_idx
    ON master.external_reference
       (tenant_id, owner_type_id, owner_id, external_entity_code)
    WHERE status = 'active';

CREATE INDEX external_reference_updated_by_idx
    ON master.external_reference (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;

CREATE INDEX external_reference_status_changed_by_idx
    ON master.external_reference (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX team_active_idx
    ON master.team (tenant_id, team_type, code)
    WHERE status = 'active';

CREATE INDEX team_updated_by_idx
    ON master.team (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;

CREATE INDEX team_status_changed_by_idx
    ON master.team (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE UNIQUE INDEX team_member_active_uq
    ON master.team_member (tenant_id, team_id, principal_id)
    WHERE left_at IS NULL;

CREATE INDEX team_member_principal_active_idx
    ON master.team_member (tenant_id, principal_id, team_id)
    WHERE left_at IS NULL;

CREATE INDEX team_member_team_history_idx
    ON master.team_member (tenant_id, team_id, joined_at DESC);

CREATE INDEX team_member_created_by_idx
    ON master.team_member (tenant_id, created_by);

CREATE INDEX team_member_left_by_idx
    ON master.team_member (tenant_id, left_by)
    WHERE left_by IS NOT NULL;

CREATE UNIQUE INDEX brand_profile_code_uq
    ON master.brand_profile (tenant_id, code);
CREATE UNIQUE INDEX brand_profile_default_uq
    ON master.brand_profile (tenant_id)
    WHERE is_default AND status = 'active';

CREATE UNIQUE INDEX letterhead_code_uq
    ON master.letterhead (tenant_id, code);
CREATE UNIQUE INDEX letterhead_default_uq
    ON master.letterhead (tenant_id)
    WHERE is_default AND status = 'active';

CREATE UNIQUE INDEX print_profile_code_uq
    ON master.print_profile (tenant_id, code);
CREATE UNIQUE INDEX print_profile_default_uq
    ON master.print_profile (tenant_id)
    WHERE is_default AND status = 'active';

CREATE UNIQUE INDEX template_code_uq
    ON master.template (tenant_id, code);
CREATE INDEX template_kind_status_idx
    ON master.template (tenant_id, kind, status);
CREATE INDEX template_current_version_fk_idx
    ON master.template (tenant_id, current_version_id)
    WHERE current_version_id IS NOT NULL;

-- Canonical counterparty identity and thin role lookup paths.
CREATE UNIQUE INDEX business_partner_code_uq
    ON master.business_partner (tenant_id, lower(code));

CREATE INDEX business_partner_name_idx
    ON master.business_partner (tenant_id, lower(name));

CREATE INDEX business_partner_legal_name_idx
    ON master.business_partner (tenant_id, lower(legal_name))
    WHERE legal_name IS NOT NULL;

CREATE INDEX business_partner_parent_idx
    ON master.business_partner (tenant_id, parent_business_partner_id)
    WHERE parent_business_partner_id IS NOT NULL;

CREATE INDEX business_partner_status_idx
    ON master.business_partner (tenant_id, status, code);
CREATE INDEX business_partner_category_ownership_idx
    ON master.business_partner (tenant_id, partner_category, ownership_class, status);

CREATE INDEX business_partner_registration_country_idx
    ON master.business_partner (registration_country_code)
    WHERE registration_country_code IS NOT NULL;

CREATE INDEX business_partner_created_by_idx
    ON master.business_partner (tenant_id, created_by);

CREATE INDEX business_partner_updated_by_idx
    ON master.business_partner (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;

CREATE INDEX business_partner_status_changed_by_idx
    ON master.business_partner (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE UNIQUE INDEX supplier_code_uq
    ON master.supplier (tenant_id, lower(supplier_code));

CREATE INDEX supplier_status_type_idx
    ON master.supplier (tenant_id, status, supplier_type);

CREATE INDEX supplier_created_by_idx
    ON master.supplier (tenant_id, created_by);

CREATE INDEX supplier_updated_by_idx
    ON master.supplier (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;

CREATE INDEX supplier_status_changed_by_idx
    ON master.supplier (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE UNIQUE INDEX customer_code_uq
    ON master.customer (tenant_id, lower(customer_code));

CREATE INDEX customer_status_type_idx
    ON master.customer (tenant_id, status, customer_type);

CREATE INDEX customer_key_account_idx
    ON master.customer (tenant_id, customer_code)
    WHERE is_key_account AND status = 'active';

CREATE INDEX customer_created_by_idx
    ON master.customer (tenant_id, created_by);

CREATE INDEX customer_updated_by_idx
    ON master.customer (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;

CREATE INDEX customer_status_changed_by_idx
    ON master.customer (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE UNIQUE INDEX template_binding_active_coordinate_uq
    ON master.template_binding
       (tenant_id, entity_code, operation_code, variant_code, locale_code)
    WHERE status = 'active';
CREATE INDEX template_binding_resolution_idx
    ON master.template_binding
       (tenant_id, entity_code, operation_code, locale_code, variant_code)
    WHERE status = 'active';
CREATE INDEX template_binding_template_fk_idx
    ON master.template_binding (tenant_id, template_id);

CREATE INDEX legal_entity_parent_idx
    ON master.legal_entity (tenant_id, parent_legal_entity_id)
    WHERE parent_legal_entity_id IS NOT NULL;
CREATE INDEX legal_entity_status_idx
    ON master.legal_entity (tenant_id, status, code);
CREATE INDEX company_code_legal_entity_idx
    ON master.company_code (tenant_id, legal_entity_id, status);

CREATE UNIQUE INDEX organization_tax_registration_active_uq
    ON master.organization_tax_registration
       (tenant_id, legal_entity_id, company_code_id, jurisdiction_id,
        registration_type, registration_number)
    NULLS NOT DISTINCT
    WHERE status = 'active';
CREATE INDEX organization_tax_registration_company_idx
    ON master.organization_tax_registration (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;

CREATE INDEX operating_organization_parent_idx
    ON master.operating_organization (tenant_id, parent_operating_organization_id)
    WHERE parent_operating_organization_id IS NOT NULL;
CREATE INDEX operating_organization_domain_status_idx
    ON master.operating_organization (tenant_id, domain, status, code);
CREATE INDEX operating_organization_company_active_org_idx
    ON master.operating_organization_company_assignment
       (tenant_id, operating_organization_id, effective_from, effective_until, company_code_id)
    WHERE status = 'active';
CREATE INDEX operating_organization_company_active_company_idx
    ON master.operating_organization_company_assignment
       (tenant_id, company_code_id, effective_from, effective_until, operating_organization_id)
    WHERE status = 'active';
CREATE INDEX procurement_organization_profile_lead_company_idx
    ON master.procurement_organization_profile (tenant_id, lead_company_code_id)
    WHERE lead_company_code_id IS NOT NULL;
CREATE INDEX sales_organization_profile_booking_company_idx
    ON master.sales_organization_profile (tenant_id, booking_company_code_id)
    WHERE booking_company_code_id IS NOT NULL;
CREATE INDEX sales_organization_profile_invoicing_company_idx
    ON master.sales_organization_profile (tenant_id, invoicing_company_code_id)
    WHERE invoicing_company_code_id IS NOT NULL;
CREATE INDEX operating_organization_company_assignment_company_idx
    ON master.operating_organization_company_assignment
       (tenant_id, company_code_id, status);
CREATE INDEX operating_organization_company_assignment_organization_idx
    ON master.operating_organization_company_assignment
       (tenant_id, operating_organization_id, status);

CREATE INDEX org_unit_parent_idx
    ON master.org_unit (tenant_id, parent_org_unit_id, sort_order)
    WHERE parent_org_unit_id IS NOT NULL;
CREATE INDEX org_unit_type_status_idx
    ON master.org_unit (tenant_id, org_unit_type_id, status);
CREATE INDEX org_unit_manager_idx
    ON master.org_unit (tenant_id, manager_principal_id)
    WHERE manager_principal_id IS NOT NULL;

-- Neon management-accounting access paths.
CREATE INDEX profit_center_parent_idx
    ON master.profit_center (tenant_id, company_code_id, parent_id, sort_order)
    WHERE parent_id IS NOT NULL;
CREATE INDEX profit_center_company_status_idx
    ON master.profit_center (tenant_id, company_code_id, status, code);
CREATE INDEX profit_center_posting_idx
    ON master.profit_center (tenant_id, company_code_id, code)
    WHERE status = 'active' AND is_posting_allowed;

CREATE INDEX cost_center_parent_idx
    ON master.cost_center (tenant_id, company_code_id, parent_id, sort_order)
    WHERE parent_id IS NOT NULL;
CREATE INDEX cost_center_company_status_idx
    ON master.cost_center (tenant_id, company_code_id, status, code);
CREATE INDEX cost_center_profit_center_idx
    ON master.cost_center (tenant_id, company_code_id, profit_center_id)
    WHERE profit_center_id IS NOT NULL;
CREATE INDEX cost_center_posting_idx
    ON master.cost_center (tenant_id, company_code_id, code)
    WHERE status = 'active' AND is_posting_allowed;

CREATE INDEX dimension_type_scope_status_idx
    ON master.dimension_type (tenant_id, scope_mode, status, sort_order, code);

CREATE UNIQUE INDEX dimension_value_tenant_code_uq
    ON master.dimension_value (tenant_id, dimension_type_id, code)
    WHERE company_code_id IS NULL;
CREATE UNIQUE INDEX dimension_value_company_code_uq
    ON master.dimension_value
       (tenant_id, dimension_type_id, company_code_id, code)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX dimension_value_parent_idx
    ON master.dimension_value
       (tenant_id, dimension_type_id, parent_id, sort_order)
    WHERE parent_id IS NOT NULL;
CREATE INDEX dimension_value_company_status_idx
    ON master.dimension_value
       (tenant_id, company_code_id, dimension_type_id, status, code)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX dimension_value_tenant_status_idx
    ON master.dimension_value (tenant_id, dimension_type_id, status, code)
    WHERE company_code_id IS NULL;

CREATE INDEX dimension_set_item_value_idx
    ON master.dimension_set_item
       (tenant_id, dimension_type_id, dimension_value_id);

-- Neon accounting foundation access paths and active-set invariants.
CREATE INDEX accounting_profile_direction_idx
    ON master.accounting_profile (tenant_id, direction, subledger_type, status, sort_order);

CREATE INDEX chart_of_account_status_idx
    ON master.chart_of_account (tenant_id, status, code);

CREATE INDEX gl_account_parent_idx
    ON master.gl_account (tenant_id, chart_of_account_id, parent_id, sort_order)
    WHERE parent_id IS NOT NULL;
CREATE INDEX gl_account_path_idx
    ON master.gl_account (tenant_id, chart_of_account_id, path);
CREATE INDEX gl_account_posting_idx
    ON master.gl_account (tenant_id, chart_of_account_id, code)
    WHERE status = 'active' AND node_type = 'posting' AND is_blocked = false;
CREATE INDEX gl_account_class_idx
    ON master.gl_account (tenant_id, chart_of_account_id, account_class, status);

CREATE UNIQUE INDEX ledger_book_one_primary_uq
    ON master.ledger_book (tenant_id)
    WHERE is_primary AND status = 'active';
CREATE INDEX ledger_book_category_idx
    ON master.ledger_book (tenant_id, category, status, sort_order);

CREATE UNIQUE INDEX company_code_chart_one_primary_uq
    ON master.company_code_chart_assignment
       (tenant_id, company_code_id, assignment_type)
    WHERE is_primary AND status = 'active';
CREATE INDEX company_code_chart_chart_idx
    ON master.company_code_chart_assignment
       (tenant_id, chart_of_account_id, status, company_code_id);
CREATE INDEX company_code_chart_effective_idx
    ON master.company_code_chart_assignment
       (tenant_id, company_code_id, assignment_type, effective_from, effective_to);

CREATE INDEX company_code_book_book_idx
    ON master.company_code_book_assignment (tenant_id, book_id, status, company_code_id);
CREATE INDEX company_code_book_effective_idx
    ON master.company_code_book_assignment
       (tenant_id, company_code_id, status, effective_from, effective_to, priority);

CREATE INDEX fiscal_period_company_date_idx
    ON master.fiscal_period (tenant_id, company_code_id, start_date, end_date);
CREATE INDEX fiscal_period_company_status_idx
    ON master.fiscal_period (tenant_id, company_code_id, status, fiscal_year, period_number);
CREATE INDEX fiscal_period_calendar_config_idx
    ON master.fiscal_period (tenant_id, fiscal_calendar_config_id, calendar_version_no)
    WHERE fiscal_calendar_config_id IS NOT NULL;

CREATE UNIQUE INDEX fx_rate_one_active_observation_uq
    ON master.fx_rate
       (tenant_id, from_currency, to_currency, rate_type, source, effective_date)
    WHERE status = 'active';
CREATE INDEX fx_rate_lookup_idx
    ON master.fx_rate
       (tenant_id, from_currency, to_currency, rate_type, effective_date DESC, effective_time DESC)
    WHERE status = 'active';
CREATE INDEX fx_rate_supersedes_idx
    ON master.fx_rate (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX company_code_dimension_default_lookup_idx
    ON master.company_code_dimension_default
       (tenant_id, company_code_id, dimension_type_id, status, effective_from, effective_to);
CREATE INDEX company_code_dimension_default_value_idx
    ON master.company_code_dimension_default
       (tenant_id, dimension_type_id, dimension_value_id);

CREATE INDEX company_code_gl_account_gl_idx
    ON master.company_code_gl_account (tenant_id, gl_account_id, status, company_code_id);
CREATE INDEX company_code_gl_account_posting_idx
    ON master.company_code_gl_account (tenant_id, company_code_id, gl_account_id)
    WHERE status = 'active' AND posting_allowed;
CREATE INDEX company_code_gl_account_default_cost_idx
    ON master.company_code_gl_account
       (tenant_id, company_code_id, default_cost_center_id)
    WHERE default_cost_center_id IS NOT NULL;

-- Neon operational banking access paths.
CREATE UNIQUE INDEX bank_party_active_bic_uq
    ON master.bank_party (tenant_id, country_code, bic)
    WHERE bic IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX bank_party_active_national_code_uq
    ON master.bank_party (
        tenant_id, country_code, national_bank_code_type,
        national_bank_code, COALESCE(branch_code, '')
    )
    WHERE national_bank_code IS NOT NULL AND status = 'active';
CREATE INDEX bank_party_type_status_idx
    ON master.bank_party (tenant_id, institution_type, status, name);

CREATE UNIQUE INDEX bank_account_active_iban_uq
    ON master.bank_account (tenant_id, account_id_value)
    WHERE account_id_type = 'iban'
      AND status NOT IN ('closed', 'retired');
CREATE UNIQUE INDEX bank_account_active_local_uq
    ON master.bank_account (
        tenant_id,
        COALESCE(bank_party_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(bank_country_override, '  '::character(2)),
        COALESCE(lower(bank_name_override), ''),
        account_id_value,
        currency_code
    )
    WHERE account_id_type = 'local'
      AND status NOT IN ('closed', 'retired');
CREATE INDEX bank_account_bank_party_idx
    ON master.bank_account (tenant_id, bank_party_id, status)
    WHERE bank_party_id IS NOT NULL;
CREATE INDEX bank_account_correspondent_idx
    ON master.bank_account (tenant_id, correspondent_bank_party_id)
    WHERE correspondent_bank_party_id IS NOT NULL;
CREATE INDEX bank_account_provider_ref_idx
    ON master.bank_account (tenant_id, provider_account_ref)
    WHERE provider_account_ref IS NOT NULL;
CREATE INDEX bank_account_unverified_idx
    ON master.bank_account (tenant_id, status, created_at)
    WHERE NOT is_verified AND status NOT IN ('closed', 'retired');

CREATE INDEX bank_account_link_owner_idx
    ON master.bank_account_link
       (tenant_id, owner_type_id, owner_id, purpose, effective_from, effective_until);
CREATE INDEX bank_account_link_owner_code_idx
    ON master.bank_account_link
       (tenant_id, owner_type, owner_id, purpose, effective_from, effective_until);
CREATE INDEX bank_account_link_account_idx
    ON master.bank_account_link (tenant_id, bank_account_id);
CREATE INDEX bank_account_link_company_idx
    ON master.bank_account_link (tenant_id, company_code_id, purpose)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX bank_account_link_current_idx
    ON master.bank_account_link
       (tenant_id, owner_type, owner_id, purpose, is_primary)
    WHERE effective_until IS NULL;

CREATE INDEX bank_account_house_config_gl_idx
    ON master.bank_account_house_config (tenant_id, gl_account_id);
CREATE INDEX bank_account_house_config_active_idx
    ON master.bank_account_house_config
       (tenant_id, bank_account_link_id, priority DESC)
    WHERE status = 'active';

CREATE INDEX payment_method_catalog_idx
    ON master.payment_method (tenant_id, status, sort_order, direction, instrument_mode, code);

-- Neon payment-term aggregate.
CREATE INDEX payment_term_catalog_idx
    ON master.payment_term (tenant_id, status, sort_order, code);
CREATE UNIQUE INDEX pt_current_version_uq
    ON master.payment_term (tenant_id, code)
    WHERE is_current_version IS TRUE;
CREATE INDEX payment_term_version_idx
    ON master.payment_term (tenant_id, code, version, is_current_version);
CREATE INDEX payment_term_replaces_idx
    ON master.payment_term (tenant_id, replaces_payment_term_id)
    WHERE replaces_payment_term_id IS NOT NULL;
CREATE INDEX payment_term_holiday_calendar_idx
    ON master.payment_term (tenant_id, holiday_calendar_id)
    WHERE holiday_calendar_id IS NOT NULL;
CREATE INDEX payment_term_clause_term_idx
    ON master.payment_term_clause
       (tenant_id, payment_term_id, sequence_no);
CREATE INDEX payment_term_clause_settles_idx
    ON master.payment_term_clause
       (tenant_id, payment_term_id, settles_clause_code)
    WHERE settles_clause_code IS NOT NULL;
CREATE INDEX payment_term_discount_tier_term_idx
    ON master.payment_term_discount_tier
       (tenant_id, payment_term_id, qualify_within_days);

-- Neon tax-master identity catalogs.
CREATE INDEX condition_type_catalog_idx
    ON master.condition_type (tenant_id, status, term_type, sort_order, code);
CREATE INDEX condition_type_sub_type_idx
    ON master.condition_type (tenant_id, term_type, term_sub_type, sort_order)
    WHERE status = 'active' AND term_sub_type IS NOT NULL;
CREATE INDEX condition_type_replaces_idx
    ON master.condition_type (tenant_id, replaces_condition_type_id)
    WHERE replaces_condition_type_id IS NOT NULL;
CREATE INDEX condition_type_applicability_gin_idx
    ON master.condition_type USING gin (applies_to_classes)
    WHERE status = 'active';
CREATE INDEX tax_jurisdiction_geography_idx
    ON master.tax_jurisdiction (
        tenant_id, country_code, state_region_code, jurisdiction_type
    )
    WHERE status = 'active';
CREATE INDEX tax_jurisdiction_authority_idx
    ON master.tax_jurisdiction (tenant_id, authority_name)
    WHERE status = 'active' AND authority_name IS NOT NULL;
CREATE INDEX tax_type_class_idx
    ON master.tax_type (tenant_id, tax_class, section_code_mode)
    WHERE status = 'active';
CREATE INDEX tax_type_condition_type_idx
    ON master.tax_type (tenant_id, condition_type_id)
    WHERE status = 'active' AND condition_type_id IS NOT NULL;
CREATE INDEX organization_tax_registration_jurisdiction_idx
    ON master.organization_tax_registration (tenant_id, jurisdiction_id)
    WHERE status = 'active';

-- Neon fixed-asset foundation.
CREATE INDEX asset_class_parent_idx
    ON master.asset_class (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX asset_class_active_idx
    ON master.asset_class (tenant_id, asset_nature, sort_order)
    WHERE status = 'active';

CREATE INDEX asset_class_idx
    ON master.asset (tenant_id, asset_class_id, status);
CREATE INDEX asset_company_status_idx
    ON master.asset (tenant_id, company_code_id, status);
CREATE INDEX asset_custodian_idx
    ON master.asset (tenant_id, custodian_principal_id)
    WHERE custodian_principal_id IS NOT NULL;
CREATE UNIQUE INDEX asset_active_barcode_uq
    ON master.asset (tenant_id, barcode)
    WHERE barcode IS NOT NULL AND status <> 'retired';
CREATE UNIQUE INDEX asset_active_serial_uq
    ON master.asset (tenant_id, serial_number)
    WHERE serial_number IS NOT NULL AND status <> 'retired';

CREATE INDEX asset_book_ledger_idx
    ON master.asset_book (tenant_id, ledger_book_id, status, asset_id);
CREATE INDEX asset_book_company_idx
    ON master.asset_book (tenant_id, company_code_id, status);
CREATE INDEX asset_book_depreciation_start_idx
    ON master.asset_book (tenant_id, depreciation_start_date)
    WHERE status = 'active' AND depreciation_start_date IS NOT NULL;

CREATE INDEX asset_component_parent_idx
    ON master.asset_component (tenant_id, parent_asset_id, status, sort_order);
CREATE INDEX asset_component_child_idx
    ON master.asset_component (tenant_id, component_asset_id, status);

CREATE INDEX asset_assignment_history_asset_idx
    ON master.asset_assignment_history
        (tenant_id, asset_id, effective_at DESC, id DESC);
CREATE INDEX asset_assignment_history_principal_idx
    ON master.asset_assignment_history (tenant_id, to_principal_id, effective_at DESC)
    WHERE to_principal_id IS NOT NULL;
CREATE INDEX asset_assignment_history_scope_idx
    ON master.asset_assignment_history (tenant_id, to_scope_target_id, effective_at DESC)
    WHERE to_scope_target_id IS NOT NULL;
CREATE INDEX bi_parent_pidx
    ON master.business_intent (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX bi_tenant_domain_pidx
    ON master.business_intent (tenant_id, domain)
    WHERE is_active = true;
CREATE INDEX bi_visibility_pidx
    ON master.business_intent (tenant_id, visibility)
    WHERE is_active = true;

CREATE INDEX person_name_idx
    ON master.person (tenant_id, lower(COALESCE(display_name, name)));
CREATE INDEX person_email_idx
    ON master.person (tenant_id, lower(primary_email))
    WHERE primary_email IS NOT NULL;
CREATE INDEX person_sensitive_profile_person_idx
    ON master.person_sensitive_profile (tenant_id, person_id);

CREATE INDEX site_company_idx
    ON master.site (tenant_id, company_code_id, status);
CREATE INDEX site_parent_idx
    ON master.site (tenant_id, parent_site_id)
    WHERE parent_site_id IS NOT NULL;

CREATE INDEX career_level_band_idx
    ON master.career_level (tenant_id, career_band_id, level_no);
CREATE INDEX job_function_family_idx
    ON master.job_function (tenant_id, job_family_id)
    WHERE job_family_id IS NOT NULL;
CREATE INDEX job_classification_idx
    ON master.job (tenant_id, job_family_id, job_function_id, status);
CREATE INDEX job_grade_idx
    ON master.job (tenant_id, pay_grade_id)
    WHERE pay_grade_id IS NOT NULL;

CREATE UNIQUE INDEX holiday_calendar_one_default_uq
    ON master.holiday_calendar
       (tenant_id, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE is_default AND status = 'active';
CREATE INDEX holiday_calendar_scope_idx
    ON master.holiday_calendar
       (tenant_id, country_code, company_code_id, legal_entity_id, site_id);
CREATE INDEX holiday_calendar_day_year_idx
    ON master.holiday_calendar_day
       (tenant_id, holiday_calendar_id, calendar_year, holiday_date);

CREATE INDEX pay_component_type_idx
    ON master.pay_component (tenant_id, component_type, status);
CREATE INDEX pay_component_formula_idx
    ON master.pay_component (tenant_id, formula_expression_id)
    WHERE formula_expression_id IS NOT NULL;
CREATE INDEX pay_group_company_idx
    ON master.pay_group (tenant_id, company_code_id, status);
CREATE UNIQUE INDEX pay_structure_one_active_per_group_uq
    ON master.pay_structure (tenant_id, pay_group_id, effective_from)
    WHERE status = 'active' AND pay_group_id IS NOT NULL;
CREATE INDEX pay_structure_line_component_idx
    ON master.pay_structure_line (tenant_id, pay_component_id);
CREATE INDEX statutory_scheme_country_idx
    ON master.statutory_scheme (tenant_id, country_code, scheme_type, status);

CREATE INDEX leave_plan_type_idx
    ON master.leave_plan (tenant_id, leave_type_id, status);
CREATE INDEX leave_plan_scope_idx
    ON master.leave_plan (tenant_id, company_code_id, legal_entity_id, country_code);
CREATE INDEX leave_plan_rule_priority_idx
    ON master.leave_plan_rule (tenant_id, leave_plan_id, priority)
    WHERE status = 'active';

CREATE INDEX position_job_idx
    ON master.position (tenant_id, job_id)
    WHERE job_id IS NOT NULL;
CREATE INDEX position_org_unit_idx
    ON master.position (tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL;
CREATE INDEX position_reports_to_idx
    ON master.position (tenant_id, reports_to_position_id)
    WHERE reports_to_position_id IS NOT NULL;

CREATE UNIQUE INDEX employee_principal_uq
    ON master.employee (tenant_id, principal_id)
    WHERE principal_id IS NOT NULL;
CREATE INDEX employee_manager_idx
    ON master.employee (tenant_id, manager_id)
    WHERE manager_id IS NOT NULL;
CREATE INDEX employee_company_idx
    ON master.employee (tenant_id, company_code_id, status);

CREATE INDEX employment_person_idx
    ON master.employment (tenant_id, person_id);
CREATE INDEX employment_employee_idx
    ON master.employment (tenant_id, employee_id)
    WHERE employee_id IS NOT NULL;

CREATE INDEX work_assignment_employee_idx
    ON master.work_assignment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX work_assignment_position_idx
    ON master.work_assignment (tenant_id, position_id)
    WHERE position_id IS NOT NULL;

CREATE INDEX leave_enrollment_employee_idx
    ON master.employee_leave_enrollment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX statutory_enrollment_employee_idx
    ON master.employee_statutory_enrollment (tenant_id, employee_id, effective_from DESC);

CREATE INDEX work_pattern_day_pattern_idx
    ON master.work_pattern_day (tenant_id, work_pattern_id, day_no);

CREATE INDEX warehouse_site_idx ON master.warehouse (tenant_id, site_id);
CREATE INDEX warehouse_active_site_idx ON master.warehouse (tenant_id, site_id, code) WHERE status = 'active';
CREATE INDEX warehouse_type_idx ON master.warehouse (tenant_id, warehouse_type);
CREATE INDEX warehouse_manager_idx ON master.warehouse (tenant_id, manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX warehouse_status_by_idx ON master.warehouse (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX warehouse_created_by_idx ON master.warehouse (tenant_id, created_by);
CREATE INDEX warehouse_updated_by_idx ON master.warehouse (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX risk_dimension_category_idx
    ON master.risk_dimension (category, ordinal)
    WHERE status = 'active';

CREATE INDEX risk_driver_registry_dimension_idx
    ON master.risk_driver_registry (default_dimension_code)
    WHERE default_dimension_code IS NOT NULL;

CREATE INDEX risk_model_context_effective_idx
    ON master.risk_model (applicable_context, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX risk_model_dimension_order_idx
    ON master.risk_model_dimension (model_code, model_version, ordinal);

CREATE INDEX party_risk_assessment_business_partner_idx
    ON master.party_risk_assessment (
        tenant_id, business_partner_id, assessment_context
    );
CREATE UNIQUE INDEX party_risk_assessment_approved_context_uq
    ON master.party_risk_assessment (
        tenant_id, subject_type, subject_id, assessment_context
    )
    WHERE status = 'approved';
CREATE INDEX party_risk_assessment_review_due_idx
    ON master.party_risk_assessment (tenant_id, next_review_at)
    WHERE status = 'approved' AND next_review_at IS NOT NULL;

CREATE INDEX party_risk_dimension_score_assessment_idx
    ON master.party_risk_dimension_score (tenant_id, assessment_id);

CREATE INDEX party_risk_evidence_business_partner_idx
    ON master.party_risk_evidence (tenant_id, business_partner_id, status);
CREATE INDEX party_risk_evidence_subject_idx
    ON master.party_risk_evidence (tenant_id, subject_type, subject_id);
CREATE INDEX party_risk_evidence_source_date_idx
    ON master.party_risk_evidence (
        tenant_id, source_code, evidence_date DESC
    );
CREATE UNIQUE INDEX party_risk_evidence_source_reference_uq
    ON master.party_risk_evidence (
        tenant_id, business_partner_id, source_code, source_reference
    )
    WHERE source_reference IS NOT NULL AND status <> 'superseded';

CREATE INDEX party_risk_driver_assessment_idx
    ON master.party_risk_driver (tenant_id, assessment_id);
CREATE INDEX party_risk_driver_dimension_score_idx
    ON master.party_risk_driver (tenant_id, dimension_score_id)
    WHERE dimension_score_id IS NOT NULL;
CREATE INDEX party_risk_driver_evidence_idx
    ON master.party_risk_driver (tenant_id, evidence_id)
    WHERE evidence_id IS NOT NULL;

CREATE INDEX party_risk_mitigation_business_partner_idx
    ON master.party_risk_mitigation (tenant_id, business_partner_id, status);
CREATE INDEX party_risk_mitigation_assessment_idx
    ON master.party_risk_mitigation (tenant_id, assessment_id)
    WHERE assessment_id IS NOT NULL;
CREATE INDEX party_risk_mitigation_overdue_idx
    ON master.party_risk_mitigation (tenant_id, due_date)
    WHERE status IN ('approved', 'in_progress') AND due_date IS NOT NULL;

CREATE INDEX party_risk_review_event_assessment_idx
    ON master.party_risk_review_event (
        tenant_id, assessment_id, created_at DESC
    );
CREATE INDEX party_risk_review_event_tenant_idx
    ON master.party_risk_review_event (tenant_id, created_at DESC);

CREATE INDEX commodity_category_parent_idx
    ON master.commodity_category (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX commodity_category_active_idx
    ON master.commodity_category (tenant_id, status, sort_order, code);

CREATE INDEX product_category_idx
    ON master.product (tenant_id, commodity_category_id, status);
CREATE INDEX product_uom_idx ON master.product (base_uom_code);
CREATE INDEX product_type_idx
    ON master.product (tenant_id, product_type, status);

CREATE INDEX item_product_idx
    ON master.item (tenant_id, product_id, status);
CREATE INDEX item_company_capability_idx
    ON master.item (
        tenant_id,
        company_code_id,
        status,
        is_purchasable,
        is_sellable,
        is_inventory_managed,
        is_manufactured
    );
CREATE INDEX item_uom_idx ON master.item (base_uom_code);

CREATE INDEX commodity_code_assignment_category_idx
    ON master.commodity_code_assignment (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_product_idx
    ON master.commodity_code_assignment (tenant_id, product_id)
    WHERE product_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_item_idx
    ON master.commodity_code_assignment (tenant_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_code_idx
    ON master.commodity_code_assignment (
        tenant_id, commodity_domain_code, commodity_code_id, status
    );
CREATE UNIQUE INDEX commodity_code_assignment_category_code_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_category_id, commodity_code_id
    )
    WHERE commodity_category_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_product_code_uq
    ON master.commodity_code_assignment (
        tenant_id, product_id, commodity_code_id
    )
    WHERE product_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_item_code_uq
    ON master.commodity_code_assignment (
        tenant_id, item_id, commodity_code_id
    )
    WHERE item_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_category_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_category_id, commodity_domain_code
    )
    WHERE commodity_category_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_product_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, product_id, commodity_domain_code
    )
    WHERE product_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_item_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, item_id, commodity_domain_code
    )
    WHERE item_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_routing_default_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_domain_code, commodity_code_id
    )
    WHERE commodity_category_id IS NOT NULL
      AND is_code_routing_default AND status = 'active';

CREATE INDEX catalog_company_direction_idx
    ON master.catalog (tenant_id, company_code_id, catalog_direction, status);
CREATE INDEX catalog_supplier_idx
    ON master.catalog (tenant_id, supplier_business_partner_id, status)
    WHERE supplier_business_partner_id IS NOT NULL;
CREATE INDEX catalog_source_publication_idx
    ON master.catalog (source_system, source_publication_id)
    WHERE source_publication_id IS NOT NULL;
CREATE UNIQUE INDEX catalog_source_coordinate_uq
    ON master.catalog (
        tenant_id, company_code_id, source_system, source_publication_id
    )
    WHERE source_system IS NOT NULL;

CREATE INDEX catalog_item_catalog_idx
    ON master.catalog_item (tenant_id, catalog_id, status);
CREATE INDEX catalog_item_item_idx
    ON master.catalog_item (tenant_id, item_id, status);
CREATE INDEX catalog_item_source_idx
    ON master.catalog_item (source_catalog_item_id)
    WHERE source_catalog_item_id IS NOT NULL;

CREATE INDEX catalog_price_item_effective_idx
    ON master.catalog_price (
        tenant_id, catalog_item_id, status, valid_from, valid_until
    );
CREATE INDEX catalog_price_currency_idx
    ON master.catalog_price (currency_code);
CREATE INDEX catalog_price_uom_idx
    ON master.catalog_price (price_uom_code);

CREATE INDEX bom_output_item_idx
    ON master.bom (tenant_id, company_code_id, output_item_id, status);
CREATE INDEX bom_effective_idx
    ON master.bom (
        tenant_id, company_code_id, status, effective_from, effective_until
    );
CREATE UNIQUE INDEX bom_released_output_uq
    ON master.bom (tenant_id, company_code_id, output_item_id, bom_type)
    WHERE status = 'released';

CREATE INDEX bom_component_bom_idx
    ON master.bom_component (tenant_id, company_code_id, bom_id, status);
CREATE INDEX bom_component_item_idx
    ON master.bom_component (
        tenant_id, company_code_id, component_item_id, status
    );

-- Audit-principal FKs are indexed because these tables can become high-volume
-- and principal retirement checks must not scan them.
CREATE INDEX commodity_category_created_by_idx
    ON master.commodity_category (tenant_id, created_by);
CREATE INDEX product_created_by_idx
    ON master.product (tenant_id, created_by);
CREATE INDEX item_created_by_idx
    ON master.item (tenant_id, created_by);
CREATE INDEX commodity_code_assignment_created_by_idx
    ON master.commodity_code_assignment (tenant_id, created_by);
CREATE INDEX catalog_created_by_idx
    ON master.catalog (tenant_id, created_by);
CREATE INDEX catalog_item_created_by_idx
    ON master.catalog_item (tenant_id, created_by);
CREATE INDEX catalog_price_created_by_idx
    ON master.catalog_price (tenant_id, created_by);
CREATE INDEX bom_created_by_idx
    ON master.bom (tenant_id, created_by);
CREATE INDEX bom_component_created_by_idx
    ON master.bom_component (tenant_id, created_by);

CREATE INDEX project_customer_idx
    ON master.project (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX project_responsible_idx
    ON master.project (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX project_cost_center_idx
    ON master.project (tenant_id, default_cost_center_id)
    WHERE default_cost_center_id IS NOT NULL;
CREATE INDEX project_status_idx
    ON master.project (tenant_id, company_code_id, status);
CREATE INDEX project_created_by_idx
    ON master.project (tenant_id, created_by);

CREATE INDEX project_wbs_parent_idx
    ON master.project_wbs (tenant_id, project_id, parent_wbs_id)
    WHERE parent_wbs_id IS NOT NULL;
CREATE INDEX project_wbs_responsible_idx
    ON master.project_wbs (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX project_wbs_cost_center_idx
    ON master.project_wbs (tenant_id, default_cost_center_id)
    WHERE default_cost_center_id IS NOT NULL;
CREATE INDEX project_wbs_status_idx
    ON master.project_wbs (tenant_id, project_id, status, is_postable);
CREATE INDEX project_wbs_created_by_idx
    ON master.project_wbs (tenant_id, created_by);

CREATE INDEX project_item_wbs_idx
    ON master.project_item (tenant_id, project_id, project_wbs_id)
    WHERE project_wbs_id IS NOT NULL;
CREATE INDEX project_item_item_idx
    ON master.project_item (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX project_item_status_idx
    ON master.project_item (tenant_id, project_id, status);
CREATE INDEX project_item_created_by_idx
    ON master.project_item (tenant_id, created_by);

CREATE INDEX compensation_assignment_employee_idx ON master.compensation_assignment(tenant_id,employee_id,effective_from DESC);
CREATE INDEX compensation_assignment_employment_idx ON master.compensation_assignment(tenant_id,employment_id,effective_from DESC);
CREATE INDEX compensation_assignment_pay_group_idx ON master.compensation_assignment(tenant_id,pay_group_id,status);
CREATE INDEX compensation_assignment_structure_idx ON master.compensation_assignment(tenant_id,pay_structure_id) WHERE pay_structure_id IS NOT NULL;
CREATE UNIQUE INDEX compensation_assignment_source_change_uq ON master.compensation_assignment(tenant_id,source_compensation_change_id) WHERE source_compensation_change_id IS NOT NULL;

CREATE UNIQUE INDEX business_partner_relationship_current_uq
    ON master.business_partner_relationship
       (tenant_id, source_business_partner_id, target_business_partner_id,
        relationship_type_code)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_relationship_target_idx
    ON master.business_partner_relationship
       (tenant_id, target_business_partner_id, status);

CREATE INDEX business_partner_governance_owner_idx
    ON master.business_partner_governance_relation
       (tenant_id, business_partner_id, relation_type_code, status);
CREATE INDEX business_partner_governance_member_idx
    ON master.business_partner_governance_relation
       (tenant_id, member_business_partner_id)
    WHERE member_business_partner_id IS NOT NULL;

CREATE UNIQUE INDEX business_partner_identifier_active_uq
    ON master.business_partner_identifier
       (tenant_id, business_partner_id, scheme_code, identifier_value)
    WHERE status = 'active';
CREATE UNIQUE INDEX business_partner_identifier_primary_uq
    ON master.business_partner_identifier
       (tenant_id, business_partner_id, scheme_code)
    WHERE is_primary AND status = 'active';
CREATE INDEX business_partner_identifier_value_idx
    ON master.business_partner_identifier
       (tenant_id, scheme_code, identifier_value);

CREATE UNIQUE INDEX business_partner_tax_registration_active_uq
    ON master.business_partner_tax_registration
       (tenant_id, business_partner_id, jurisdiction_id,
        registration_type_code, registration_number)
    WHERE status = 'active';
CREATE UNIQUE INDEX business_partner_tax_registration_primary_uq
    ON master.business_partner_tax_registration
       (tenant_id, business_partner_id, jurisdiction_id, registration_type_code)
    WHERE is_primary AND status = 'active';

CREATE UNIQUE INDEX business_partner_commodity_capability_current_uq
    ON master.business_partner_commodity_capability
       (tenant_id, business_partner_id, commodity_category_id, partner_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_commodity_capability_category_idx
    ON master.business_partner_commodity_capability
       (tenant_id, commodity_category_id, partner_role, status);

CREATE UNIQUE INDEX business_partner_industry_classification_current_uq
    ON master.business_partner_industry_classification
       (tenant_id, business_partner_id, industry_domain_code, industry_code_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE UNIQUE INDEX business_partner_industry_classification_primary_uq
    ON master.business_partner_industry_classification
       (tenant_id, business_partner_id, industry_domain_code)
    WHERE is_primary AND effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_industry_classification_code_idx
    ON master.business_partner_industry_classification
       (industry_domain_code, industry_code_id, status);

CREATE UNIQUE INDEX business_partner_operating_org_assignment_current_uq
    ON master.business_partner_operating_organization_assignment
       (tenant_id, business_partner_id, operating_organization_id, partner_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_operating_org_assignment_org_idx
    ON master.business_partner_operating_organization_assignment
       (tenant_id, operating_organization_id, partner_role, status);

CREATE INDEX company_code_supplier_profile_company_idx
    ON master.company_code_supplier_profile
       (tenant_id, company_code_id, status, supplier_id);
CREATE INDEX company_code_supplier_profile_bank_idx
    ON master.company_code_supplier_profile
       (tenant_id, preferred_remittance_bank_link_id)
    WHERE preferred_remittance_bank_link_id IS NOT NULL;
CREATE INDEX company_code_customer_profile_company_idx
    ON master.company_code_customer_profile
       (tenant_id, company_code_id, status, customer_id);

CREATE UNIQUE INDEX legal_entity_business_partner_link_legal_uq
    ON master.legal_entity_business_partner_link (tenant_id, legal_entity_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE UNIQUE INDEX legal_entity_business_partner_link_partner_uq
    ON master.legal_entity_business_partner_link (tenant_id, business_partner_id)
    WHERE effective_until IS NULL AND status = 'active';

CREATE UNIQUE INDEX intercompany_trading_pair_current_uq
    ON master.intercompany_trading_pair
       (tenant_id, source_company_code_id, counterparty_company_code_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX intercompany_trading_pair_counterparty_idx
    ON master.intercompany_trading_pair
       (tenant_id, counterparty_company_code_id, status);

CREATE INDEX contact_person_identity_link_person_idx
    ON master.contact_person_identity_link (tenant_id, person_id)
    WHERE effective_until IS NULL;

CREATE UNIQUE INDEX certification_type_scope_code_uq
  ON master.certification_type
  USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX certification_type_category_idx
  ON master.certification_type USING btree (category)
  WHERE category IS NOT NULL;
CREATE INDEX certification_type_tenant_idx
  ON master.certification_type USING btree (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX certification_expiry_idx
  ON master.certification USING btree (tenant_id, effective_until)
  WHERE effective_until IS NOT NULL AND status = 'active'::text;
CREATE INDEX certification_owner_idx
  ON master.certification USING btree (tenant_id, owner_type, owner_id);
CREATE INDEX certification_type_idx
  ON master.certification USING btree (tenant_id, certification_type_id)
  WHERE certification_type_id IS NOT NULL;
CREATE UNIQUE INDEX legal_entity_live_canonical_party_uq ON master.legal_entity(tenant_id,canonical_party_id) WHERE canonical_party_id IS NOT NULL AND status<>'retired';
CREATE UNIQUE INDEX business_partner_live_canonical_purpose_uq ON master.business_partner(tenant_id,canonical_party_id,representation_purpose_code) WHERE canonical_party_id IS NOT NULL AND status<>'archived';


CREATE INDEX organization_amendment_resource_idx ON master.organization_amendment(tenant_id,resource_kind,resource_id,revision_no DESC);
CREATE INDEX organization_amendment_effective_idx ON master.organization_amendment(tenant_id,effective_at DESC);
