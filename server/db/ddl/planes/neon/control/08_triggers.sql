CREATE TRIGGER trg_subscription_plan_updated_at
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_subscription_plan_guard
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION control.trg_subscription_plan_guard();

CREATE TRIGGER trg_subscription_plan_status_changed
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_owner_type_guard
BEFORE UPDATE OR DELETE ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_guard();

CREATE TRIGGER trg_owner_type_validate_target
BEFORE INSERT OR UPDATE OF
    source_type, target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column
ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_validate_target();

CREATE TRIGGER trg_owner_type_updated_at
BEFORE UPDATE ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_owner_type_status_changed
BEFORE UPDATE OF status ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_owner_type_purpose_validate
BEFORE INSERT OR UPDATE OF owner_type_id, capability, purpose_code
ON control.owner_type_purpose
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_purpose_validate();

CREATE TRIGGER trg_owner_type_purpose_guard
BEFORE UPDATE OR DELETE ON control.owner_type_purpose
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_purpose_guard();

CREATE TRIGGER trg_org_unit_type_status_changed
BEFORE UPDATE OF status ON control.org_unit_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_org_unit_type_updated_at
BEFORE UPDATE ON control.org_unit_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER risk_source_config_identity_guard
BEFORE UPDATE ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_risk_source_config_identity();
CREATE TRIGGER risk_source_config_status_changed
BEFORE UPDATE OF status ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER risk_source_config_updated_at
BEFORE UPDATE ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_business_partner_qualification_10_lookup
BEFORE INSERT OR UPDATE OF qualification_type_code
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup();

CREATE TRIGGER trg_business_partner_qualification_20_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role,
    operating_organization_id, company_code_id, commodity_capability_id,
    risk_assessment_id
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

CREATE TRIGGER trg_business_partner_qualification_30_guard
BEFORE INSERT OR UPDATE
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_business_partner_qualification();

CREATE TRIGGER trg_business_partner_qualification_40_updated
BEFORE UPDATE ON control.business_partner_qualification
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_supplier_preference_designation_10_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, supplier_id,
    operating_organization_id, company_code_id, commodity_category_id,
    effective_from, effective_until
ON control.supplier_preference_designation
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

CREATE TRIGGER trg_supplier_preference_designation_20_guard
BEFORE INSERT OR UPDATE ON control.supplier_preference_designation
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_supplier_preference_designation();

CREATE TRIGGER trg_supplier_preference_designation_30_updated
BEFORE UPDATE ON control.supplier_preference_designation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_business_partner_block_10_operation_lookup
BEFORE INSERT OR UPDATE OF operation_code
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup('operation');

CREATE TRIGGER trg_business_partner_block_20_reason_lookup
BEFORE INSERT OR UPDATE OF reason_code
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup('reason');

CREATE TRIGGER trg_business_partner_block_30_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role_scope,
    operating_organization_id, company_code_id
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

CREATE TRIGGER trg_business_partner_block_40_guard
BEFORE INSERT OR UPDATE
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_business_partner_block();

CREATE TRIGGER trg_business_partner_block_50_updated
BEFORE UPDATE ON control.business_partner_block
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_formula_expression_status_changed
BEFORE UPDATE OF status ON control.formula_expression
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_formula_expression_updated_at
BEFORE UPDATE ON control.formula_expression
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_formula_expression_version_immutable
BEFORE UPDATE OR DELETE ON control.formula_expression_version
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_published_formula_version();

CREATE TRIGGER trg_formula_expression_version_updated_at
BEFORE UPDATE ON control.formula_expression_version
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rate_table_status_changed
BEFORE UPDATE OF status ON control.rate_table
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_rate_table_updated_at
BEFORE UPDATE ON control.rate_table
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rate_table_row_updated_at
BEFORE UPDATE ON control.rate_table_row
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_item_inventory_policy_00_created_by
BEFORE INSERT ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_item_inventory_policy_10_identity_guard
BEFORE UPDATE OR DELETE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_item_inventory_policy();

CREATE TRIGGER trg_item_inventory_policy_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, item_id
ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_item_inventory_policy();

CREATE TRIGGER trg_item_inventory_policy_20_status_evidence
BEFORE UPDATE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_item_inventory_policy_90_updated_at
BEFORE UPDATE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['planning_model', 'planning_driver']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_00_created_by BEFORE INSERT ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_identity BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_planning_identity()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_80_status BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_90_updated_at BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_planning_dependency_00_created_by
BEFORE INSERT ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_dependency_10_identity
BEFORE UPDATE ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_planning_dependency();

CREATE TRIGGER trg_planning_dependency_20_cycle
BEFORE INSERT OR UPDATE OF planning_driver_id, depends_on_driver_id
ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_planning_dependency();

CREATE TRIGGER trg_budget_control_policy_00_created_by
BEFORE INSERT ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_budget_control_policy_05_validate
BEFORE INSERT OR UPDATE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_budget_control_policy();

CREATE TRIGGER trg_budget_control_policy_10_status
BEFORE UPDATE OF status ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_budget_control_policy_20_guard
BEFORE UPDATE OR DELETE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_budget_control_policy();

CREATE TRIGGER trg_budget_control_policy_90_updated
BEFORE UPDATE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_execution_profile_identity_guard
BEFORE UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER payment_execution_profile_status_changed
BEFORE UPDATE OF status ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER payment_execution_profile_updated_at
BEFORE UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_execution_profile_validate
BEFORE INSERT OR UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_payment_execution_profile();

CREATE TRIGGER asset_class_book_policy_identity_guard
BEFORE UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER asset_class_book_policy_status_changed
BEFORE UPDATE OF status ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER asset_class_book_policy_updated_at
BEFORE UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER asset_class_book_policy_validate
BEFORE INSERT OR UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_asset_class_book_policy();

CREATE TRIGGER commodity_code_classification_policy_identity_guard
BEFORE UPDATE ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER commodity_code_classification_policy_status_changed
BEFORE UPDATE OF status ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER commodity_code_classification_policy_updated_at
BEFORE UPDATE ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commodity_code_classification_policy_validate
BEFORE INSERT OR UPDATE OF
    primary_commodity_domain_code,
    trade_commodity_domain_code,
    status
ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_commodity_code_classification_policy();

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
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_guard BEFORE UPDATE OR DELETE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_commodity_category_policy()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_15_validate BEFORE INSERT OR UPDATE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_validate_commodity_category_policy()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status BEFORE UPDATE OF status ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated BEFORE UPDATE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_procurement_match_policy_00_created_by
BEFORE INSERT ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_procurement_match_policy_10_status
BEFORE UPDATE OF status ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_procurement_match_policy_20_guard
BEFORE UPDATE OR DELETE ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_procurement_match_tolerance_policy();

CREATE TRIGGER trg_procurement_match_policy_90_updated
BEFORE UPDATE ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fx_policy_00_created_by
BEFORE INSERT ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fx_policy_05_validate
BEFORE INSERT OR UPDATE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_fx_policy();

CREATE TRIGGER trg_fx_policy_10_status
BEFORE UPDATE OF status ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fx_policy_20_guard
BEFORE UPDATE OR DELETE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fx_policy();

CREATE TRIGGER trg_fx_policy_90_updated
BEFORE UPDATE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_policy_00_created_by
BEFORE INSERT ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_dimension_policy_05_validate
BEFORE INSERT OR UPDATE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_dimension_policy();

CREATE TRIGGER trg_dimension_policy_10_status
BEFORE UPDATE OF status ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dimension_policy_20_guard
BEFORE UPDATE OR DELETE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_dimension_policy();

CREATE TRIGGER trg_dimension_policy_90_updated
BEFORE UPDATE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_policy_allowed_value_00_created_by
BEFORE INSERT ON control.dimension_policy_allowed_value
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_dimension_policy_allowed_value_10_guard
BEFORE INSERT OR UPDATE OR DELETE
ON control.dimension_policy_allowed_value
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_dimension_policy_allowed_value();

CREATE TRIGGER trg_tax_rate_schedule_00_validate
BEFORE INSERT OR UPDATE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_rate_schedule();
CREATE TRIGGER trg_tax_rate_schedule_10_guard
BEFORE UPDATE OR DELETE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_rate_schedule_20_status
BEFORE UPDATE OF status ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_rate_schedule_90_updated
BEFORE UPDATE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_group_00_validate
BEFORE INSERT OR UPDATE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_group();
CREATE TRIGGER trg_tax_group_10_guard
BEFORE UPDATE OR DELETE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_group_20_status
BEFORE UPDATE OF status ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_group_90_updated
BEFORE UPDATE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_group_component_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.tax_group_component
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_group_component();

CREATE TRIGGER trg_tax_resolution_rule_00_validate
BEFORE INSERT OR UPDATE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_resolution_rule();
CREATE TRIGGER trg_tax_resolution_rule_10_guard
BEFORE UPDATE OR DELETE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_resolution_rule_20_status
BEFORE UPDATE OF status ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_resolution_rule_90_updated
BEFORE UPDATE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_wht_threshold_config_00_validate
BEFORE INSERT OR UPDATE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_wht_threshold_config();
CREATE TRIGGER trg_wht_threshold_config_10_guard
BEFORE UPDATE OR DELETE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_wht_threshold_config_20_status
BEFORE UPDATE OF status ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_wht_threshold_config_90_updated
BEFORE UPDATE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_accounting_profile_policy_00_validate
BEFORE INSERT OR UPDATE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_accounting_profile_policy();
CREATE TRIGGER trg_accounting_profile_policy_10_guard
BEFORE UPDATE OR DELETE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_accounting_profile_policy_20_status
BEFORE UPDATE OF status ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_accounting_profile_policy_90_updated
BEFORE UPDATE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_accounting_profile_event_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.accounting_profile_event
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_profile_event();
CREATE TRIGGER trg_accounting_profile_entry_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.accounting_profile_entry
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_profile_entry();

CREATE TRIGGER trg_accounting_profile_assignment_00_validate
BEFORE INSERT OR UPDATE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_accounting_profile_assignment();
CREATE TRIGGER trg_accounting_profile_assignment_10_guard
BEFORE UPDATE OR DELETE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_accounting_profile_assignment_20_status
BEFORE UPDATE OF status ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_accounting_profile_assignment_90_updated
BEFORE UPDATE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_posting_role_account_assignment_00_validate
BEFORE INSERT OR UPDATE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_posting_role_account_assignment();
CREATE TRIGGER trg_posting_role_account_assignment_10_guard
BEFORE UPDATE OR DELETE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_posting_role_account_assignment_20_status
BEFORE UPDATE OF status ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_posting_role_account_assignment_90_updated
BEFORE UPDATE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cross_book_posting_policy_00_validate
BEFORE INSERT OR UPDATE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_cross_book_posting_policy();
CREATE TRIGGER trg_cross_book_posting_policy_10_guard
BEFORE UPDATE OR DELETE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_cross_book_posting_policy_20_status
BEFORE UPDATE OF status ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_cross_book_posting_policy_90_updated
BEFORE UPDATE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cross_book_account_assignment_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.cross_book_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_cross_book_account_assignment();

CREATE TRIGGER trg_fiscal_calendar_config_00_created_by
BEFORE INSERT ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fiscal_calendar_config_05_validate
BEFORE INSERT OR UPDATE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_fiscal_calendar_config();

CREATE TRIGGER trg_fiscal_calendar_config_10_status
BEFORE UPDATE OF status ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fiscal_calendar_config_20_guard
BEFORE UPDATE OR DELETE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fiscal_calendar_config();

CREATE TRIGGER trg_fiscal_calendar_config_90_updated
BEFORE UPDATE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fiscal_calendar_period_rule_00_created_by
BEFORE INSERT ON control.fiscal_calendar_period_rule
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fiscal_calendar_period_rule_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.fiscal_calendar_period_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fiscal_calendar_period_rule();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_00_created_by
BEFORE INSERT ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_05_validate
BEFORE INSERT OR UPDATE ON control.company_fiscal_calendar_assignment
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_company_fiscal_calendar_assignment();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_10_status
BEFORE UPDATE OF status ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_20_guard
BEFORE UPDATE OR DELETE ON control.company_fiscal_calendar_assignment
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_company_fiscal_calendar_assignment();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_90_updated
BEFORE UPDATE ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mesh_bp_profile_inbox_immutable
BEFORE UPDATE OR DELETE ON control.mesh_business_partner_profile_inbox
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_business_partner_profile_evidence();
CREATE TRIGGER trg_customer_lifecycle_event_immutable
BEFORE UPDATE OR DELETE ON control.customer_lifecycle_event
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_customer_lifecycle_event_mutation();
CREATE TRIGGER trg_mesh_bp_profile_attempt_immutable
BEFORE UPDATE OR DELETE ON control.mesh_business_partner_profile_processing_attempt
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_business_partner_profile_evidence();
CREATE TRIGGER trg_mesh_workforce_claim_inbox_immutable
BEFORE UPDATE OR DELETE ON control.mesh_workforce_claim_inbox
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation();
CREATE TRIGGER trg_mesh_workforce_claim_attempt_immutable
BEFORE UPDATE OR DELETE ON control.mesh_workforce_claim_processing_attempt
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation();
CREATE TRIGGER trg_mesh_bp_profile_projection_guard
BEFORE UPDATE OR DELETE ON control.mesh_business_partner_profile_projection
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_business_partner_profile_projection();
CREATE TRIGGER trg_mesh_bp_account_link_guard BEFORE UPDATE OR DELETE ON control.mesh_business_partner_account_link FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_business_partner_account_link();
CREATE TRIGGER trg_mesh_bp_account_link_updated BEFORE UPDATE ON control.mesh_business_partner_account_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_mesh_bank_disclosure_inbox_immutable BEFORE UPDATE OR DELETE ON control.mesh_bank_account_disclosure_inbox FOR EACH ROW EXECUTE FUNCTION control.trg_reject_mesh_bank_disclosure_inbox_mutation();
CREATE TRIGGER trg_mesh_bank_account_projection_guard BEFORE UPDATE OR DELETE ON control.mesh_bank_account_projection FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_bank_account_projection();
