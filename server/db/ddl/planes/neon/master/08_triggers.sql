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

CREATE TRIGGER trg_legal_entity_identity_immutable BEFORE UPDATE OF id, tenant_id, code
ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_legal_entity_status_changed BEFORE UPDATE OF status
ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_legal_entity_updated_at BEFORE UPDATE
ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_legal_entity_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_legal_entity_id ON master.legal_entity
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_legal_entity_id'
);

CREATE TRIGGER trg_company_code_identity_immutable BEFORE UPDATE OF id, tenant_id, code
ON master.company_code FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_company_code_status_changed BEFORE UPDATE OF status
ON master.company_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_company_code_updated_at BEFORE UPDATE
ON master.company_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_organization_tax_registration_identity_immutable BEFORE UPDATE OF id, tenant_id
ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_organization_tax_registration_status_changed BEFORE UPDATE OF status
ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_organization_tax_registration_updated_at BEFORE UPDATE
ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_operating_organization_identity_immutable BEFORE UPDATE OF id, tenant_id, code
ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_operating_organization_status_changed BEFORE UPDATE OF status
ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_operating_organization_updated_at BEFORE UPDATE
ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_operating_organization_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_operating_organization_id ON master.operating_organization
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_operating_organization_id'
);

CREATE TRIGGER trg_procurement_organization_profile_identity_immutable
BEFORE UPDATE OF tenant_id, operating_organization_id ON master.procurement_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_procurement_organization_profile_updated_at BEFORE UPDATE
ON master.procurement_organization_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_procurement_organization_profile_domain
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id
ON master.procurement_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile();

CREATE TRIGGER trg_sales_organization_profile_identity_immutable
BEFORE UPDATE OF tenant_id, operating_organization_id ON master.sales_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_sales_organization_profile_updated_at BEFORE UPDATE
ON master.sales_organization_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_sales_organization_profile_domain
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id
ON master.sales_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile();

CREATE TRIGGER trg_operating_organization_company_assignment_identity_immutable
BEFORE UPDATE OF id, tenant_id ON master.operating_organization_company_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_operating_organization_company_assignment_status_changed BEFORE UPDATE OF status
ON master.operating_organization_company_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_operating_organization_company_assignment_updated_at BEFORE UPDATE
ON master.operating_organization_company_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_org_unit_identity_immutable BEFORE UPDATE OF id, tenant_id, code
ON master.org_unit FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_org_unit_status_changed BEFORE UPDATE OF status
ON master.org_unit FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_org_unit_updated_at BEFORE UPDATE
ON master.org_unit FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_org_unit_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_org_unit_id ON master.org_unit
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_org_unit_id'
);

CREATE TRIGGER trg_profit_center_identity_immutable
BEFORE UPDATE OF id, tenant_id, company_code_id, code ON master.profit_center
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_management_center_identity();
CREATE TRIGGER trg_profit_center_status_changed
BEFORE UPDATE OF status ON master.profit_center
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_profit_center_updated_at
BEFORE UPDATE ON master.profit_center
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_profit_center_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_id ON master.profit_center
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_id'
);

CREATE TRIGGER trg_cost_center_identity_immutable
BEFORE UPDATE OF id, tenant_id, company_code_id, code ON master.cost_center
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_management_center_identity();
CREATE TRIGGER trg_cost_center_status_changed
BEFORE UPDATE OF status ON master.cost_center
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_cost_center_updated_at
BEFORE UPDATE ON master.cost_center
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_cost_center_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_id ON master.cost_center
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_id'
);

CREATE TRIGGER trg_dimension_type_identity_immutable
BEFORE UPDATE OF id, tenant_id, code ON master.dimension_type
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();
CREATE TRIGGER trg_dimension_type_structure_guard
BEFORE UPDATE OF scope_mode, is_hierarchical, max_depth ON master.dimension_type
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_dimension_type_structure();
CREATE TRIGGER trg_dimension_type_status_changed
BEFORE UPDATE OF status ON master.dimension_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_dimension_type_updated_at
BEFORE UPDATE ON master.dimension_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_value_identity_immutable
BEFORE UPDATE OF id, tenant_id, dimension_type_id, company_code_id, code
ON master.dimension_value
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_dimension_value_identity();
CREATE TRIGGER trg_dimension_value_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_id ON master.dimension_value
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_id'
);
CREATE TRIGGER trg_dimension_value_scope
BEFORE INSERT OR UPDATE OF dimension_type_id, company_code_id, parent_id
ON master.dimension_value
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_dimension_value();
CREATE TRIGGER trg_dimension_value_status_changed
BEFORE UPDATE OF status ON master.dimension_value
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_dimension_value_updated_at
BEFORE UPDATE ON master.dimension_value
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_set_immutable
BEFORE UPDATE OR DELETE ON master.dimension_set
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_dimension_set_immutable();
CREATE TRIGGER trg_dimension_set_item_immutable
BEFORE UPDATE OR DELETE ON master.dimension_set_item
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_dimension_set_immutable();

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
        'template_binding',
        'legal_entity',
        'company_code',
        'organization_tax_registration',
        'operating_organization',
        'procurement_organization_profile',
        'sales_organization_profile',
        'operating_organization_company_assignment',
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

-- Neon fixed-asset foundation.
CREATE TRIGGER trg_asset_class_00_identity
BEFORE UPDATE ON master.asset_class
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'code'
);
CREATE TRIGGER trg_asset_class_10_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_id ON master.asset_class
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_id'
);

CREATE TRIGGER trg_asset_00_identity
BEFORE UPDATE ON master.asset
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'code'
);

CREATE TRIGGER trg_asset_book_00_identity
BEFORE UPDATE ON master.asset_book
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'asset_id', 'ledger_book_id'
);
CREATE TRIGGER trg_asset_book_10_validate
BEFORE INSERT OR UPDATE OF
    company_code_id, asset_id, ledger_book_id, currency_code,
    depreciation_method
ON master.asset_book
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_asset_book();

CREATE TRIGGER trg_asset_component_00_identity
BEFORE UPDATE ON master.asset_component
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'parent_asset_id', 'component_asset_id'
);
CREATE TRIGGER trg_asset_component_10_validate
BEFORE INSERT OR UPDATE OF
    parent_asset_id, component_asset_id, allocation_percentage, status
ON master.asset_component
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_asset_component();

CREATE TRIGGER trg_asset_assignment_history_00_created_by
BEFORE INSERT ON master.asset_assignment_history
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_asset_assignment_history_10_actor
BEFORE INSERT ON master.asset_assignment_history
FOR EACH ROW EXECUTE FUNCTION master.trg_set_asset_assignment_actor();
CREATE TRIGGER trg_asset_assignment_history_90_immutable
BEFORE UPDATE OR DELETE ON master.asset_assignment_history
FOR EACH ROW EXECUTE FUNCTION master.trg_prevent_asset_assignment_mutation();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_class', 'asset', 'asset_book', 'asset_component'
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
            'trg_' || v_table || '_05_creation_evidence',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            'trg_' || v_table || '_20_status_changed',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_30_updated_at',
            v_table
        );
    END LOOP;
END;
$$;

-- Canonical business-partner identity and thin commercial roles.
CREATE TRIGGER trg_business_partner_05_normalize
BEFORE INSERT OR UPDATE OF
    code, name, display_name, legal_name, legal_form,
    registration_country_code, website_url, description, aliases
ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_counterparty();

CREATE TRIGGER trg_business_partner_10_guard
BEFORE UPDATE OR DELETE ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_counterparty_lifecycle();

CREATE TRIGGER trg_business_partner_15_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_business_partner_id
ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_business_partner_id'
);

CREATE TRIGGER trg_business_partner_20_status_changed
BEFORE UPDATE OF status ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_business_partner_30_updated_at
BEFORE UPDATE ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_supplier_05_normalize
BEFORE INSERT OR UPDATE OF supplier_code, supplier_type
ON master.supplier
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_counterparty();

CREATE TRIGGER trg_supplier_10_guard
BEFORE UPDATE OR DELETE ON master.supplier
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_counterparty_lifecycle();

CREATE TRIGGER trg_supplier_15_role
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, supplier_type
ON master.supplier
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_commercial_role();

CREATE TRIGGER trg_supplier_20_status_changed
BEFORE UPDATE OF status ON master.supplier
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_supplier_30_updated_at
BEFORE UPDATE ON master.supplier
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_customer_05_normalize
BEFORE INSERT OR UPDATE OF customer_code, customer_type
ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_counterparty();

CREATE TRIGGER trg_customer_10_guard
BEFORE UPDATE OR DELETE ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_counterparty_lifecycle();

CREATE TRIGGER trg_customer_15_role
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, customer_type
ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_commercial_role();

CREATE TRIGGER trg_customer_20_status_changed
BEFORE UPDATE OF status ON master.customer
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_customer_30_updated_at
BEFORE UPDATE ON master.customer
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner', 'supplier', 'customer'
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

-- Neon tax-master identity catalogs.
CREATE TRIGGER trg_condition_type_05_normalize
BEFORE INSERT OR UPDATE ON master.condition_type
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_condition_type();
CREATE TRIGGER trg_condition_type_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.condition_type
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_condition_type();
CREATE TRIGGER trg_condition_type_20_status_changed
BEFORE UPDATE OF status ON master.condition_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_condition_type_30_updated_at
BEFORE UPDATE ON master.condition_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_jurisdiction_05_normalize
BEFORE INSERT OR UPDATE ON master.tax_jurisdiction
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_tax_jurisdiction();
CREATE TRIGGER trg_tax_jurisdiction_10_guard
BEFORE UPDATE OR DELETE ON master.tax_jurisdiction
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tax_jurisdiction();
CREATE TRIGGER trg_tax_jurisdiction_20_status_changed
BEFORE UPDATE OF status ON master.tax_jurisdiction
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_jurisdiction_30_updated_at
BEFORE UPDATE ON master.tax_jurisdiction
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_type_05_normalize
BEFORE INSERT OR UPDATE ON master.tax_type
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_tax_type();
CREATE TRIGGER trg_tax_type_10_guard
BEFORE UPDATE OR DELETE ON master.tax_type
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tax_type();
CREATE TRIGGER trg_tax_type_20_status_changed
BEFORE UPDATE OF status ON master.tax_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_type_30_updated_at
BEFORE UPDATE ON master.tax_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'condition_type', 'tax_jurisdiction', 'tax_type'
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

-- Neon payment-term aggregate.
CREATE TRIGGER trg_payment_term_05_normalize
BEFORE INSERT OR UPDATE OF
    code, name, description, term_category
ON master.payment_term
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_payment_term();
CREATE TRIGGER trg_payment_term_10_guard
BEFORE UPDATE OR DELETE ON master.payment_term
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_payment_term();
CREATE TRIGGER trg_payment_term_20_status_changed
BEFORE UPDATE OF status ON master.payment_term
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_payment_term_30_updated_at
BEFORE UPDATE ON master.payment_term
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_payment_term_clause_05_normalize
BEFORE INSERT OR UPDATE ON master.payment_term_clause
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_payment_term_clause();
CREATE TRIGGER trg_payment_term_clause_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.payment_term_clause
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_payment_term_child();
CREATE TRIGGER trg_payment_term_clause_15_settlement
BEFORE INSERT OR UPDATE OF
    clause_code, clause_type, sequence_no, settles_clause_code
ON master.payment_term_clause
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_payment_term_settlement();
CREATE TRIGGER trg_payment_term_clause_30_updated_at
BEFORE UPDATE ON master.payment_term_clause
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_payment_term_discount_05_normalize
BEFORE INSERT OR UPDATE ON master.payment_term_discount_tier
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_payment_term_discount();
CREATE TRIGGER trg_payment_term_discount_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.payment_term_discount_tier
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_payment_term_child();
CREATE TRIGGER trg_payment_term_discount_30_updated_at
BEFORE UPDATE ON master.payment_term_discount_tier
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'payment_term', 'payment_term_clause',
        'payment_term_discount_tier'
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

-- Neon operational banking foundation.
CREATE TRIGGER trg_bank_party_normalize
BEFORE INSERT OR UPDATE OF
    code, name, country_code, bic, national_bank_code_type,
    national_bank_code, branch_code, branch_name
ON master.bank_party
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_bank_party();
CREATE TRIGGER trg_bank_party_identity
BEFORE UPDATE OF id, tenant_id, code ON master.bank_party
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_identity();

CREATE TRIGGER trg_bank_account_normalize
BEFORE INSERT OR UPDATE OF
    code, name, account_holder_name, account_id_value, account_last4,
    currency_code, bic_override, bank_name_override,
    bank_country_override, provider_account_ref
ON master.bank_account
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_bank_account();
CREATE TRIGGER trg_bank_account_identity
BEFORE UPDATE ON master.bank_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_bank_account_identity();
CREATE TRIGGER trg_bank_account_verification
BEFORE UPDATE OF
    is_verified, verified_at, verified_by, verification_method
ON master.bank_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_bank_verification();

CREATE TRIGGER trg_bank_account_link_00_resolve_owner
BEFORE INSERT OR UPDATE OF
    owner_type_id, owner_type, owner_id, relationship_role,
    company_code_id, purpose
ON master.bank_account_link
FOR EACH ROW EXECUTE FUNCTION master.trg_resolve_bank_account_owner();
CREATE TRIGGER trg_bank_account_link_10_validate_owner
BEFORE INSERT OR UPDATE OF
    tenant_id, owner_type_id, owner_id, purpose
ON master.bank_account_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_reference();
CREATE TRIGGER trg_bank_account_link_identity
BEFORE UPDATE ON master.bank_account_link
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_bank_account_link_identity();
CREATE TRIGGER trg_bank_account_link_updated_at
BEFORE UPDATE ON master.bank_account_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_house_bank_config_validate
BEFORE INSERT OR UPDATE OF
    bank_account_link_id, gl_account_id, status
ON master.bank_account_house_config
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_house_bank_config();
CREATE TRIGGER trg_house_bank_config_default
BEFORE INSERT OR UPDATE OF
    bank_account_link_id, is_default_disbursement,
    is_default_collection, status
ON master.bank_account_house_config
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_house_bank_default();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_party', 'bank_account', 'bank_account_link',
        'bank_account_house_config'
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
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE DELETE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_block_operational_bank_delete()',
            'trg_' || v_table || '_delete_blocked',
            v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_party', 'bank_account', 'bank_account_house_config'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            'trg_' || v_table || '_status_changed',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_updated_at',
            v_table
        );
    END LOOP;
END;
$$;

-- Neon accounting foundation.
CREATE TRIGGER trg_accounting_profile_identity
BEFORE UPDATE ON master.accounting_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'code'
);
CREATE TRIGGER trg_chart_of_account_identity
BEFORE UPDATE ON master.chart_of_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'code'
);
CREATE TRIGGER trg_gl_account_identity
BEFORE UPDATE ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'chart_of_account_id', 'code'
);
CREATE TRIGGER trg_gl_account_derive_path
BEFORE INSERT OR UPDATE OF parent_id, code ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_derive_gl_account_path();
CREATE TRIGGER trg_gl_account_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_gl_account();
CREATE TRIGGER trg_gl_account_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_id ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle('parent_id');
CREATE TRIGGER trg_gl_account_rebuild_descendants
AFTER UPDATE OF parent_id, code ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_rebuild_gl_account_descendants();

CREATE TRIGGER trg_ledger_book_identity
BEFORE UPDATE ON master.ledger_book
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'code'
);
CREATE TRIGGER trg_company_code_chart_assignment_identity
BEFORE UPDATE ON master.company_code_chart_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'chart_of_account_id', 'assignment_type'
);
CREATE TRIGGER trg_company_code_book_assignment_identity
BEFORE UPDATE ON master.company_code_book_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'book_id', 'effective_from'
);

CREATE TRIGGER trg_fiscal_period_identity
BEFORE UPDATE ON master.fiscal_period
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'fiscal_year',
    'period_number', 'period_type', 'start_date', 'end_date'
);
CREATE TRIGGER trg_fiscal_period_10_transition
BEFORE UPDATE OF status ON master.fiscal_period
FOR EACH ROW EXECUTE FUNCTION master.trg_set_fiscal_period_evidence();

CREATE TRIGGER trg_fx_rate_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.fx_rate
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_fx_rate();

CREATE TRIGGER trg_company_code_dimension_default_identity
BEFORE UPDATE ON master.company_code_dimension_default
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'dimension_type_id',
    'dimension_value_id', 'effective_from'
);
CREATE TRIGGER trg_company_code_dimension_default_scope
BEFORE INSERT OR UPDATE OF company_code_id, dimension_type_id, dimension_value_id
ON master.company_code_dimension_default
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_company_dimension_default();

CREATE TRIGGER trg_company_code_gl_account_identity
BEFORE UPDATE ON master.company_code_gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_accounting_identity(
    'id', 'tenant_id', 'company_code_id', 'gl_account_id'
);
CREATE TRIGGER trg_company_code_gl_account_chart
BEFORE INSERT OR UPDATE OF company_code_id, gl_account_id
ON master.company_code_gl_account
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_company_gl_account();

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
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            'trg_' || v_table || '_20_status_changed',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_30_updated_at',
            v_table
        );
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
CREATE TRIGGER trg_bi_parent_guard
    BEFORE INSERT OR UPDATE OF parent_id, domain
    ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION master.trg_bi_parent_guard();

CREATE TRIGGER trg_bi_status_changed
    BEFORE UPDATE OF status ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bi_updated_at
    BEFORE UPDATE ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
