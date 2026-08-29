ALTER TABLE master.tenant
    ADD CONSTRAINT tenant_canonical_party_uq UNIQUE (canonical_party_id),
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
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_no_overlap_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        operating_organization_id WITH =,
        company_code_id WITH =,
        participation_role WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');

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

ALTER TABLE master.business_partner
    ADD CONSTRAINT business_partner_category_locked_by_fk
    FOREIGN KEY (tenant_id, category_locked_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

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

-- Correct nullable correspondent semantics for databases created before this fix.
ALTER TABLE master.bank_account
    DROP CONSTRAINT bank_account_correspondent_self_chk;

ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_correspondent_self_chk CHECK (
        correspondent_bank_party_id IS NULL
        OR correspondent_bank_party_id IS DISTINCT FROM bank_party_id
    );

ALTER TABLE master.person
    ADD CONSTRAINT person_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT person_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT person_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.person_sensitive_profile
    ADD CONSTRAINT person_sensitive_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT person_sensitive_profile_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT person_sensitive_profile_nationality_fk
    FOREIGN KEY (nationality_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.site
    ADD CONSTRAINT site_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT site_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT site_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_timezone_fk
    FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_manager_fk
    FOREIGN KEY (manager_id) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT site_capacity_uom_fk
    FOREIGN KEY (capacity_uom) REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_parent_fk
    FOREIGN KEY (tenant_id, parent_site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.career_band
    ADD CONSTRAINT career_band_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.career_level
    ADD CONSTRAINT career_level_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT career_level_band_fk
    FOREIGN KEY (tenant_id, career_band_id)
    REFERENCES master.career_band (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.designation
    ADD CONSTRAINT designation_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.job_family
    ADD CONSTRAINT job_family_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.job_function
    ADD CONSTRAINT job_function_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT job_function_family_fk
    FOREIGN KEY (tenant_id, job_family_id)
    REFERENCES master.job_family (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_grade
    ADD CONSTRAINT pay_grade_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_grade_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.job
    ADD CONSTRAINT job_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT job_family_fk
    FOREIGN KEY (tenant_id, job_family_id)
    REFERENCES master.job_family (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_function_fk
    FOREIGN KEY (tenant_id, job_function_id)
    REFERENCES master.job_function (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_band_fk
    FOREIGN KEY (tenant_id, career_band_id)
    REFERENCES master.career_band (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_level_fk
    FOREIGN KEY (tenant_id, career_level_id)
    REFERENCES master.career_level (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_grade_fk
    FOREIGN KEY (tenant_id, pay_grade_id)
    REFERENCES master.pay_grade (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_designation_fk
    FOREIGN KEY (tenant_id, designation_id)
    REFERENCES master.designation (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.holiday_calendar
    ADD CONSTRAINT holiday_calendar_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT holiday_calendar_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.holiday_calendar_day
    ADD CONSTRAINT holiday_calendar_day_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT holiday_calendar_day_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE master.shift_type
    ADD CONSTRAINT shift_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.work_pattern
    ADD CONSTRAINT work_pattern_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.work_pattern_day
    ADD CONSTRAINT work_pattern_day_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT work_pattern_day_pattern_fk
    FOREIGN KEY (tenant_id, work_pattern_id)
    REFERENCES master.work_pattern (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE master.pay_component
    ADD CONSTRAINT pay_component_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_component_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_group
    ADD CONSTRAINT pay_group_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_group_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_calendar_fk
    FOREIGN KEY (tenant_id, calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_structure
    ADD CONSTRAINT pay_structure_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_group_fk
    FOREIGN KEY (tenant_id, pay_group_id)
    REFERENCES master.pay_group (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_structure_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.pay_structure_line
    ADD CONSTRAINT pay_structure_line_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_line_structure_fk
    FOREIGN KEY (tenant_id, pay_structure_id)
    REFERENCES master.pay_structure (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_line_component_fk
    FOREIGN KEY (tenant_id, pay_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_structure_line_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.statutory_scheme
    ADD CONSTRAINT statutory_scheme_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT statutory_scheme_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_employee_component_fk
    FOREIGN KEY (tenant_id, employee_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_employer_component_fk
    FOREIGN KEY (tenant_id, employer_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_rate_table_fk
    FOREIGN KEY (tenant_id, rate_table_id)
    REFERENCES control.rate_table (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.leave_type
    ADD CONSTRAINT leave_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.leave_plan
    ADD CONSTRAINT leave_plan_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_type_fk
    FOREIGN KEY (tenant_id, leave_type_id)
    REFERENCES master.leave_type (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.leave_plan_rule
    ADD CONSTRAINT leave_plan_rule_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_rule_plan_fk
    FOREIGN KEY (tenant_id, leave_plan_id)
    REFERENCES master.leave_plan (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_rule_formula_fk
    FOREIGN KEY (tenant_id, accrual_formula_version_id)
    REFERENCES control.formula_expression_version (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.position
    ADD CONSTRAINT position_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT position_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_org_unit_fk
    FOREIGN KEY (tenant_id, org_unit_id)
    REFERENCES master.org_unit (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_job_fk
    FOREIGN KEY (tenant_id, job_id)
    REFERENCES master.job (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_reports_to_fk
    FOREIGN KEY (tenant_id, reports_to_position_id)
    REFERENCES master.position (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_cost_center_fk
    FOREIGN KEY (tenant_id, company_code_id, cost_center_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_profit_center_fk
    FOREIGN KEY (tenant_id, company_code_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_site_fk
    FOREIGN KEY (tenant_id, company_code_id, site_id)
    REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee
    ADD CONSTRAINT employee_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_manager_fk
    FOREIGN KEY (tenant_id, manager_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee
    ADD CONSTRAINT employee_contract_identity_uq
    UNIQUE (tenant_id, id, person_id);

ALTER TABLE master.employment
    ADD CONSTRAINT employment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employment_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employment
    ADD CONSTRAINT employment_assignment_identity_uq
    UNIQUE (tenant_id, id, employee_id, company_code_id),
    ADD CONSTRAINT employment_employee_person_fk
    FOREIGN KEY (tenant_id, employee_id, person_id)
    REFERENCES master.employee (tenant_id, id, person_id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_company_legal_entity_fk
    FOREIGN KEY (tenant_id, company_code_id, legal_entity_id)
    REFERENCES master.company_code (tenant_id, id, legal_entity_id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_primary_effective_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        person_id WITH =,
        daterange(hire_date, COALESCE(termination_date, 'infinity'::date), '[)') WITH &&
    ) WHERE (is_primary AND status = 'active' AND employment_status IN ('active', 'suspended'));

ALTER TABLE master.work_assignment
    ADD CONSTRAINT work_assignment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT work_assignment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_employment_fk
    FOREIGN KEY (tenant_id, employment_id)
    REFERENCES master.employment (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_position_fk
    FOREIGN KEY (tenant_id, position_id)
    REFERENCES master.position (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_org_unit_fk
    FOREIGN KEY (tenant_id, org_unit_id)
    REFERENCES master.org_unit (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_job_fk
    FOREIGN KEY (tenant_id, job_id)
    REFERENCES master.job (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_manager_fk
    FOREIGN KEY (tenant_id, manager_employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_employment_contract_fk
    FOREIGN KEY (tenant_id, employment_id, employee_id, company_code_id)
    REFERENCES master.employment (tenant_id, id, employee_id, company_code_id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_cost_center_fk
    FOREIGN KEY (tenant_id, company_code_id, cost_center_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_profit_center_fk
    FOREIGN KEY (tenant_id, company_code_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_site_fk
    FOREIGN KEY (tenant_id, company_code_id, site_id)
    REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT;

ALTER TABLE master.work_assignment
    ADD CONSTRAINT work_assignment_primary_effective_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (assignment_type = 'primary' AND status = 'active');

ALTER TABLE master.employee_leave_enrollment
    ADD CONSTRAINT employee_leave_enrollment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_leave_enrollment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_leave_enrollment_plan_fk
    FOREIGN KEY (tenant_id, leave_plan_id)
    REFERENCES master.leave_plan (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee_statutory_enrollment
    ADD CONSTRAINT employee_statutory_enrollment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_statutory_enrollment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_statutory_enrollment_scheme_fk
    FOREIGN KEY (tenant_id, statutory_scheme_id)
    REFERENCES master.statutory_scheme (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.payment_term
    ADD CONSTRAINT payment_term_holiday_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE RESTRICT;

-- Every HR row is tied to a local Neon audit actor.
ALTER TABLE master.person
    ADD CONSTRAINT person_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.person_sensitive_profile
    ADD CONSTRAINT person_sensitive_profile_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.site
    ADD CONSTRAINT site_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.career_band
    ADD CONSTRAINT career_band_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.career_level
    ADD CONSTRAINT career_level_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.designation
    ADD CONSTRAINT designation_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job_family
    ADD CONSTRAINT job_family_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job_function
    ADD CONSTRAINT job_function_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_grade
    ADD CONSTRAINT pay_grade_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job
    ADD CONSTRAINT job_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.holiday_calendar
    ADD CONSTRAINT holiday_calendar_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.holiday_calendar_day
    ADD CONSTRAINT holiday_calendar_day_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.shift_type
    ADD CONSTRAINT shift_type_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_pattern
    ADD CONSTRAINT work_pattern_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_pattern_day
    ADD CONSTRAINT work_pattern_day_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_component
    ADD CONSTRAINT pay_component_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_group
    ADD CONSTRAINT pay_group_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_structure
    ADD CONSTRAINT pay_structure_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_structure_line
    ADD CONSTRAINT pay_structure_line_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.statutory_scheme
    ADD CONSTRAINT statutory_scheme_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_type
    ADD CONSTRAINT leave_type_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_plan
    ADD CONSTRAINT leave_plan_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_plan_rule
    ADD CONSTRAINT leave_plan_rule_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.position
    ADD CONSTRAINT position_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee
    ADD CONSTRAINT employee_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employment
    ADD CONSTRAINT employment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_assignment
    ADD CONSTRAINT work_assignment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee_leave_enrollment
    ADD CONSTRAINT employee_leave_enrollment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee_statutory_enrollment
    ADD CONSTRAINT employee_statutory_enrollment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE master.warehouse
    ADD CONSTRAINT warehouse_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT warehouse_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT warehouse_manager_fk FOREIGN KEY (tenant_id, manager_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE master.risk_driver_registry
    ADD CONSTRAINT risk_driver_registry_dimension_fk
    FOREIGN KEY (default_dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE SET NULL;

ALTER TABLE master.risk_model_dimension
    ADD CONSTRAINT risk_model_dimension_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version)
    ON DELETE CASCADE;
ALTER TABLE master.risk_model_dimension
    ADD CONSTRAINT risk_model_dimension_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_assessed_by_fk
    FOREIGN KEY (tenant_id, assessed_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_dimension_score
    ADD CONSTRAINT party_risk_dimension_score_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_dimension_score
    ADD CONSTRAINT party_risk_dimension_score_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_source_fk
    FOREIGN KEY (source_code)
    REFERENCES master.risk_source (code)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by)
    REFERENCES master.party_risk_evidence (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_ingested_by_fk
    FOREIGN KEY (tenant_id, ingested_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_dimension_score_fk
    FOREIGN KEY (tenant_id, dimension_score_id)
    REFERENCES master.party_risk_dimension_score (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_evidence_fk
    FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES master.party_risk_evidence (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_registry_fk
    FOREIGN KEY (driver_code)
    REFERENCES master.risk_driver_registry (code)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_driver_fk
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES master.party_risk_driver (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_assigned_to_fk
    FOREIGN KEY (tenant_id, assigned_to)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_review_event
    ADD CONSTRAINT party_risk_review_event_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_review_event
    ADD CONSTRAINT party_risk_review_event_actor_fk
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.product
    ADD CONSTRAINT product_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_base_uom_fk
    FOREIGN KEY (base_uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.item
    ADD CONSTRAINT item_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES master.product (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_base_uom_fk
    FOREIGN KEY (base_uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES master.product (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_code_fk
    FOREIGN KEY (commodity_domain_code, commodity_code_id)
    REFERENCES shared.commodity_code (domain_code, id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_supplier_partner_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_catalog_fk
    FOREIGN KEY (tenant_id, catalog_id)
    REFERENCES master.catalog (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_catalog_item_fk
    FOREIGN KEY (tenant_id, catalog_item_id)
    REFERENCES master.catalog_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_uom_fk
    FOREIGN KEY (price_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bom
    ADD CONSTRAINT bom_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_output_item_fk
    FOREIGN KEY (tenant_id, company_code_id, output_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_bom_fk
    FOREIGN KEY (tenant_id, company_code_id, bom_id)
    REFERENCES master.bom (tenant_id, company_code_id, id) ON DELETE CASCADE;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_item_fk
    FOREIGN KEY (tenant_id, company_code_id, component_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.project
    ADD CONSTRAINT project_company_fk FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_cost_center_fk FOREIGN KEY (tenant_id, default_cost_center_id)
    REFERENCES master.cost_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.project_wbs
    ADD CONSTRAINT project_wbs_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_wbs_parent_fk FOREIGN KEY (tenant_id, project_id, parent_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_cost_center_fk FOREIGN KEY (tenant_id, default_cost_center_id)
    REFERENCES master.cost_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.project_item
    ADD CONSTRAINT project_item_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_item_wbs_fk FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_item_fk FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.compensation_assignment
    ADD CONSTRAINT compensation_assignment_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_pay_group_fk FOREIGN KEY(tenant_id,pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_pay_structure_fk FOREIGN KEY(tenant_id,pay_structure_id) REFERENCES master.pay_structure(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_source_change_fk FOREIGN KEY(tenant_id,source_compensation_change_id) REFERENCES document.compensation_change(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_no_overlap_excl EXCLUDE USING gist (
        tenant_id WITH =, employee_id WITH =, pay_group_id WITH =,
        daterange(effective_from,coalesce(effective_until+1,'infinity'::date),'[)') WITH &&
    ) WHERE (status IN ('planned','active'));

ALTER TABLE master.business_partner_relationship
    ADD CONSTRAINT business_partner_relationship_source_fk
    FOREIGN KEY (tenant_id, source_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_relationship_target_fk
    FOREIGN KEY (tenant_id, target_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_relationship_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_governance_relation
    ADD CONSTRAINT business_partner_governance_relation_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_governance_relation_member_fk
    FOREIGN KEY (tenant_id, member_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_governance_relation_country_fk
    FOREIGN KEY (member_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_identifier
    ADD CONSTRAINT business_partner_identifier_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_identifier_country_fk
    FOREIGN KEY (issuing_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_identifier_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_tax_registration
    ADD CONSTRAINT business_partner_tax_registration_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_tax_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_commodity_capability
    ADD CONSTRAINT business_partner_commodity_capability_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_commodity_capability_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_industry_classification
    ADD CONSTRAINT business_partner_industry_classification_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_industry_classification_code_fk
    FOREIGN KEY (industry_domain_code, industry_code_id)
    REFERENCES shared.industry_code (domain_code, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_industry_classification_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_industry_classification_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        business_partner_id WITH =,
        industry_domain_code WITH =,
        industry_code_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active'),
    ADD CONSTRAINT business_partner_industry_classification_primary_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        business_partner_id WITH =,
        industry_domain_code WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (is_primary AND status = 'active');

ALTER TABLE master.business_partner_operating_organization_assignment
    ADD CONSTRAINT business_partner_operating_org_assignment_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_operating_org_assignment_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_supplier_profile
    ADD CONSTRAINT company_code_supplier_profile_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_accounting_fk
    FOREIGN KEY (tenant_id, default_accounting_profile_id)
    REFERENCES master.accounting_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_bank_link_fk
    FOREIGN KEY (tenant_id, preferred_remittance_bank_link_id)
    REFERENCES master.bank_account_link (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_dimension_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_customer_profile
    ADD CONSTRAINT company_code_customer_profile_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_credit_currency_fk
    FOREIGN KEY (credit_limit_currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_accounting_fk
    FOREIGN KEY (tenant_id, default_accounting_profile_id)
    REFERENCES master.accounting_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_dimension_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.legal_entity_business_partner_link
    ADD CONSTRAINT legal_entity_business_partner_link_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT legal_entity_business_partner_link_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.intercompany_trading_pair
    ADD CONSTRAINT intercompany_trading_pair_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_counterparty_company_fk
    FOREIGN KEY (tenant_id, counterparty_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_supplier_profile_fk
    FOREIGN KEY (tenant_id, counterparty_supplier_profile_id)
    REFERENCES master.company_code_supplier_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_customer_profile_fk
    FOREIGN KEY (tenant_id, mirror_customer_profile_id)
    REFERENCES master.company_code_customer_profile (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.contact_person_identity_link
    ADD CONSTRAINT contact_person_identity_link_contact_fk
    FOREIGN KEY (tenant_id, contact_person_id)
    REFERENCES master.contact_person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_identity_link_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_identity_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- Consistent lifecycle/creation evidence for all mutable partner extensions.
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner_relationship',
        'business_partner_governance_relation',
        'business_partner_identifier',
        'business_partner_tax_registration',
        'business_partner_commodity_capability',
        'business_partner_operating_organization_assignment',
        'company_code_supplier_profile',
        'company_code_customer_profile',
        'legal_entity_business_partner_link',
        'intercompany_trading_pair'
    ] LOOP
        EXECUTE format(
            'ALTER TABLE master.%I ADD CONSTRAINT %I_created_by_fk '
            'FOREIGN KEY (tenant_id, created_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I ADD CONSTRAINT %I_updated_by_fk '
            'FOREIGN KEY (tenant_id, updated_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I ADD CONSTRAINT %I_status_changed_by_fk '
            'FOREIGN KEY (tenant_id, status_changed_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
    END LOOP;
END;
$$;

ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_pkey PRIMARY KEY (id);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_code_fmt_chk
  CHECK (code ~ '^[a-z][a-z0-9_-]*$'::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_custom_tenant_chk
  CHECK (NOT is_custom OR tenant_id IS NOT NULL);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_name_nonempty_chk
  CHECK (btrim(name) <> ''::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_status_chk
  CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_metadata_object_chk
  CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_pkey PRIMARY KEY (id);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_tenant_id_uq UNIQUE (tenant_id, id);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_owner_nonempty_chk
  CHECK (btrim(owner_type) <> ''::text);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_status_chk
  CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'superseded'::text]));
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_type_xor_custom_chk
  CHECK (
    certification_type_id IS NOT NULL AND custom_name IS NULL
    OR certification_type_id IS NULL AND custom_name IS NOT NULL
  );
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_validity_order_chk
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_metadata_object_chk
  CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_type_fk
  FOREIGN KEY (certification_type_id)
  REFERENCES master.certification_type(id)
  ON DELETE RESTRICT;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_company_code_fk
  FOREIGN KEY (tenant_id, company_code_id)
  REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_site_fk
  FOREIGN KEY (tenant_id, site_id)
  REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT;


ALTER TABLE master.organization_amendment
  ADD CONSTRAINT organization_amendment_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_amendment_recorded_by_fk FOREIGN KEY(tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE master.external_worker
    ADD CONSTRAINT external_worker_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_person_fk FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_status_changed_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
