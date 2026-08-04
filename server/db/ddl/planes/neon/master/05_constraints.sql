ALTER TABLE master.tenant
    ADD CONSTRAINT tenant_subscription_plan_fk
    FOREIGN KEY (subscription_plan_id)
    REFERENCES control.subscription_plan (id)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_profile
    ADD CONSTRAINT tenant_profile_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_profile
    ADD CONSTRAINT tenant_profile_country_fk
    FOREIGN KEY (country_code)
    REFERENCES shared.country (code)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_profile
    ADD CONSTRAINT tenant_profile_locale_fk
    FOREIGN KEY (locale_code)
    REFERENCES shared.locale (code)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_profile
    ADD CONSTRAINT tenant_profile_timezone_fk
    FOREIGN KEY (timezone_code)
    REFERENCES shared.timezone (code)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_profile
    ADD CONSTRAINT tenant_profile_language_fk
    FOREIGN KEY (language_code)
    REFERENCES shared.language (code)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_relationship
    ADD CONSTRAINT tenant_relationship_from_tenant_fk
    FOREIGN KEY (from_tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.tenant_relationship
    ADD CONSTRAINT tenant_relationship_to_tenant_fk
    FOREIGN KEY (to_tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.module
    ADD CONSTRAINT module_workspace_fk
    FOREIGN KEY (workspace_id)
    REFERENCES master.workspace (id)
    ON DELETE RESTRICT;

ALTER TABLE master.address
    ADD CONSTRAINT address_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.address
    ADD CONSTRAINT address_country_fk
    FOREIGN KEY (country_code)
    REFERENCES shared.country (code)
    ON DELETE RESTRICT;

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_address_fk
    FOREIGN KEY (tenant_id, address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_owner_purpose_address_uq
    UNIQUE NULLS NOT DISTINCT
    (tenant_id, owner_type_id, owner_id, purpose, role_qualifier, address_id);

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_one_primary_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        owner_type_id WITH =,
        owner_id WITH =,
        purpose WITH =,
        COALESCE(role_qualifier, '') WITH =,
        daterange(
            effective_from,
            COALESCE(effective_until, 'infinity'::date),
            '[)'
        ) WITH &&
    )
    WHERE (is_primary);

ALTER TABLE master.contact_link
    ADD CONSTRAINT contact_link_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.contact_link
    ADD CONSTRAINT contact_link_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE master.contact_link
    ADD CONSTRAINT contact_link_primary_active_chk
    CHECK (NOT is_primary OR status = 'active');

ALTER TABLE master.contact_email
    ADD CONSTRAINT contact_email_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.contact_email
    ADD CONSTRAINT contact_email_link_fk
    FOREIGN KEY (tenant_id, contact_link_id)
    REFERENCES master.contact_link (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.contact_phone
    ADD CONSTRAINT contact_phone_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.contact_phone
    ADD CONSTRAINT contact_phone_link_fk
    FOREIGN KEY (tenant_id, contact_link_id)
    REFERENCES master.contact_link (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.principal
    ADD CONSTRAINT principal_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_profile
    ADD CONSTRAINT principal_profile_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_profile
    ADD CONSTRAINT principal_profile_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.principal_identity_binding
    ADD CONSTRAINT principal_identity_binding_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_identity_binding
    ADD CONSTRAINT principal_identity_binding_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_profile
    ADD CONSTRAINT principal_ui_profile_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_profile
    ADD CONSTRAINT principal_ui_profile_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.principal_ui_profile
    ADD CONSTRAINT principal_ui_profile_locale_fk
    FOREIGN KEY (locale_code)
    REFERENCES shared.locale (code)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_profile
    ADD CONSTRAINT principal_ui_profile_language_fk
    FOREIGN KEY (language_code)
    REFERENCES shared.language (code)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_profile
    ADD CONSTRAINT principal_ui_profile_timezone_fk
    FOREIGN KEY (timezone_code)
    REFERENCES shared.timezone (code)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_preference
    ADD CONSTRAINT principal_ui_preference_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_ui_preference
    ADD CONSTRAINT principal_ui_preference_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.principal_ui_preference
    ADD CONSTRAINT principal_ui_preference_natural_uq
    UNIQUE NULLS NOT DISTINCT
    (tenant_id, principal_id, preference_code, surface_code);

ALTER TABLE master.principal_notification_preference
    ADD CONSTRAINT principal_notification_preference_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.principal_notification_preference
    ADD CONSTRAINT principal_notification_preference_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.principal_notification_preference
    ADD CONSTRAINT principal_notification_preference_natural_uq
    UNIQUE (tenant_id, principal_id, event_code, channel);

ALTER TABLE master.saved_view
    ADD CONSTRAINT saved_view_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.saved_view
    ADD CONSTRAINT saved_view_owner_principal_fk
    FOREIGN KEY (tenant_id, owner_principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.record_bookmark
    ADD CONSTRAINT record_bookmark_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.record_bookmark
    ADD CONSTRAINT record_bookmark_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_source_identity_uq
    UNIQUE (
        tenant_id,
        source_system_code,
        external_entity_code,
        external_id
    );

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.external_reference
    ADD CONSTRAINT external_reference_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team
    ADD CONSTRAINT team_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.team
    ADD CONSTRAINT team_code_uq
    UNIQUE (tenant_id, code);

ALTER TABLE master.team
    ADD CONSTRAINT team_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team
    ADD CONSTRAINT team_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team
    ADD CONSTRAINT team_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team_member
    ADD CONSTRAINT team_member_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.team_member
    ADD CONSTRAINT team_member_team_fk
    FOREIGN KEY (tenant_id, team_id)
    REFERENCES master.team (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team_member
    ADD CONSTRAINT team_member_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team_member
    ADD CONSTRAINT team_member_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.team_member
    ADD CONSTRAINT team_member_left_by_fk
    FOREIGN KEY (tenant_id, left_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.brand_profile
    ADD CONSTRAINT brand_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.brand_profile
    ADD CONSTRAINT brand_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.letterhead
    ADD CONSTRAINT letterhead_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.letterhead
    ADD CONSTRAINT letterhead_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.print_profile
    ADD CONSTRAINT print_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.print_profile
    ADD CONSTRAINT print_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.template
    ADD CONSTRAINT template_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.template
    ADD CONSTRAINT template_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.template
    ADD CONSTRAINT template_current_version_fk
    FOREIGN KEY (tenant_id, id, current_version_id)
    REFERENCES snapshot.template_version (tenant_id, template_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_brand_fk
    FOREIGN KEY (tenant_id, brand_profile_id)
    REFERENCES master.brand_profile (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_letterhead_fk
    FOREIGN KEY (tenant_id, letterhead_id)
    REFERENCES master.letterhead (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_print_profile_fk
    FOREIGN KEY (tenant_id, print_profile_id)
    REFERENCES master.print_profile (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
ALTER TABLE master.template_binding
    ADD CONSTRAINT template_binding_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- Neon organization foundation.
ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_parent_fk
    FOREIGN KEY (tenant_id, parent_legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_registration_country_fk
    FOREIGN KEY (registration_country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_functional_currency_fk
    FOREIGN KEY (functional_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_reporting_currency_fk
    FOREIGN KEY (reporting_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_functional_currency_fk
    FOREIGN KEY (functional_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_timezone_fk
    FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_tenant_id_legal_entity_uq
    UNIQUE (tenant_id, id, legal_entity_id);

ALTER TABLE master.organization_tax_registration
    ADD CONSTRAINT organization_tax_registration_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_country_fk
    FOREIGN KEY (country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;
ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_state_region_fk
    FOREIGN KEY (country_code, state_region_code)
    REFERENCES shared.state_region (country_code, code)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.tax_type
    ADD CONSTRAINT tax_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.condition_type
    ADD CONSTRAINT condition_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.condition_type
    ADD CONSTRAINT condition_type_replaces_fk
    FOREIGN KEY (tenant_id, replaces_condition_type_id)
    REFERENCES master.condition_type (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_type
    ADD CONSTRAINT tax_type_condition_type_fk
    FOREIGN KEY (tenant_id, condition_type_id)
    REFERENCES master.condition_type (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_jurisdiction
    ADD CONSTRAINT tax_jurisdiction_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_type
    ADD CONSTRAINT tax_type_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_type
    ADD CONSTRAINT tax_type_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.tax_type
    ADD CONSTRAINT tax_type_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.condition_type
    ADD CONSTRAINT condition_type_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.condition_type
    ADD CONSTRAINT condition_type_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.condition_type
    ADD CONSTRAINT condition_type_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.organization_tax_registration
    ADD CONSTRAINT organization_tax_registration_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.organization_tax_registration
    ADD CONSTRAINT organization_tax_registration_company_fk
    FOREIGN KEY (tenant_id, company_code_id, legal_entity_id)
    REFERENCES master.company_code (tenant_id, id, legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE master.organization_tax_registration
    ADD CONSTRAINT organization_tax_registration_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.operating_organization
    ADD CONSTRAINT operating_organization_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization
    ADD CONSTRAINT operating_organization_parent_fk
    FOREIGN KEY (tenant_id, parent_operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.procurement_organization_profile
    ADD CONSTRAINT procurement_organization_profile_organization_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.procurement_organization_profile
    ADD CONSTRAINT procurement_organization_profile_currency_fk
    FOREIGN KEY (default_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.procurement_organization_profile
    ADD CONSTRAINT procurement_organization_profile_lead_company_fk
    FOREIGN KEY (tenant_id, lead_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.sales_organization_profile
    ADD CONSTRAINT sales_organization_profile_organization_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.sales_organization_profile
    ADD CONSTRAINT sales_organization_profile_currency_fk
    FOREIGN KEY (default_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.sales_organization_profile
    ADD CONSTRAINT sales_organization_profile_booking_company_fk
    FOREIGN KEY (tenant_id, booking_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.sales_organization_profile
    ADD CONSTRAINT sales_organization_profile_invoicing_company_fk
    FOREIGN KEY (tenant_id, invoicing_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_organization_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_coordinate_uq
    UNIQUE (tenant_id, operating_organization_id, company_code_id, effective_from);

ALTER TABLE master.org_unit
    ADD CONSTRAINT org_unit_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.org_unit
    ADD CONSTRAINT org_unit_type_fk
    FOREIGN KEY (tenant_id, org_unit_type_id)
    REFERENCES control.org_unit_type (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.org_unit
    ADD CONSTRAINT org_unit_parent_fk
    FOREIGN KEY (tenant_id, parent_org_unit_id)
    REFERENCES master.org_unit (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.org_unit
    ADD CONSTRAINT org_unit_manager_principal_fk
    FOREIGN KEY (tenant_id, manager_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.legal_entity
    ADD CONSTRAINT legal_entity_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code
    ADD CONSTRAINT company_code_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.organization_tax_registration
    ADD CONSTRAINT organization_tax_registration_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization
    ADD CONSTRAINT operating_organization_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.procurement_organization_profile
    ADD CONSTRAINT procurement_organization_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.sales_organization_profile
    ADD CONSTRAINT sales_organization_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.org_unit
    ADD CONSTRAINT org_unit_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- Neon management-accounting foundation.
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_parent_fk
    FOREIGN KEY (tenant_id, company_code_id, parent_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.profit_center
    ADD CONSTRAINT profit_center_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_parent_fk
    FOREIGN KEY (tenant_id, company_code_id, parent_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_profit_center_fk
    FOREIGN KEY (tenant_id, company_code_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.cost_center
    ADD CONSTRAINT cost_center_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.dimension_type
    ADD CONSTRAINT dimension_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_type
    ADD CONSTRAINT dimension_type_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_type
    ADD CONSTRAINT dimension_type_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_type
    ADD CONSTRAINT dimension_type_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_parent_fk
    FOREIGN KEY (tenant_id, dimension_type_id, parent_id)
    REFERENCES master.dimension_value (tenant_id, dimension_type_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_value
    ADD CONSTRAINT dimension_value_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.dimension_set
    ADD CONSTRAINT dimension_set_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_set
    ADD CONSTRAINT dimension_set_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.dimension_set_item
    ADD CONSTRAINT dimension_set_item_set_fk
    FOREIGN KEY (tenant_id, dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_set_item
    ADD CONSTRAINT dimension_set_item_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.dimension_set_item
    ADD CONSTRAINT dimension_set_item_value_fk
    FOREIGN KEY (tenant_id, dimension_type_id, dimension_value_id)
    REFERENCES master.dimension_value (tenant_id, dimension_type_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.dimension_set_item
    ADD CONSTRAINT dimension_set_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- Neon accounting foundation.
ALTER TABLE master.accounting_profile
    ADD CONSTRAINT accounting_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.chart_of_account
    ADD CONSTRAINT chart_of_account_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.ledger_book
    ADD CONSTRAINT ledger_book_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;

ALTER TABLE master.gl_account
    ADD CONSTRAINT gl_account_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.gl_account
    ADD CONSTRAINT gl_account_chart_fk
    FOREIGN KEY (tenant_id, chart_of_account_id)
    REFERENCES master.chart_of_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.gl_account
    ADD CONSTRAINT gl_account_parent_fk
    FOREIGN KEY (tenant_id, chart_of_account_id, parent_id)
    REFERENCES master.gl_account (tenant_id, chart_of_account_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.gl_account
    ADD CONSTRAINT gl_account_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.ledger_book
    ADD CONSTRAINT ledger_book_currency_fk
    FOREIGN KEY (base_currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.company_code_chart_assignment
    ADD CONSTRAINT company_code_chart_assignment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_chart_assignment
    ADD CONSTRAINT company_code_chart_assignment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_chart_assignment
    ADD CONSTRAINT company_code_chart_assignment_chart_fk
    FOREIGN KEY (tenant_id, chart_of_account_id)
    REFERENCES master.chart_of_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_book_assignment
    ADD CONSTRAINT company_code_book_assignment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_book_assignment
    ADD CONSTRAINT company_code_book_assignment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_book_assignment
    ADD CONSTRAINT company_code_book_assignment_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_book_assignment
    ADD CONSTRAINT company_code_book_assignment_currency_fk
    FOREIGN KEY (override_currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.fiscal_period
    ADD CONSTRAINT fiscal_period_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.fiscal_period
    ADD CONSTRAINT fiscal_period_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.fx_rate
    ADD CONSTRAINT fx_rate_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.fx_rate
    ADD CONSTRAINT fx_rate_from_currency_fk
    FOREIGN KEY (from_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.fx_rate
    ADD CONSTRAINT fx_rate_to_currency_fk
    FOREIGN KEY (to_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.fx_rate
    ADD CONSTRAINT fx_rate_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_id)
    REFERENCES master.fx_rate (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT company_code_dimension_default_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT company_code_dimension_default_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT company_code_dimension_default_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT company_code_dimension_default_value_fk
    FOREIGN KEY (tenant_id, dimension_type_id, dimension_value_id)
    REFERENCES master.dimension_value (tenant_id, dimension_type_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT company_code_dimension_default_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        dimension_type_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE master.company_code_gl_account
    ADD CONSTRAINT company_code_gl_account_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_gl_account
    ADD CONSTRAINT company_code_gl_account_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_gl_account
    ADD CONSTRAINT company_code_gl_account_gl_fk
    FOREIGN KEY (tenant_id, gl_account_id)
    REFERENCES master.gl_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.company_code_gl_account
    ADD CONSTRAINT company_code_gl_account_default_cost_fk
    FOREIGN KEY (tenant_id, company_code_id, default_cost_center_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id)
    ON DELETE RESTRICT;

DO $$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'accounting_profile', 'chart_of_account', 'gl_account', 'ledger_book',
        'company_code_chart_assignment', 'company_code_book_assignment',
        'fiscal_period', 'fx_rate', 'company_code_dimension_default',
        'company_code_gl_account'
    ]
    LOOP
        FOREACH v_column IN ARRAY ARRAY['created_by', 'updated_by', 'status_changed_by']
        LOOP
            EXECUTE format(
                'ALTER TABLE master.%I ADD CONSTRAINT %I '
                'FOREIGN KEY (tenant_id, %I) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
                v_table,
                v_table || '_' || v_column || '_fk',
                v_column
            );
        END LOOP;
    END LOOP;

    FOREACH v_column IN ARRAY ARRAY[
        'opened_by', 'soft_closed_by', 'hard_closed_by'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE master.fiscal_period ADD CONSTRAINT %I '
            'FOREIGN KEY (tenant_id, %I) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            'fiscal_period_' || v_column || '_fk',
            v_column
        );
    END LOOP;
END;
$$;

-- Neon fixed-asset foundation.
ALTER TABLE master.asset_class
    ADD CONSTRAINT asset_class_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.asset_class
    ADD CONSTRAINT asset_class_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.asset_class (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_class
    ADD CONSTRAINT asset_class_default_uom_fk
    FOREIGN KEY (default_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;

ALTER TABLE master.asset
    ADD CONSTRAINT asset_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.asset
    ADD CONSTRAINT asset_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset
    ADD CONSTRAINT asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id)
    REFERENCES master.asset_class (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset
    ADD CONSTRAINT asset_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.asset
    ADD CONSTRAINT asset_custodian_fk
    FOREIGN KEY (tenant_id, custodian_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.asset_book
    ADD CONSTRAINT asset_book_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.asset_book
    ADD CONSTRAINT asset_book_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_book
    ADD CONSTRAINT asset_book_asset_fk
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_book
    ADD CONSTRAINT asset_book_ledger_fk
    FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_book
    ADD CONSTRAINT asset_book_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.asset_component
    ADD CONSTRAINT asset_component_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.asset_component
    ADD CONSTRAINT asset_component_parent_fk
    FOREIGN KEY (tenant_id, parent_asset_id)
    REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_component
    ADD CONSTRAINT asset_component_child_fk
    FOREIGN KEY (tenant_id, component_asset_id)
    REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_asset_fk
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_from_principal_fk
    FOREIGN KEY (tenant_id, from_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_to_principal_fk
    FOREIGN KEY (tenant_id, to_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_from_scope_fk
    FOREIGN KEY (tenant_id, from_scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_to_scope_fk
    FOREIGN KEY (tenant_id, to_scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.asset_assignment_history
    ADD CONSTRAINT asset_assignment_history_assigned_by_fk
    FOREIGN KEY (tenant_id, assigned_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

DO $$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_class', 'asset', 'asset_book', 'asset_component'
    ]
    LOOP
        FOREACH v_column IN ARRAY ARRAY[
            'created_by', 'updated_by', 'status_changed_by'
        ]
        LOOP
            EXECUTE format(
                'ALTER TABLE master.%I ADD CONSTRAINT %I '
                'FOREIGN KEY (tenant_id, %I) '
                'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
                v_table,
                v_table || '_' || v_column || '_fk',
                v_column
            );
        END LOOP;
    END LOOP;

    ALTER TABLE master.asset_assignment_history
        ADD CONSTRAINT asset_assignment_history_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
END;
$$;

-- Canonical business-partner identity and thin supplier/customer roles.
ALTER TABLE master.business_partner
    ADD CONSTRAINT business_partner_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.business_partner
    ADD CONSTRAINT business_partner_registration_country_fk
    FOREIGN KEY (registration_country_code)
    REFERENCES shared.country (code)
    ON DELETE RESTRICT;

ALTER TABLE master.business_partner
    ADD CONSTRAINT business_partner_parent_fk
    FOREIGN KEY (tenant_id, parent_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE master.supplier
    ADD CONSTRAINT supplier_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.supplier
    ADD CONSTRAINT supplier_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.customer
    ADD CONSTRAINT customer_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.customer
    ADD CONSTRAINT customer_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;

DO $$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner', 'supplier', 'customer'
    ]
    LOOP
        FOREACH v_column IN ARRAY ARRAY[
            'created_by', 'updated_by', 'status_changed_by'
        ]
        LOOP
            EXECUTE format(
                'ALTER TABLE master.%I ADD CONSTRAINT %I '
                'FOREIGN KEY (tenant_id, %I) '
                'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
                v_table,
                v_table || '_' || v_column || '_fk',
                v_column
            );
        END LOOP;
    END LOOP;
END;
$$;

-- Neon operational banking foundation.
ALTER TABLE master.bank_party
    ADD CONSTRAINT bank_party_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.bank_party
    ADD CONSTRAINT bank_party_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_bank_party_fk
    FOREIGN KEY (tenant_id, bank_party_id)
    REFERENCES master.bank_party (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_correspondent_fk
    FOREIGN KEY (tenant_id, correspondent_bank_party_id)
    REFERENCES master.bank_party (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.bank_account_link
    ADD CONSTRAINT bank_account_link_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account_link
    ADD CONSTRAINT bank_account_link_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account_link
    ADD CONSTRAINT bank_account_link_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account_link
    ADD CONSTRAINT bank_account_link_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bank_account_house_config
    ADD CONSTRAINT bank_account_house_config_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account_house_config
    ADD CONSTRAINT bank_account_house_config_link_fk
    FOREIGN KEY (tenant_id, bank_account_link_id)
    REFERENCES master.bank_account_link (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bank_account_house_config
    ADD CONSTRAINT bank_account_house_config_gl_fk
    FOREIGN KEY (tenant_id, gl_account_id)
    REFERENCES master.gl_account (tenant_id, id) ON DELETE RESTRICT;

DO $$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_party', 'bank_account', 'bank_account_house_config'
    ]
    LOOP
        FOREACH v_column IN ARRAY ARRAY['created_by', 'updated_by', 'status_changed_by']
        LOOP
            EXECUTE format(
                'ALTER TABLE master.%I ADD CONSTRAINT %I '
                'FOREIGN KEY (tenant_id, %I) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
                v_table,
                v_table || '_' || v_column || '_fk',
                v_column
            );
        END LOOP;
    END LOOP;

    FOREACH v_column IN ARRAY ARRAY['created_by', 'updated_by']
    LOOP
        EXECUTE format(
            'ALTER TABLE master.bank_account_link ADD CONSTRAINT %I '
            'FOREIGN KEY (tenant_id, %I) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            'bank_account_link_' || v_column || '_fk',
            v_column
        );
    END LOOP;
END;
$$;

ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.payment_method
    ADD CONSTRAINT payment_method_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT;

-- Neon payment-term aggregate.
ALTER TABLE master.payment_term
    ADD CONSTRAINT payment_term_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.payment_term
    ADD CONSTRAINT payment_term_replaces_fk
    FOREIGN KEY (tenant_id, replaces_payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.payment_term_clause
    ADD CONSTRAINT payment_term_clause_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.payment_term_clause
    ADD CONSTRAINT payment_term_clause_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.payment_term_clause
    ADD CONSTRAINT payment_term_clause_settles_fk
    FOREIGN KEY (tenant_id, payment_term_id, settles_clause_code)
    REFERENCES master.payment_term_clause
        (tenant_id, payment_term_id, clause_code)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE master.payment_term_clause
    ADD CONSTRAINT payment_term_clause_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.payment_term_discount_tier
    ADD CONSTRAINT payment_term_discount_tier_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.payment_term_discount_tier
    ADD CONSTRAINT payment_term_discount_tier_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.payment_term_discount_tier
    ADD CONSTRAINT payment_term_discount_tier_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;

DO $$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'payment_method',
        'payment_term', 'payment_term_clause',
        'payment_term_discount_tier'
    ]
    LOOP
        FOREACH v_column IN ARRAY ARRAY['created_by', 'updated_by']
        LOOP
            EXECUTE format(
                'ALTER TABLE master.%I ADD CONSTRAINT %I '
                'FOREIGN KEY (tenant_id, %I) '
                'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
                v_table,
                v_table || '_' || v_column || '_fk',
                v_column
            );
        END LOOP;
    END LOOP;

    ALTER TABLE master.payment_term
        ADD CONSTRAINT payment_term_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
    ALTER TABLE master.payment_method
        ADD CONSTRAINT payment_method_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
END;
$$;
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_pkey PRIMARY KEY (id);
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_code_uq UNIQUE (tenant_id, code);
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_tenant_id_uq UNIQUE (tenant_id, id);
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_code_chk CHECK (btrim(code) <> '');
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_depth_chk CHECK (depth >= 0);
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_domain_chk CHECK (
        domain IN (
            'OPEX', 'CAPEX', 'REVENUE', 'COST_OF_SALES',
            'TRANSFER', 'REGULATORY', 'ADMIN', 'DEFERRED_REVENUE'
        )
    );
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_name_chk CHECK (btrim(name) <> '');
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_no_self_ref CHECK (parent_id IS DISTINCT FROM id);
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_visibility_chk CHECK (
        visibility IN ('STANDARD', 'RESTRICTED', 'CONFIDENTIAL')
    );
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.business_intent(tenant_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY master.business_intent
    ADD CONSTRAINT bi_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant(id)
    ON DELETE CASCADE;
