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

CREATE INDEX address_duplicate_candidate_idx
    ON master.address
       (tenant_id, country_code, postal_code, lower(line1), lower(city))
    WHERE status = 'active' AND line1 IS NOT NULL;

CREATE INDEX address_link_owner_idx
    ON master.address_link
       (tenant_id, owner_type_id, owner_id, purpose, role_qualifier);

CREATE INDEX address_link_address_idx
    ON master.address_link (tenant_id, address_id);

CREATE INDEX address_link_owner_type_fk_idx
    ON master.address_link (owner_type_id);

CREATE INDEX address_link_current_primary_idx
    ON master.address_link
       (tenant_id, owner_type_id, owner_id, purpose, role_qualifier)
    WHERE is_primary AND effective_until IS NULL;

CREATE UNIQUE INDEX contact_link_value_uq
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type, value, purpose, role_qualifier)
    NULLS NOT DISTINCT;

CREATE UNIQUE INDEX contact_link_one_primary_uq
    ON master.contact_link
       (tenant_id, owner_type_id, owner_id, channel_type, purpose, role_qualifier)
    NULLS NOT DISTINCT
    WHERE is_primary AND status = 'active';

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
