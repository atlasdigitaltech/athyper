REVOKE ALL ON SCHEMA control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA control FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA control FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT ON
            control.subscription_plan,
            control.owner_type,
            control.owner_type_purpose,
            control.org_unit_type
        TO athyperapp;
        GRANT INSERT, UPDATE ON control.org_unit_type TO athyperapp;

        GRANT EXECUTE ON FUNCTION control.fn_register_owner_type(
            uuid, text, text, text, text, text, text, text, text,
            boolean, boolean, boolean
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_activate_owner_type(
            uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_deprecate_owner_type(
            uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_add_owner_type_purpose(
            uuid, uuid, text, text
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_remove_owner_type_purpose(
            uuid, uuid, text, text
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA control TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA control TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.mesh_business_partner_profile_inbox,
    control.mesh_business_partner_profile_processing_attempt,
    control.mesh_business_partner_profile_projection,
    control.mesh_workforce_claim_inbox,
    control.mesh_workforce_claim_processing_attempt
FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
    control.trg_guard_mesh_business_partner_profile_evidence(),
    control.trg_guard_mesh_business_partner_profile_projection(),
    control.trg_reject_mesh_workforce_claim_evidence_mutation()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON control.mesh_business_partner_profile_inbox TO athyperapp;
        GRANT SELECT, INSERT ON control.mesh_business_partner_profile_processing_attempt,
            control.mesh_workforce_claim_inbox,
            control.mesh_workforce_claim_processing_attempt TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON control.mesh_business_partner_profile_projection TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        GRANT USAGE ON SCHEMA control TO athyper_jobs_service;
        GRANT SELECT, INSERT, UPDATE ON control.mesh_business_partner_profile_inbox TO athyper_jobs_service;
        GRANT SELECT, INSERT ON control.mesh_business_partner_profile_processing_attempt TO athyper_jobs_service;
        GRANT SELECT, INSERT, UPDATE ON control.mesh_business_partner_profile_projection TO athyper_jobs_service;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.mesh_business_partner_profile_inbox,
            control.mesh_business_partner_profile_processing_attempt,
            control.mesh_business_partner_profile_projection,
            control.mesh_workforce_claim_inbox,
            control.mesh_workforce_claim_processing_attempt TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT SELECT ON
      control.accounting_profile_policy_catalog,
      control.v_authorization_v2_deferred_constraints,
      master.v_business_partner_address,
      master.v_business_partner_app_index,
      master.v_business_partner_bank_account,
      master.v_business_partner_role_summary,
      master.v_company_code_address,
      master.v_contact_summary,
      master.v_effective_principal_ui,
      master.v_resolved_address,
      master.v_resolved_identity,
      master.v_site_address,
      master.v_supplier_address,
      master.v_supplier_bank_account,
      master.business_partner_governance_summary,
      master.entity_commodity_assignment,
      document.purchase_order,
      document.v_ap_invoice_summary,
      document.v_ap_settlement_graph,
      document.v_ap_settlement_summary,
      document.v_commitment_line_pricing_summary,
      document.v_current_accounting_distribution,
      document.v_current_pricing_component,
      document.v_current_schedule_line,
      document.v_invoice_retention_release_schedule,
      ledger.v_trial_balance,
      ledger.v_asset_reserve_summary
    TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT SELECT ON
      control.accounting_profile_policy_catalog,
      control.v_authorization_v2_deferred_constraints,
      master.v_business_partner_address,
      master.v_business_partner_app_index,
      master.v_business_partner_bank_account,
      master.v_business_partner_role_summary,
      master.v_company_code_address,
      master.v_contact_summary,
      master.v_effective_principal_ui,
      master.v_resolved_address,
      master.v_resolved_identity,
      master.v_site_address,
      master.v_supplier_address,
      master.v_supplier_bank_account,
      master.business_partner_governance_summary,
      master.entity_commodity_assignment,
      document.purchase_order,
      document.v_ap_invoice_summary,
      document.v_ap_settlement_graph,
      document.v_ap_settlement_summary,
      document.v_commitment_line_pricing_summary,
      document.v_current_accounting_distribution,
      document.v_current_pricing_component,
      document.v_current_schedule_line,
      document.v_invoice_retention_release_schedule,
      ledger.v_trial_balance,
      ledger.v_asset_reserve_summary
    TO athyperadmin;
  END IF;
END;
$$;

REVOKE ALL ON control.risk_source_config, control.v_risk_source_config FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.v_risk_source_config TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON control.risk_source_config TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.risk_source_config TO athyperadmin;
        GRANT SELECT ON control.v_risk_source_config TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.business_partner_qualification,
    control.supplier_preference_designation,
    control.customer_account_designation,
    control.business_partner_block
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.business_partner_qualification,
            control.supplier_preference_designation,
            control.customer_account_designation,
            control.business_partner_block
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.business_partner_qualification,
            control.supplier_preference_designation,
            control.customer_account_designation,
            control.business_partner_block
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.formula_expression,
            control.formula_expression_version,
            control.rate_table,
            control.rate_table_row
        TO athyperapp;

        GRANT EXECUTE ON FUNCTION control.trg_guard_published_formula_version()
        TO athyperapp;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON control.item_inventory_policy
            TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES
            ON control.item_inventory_policy
            TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            control.planning_model,
            control.planning_driver,
            control.planning_driver_dependency
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            control.planning_model,
            control.planning_driver,
            control.planning_driver_dependency
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.budget_control_policy FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON control.budget_control_policy TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.budget_control_policy TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.payment_execution_profile FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.payment_execution_profile TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.payment_execution_profile TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.asset_class_book_policy FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON control.asset_class_book_policy TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.asset_class_book_policy TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.commodity_code_classification_policy FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE
            ON control.commodity_code_classification_policy TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES
            ON control.commodity_code_classification_policy TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            control.commodity_category_buy_policy,
            control.commodity_category_sell_policy,
            control.commodity_category_inventory_policy
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            control.commodity_category_buy_policy,
            control.commodity_category_sell_policy,
            control.commodity_category_inventory_policy
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.procurement_match_tolerance_policy,
    control.fx_policy,
    control.dimension_policy,
    control.dimension_policy_allowed_value
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.procurement_match_tolerance_policy,
            control.fx_policy
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.dimension_policy,
            control.dimension_policy_allowed_value
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.procurement_match_tolerance_policy,
            control.fx_policy,
            control.dimension_policy,
            control.dimension_policy_allowed_value
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.tax_rate_schedule,
    control.tax_group,
    control.tax_group_component,
    control.tax_resolution_rule,
    control.wht_threshold_config
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.trg_guard_tax_policy_row(),
    control.trg_validate_tax_rate_schedule(),
    control.trg_validate_tax_group(),
    control.trg_validate_tax_group_component(),
    control.trg_validate_tax_resolution_rule(),
    control.trg_validate_wht_threshold_config()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.tax_rate_schedule,
            control.tax_group,
            control.tax_group_component,
            control.tax_resolution_rule,
            control.wht_threshold_config
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.tax_rate_schedule,
            control.tax_group,
            control.tax_group_component,
            control.tax_resolution_rule,
            control.wht_threshold_config
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.accounting_profile_policy,
    control.accounting_profile_event,
    control.accounting_profile_entry,
    control.accounting_profile_assignment,
    control.posting_role_account_assignment,
    control.cross_book_posting_policy,
    control.cross_book_account_assignment
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.trg_guard_accounting_policy_row(),
    control.trg_validate_accounting_profile_policy(),
    control.trg_guard_accounting_profile_event(),
    control.trg_guard_accounting_profile_entry(),
    control.trg_validate_accounting_profile_assignment(),
    control.trg_validate_posting_role_account_assignment(),
    control.trg_validate_cross_book_posting_policy(),
    control.trg_guard_cross_book_account_assignment(),
    control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
    control.resolve_posting_role_account(uuid, uuid, text, date)
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.accounting_profile_policy,
            control.accounting_profile_event,
            control.accounting_profile_entry,
            control.accounting_profile_assignment,
            control.posting_role_account_assignment,
            control.cross_book_posting_policy,
            control.cross_book_account_assignment
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
            control.resolve_posting_role_account(uuid, uuid, text, date)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.accounting_profile_policy,
            control.accounting_profile_event,
            control.accounting_profile_entry,
            control.accounting_profile_assignment,
            control.posting_role_account_assignment,
            control.cross_book_posting_policy,
            control.cross_book_account_assignment
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
            control.resolve_posting_role_account(uuid, uuid, text, date)
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.fiscal_calendar_config,
    control.fiscal_calendar_period_rule,
    control.company_fiscal_calendar_assignment
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.fiscal_calendar_year_start(uuid, uuid, integer),
    control.preview_fiscal_calendar(uuid, uuid, integer),
    control.resolve_company_fiscal_calendar(uuid, uuid, integer),
    control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
    master.resolve_fiscal_period(uuid, uuid, date, boolean)
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.fiscal_calendar_config,
            control.fiscal_calendar_period_rule,
            control.company_fiscal_calendar_assignment
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            control.fiscal_calendar_year_start(uuid, uuid, integer),
            control.preview_fiscal_calendar(uuid, uuid, integer),
            control.resolve_company_fiscal_calendar(uuid, uuid, integer),
            control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
            master.resolve_fiscal_period(uuid, uuid, date, boolean)
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.fiscal_calendar_config,
            control.fiscal_calendar_period_rule,
            control.company_fiscal_calendar_assignment
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            control.fiscal_calendar_year_start(uuid, uuid, integer),
            control.preview_fiscal_calendar(uuid, uuid, integer),
            control.resolve_company_fiscal_calendar(uuid, uuid, integer),
            control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
            master.resolve_fiscal_period(uuid, uuid, date, boolean)
        TO athyperadmin;
    END IF;
END;
$$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON control.mesh_business_partner_account_link,control.mesh_bank_account_disclosure_inbox,control.mesh_bank_account_projection TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_jobs_service') THEN GRANT USAGE ON SCHEMA control TO athyper_jobs_service; GRANT SELECT ON control.mesh_business_partner_account_link TO athyper_jobs_service; GRANT SELECT,INSERT ON control.mesh_bank_account_disclosure_inbox TO athyper_jobs_service; GRANT SELECT,INSERT,UPDATE ON control.mesh_bank_account_projection TO athyper_jobs_service; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON control.mesh_business_partner_account_link,control.mesh_bank_account_disclosure_inbox,control.mesh_bank_account_projection TO athyperadmin; END IF; END $$;
REVOKE ALL ON control.customer_credit_review,control.customer_lifecycle_event,control.business_partner_decision_scope FROM PUBLIC;
REVOKE ALL ON control.current_customer_account_designation,control.current_customer_credit_limit FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON control.business_partner_decision_scope,control.customer_credit_review TO athyperapp; GRANT SELECT ON control.customer_lifecycle_event TO athyperapp; GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,bigint,text,date,text,jsonb,text,uuid) TO athyperapp; GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN REVOKE ALL ON control.business_partner_decision_scope,control.customer_credit_review FROM athyperadmin; GRANT SELECT ON control.business_partner_decision_scope,control.customer_credit_review TO athyperadmin; REVOKE ALL ON control.customer_lifecycle_event FROM athyperadmin; GRANT SELECT ON control.customer_lifecycle_event TO athyperadmin; GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(uuid,uuid,uuid,uuid,uuid,text,bigint,text,date,text,jsonb,text,uuid) TO athyperadmin; GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperadmin; END IF; END $$;
REVOKE ALL ON FUNCTION control.command_create_business_partner_decision(uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION control.command_create_business_partner_decision(uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid) TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION control.command_create_business_partner_decision(uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid) TO athyperadmin; END IF;
END $$;
REVOKE ALL ON control.external_workforce_rate_card, control.external_workforce_rate FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   GRANT SELECT,INSERT,UPDATE ON control.external_workforce_rate_card, control.external_workforce_rate TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
   GRANT ALL PRIVILEGES ON control.external_workforce_rate_card, control.external_workforce_rate TO athyperadmin;
 END IF;
END $$;

-- S5 Business Partner mutation authority: runtime roles create requests and invoke
-- commands, but cannot directly write lifecycle/decision or evidence columns.
REVOKE ALL ON control.business_partner_mutation_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION control.trg_guard_business_partner_mutation_evidence_payload() FROM PUBLIC;
REVOKE ALL ON FUNCTION
    control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),
    control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),
    control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid),
    control.trg_reject_business_partner_mutation_evidence_change(),
    control.trg_enforce_business_partner_mutation_authority(),
    control.trg_record_customer_lifecycle_mutation()
FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        REVOKE ALL ON FUNCTION
            control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),
            control.trg_reject_business_partner_mutation_evidence_change(),
            control.trg_guard_business_partner_mutation_evidence_payload(),
            control.trg_enforce_business_partner_mutation_authority(),
            control.trg_record_customer_lifecycle_mutation()
        FROM athyperapp;
        REVOKE INSERT,UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,
            control.customer_account_designation,control.customer_credit_review FROM athyperapp;
        GRANT SELECT ON control.business_partner_qualification,control.supplier_preference_designation,
            control.customer_account_designation,control.customer_credit_review TO athyperapp;
        GRANT SELECT ON control.business_partner_mutation_evidence TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),
            control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid)
        TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        REVOKE ALL ON FUNCTION
            control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),
            control.trg_reject_business_partner_mutation_evidence_change(),
            control.trg_guard_business_partner_mutation_evidence_payload(),
            control.trg_enforce_business_partner_mutation_authority(),
            control.trg_record_customer_lifecycle_mutation()
        FROM athyperadmin;
        REVOKE ALL ON control.business_partner_mutation_evidence FROM athyperadmin;
        REVOKE INSERT,UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,
            control.customer_account_designation,control.customer_credit_review FROM athyperadmin;
        GRANT SELECT ON control.business_partner_qualification,control.supplier_preference_designation,
            control.customer_account_designation,control.customer_credit_review TO athyperadmin;
        GRANT SELECT ON control.business_partner_mutation_evidence TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),
            control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid)
        TO athyperadmin;
    END IF;
END;
$$;

GRANT SELECT ON control.supplier_communication_policy TO athyperapp,athyperadmin;
