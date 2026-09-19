CREATE INDEX business_partner_qualification_partner_idx
    ON control.business_partner_qualification
       (tenant_id, business_partner_id, partner_role, decision);
CREATE UNIQUE INDEX business_partner_qualification_idempotency_uq
    ON control.business_partner_qualification (tenant_id, idempotency_key);
CREATE UNIQUE INDEX business_partner_qualification_decision_idempotency_uq
    ON control.business_partner_qualification (tenant_id, decision_idempotency_key)
    WHERE decision_idempotency_key IS NOT NULL;
CREATE INDEX business_partner_qualification_org_idx
    ON control.business_partner_qualification
       (tenant_id, operating_organization_id)
    WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_qualification_company_idx
    ON control.business_partner_qualification
       (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_qualification_capability_idx
    ON control.business_partner_qualification
       (tenant_id, commodity_capability_id)
    WHERE commodity_capability_id IS NOT NULL;
CREATE INDEX business_partner_qualification_review_due_idx
    ON control.business_partner_qualification
       (tenant_id, next_review_at)
    WHERE decision IN ('approved', 'conditional')
      AND next_review_at IS NOT NULL;
CREATE INDEX business_partner_qualification_readiness_idx
    ON control.business_partner_qualification
       (tenant_id, business_partner_id, partner_role,
        operating_organization_id, company_code_id,
        qualification_type_code, decision, effective_from, effective_until);

CREATE UNIQUE INDEX supplier_preference_designation_idempotency_uq
    ON control.supplier_preference_designation (tenant_id, idempotency_key);
CREATE UNIQUE INDEX supplier_preference_designation_decision_idempotency_uq
    ON control.supplier_preference_designation (tenant_id, decision_idempotency_key)
    WHERE decision_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX supplier_preference_designation_revocation_idempotency_uq
    ON control.supplier_preference_designation (tenant_id, revocation_idempotency_key)
    WHERE revocation_idempotency_key IS NOT NULL;
CREATE INDEX supplier_preference_designation_resolution_idx
    ON control.supplier_preference_designation
       (tenant_id, business_partner_id, operating_organization_id,
        company_code_id, commodity_category_id, status, effective_from, effective_until);
CREATE INDEX supplier_preference_designation_supplier_idx
    ON control.supplier_preference_designation
       (tenant_id, supplier_id, operating_organization_id, status);

CREATE UNIQUE INDEX customer_account_designation_idempotency_uq
    ON control.customer_account_designation (tenant_id, idempotency_key);
CREATE UNIQUE INDEX customer_account_designation_decision_idempotency_uq
    ON control.customer_account_designation (tenant_id, decision_idempotency_key)
    WHERE decision_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX customer_account_designation_revocation_idempotency_uq
    ON control.customer_account_designation (tenant_id, revocation_idempotency_key)
    WHERE revocation_idempotency_key IS NOT NULL;
CREATE INDEX customer_account_designation_resolution_idx
    ON control.customer_account_designation
       (tenant_id, business_partner_id, operating_organization_id,
        company_code_id, country_code, channel_code, designation_type, status, effective_from, effective_until);
CREATE INDEX customer_account_designation_customer_idx
    ON control.customer_account_designation
       (tenant_id, customer_id, operating_organization_id, status);

CREATE INDEX business_partner_block_partner_idx
    ON control.business_partner_block
       (tenant_id, business_partner_id, status, effective_from);
CREATE INDEX business_partner_block_org_idx
    ON control.business_partner_block
       (tenant_id, operating_organization_id)
    WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_block_company_idx
    ON control.business_partner_block
       (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_block_active_operation_idx
    ON control.business_partner_block
       (tenant_id, business_partner_id, partner_role_scope, operation_code)
    WHERE status = 'active';

CREATE INDEX subscription_plan_active_pidx
    ON control.subscription_plan (sort_order, code)
    WHERE status = 'active';

CREATE UNIQUE INDEX owner_type_platform_code_uq
    ON control.owner_type (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX owner_type_tenant_code_uq
    ON control.owner_type (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX owner_type_active_capability_idx
    ON control.owner_type
       (tenant_id, supports_address, supports_contact, sort_order, code)
    WHERE status = 'active';

CREATE INDEX owner_type_target_idx
    ON control.owner_type (target_schema, target_table)
    WHERE status <> 'deprecated';

CREATE INDEX owner_type_purpose_lookup_idx
    ON control.owner_type_purpose (capability, purpose_code, owner_type_id);

CREATE INDEX org_unit_type_tenant_level_idx
    ON control.org_unit_type (tenant_id, level_order, code)
    WHERE status = 'active';

CREATE INDEX risk_source_config_enabled_idx
    ON control.risk_source_config (tenant_id, source_code)
    WHERE status = 'active';
CREATE INDEX risk_source_config_connector_idx
    ON control.risk_source_config (tenant_id, connector_instance_id)
    WHERE connector_instance_id IS NOT NULL;

CREATE INDEX formula_expression_status_idx
    ON control.formula_expression (tenant_id, formula_kind, status);

CREATE INDEX formula_expression_version_effective_idx
    ON control.formula_expression_version
       (tenant_id, formula_expression_id, effective_from DESC)
    WHERE status = 'effective';

CREATE UNIQUE INDEX formula_expression_one_open_effective_uq
    ON control.formula_expression_version (tenant_id, formula_expression_id)
    WHERE status = 'effective' AND effective_until IS NULL;

CREATE INDEX rate_table_status_idx
    ON control.rate_table (tenant_id, rate_table_kind, status);

CREATE INDEX rate_table_country_idx
    ON control.rate_table (tenant_id, country_code, status)
    WHERE country_code IS NOT NULL;

CREATE INDEX rate_table_row_lookup_idx
    ON control.rate_table_row
       (tenant_id, rate_table_id, effective_from DESC, sequence_no);

CREATE INDEX rate_table_row_range_idx
    ON control.rate_table_row
       (tenant_id, rate_table_id, range_from, range_until)
    WHERE range_from IS NOT NULL;

CREATE INDEX item_inventory_policy_item_idx
    ON control.item_inventory_policy (
        tenant_id, company_code_id, item_id, status, effective_from, effective_to
    );
CREATE INDEX item_inventory_policy_created_by_idx
    ON control.item_inventory_policy (tenant_id, created_by);

CREATE INDEX planning_model_book_idx
    ON control.planning_model (tenant_id, ledger_book_id);
CREATE INDEX planning_model_based_on_idx
    ON control.planning_model (tenant_id, based_on_model_id)
    WHERE based_on_model_id IS NOT NULL;
CREATE INDEX planning_model_status_idx
    ON control.planning_model (tenant_id, company_code_id, status);
CREATE INDEX planning_model_responsible_idx
    ON control.planning_model (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX planning_model_created_by_idx
    ON control.planning_model (tenant_id, created_by);

CREATE INDEX planning_driver_formula_idx
    ON control.planning_driver (tenant_id, formula_expression_id)
    WHERE formula_expression_id IS NOT NULL;
CREATE INDEX planning_driver_status_idx
    ON control.planning_driver (tenant_id, planning_model_id, status);
CREATE INDEX planning_driver_created_by_idx
    ON control.planning_driver (tenant_id, created_by);
CREATE INDEX planning_dependency_reverse_idx
    ON control.planning_driver_dependency
       (tenant_id, planning_model_id, depends_on_driver_id);
CREATE INDEX planning_dependency_created_by_idx
    ON control.planning_driver_dependency (tenant_id, created_by);

CREATE INDEX budget_control_policy_resolve_idx
    ON control.budget_control_policy (
        tenant_id, company_code_id, ledger_book_id,
        source_document_type, effective_from, effective_to
    ) WHERE status = 'active';

CREATE INDEX budget_control_policy_supersedes_idx
    ON control.budget_control_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX payment_execution_profile_connector_idx
    ON control.payment_execution_profile (tenant_id, connector_instance_id)
    WHERE connector_instance_id IS NOT NULL;

CREATE INDEX payment_execution_profile_active_rail_idx
    ON control.payment_execution_profile (tenant_id, payment_rail_code, delivery_mode)
    WHERE status = 'active';

CREATE INDEX asset_class_book_policy_asset_class_idx
    ON control.asset_class_book_policy (tenant_id, asset_class_id)
    WHERE status = 'active';

CREATE INDEX asset_class_book_policy_company_idx
    ON control.asset_class_book_policy (tenant_id, company_code_id)
    WHERE status = 'active';

CREATE INDEX asset_class_book_policy_ledger_book_idx
    ON control.asset_class_book_policy (tenant_id, ledger_book_id)
    WHERE status = 'active';

CREATE INDEX commodity_code_classification_policy_primary_domain_idx
    ON control.commodity_code_classification_policy (
        primary_commodity_domain_code, tenant_id
    )
    WHERE status = 'active';

CREATE INDEX commodity_code_classification_policy_trade_domain_idx
    ON control.commodity_code_classification_policy (
        trade_commodity_domain_code, tenant_id
    )
    WHERE trade_commodity_domain_code IS NOT NULL AND status = 'active';

CREATE INDEX cc_buy_policy_resolution_idx
    ON control.commodity_category_buy_policy (
        tenant_id, commodity_category_id, company_code_id,
        company_code_supplier_profile_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_buy_policy_intent_idx
    ON control.commodity_category_buy_policy (tenant_id, business_intent_id)
    WHERE status = 'active';
CREATE INDEX cc_buy_policy_created_by_idx
    ON control.commodity_category_buy_policy (tenant_id, created_by);

CREATE INDEX cc_sell_policy_resolution_idx
    ON control.commodity_category_sell_policy (
        tenant_id, commodity_category_id, company_code_id,
        company_code_customer_profile_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_sell_policy_intent_idx
    ON control.commodity_category_sell_policy (tenant_id, business_intent_id)
    WHERE status = 'active';
CREATE INDEX cc_sell_policy_created_by_idx
    ON control.commodity_category_sell_policy (tenant_id, created_by);

CREATE INDEX cc_inventory_policy_resolution_idx
    ON control.commodity_category_inventory_policy (
        tenant_id, commodity_category_id, company_code_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_inventory_policy_created_by_idx
    ON control.commodity_category_inventory_policy (tenant_id, created_by);

CREATE INDEX procurement_match_tolerance_resolution_idx
    ON control.procurement_match_tolerance_policy (
        tenant_id, match_type, company_code_id, effective_from DESC
    ) WHERE status = 'active';

CREATE INDEX procurement_match_tolerance_created_by_idx
    ON control.procurement_match_tolerance_policy (tenant_id, created_by);

CREATE INDEX fx_policy_resolution_idx
    ON control.fx_policy (
        tenant_id, transaction_context,
        company_code_id, ledger_book_id, effective_from DESC, version_no DESC
    ) WHERE status = 'active';

CREATE INDEX fx_policy_supersedes_idx
    ON control.fx_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX fx_policy_created_by_idx
    ON control.fx_policy (tenant_id, created_by);

CREATE UNIQUE INDEX dimension_policy_active_code_uq
    ON control.dimension_policy (tenant_id, policy_code)
    WHERE status = 'active';

CREATE INDEX dimension_policy_resolution_idx
    ON control.dimension_policy (
        tenant_id,
        dimension_type_id,
        company_code_id,
        scope_account_id,
        scope_account_class,
        scope_subledger_type,
        scope_book_id,
        scope_document_type,
        effective_from DESC,
        version_no DESC
    ) WHERE status = 'active';

CREATE INDEX dimension_policy_supersedes_idx
    ON control.dimension_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX dimension_policy_created_by_idx
    ON control.dimension_policy (tenant_id, created_by);

CREATE INDEX dimension_policy_allowed_value_policy_idx
    ON control.dimension_policy_allowed_value (
        tenant_id, policy_id, dimension_value_id
    );

CREATE INDEX dimension_policy_allowed_value_value_idx
    ON control.dimension_policy_allowed_value (
        tenant_id, dimension_type_id, dimension_value_id
    );

CREATE INDEX tax_rate_schedule_resolution_idx
    ON control.tax_rate_schedule (
        tenant_id, jurisdiction_id, tax_type_id, tax_direction,
        component_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_rate_schedule_created_by_idx
    ON control.tax_rate_schedule (tenant_id, created_by);

CREATE INDEX tax_group_resolution_idx
    ON control.tax_group (tenant_id, code, effective_from DESC)
    WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_group_jurisdiction_idx
    ON control.tax_group (tenant_id, jurisdiction_id, group_kind);

CREATE INDEX tax_group_rounding_rule_idx
    ON control.tax_group (tenant_id, rounding_rule_id);

CREATE INDEX tax_group_supersedes_idx
    ON control.tax_group (tenant_id, supersedes_tax_group_id)
    WHERE supersedes_tax_group_id IS NOT NULL;

CREATE INDEX tax_group_component_schedule_idx
    ON control.tax_group_component (tenant_id, tax_rate_schedule_id);

CREATE INDEX tax_resolution_rule_resolution_idx
    ON control.tax_resolution_rule (
        tenant_id, scope_company_code_id, scope_transaction_direction,
        priority DESC, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_resolution_rule_tax_group_idx
    ON control.tax_resolution_rule (tenant_id, resolved_tax_group_id);

CREATE INDEX wht_threshold_config_resolution_idx
    ON control.wht_threshold_config (
        tenant_id, company_code_id, jurisdiction_id, tax_type_id,
        section_code, threshold_mode, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');

CREATE INDEX accounting_profile_policy_profile_idx
    ON control.accounting_profile_policy (tenant_id, accounting_profile_id, effective_from DESC);
CREATE INDEX accounting_profile_policy_supersedes_idx
    ON control.accounting_profile_policy (tenant_id, supersedes_policy_id)
    WHERE supersedes_policy_id IS NOT NULL;
CREATE INDEX accounting_profile_policy_created_by_idx
    ON control.accounting_profile_policy (tenant_id, created_by);
CREATE INDEX accounting_profile_policy_updated_by_idx
    ON control.accounting_profile_policy (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX accounting_profile_policy_status_by_idx
    ON control.accounting_profile_policy (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX accounting_profile_event_policy_idx
    ON control.accounting_profile_event (tenant_id, accounting_profile_policy_id, sequence_no);
CREATE INDEX accounting_profile_event_created_by_idx
    ON control.accounting_profile_event (tenant_id, created_by);
CREATE INDEX accounting_profile_entry_event_idx
    ON control.accounting_profile_entry (tenant_id, accounting_profile_event_id, line_no);
CREATE INDEX accounting_profile_entry_role_idx
    ON control.accounting_profile_entry (posting_role_code);
CREATE INDEX accounting_profile_entry_condition_idx
    ON control.accounting_profile_entry (tenant_id, condition_type_id)
    WHERE condition_type_id IS NOT NULL;
CREATE INDEX accounting_profile_entry_created_by_idx
    ON control.accounting_profile_entry (tenant_id, created_by);

CREATE INDEX accounting_profile_assignment_resolution_idx
    ON control.accounting_profile_assignment (
        tenant_id, company_code_id, business_intent_id,
        flow_code, document_type_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX accounting_profile_assignment_policy_idx
    ON control.accounting_profile_assignment (tenant_id, accounting_profile_policy_id);
CREATE INDEX accounting_profile_assignment_intent_idx
    ON control.accounting_profile_assignment (tenant_id, business_intent_id)
    WHERE business_intent_id IS NOT NULL;
CREATE INDEX accounting_profile_assignment_created_by_idx
    ON control.accounting_profile_assignment (tenant_id, created_by);
CREATE INDEX accounting_profile_assignment_updated_by_idx
    ON control.accounting_profile_assignment (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX accounting_profile_assignment_status_by_idx
    ON control.accounting_profile_assignment (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX posting_role_account_assignment_resolution_idx
    ON control.posting_role_account_assignment (
        tenant_id, company_code_id, ledger_book_id,
        posting_role_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX posting_role_account_assignment_account_idx
    ON control.posting_role_account_assignment (tenant_id, gl_account_id);
CREATE INDEX posting_role_account_assignment_book_idx
    ON control.posting_role_account_assignment (tenant_id, ledger_book_id);
CREATE INDEX posting_role_account_assignment_supersedes_idx
    ON control.posting_role_account_assignment (tenant_id, supersedes_assignment_id)
    WHERE supersedes_assignment_id IS NOT NULL;
CREATE INDEX posting_role_account_assignment_created_by_idx
    ON control.posting_role_account_assignment (tenant_id, created_by);
CREATE INDEX posting_role_account_assignment_updated_by_idx
    ON control.posting_role_account_assignment (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX posting_role_account_assignment_status_by_idx
    ON control.posting_role_account_assignment (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX cross_book_posting_policy_resolution_idx
    ON control.cross_book_posting_policy (
        tenant_id, company_code_id, source_book_id,
        scope_document_type_code, scope_business_intent_id, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX cross_book_posting_policy_source_book_idx
    ON control.cross_book_posting_policy (tenant_id, source_book_id);
CREATE INDEX cross_book_posting_policy_target_book_idx
    ON control.cross_book_posting_policy (tenant_id, target_book_id);
CREATE INDEX cross_book_posting_policy_intent_idx
    ON control.cross_book_posting_policy (tenant_id, scope_business_intent_id)
    WHERE scope_business_intent_id IS NOT NULL;
CREATE INDEX cross_book_posting_policy_supersedes_idx
    ON control.cross_book_posting_policy (tenant_id, supersedes_policy_id)
    WHERE supersedes_policy_id IS NOT NULL;
CREATE INDEX cross_book_posting_policy_created_by_idx
    ON control.cross_book_posting_policy (tenant_id, created_by);
CREATE INDEX cross_book_posting_policy_updated_by_idx
    ON control.cross_book_posting_policy (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX cross_book_posting_policy_status_by_idx
    ON control.cross_book_posting_policy (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;
CREATE INDEX cross_book_account_assignment_source_idx
    ON control.cross_book_account_assignment (tenant_id, source_gl_account_id);
CREATE INDEX cross_book_account_assignment_target_idx
    ON control.cross_book_account_assignment (tenant_id, target_gl_account_id);
CREATE INDEX cross_book_account_assignment_created_by_idx
    ON control.cross_book_account_assignment (tenant_id, created_by);

CREATE INDEX fiscal_calendar_config_lineage_idx
    ON control.fiscal_calendar_config (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX fiscal_calendar_period_rule_order_idx
    ON control.fiscal_calendar_period_rule (
        tenant_id, fiscal_calendar_config_id, sequence_no
    );

CREATE INDEX company_fiscal_calendar_assignment_resolution_idx
    ON control.company_fiscal_calendar_assignment (
        tenant_id, company_code_id,
        effective_fiscal_year_from DESC,
        effective_fiscal_year_to
    )
    WHERE status = 'active';

CREATE INDEX company_fiscal_calendar_assignment_config_idx
    ON control.company_fiscal_calendar_assignment (
        tenant_id, fiscal_calendar_config_id, status
    );

CREATE INDEX mesh_bp_profile_inbox_coordinate_idx
    ON control.mesh_business_partner_profile_inbox
    (tenant_id, network_relationship_id, publication_version DESC, lifecycle_version DESC);
CREATE INDEX mesh_bp_profile_inbox_publication_idx
    ON control.mesh_business_partner_profile_inbox
    (tenant_id, publication_id, lifecycle_version DESC);
CREATE INDEX mesh_bp_profile_attempt_quarantine_idx
    ON control.mesh_business_partner_profile_processing_attempt
    (tenant_id, processed_at DESC, inbox_event_id)
    WHERE disposition = 'quarantined';
CREATE INDEX mesh_workforce_claim_inbox_relationship_idx
    ON control.mesh_workforce_claim_inbox
    (tenant_id, network_relationship_id, received_at DESC);
CREATE INDEX mesh_workforce_claim_inbox_business_key_idx
    ON control.mesh_workforce_claim_inbox
    (tenant_id, document_kind, business_key)
    WHERE business_key IS NOT NULL;
CREATE INDEX mesh_workforce_claim_attempt_retry_idx
    ON control.mesh_workforce_claim_processing_attempt
    (tenant_id, processed_at DESC, inbox_id)
    WHERE disposition IN ('quarantined','failed');
CREATE INDEX mesh_bp_profile_projection_source_idx
    ON control.mesh_business_partner_profile_projection
    (tenant_id, source_tenant_id, source_network_account_id, projection_status);
CREATE INDEX mesh_bp_account_link_partner_idx ON control.mesh_business_partner_account_link(tenant_id,business_partner_id,status);
CREATE INDEX mesh_bp_account_link_relationship_idx ON control.mesh_business_partner_account_link(tenant_id,network_relationship_id,status);
CREATE UNIQUE INDEX mesh_bp_account_link_active_partner_role_uq ON control.mesh_business_partner_account_link(tenant_id,business_partner_id,source_network_account_id,proposed_role) WHERE status='active';
CREATE INDEX mesh_bank_disclosure_inbox_relationship_idx ON control.mesh_bank_account_disclosure_inbox(tenant_id,network_relationship_id,received_at DESC);
CREATE INDEX mesh_bank_account_projection_partner_idx ON control.mesh_bank_account_projection(tenant_id,account_link_id,projection_status);
CREATE UNIQUE INDEX customer_credit_review_idempotency_uq ON control.customer_credit_review(tenant_id,idempotency_key);
CREATE UNIQUE INDEX customer_credit_review_decision_idempotency_uq ON control.customer_credit_review(tenant_id,decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;
CREATE INDEX customer_credit_review_scope_idx ON control.customer_credit_review(tenant_id,business_partner_id,operating_organization_id,company_code_id,created_at DESC);
CREATE UNIQUE INDEX customer_credit_review_effective_approved_uq ON control.customer_credit_review(tenant_id,customer_id,operating_organization_id,company_code_id) WHERE decision IN('approved','conditional') AND effective_until IS NULL;
CREATE INDEX customer_credit_review_effective_resolution_idx ON control.customer_credit_review(tenant_id,customer_id,operating_organization_id,company_code_id,effective_from,effective_until,approved_at DESC) WHERE decision IN('approved','conditional');
CREATE UNIQUE INDEX customer_lifecycle_event_idempotency_uq ON control.customer_lifecycle_event(tenant_id,idempotency_key);
CREATE INDEX customer_lifecycle_event_customer_idx ON control.customer_lifecycle_event(tenant_id,customer_id,occurred_at DESC);
CREATE UNIQUE INDEX business_partner_mutation_evidence_idempotency_uq ON control.business_partner_mutation_evidence(tenant_id,idempotency_key);
CREATE UNIQUE INDEX business_partner_mutation_evidence_version_uq ON control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,resulting_version);
CREATE INDEX business_partner_mutation_evidence_partner_idx ON control.business_partner_mutation_evidence(tenant_id,business_partner_id,occurred_at DESC);
CREATE INDEX external_workforce_rate_card_active_idx
    ON control.external_workforce_rate_card (tenant_id, company_code_id, effective_from, effective_until)
    WHERE status = 'active';
CREATE INDEX external_workforce_rate_match_idx
    ON control.external_workforce_rate (tenant_id, rate_card_id, supplier_id, job_id, site_id, worker_classification, effective_from)
    WHERE status = 'active';
CREATE INDEX business_partner_decision_scope_authority_idx
ON control.business_partner_decision_scope
(tenant_id,qualification_id,supplier_preference_id,customer_designation_id,credit_review_id,scope_group);
