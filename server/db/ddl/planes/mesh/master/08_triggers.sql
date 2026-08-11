CREATE TRIGGER trg_tenant_identity_immutable
BEFORE UPDATE OF id, code, realm_key ON master.tenant
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_identity();

CREATE TRIGGER trg_tenant_status_transition
BEFORE UPDATE OF status ON master.tenant
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_status_transition();

CREATE TRIGGER trg_tenant_updated_at
BEFORE UPDATE ON master.tenant
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tenant_profile_identity_immutable
BEFORE UPDATE OF id, tenant_id ON master.tenant_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_profile_identity();

CREATE TRIGGER trg_tenant_profile_normalize_weekend_days
BEFORE INSERT OR UPDATE OF weekend_days ON master.tenant_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_tenant_weekend_days();

CREATE TRIGGER trg_tenant_profile_updated_at
BEFORE UPDATE ON master.tenant_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tenant_relationship_identity_immutable
BEFORE UPDATE OF id, from_tenant_id, to_tenant_id, relationship_type, activated_at
ON master.tenant_relationship
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_relationship_identity();

CREATE TRIGGER trg_tenant_relationship_status_transition
BEFORE UPDATE OF status ON master.tenant_relationship
FOR EACH ROW
EXECUTE FUNCTION master.trg_guard_tenant_relationship_status_transition();

CREATE TRIGGER trg_tenant_relationship_updated_at
BEFORE UPDATE ON master.tenant_relationship
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_workspace_updated_at
BEFORE UPDATE ON master.workspace
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_workspace_identity_immutable
BEFORE UPDATE OF id, code ON master.workspace
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_catalog_identity();

CREATE TRIGGER trg_workspace_status_changed
BEFORE UPDATE ON master.workspace
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_module_updated_at
BEFORE UPDATE ON master.module
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_module_identity_immutable
BEFORE UPDATE OF id, code, workspace_id ON master.module
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_catalog_identity();

CREATE TRIGGER trg_module_status_changed
BEFORE UPDATE ON master.module
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_address_updated_at
BEFORE UPDATE ON master.address
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_address_status_changed
BEFORE UPDATE OF status ON master.address
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_address_link_owner_reference
BEFORE INSERT OR UPDATE OF
    tenant_id, owner_type_id, owner_id, purpose
ON master.address_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_reference();

CREATE TRIGGER trg_address_link_updated_at
BEFORE UPDATE ON master.address_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_contact_link_10_normalize
BEFORE INSERT OR UPDATE OF channel_type, value, purpose, role_qualifier
ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_contact_link();

CREATE TRIGGER trg_contact_link_05_identity
BEFORE UPDATE OF
    id, tenant_id, owner_type_id, owner_id, channel_type
ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_link_identity();

CREATE TRIGGER trg_contact_link_20_owner_reference
BEFORE INSERT OR UPDATE OF
    tenant_id, owner_type_id, owner_id, purpose
ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_reference();

CREATE TRIGGER trg_contact_link_30_verification_evidence
BEFORE UPDATE OF is_verified, verification_provider, verification_evidence, verification_signature
ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION master.trg_require_contact_verification_evidence();

CREATE TRIGGER trg_contact_link_updated_at
BEFORE UPDATE ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_contact_link_status_changed
BEFORE UPDATE OF status ON master.contact_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_external_reference_10_normalize
BEFORE INSERT OR UPDATE OF
    source_system_code, external_entity_code, external_id, external_code
ON master.external_reference
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_external_reference();

CREATE TRIGGER trg_external_reference_20_owner
BEFORE INSERT OR UPDATE OF tenant_id, owner_type_id, owner_id
ON master.external_reference
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_external_reference_owner();

CREATE TRIGGER trg_external_reference_identity_immutable
BEFORE UPDATE OF
    id, tenant_id, owner_type_id, owner_id,
    source_system_code, external_entity_code, external_id
ON master.external_reference
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_external_reference_identity();

CREATE TRIGGER trg_external_reference_status_changed
BEFORE UPDATE OF status ON master.external_reference
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_external_reference_updated_at
BEFORE UPDATE ON master.external_reference
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_team_10_normalize
BEFORE INSERT OR UPDATE OF code, name, description, team_type
ON master.team
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_team();

CREATE TRIGGER trg_team_identity_immutable
BEFORE UPDATE OF id, tenant_id, code, status
ON master.team
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_team_identity();

CREATE TRIGGER trg_team_status_changed
BEFORE UPDATE OF status ON master.team
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_team_updated_at
BEFORE UPDATE ON master.team
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_team_member_10_normalize
BEFORE INSERT OR UPDATE OF role_code, leave_reason
ON master.team_member
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_team_member();

CREATE TRIGGER trg_team_member_20_guard
BEFORE UPDATE ON master.team_member
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_team_member();

CREATE TRIGGER trg_contact_email_channel
BEFORE INSERT OR UPDATE OF tenant_id, contact_link_id
ON master.contact_email
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_extension_channel();

CREATE TRIGGER trg_contact_email_updated_at
BEFORE UPDATE ON master.contact_email
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_contact_phone_channel
BEFORE INSERT OR UPDATE OF tenant_id, contact_link_id
ON master.contact_phone
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_extension_channel();

CREATE TRIGGER trg_contact_phone_updated_at
BEFORE UPDATE ON master.contact_phone
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_identity_immutable
BEFORE UPDATE OF
    id, tenant_id, code, principal_type, provisioning_source, auth_epoch
ON master.principal
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_identity();

CREATE TRIGGER trg_principal_status_transition
BEFORE UPDATE OF status ON master.principal
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_status_transition();

CREATE TRIGGER trg_principal_updated_at
BEFORE UPDATE ON master.principal
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_profile_identity_immutable
BEFORE UPDATE OF id, tenant_id, principal_id ON master.principal_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_child_identity();

CREATE TRIGGER trg_principal_profile_updated_at
BEFORE UPDATE ON master.principal_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_identity_binding_10_normalize
BEFORE INSERT OR UPDATE OF
    realm_key, subject_id, issuer, audience, username,
    service_client_id, sync_error_message
ON master.principal_identity_binding
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_principal_identity_binding();

CREATE TRIGGER trg_principal_identity_binding_20_identity_immutable
BEFORE UPDATE OF
    id, tenant_id, principal_id, provider_code, realm_key, subject_id
ON master.principal_identity_binding
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_identity_binding();

CREATE TRIGGER trg_principal_identity_binding_30_validate_principal
BEFORE INSERT OR UPDATE OF tenant_id, principal_id, service_client_id
ON master.principal_identity_binding
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_identity_binding_principal();

CREATE TRIGGER trg_principal_identity_binding_40_status_transition
BEFORE UPDATE OF status ON master.principal_identity_binding
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_identity_binding_status_transition();

CREATE TRIGGER trg_principal_identity_binding_updated_at
BEFORE UPDATE ON master.principal_identity_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_ui_profile_identity_immutable
BEFORE UPDATE OF id, tenant_id, principal_id ON master.principal_ui_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_child_identity();

CREATE TRIGGER trg_principal_ui_profile_updated_at
BEFORE UPDATE ON master.principal_ui_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_ui_preference_10_normalize
BEFORE INSERT OR UPDATE OF preference_code, surface_code
ON master.principal_ui_preference
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_principal_registry_codes();

CREATE TRIGGER trg_principal_ui_preference_identity_immutable
BEFORE UPDATE OF id, tenant_id, principal_id ON master.principal_ui_preference
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_child_identity();

CREATE TRIGGER trg_principal_ui_preference_updated_at
BEFORE UPDATE ON master.principal_ui_preference
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_notification_preference_10_normalize
BEFORE INSERT OR UPDATE OF event_code
ON master.principal_notification_preference
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_principal_registry_codes();

CREATE TRIGGER trg_principal_notification_preference_identity_immutable
BEFORE UPDATE OF id, tenant_id, principal_id
ON master.principal_notification_preference
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_principal_child_identity();

CREATE TRIGGER trg_principal_notification_preference_status_changed
BEFORE UPDATE OF status ON master.principal_notification_preference
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_principal_notification_preference_updated_at
BEFORE UPDATE ON master.principal_notification_preference
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_saved_view_10_normalize
BEFORE INSERT OR UPDATE OF surface_code, entity_code, code, name, description
ON master.saved_view
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_saved_view();

CREATE TRIGGER trg_saved_view_identity_immutable
BEFORE UPDATE OF id, tenant_id, surface_code, entity_code, code
ON master.saved_view
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_saved_view_identity();

CREATE TRIGGER trg_saved_view_status_changed
BEFORE UPDATE OF status ON master.saved_view
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_saved_view_updated_at
BEFORE UPDATE ON master.saved_view
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_brand_profile_identity_immutable
BEFORE UPDATE OF id, tenant_id, code ON master.brand_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_render_registry_identity();
CREATE TRIGGER trg_brand_profile_single_default
BEFORE INSERT OR UPDATE OF is_default, status ON master.brand_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_switch_render_registry_default();
CREATE TRIGGER trg_brand_profile_status_changed
BEFORE UPDATE OF status ON master.brand_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_brand_profile_updated_at
BEFORE UPDATE ON master.brand_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_letterhead_identity_immutable
BEFORE UPDATE OF id, tenant_id, code ON master.letterhead
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_render_registry_identity();
CREATE TRIGGER trg_letterhead_single_default
BEFORE INSERT OR UPDATE OF is_default, status ON master.letterhead
FOR EACH ROW EXECUTE FUNCTION master.trg_switch_render_registry_default();
CREATE TRIGGER trg_letterhead_status_changed
BEFORE UPDATE OF status ON master.letterhead
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_letterhead_updated_at
BEFORE UPDATE ON master.letterhead
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_print_profile_identity_immutable
BEFORE UPDATE OF id, tenant_id, code ON master.print_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_render_registry_identity();
CREATE TRIGGER trg_print_profile_single_default
BEFORE INSERT OR UPDATE OF is_default, status ON master.print_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_switch_render_registry_default();
CREATE TRIGGER trg_print_profile_status_changed
BEFORE UPDATE OF status ON master.print_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_print_profile_updated_at
BEFORE UPDATE ON master.print_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_template_identity_immutable
BEFORE UPDATE OF id, tenant_id, code ON master.template
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_render_registry_identity();
CREATE TRIGGER trg_template_status_changed
BEFORE UPDATE OF status ON master.template
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_template_updated_at
BEFORE UPDATE ON master.template
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_template_binding_identity_immutable
BEFORE UPDATE OF id, tenant_id, template_id, entity_code, operation_code, variant_code, locale_code
ON master.template_binding
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_render_registry_identity();
CREATE TRIGGER trg_template_binding_status_changed
BEFORE UPDATE OF status ON master.template_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_template_binding_updated_at
BEFORE UPDATE ON master.template_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'tenant',
        'tenant_profile',
        'tenant_relationship',
        'workspace',
        'module',
        'address',
        'address_link',
        'contact_link',
        'contact_email',
        'contact_phone',
        'external_reference',
        'team',
        'team_member',
        'principal',
        'principal_profile',
        'principal_identity_binding',
        'principal_ui_profile',
        'principal_ui_preference',
        'principal_notification_preference',
        'saved_view',
        'brand_profile',
        'letterhead',
        'print_profile',
        'template',
        'template_binding'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            'trg_' || v_table || '_00_created_by',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_guard_master_evidence()',
            'trg_' || v_table || '_00_creation_evidence',
            v_table
        );
    END LOOP;
END;
$$;
