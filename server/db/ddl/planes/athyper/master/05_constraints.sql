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
