-- ============================================================================
-- control/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_aap_updated_at BEFORE UPDATE ON control.ai_action_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_act_updated_at BEFORE UPDATE ON control.ai_confidence_threshold FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_adb_updated_at BEFORE UPDATE ON control.ai_drift_baseline FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_acbp_book_code_validate BEFORE INSERT OR UPDATE OF book_code, company_code_id ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_book_code();

CREATE TRIGGER trg_acbp_class_consistency BEFORE INSERT OR UPDATE OF is_depreciable, asset_class_id ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_class_consistency();

CREATE TRIGGER trg_acbp_convention_lookup BEFORE INSERT OR UPDATE OF convention ON control.asset_class_book_policy FOR EACH ROW WHEN (new.convention IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_convention', 'convention');

CREATE TRIGGER trg_acbp_depr_method_lookup BEFORE INSERT OR UPDATE OF depreciation_method ON control.asset_class_book_policy FOR EACH ROW WHEN (new.depreciation_method IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_method', 'depreciation_method');

CREATE TRIGGER trg_acbp_posting_roles_validate BEFORE INSERT OR UPDATE ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_posting_roles();

CREATE TRIGGER trg_acbp_prorate_lookup BEFORE INSERT OR UPDATE OF prorate_basis ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_prorate_basis', 'prorate_basis');

CREATE TRIGGER trg_acbp_residual_mode_lookup BEFORE INSERT OR UPDATE OF residual_value_mode ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.residual_value_mode', 'residual_value_mode');

CREATE TRIGGER trg_acbp_start_rule_lookup BEFORE INSERT OR UPDATE OF depreciation_start_rule ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.depreciation_start_rule', 'depreciation_start_rule');

CREATE TRIGGER trg_acbp_status_changed BEFORE UPDATE ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_acbp_updated_at BEFORE UPDATE ON control.asset_class_book_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_acbpt_book_category_lookup BEFORE INSERT OR UPDATE OF book_category ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_category', 'book_category');

CREATE TRIGGER trg_acbpt_convention_lookup BEFORE INSERT OR UPDATE OF convention ON control.asset_class_book_policy_template FOR EACH ROW WHEN (new.convention IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_convention', 'convention');

CREATE TRIGGER trg_acbpt_depr_method_lookup BEFORE INSERT OR UPDATE OF depreciation_method ON control.asset_class_book_policy_template FOR EACH ROW WHEN (new.depreciation_method IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_method', 'depreciation_method');

CREATE TRIGGER trg_acbpt_posting_roles_validate BEFORE INSERT OR UPDATE ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_posting_roles();

CREATE TRIGGER trg_acbpt_prorate_lookup BEFORE INSERT OR UPDATE OF prorate_basis ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_prorate_basis', 'prorate_basis');

CREATE TRIGGER trg_acbpt_residual_mode_lookup BEFORE INSERT OR UPDATE OF residual_value_mode ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.residual_value_mode', 'residual_value_mode');

CREATE TRIGGER trg_acbpt_start_rule_lookup BEFORE INSERT OR UPDATE OF depreciation_start_rule ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.depreciation_start_rule', 'depreciation_start_rule');

CREATE TRIGGER trg_acbpt_status_changed BEFORE UPDATE ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_acbpt_updated_at BEFORE UPDATE ON control.asset_class_book_policy_template FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_auth_permission_publish_guard BEFORE INSERT OR UPDATE ON control.auth_permission FOR EACH ROW EXECUTE FUNCTION control.trg_authorization_v2_guard_permission();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.auth_permission FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "control"."auth_permission" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_auth_permission_scope_publish_guard BEFORE INSERT OR UPDATE ON control.auth_permission_scope_policy FOR EACH ROW EXECUTE FUNCTION control.trg_authorization_v2_guard_scope_policy();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.auth_permission_scope_policy FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "control"."auth_permission_scope_policy" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_bfr_acct_id_type_lookup BEFORE INSERT OR UPDATE OF account_id_type ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_id_type', 'account_id_type');

CREATE TRIGGER trg_bfr_bank_id_type_lookup BEFORE INSERT OR UPDATE OF bank_id_type ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_format_rule_bank_id_type', 'bank_id_type');

CREATE TRIGGER trg_bfr_direction_lookup BEFORE INSERT OR UPDATE OF direction ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_format_rule_direction', 'direction');

CREATE TRIGGER trg_bfr_payment_network_lookup BEFORE INSERT OR UPDATE OF payment_network ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_format_rule_payment_network', 'payment_network');

CREATE TRIGGER trg_bfr_status_changed BEFORE UPDATE ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bfr_updated_at BEFORE UPDATE ON control.bank_format_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bank_interface_nonsecret_config BEFORE INSERT OR UPDATE OF config ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION control.guard_bank_interface_nonsecret_config();

CREATE TRIGGER trg_bip_format_lookup BEFORE INSERT OR UPDATE OF file_format_code ON control.bank_interface_profile FOR EACH ROW WHEN (new.file_format_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_interface_file_format', 'file_format_code');

CREATE TRIGGER trg_bip_network_lookup BEFORE INSERT OR UPDATE OF payment_network ON control.bank_interface_profile FOR EACH ROW WHEN (new.payment_network IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_format_rule_payment_network', 'payment_network');

CREATE TRIGGER trg_bip_status_changed BEFORE UPDATE ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bip_type_lookup BEFORE INSERT OR UPDATE OF interface_type ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_interface_profile_type', 'interface_type');

CREATE TRIGGER trg_bip_updated_at BEFORE UPDATE ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_bank_interface AFTER INSERT OR DELETE OR UPDATE ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Bank interface changed');

CREATE TRIGGER trg_br_updated_at BEFORE UPDATE ON control.blueprint_registry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tba_updated_at BEFORE UPDATE ON control.blueprint_tenant_application FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bcc_updated_at BEFORE UPDATE ON control.budget_check_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccrr_status_changed BEFORE UPDATE OF status ON control.commodity_code_to_category_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ccrr_updated_at BEFORE UPDATE ON control.commodity_code_to_category_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cfca_status_changed BEFORE UPDATE ON control.company_fiscal_calendar_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_cfca_updated_at BEFORE UPDATE ON control.company_fiscal_calendar_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_calendar_assignment AFTER INSERT OR DELETE OR UPDATE ON control.company_fiscal_calendar_assignment FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Fiscal Calendar assignment changed');

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "control"."entity" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_entity_ensure_publish_state AFTER INSERT ON control.entity FOR EACH ROW EXECUTE FUNCTION control.trg_ensure_entity_publish_state();

CREATE TRIGGER trg_ear_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_code, entity_version_id, required_permission ON control.entity_action_rule FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_ect_immutable BEFORE DELETE OR UPDATE ON control.entity_contract_transition FOR EACH ROW EXECUTE FUNCTION control.trg_fn_contract_transition_immutable();

CREATE TRIGGER trg_ef_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_field FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_version_id();

CREATE TRIGGER trg_entity_field_flag_defaults BEFORE INSERT ON control.entity_field FOR EACH ROW EXECUTE FUNCTION control.trg_field_flag_defaults();

CREATE TRIGGER trg_efsurf_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_surface_id, entity_field_id ON control.entity_field_surface FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_eflow_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_version_id ON control.entity_flow FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_eflow_status_changed BEFORE UPDATE OF status ON control.entity_flow FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_eflow_updated_at BEFORE UPDATE ON control.entity_flow FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_eff_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, flow_step_id, entity_field_id ON control.entity_flow_field FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_eff_updated_at BEFORE UPDATE ON control.entity_flow_field FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_flow_field_one_writer AFTER INSERT OR UPDATE OF mode, entity_field_id, flow_step_id, tenant_id ON control.entity_flow_field FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_one_writer();

CREATE TRIGGER trg_flow_field_validate_perm BEFORE INSERT OR UPDATE OF override_permission ON control.entity_flow_field FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_validate_perm();

CREATE TRIGGER trg_flow_field_validate_section BEFORE INSERT OR UPDATE OF section_key ON control.entity_flow_field FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_validate_section();

CREATE TRIGGER trg_efsec_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, flow_step_id ON control.entity_flow_section FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_efsec_updated_at BEFORE UPDATE ON control.entity_flow_section FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_flow_section_validate_entity_code BEFORE INSERT OR UPDATE OF section_type, entity_code, tenant_id ON control.entity_flow_section FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_section_validate_entity_code();

CREATE TRIGGER trg_efs_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, flow_id ON control.entity_flow_step FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_efs_updated_at BEFORE UPDATE ON control.entity_flow_step FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_el_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id ON control.entity_lifecycle FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_el_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_lifecycle FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_name();

CREATE TRIGGER trg_el_validate_entity_binding BEFORE INSERT OR UPDATE OF entity_name ON control.entity_lifecycle FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

CREATE TRIGGER trg_elsm_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id, lifecycle_state_id ON control.entity_lifecycle_state_mask FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_elsm_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_lifecycle_state_mask FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_name();

CREATE TRIGGER trg_encfg_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id ON control.entity_numbering_config FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_encfg_status_changed BEFORE UPDATE ON control.entity_numbering_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_encfg_updated_at BEFORE UPDATE ON control.entity_numbering_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_operation FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "control"."entity_operation" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_entity_operation_v2_publish_guard BEFORE INSERT OR UPDATE ON control.entity_operation FOR EACH ROW EXECUTE FUNCTION control.trg_authorization_v2_guard_entity_operation();

CREATE TRIGGER trg_eo_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id ON control.entity_operation FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_eo_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_operation FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_name();

CREATE TRIGGER trg_eo_validate_entity_binding BEFORE INSERT OR UPDATE OF entity_name ON control.entity_operation FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

CREATE TRIGGER trg_ep_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id ON control.entity_policy FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_ep_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_policy FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_id();

CREATE TRIGGER trg_eps_m3_ready_guard BEFORE INSERT OR UPDATE ON control.entity_publish_state FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_ready_publish_state();

CREATE TRIGGER trg_eps_validate_version_pointers BEFORE INSERT OR UPDATE OF tenant_id, published_version_id, current_draft_version_id ON control.entity_publish_state FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_publish_state();

CREATE TRIGGER trg_er_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_version_id, source_field, fk_field, target_entity, target_entity_code ON control.entity_relation FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_er_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_relation FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_version_id();

CREATE TRIGGER trg_er_validate_target_entity BEFORE INSERT OR UPDATE OF target_entity ON control.entity_relation FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_target_entity();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_scope_binding FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "control"."entity_scope_binding" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_entity_scope_binding_publish_guard BEFORE INSERT OR UPDATE ON control.entity_scope_binding FOR EACH ROW EXECUTE FUNCTION control.trg_authorization_v2_guard_scope_binding();

CREATE TRIGGER trg_es_contract_scope BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id ON control.entity_surface FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.entity_version FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('global');

ALTER TABLE "control"."entity_version" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_ev_block_mutation BEFORE DELETE OR UPDATE ON control.entity_version FOR EACH ROW EXECUTE FUNCTION control.fn_block_effective_version_mutation();

CREATE TRIGGER trg_ev_bump_latest_version_no AFTER INSERT ON control.entity_version FOR EACH ROW EXECUTE FUNCTION control.trg_ev_bump_latest_version_no();

CREATE TRIGGER trg_ev_contract_guard BEFORE INSERT OR UPDATE ON control.entity_version FOR EACH ROW EXECUTE FUNCTION control.trg_fn_entity_version_contract_guard();

CREATE TRIGGER trg_ev_maintain_publish_state AFTER INSERT OR UPDATE OF status, version_no ON control.entity_version FOR EACH ROW EXECUTE FUNCTION control.trg_fn_maintain_entity_publish_state();

CREATE TRIGGER trg_fsp_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.field_security_policy FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_id();

CREATE TRIGGER trg_fcc_status_changed BEFORE UPDATE ON control.fiscal_calendar_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fcc_updated_at BEFORE UPDATE ON control.fiscal_calendar_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_calendar AFTER UPDATE OF calendar_type, version_no, fiscal_year_label_rule, year_start_rule, anchor_month, anchor_day, week_start_day, periods_per_year, leap_week_rule, effective_from, effective_to, status ON control.fiscal_calendar_config FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('calendar', 'Fiscal Calendar definition changed');

CREATE TRIGGER trg_fcpr_status_changed BEFORE UPDATE ON control.fiscal_calendar_period_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fcpr_updated_at BEFORE UPDATE ON control.fiscal_calendar_period_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_calendar_rule AFTER INSERT OR DELETE OR UPDATE ON control.fiscal_calendar_period_rule FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('calendar_rule', 'Fiscal Calendar period rule changed');

CREATE TRIGGER trg_fbb_updated_at BEFORE UPDATE ON control.forecast_budget_bridge FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON control.formula_expression FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON control.formula_expression FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON control.formula_expression_version FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_fx_policy AFTER INSERT OR DELETE OR UPDATE ON control.fx_policy FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional', 'FX policy changed');

CREATE TRIGGER trg_fx_policy_immutable BEFORE DELETE OR UPDATE ON control.fx_policy FOR EACH ROW EXECUTE FUNCTION control.guard_fx_policy_immutable();

CREATE TRIGGER trg_fx_policy_scope BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, ledger_book_id, status ON control.fx_policy FOR EACH ROW EXECUTE FUNCTION control.guard_fx_policy_scope();

CREATE TRIGGER trg_har_execdesc_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.hook_action_registry FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_all_execution_descriptors();

CREATE TRIGGER trg_lifecycle_execdesc_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.lifecycle FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_all_execution_descriptors();

CREATE TRIGGER trg_lifecycle_state_execdesc_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.lifecycle_state FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_all_execution_descriptors();

CREATE TRIGGER trg_lookup_domain_status_changed BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_lookup_domain_updated_at BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_lookup_value_extensibility BEFORE INSERT OR UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_extensibility();

CREATE TRIGGER trg_lookup_value_status_changed BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_lookup_value_updated_at BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mfa_config_contact_link_guard BEFORE INSERT OR UPDATE OF contact_link_id, method_type, principal_id, tenant_id ON control.mfa_config FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mfa_contact_link();

CREATE TRIGGER trg_mfa_config_method_type_lookup BEFORE INSERT OR UPDATE OF method_type ON control.mfa_config FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.mfa_method_type', 'method_type');

CREATE TRIGGER trg_mfa_config_updated_at BEFORE UPDATE ON control.mfa_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_orr_updated_at BEFORE UPDATE ON control.outbox_routing_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ov_invalidate AFTER INSERT OR DELETE OR UPDATE ON control."overlay" FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_overlay_row();

CREATE TRIGGER trg_oc_invalidate AFTER INSERT OR DELETE OR UPDATE ON control.overlay_change FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_overlay_id();

CREATE TRIGGER trg_fin_ready_payment_policy AFTER INSERT OR DELETE OR UPDATE ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company payment policy changed');

CREATE TRIGGER trg_pmcp_direction_lookup BEFORE INSERT OR UPDATE OF direction ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_method_direction', 'direction');

CREATE TRIGGER trg_pmcp_status_changed BEFORE UPDATE ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pmcp_updated_at BEFORE UPDATE ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pmcp_validate_bank_link BEFORE INSERT OR UPDATE OF bank_account_link_id, company_code_id ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION control.trg_pmcp_validate_bank_link_company();

CREATE TRIGGER trg_fin_ready_interface_binding AFTER INSERT OR DELETE OR UPDATE ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional', 'Payment interface binding changed');

CREATE TRIGGER trg_pmib_conflict BEFORE INSERT OR UPDATE OF tenant_id, payment_method_id, company_code_id, bank_account_link_id, currency_code, direction, counterparty_country_code, payment_network, priority, effective_from, effective_until, status ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION control.guard_payment_interface_binding_conflict();

CREATE TRIGGER trg_pmib_direction_lookup BEFORE INSERT OR UPDATE OF direction ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_method_direction', 'direction');

CREATE TRIGGER trg_pmib_house_bank BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, bank_account_link_id ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION control.guard_payment_interface_house_bank();

CREATE TRIGGER trg_pmib_network_lookup BEFORE INSERT OR UPDATE OF payment_network ON control.payment_method_interface_binding FOR EACH ROW WHEN (new.payment_network IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bank_format_rule_payment_network', 'payment_network');

CREATE TRIGGER trg_pmib_status_changed BEFORE UPDATE ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pmib_updated_at BEFORE UPDATE ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_settlement_rule AFTER INSERT OR DELETE OR UPDATE ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Settlement accounting rule changed');

CREATE TRIGGER trg_psr_bank_fee_role_lookup BEFORE INSERT OR UPDATE OF bank_fee_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.bank_fee_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'bank_fee_posting_role_code');

CREATE TRIGGER trg_psr_chargeback_role_lookup BEFORE INSERT OR UPDATE OF chargeback_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.chargeback_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'chargeback_posting_role_code');

CREATE TRIGGER trg_psr_clearing_role_lookup BEFORE INSERT OR UPDATE OF clearing_posting_role_code ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'clearing_posting_role_code');

CREATE TRIGGER trg_psr_company_book BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, book_code, effective_from, status ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION control.guard_payment_settlement_book();

CREATE TRIGGER trg_psr_direction_lookup BEFORE INSERT OR UPDATE OF direction ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_method_direction', 'direction');

CREATE TRIGGER trg_psr_discount_role_lookup BEFORE INSERT OR UPDATE OF discount_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.discount_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'discount_posting_role_code');

CREATE TRIGGER trg_psr_fx_gain_role_lookup BEFORE INSERT OR UPDATE OF fx_gain_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.fx_gain_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'fx_gain_posting_role_code');

CREATE TRIGGER trg_psr_fx_loss_role_lookup BEFORE INSERT OR UPDATE OF fx_loss_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.fx_loss_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'fx_loss_posting_role_code');

CREATE TRIGGER trg_psr_settlement_role_lookup BEFORE INSERT OR UPDATE OF settlement_posting_role_code ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'settlement_posting_role_code');

CREATE TRIGGER trg_psr_status_changed BEFORE UPDATE ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_psr_suspense_role_lookup BEFORE INSERT OR UPDATE OF suspense_posting_role_code ON control.payment_settlement_rule FOR EACH ROW WHEN (new.suspense_posting_role_code IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('control.payment_settlement_posting_role', 'suspense_posting_role_code');

CREATE TRIGGER trg_psr_updated_at BEFORE UPDATE ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_version_policy_rule BEFORE UPDATE ON control.policy_rule FOR EACH ROW EXECUTE FUNCTION control.trg_fn_version_policy_rule();

CREATE TRIGGER trg_pram_status_changed BEFORE UPDATE ON control.posting_role_account_map FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pram_updated_at BEFORE UPDATE ON control.posting_role_account_map FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pram_validate BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, ledger_book_id, posting_role_code, gl_account_id, effective_from, effective_to, priority, status ON control.posting_role_account_map FOR EACH ROW EXECUTE FUNCTION control.trg_validate_posting_role_account_map();

CREATE TRIGGER trg_posting_role_alias_status_changed BEFORE UPDATE ON control.posting_role_alias FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_posting_role_alias_updated_at BEFORE UPDATE ON control.posting_role_alias FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON control.rate_table FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON control.rate_table FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON control.rate_table_row FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_tax_group AFTER INSERT OR DELETE OR UPDATE ON control.tax_group FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Tax Group changed');

CREATE TRIGGER trg_fin_ready_tax_group_component AFTER INSERT OR DELETE OR UPDATE ON control.tax_group_component FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Tax Group component changed');

CREATE TRIGGER trg_tgc_version_scope BEFORE INSERT OR UPDATE OF tenant_id, tax_group_id, tax_group_version_id ON control.tax_group_component FOR EACH ROW EXECUTE FUNCTION control.guard_tax_group_component_version();

CREATE TRIGGER trg_fin_ready_tax_group_version AFTER INSERT OR DELETE OR UPDATE ON control.tax_group_version FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Tax Group version changed');

CREATE TRIGGER trg_tgv_activation BEFORE INSERT OR UPDATE OF status ON control.tax_group_version FOR EACH ROW EXECUTE FUNCTION control.guard_tax_group_version_activation();

CREATE TRIGGER trg_tgv_updated_at BEFORE UPDATE ON control.tax_group_version FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_tax_resolution_rule AFTER INSERT OR DELETE OR UPDATE ON control.tax_resolution_rule FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Tax Resolution rule changed');

CREATE TRIGGER trg_trr_ambiguity BEFORE INSERT OR UPDATE OF tenant_id, priority, effective_from, effective_to, status, scope_billto_jurisdiction_id, scope_shipto_jurisdiction_id, scope_billfrom_jurisdiction_id, scope_shipfrom_jurisdiction_id, scope_counterparty_tax_status, scope_commodity_category_id, scope_supplier_industry_code, scope_doc_entity_codes, requires_shipto_shipfrom_match, requires_shipto_shipfrom_mismatch ON control.tax_resolution_rule FOR EACH ROW EXECUTE FUNCTION control.guard_tax_resolution_rule_ambiguity();

CREATE TRIGGER trg_tec_updated_at BEFORE UPDATE ON control.transaction_event_catalog FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_wht_threshold AFTER INSERT OR DELETE OR UPDATE ON control.wht_threshold_config FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'WHT threshold changed');

CREATE TRIGGER trg_wtc_updated_at BEFORE UPDATE ON control.wht_threshold_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
