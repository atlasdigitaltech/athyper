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
