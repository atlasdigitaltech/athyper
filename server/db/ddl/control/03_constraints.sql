-- ============================================================================
-- control/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_policy_pkey" PRIMARY KEY (tenant_id);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_pkey" PRIMARY KEY (tenant_id, provider_id);

ALTER TABLE ONLY "control"."auth_entitlement_target_policy"
  ADD CONSTRAINT "auth_entitlement_target_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bank_format_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "book_posting_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_pkey" PRIMARY KEY (tenant_id);

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "company_fiscal_calendar_assignment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."dimension_policy_allowed_value"
  ADD CONSTRAINT "dpav_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."document_lookup"
  ADD CONSTRAINT "dl_pkey" PRIMARY KEY (lookup_code);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_pkey" PRIMARY KEY (class_key);

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_pkey" PRIMARY KEY (entity_id);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_pkey" PRIMARY KEY (group_key);

ALTER TABLE ONLY "control"."field_group_member"
  ADD CONSTRAINT "fgm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."intake_idempotency"
  ADD CONSTRAINT "iidem_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lookup_domain"
  ADD CONSTRAINT "lookup_domain_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."planning_driver_version"
  ADD CONSTRAINT "pdv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."policy_rule_version"
  ADD CONSTRAINT "prv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."policy_test_case"
  ADD CONSTRAINT "ptc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."polymorphic_child_binding"
  ADD CONSTRAINT "pcb_pkey" PRIMARY KEY (binding_code);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."record_edit_lock"
  ADD CONSTRAINT "rel_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_config_book_uq" UNIQUE (profile_config_id, book_code);

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_config_uq" UNIQUE (profile_config_id);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_profile_version_uq" UNIQUE (accounting_profile_id, version);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_event_seq_uq" UNIQUE (profile_event_id, line_seq);

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_config_event_uq" UNIQUE (profile_config_id, event_code);

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_config_uq" UNIQUE (profile_config_id);

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_config_uq" UNIQUE (profile_config_id);

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, action_code, doc_class);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, action_code, doc_class, model_id);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_class_book_eff_uq" UNIQUE (tenant_id, company_code_id, asset_class_id, book_code, effective_from);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_scope_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, template_code, asset_class_code, book_category, effective_from);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_scope_uq" UNIQUE (tenant_id, provider_id, rotation_epoch);

ALTER TABLE ONLY "control"."auth_entitlement_target_policy"
  ADD CONSTRAINT "auth_entitlement_target_policy_target_uq" UNIQUE NULLS NOT DISTINCT (plane_code, target_kind, module_id, feature_id, policy_version);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_exact_operation_uq" UNIQUE NULLS NOT DISTINCT (entity_id, operation_code, id);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_id_delegable_uq" UNIQUE (id, is_delegable);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_id_shareable_uq" UNIQUE (id, is_shareable);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_exact_uq" UNIQUE (id, permission_id, scope_kind);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_uq" UNIQUE (permission_id, scope_kind);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_tenant_bp_uq" UNIQUE (tenant_id, blueprint_code);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "book_posting_rule_company_code_uq" UNIQUE (tenant_id, company_code_id, rule_code);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "book_posting_rule_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "company_fiscal_calendar_assignment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_tenant_kind_uq" UNIQUE (tenant_id, kind);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_tenant_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_code_ver_uq" UNIQUE (tenant_id, policy_code, policy_version);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."dimension_policy_allowed_value"
  ADD CONSTRAINT "dpav_policy_value_uq" UNIQUE (policy_id, dimension_value_id);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_code);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_physical_uq" UNIQUE (table_schema, table_name);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_id_uq" UNIQUE (id);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_binding_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_field_id);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_version_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_version_id, flow_code, version_no);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_step_field_uq" UNIQUE (flow_step_id, entity_field_id);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_step_key_uq" UNIQUE (flow_step_id, section_key);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_step_order_uq" UNIQUE (flow_step_id, sort_order) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_flow_order_uq" UNIQUE (flow_id, sort_order) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_flow_step_uq" UNIQUE (flow_id, step_key);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_binding_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, entity_version_id, lifecycle_id);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, company_code_id, entity_id, entity_version_id, number_field);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_bucket_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, config_id, scope_key, fiscal_year, period_number, quarter_number);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_binding_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, entity_version_id, permission_code);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_id_permission_v2_uq" UNIQUE (id, permission_id_v2);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_tenant_entity_version_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, entity_version_id);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_name_uq" UNIQUE (entity_version_id, name);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_uq" UNIQUE (entity_operation_id, plane_code, scope_kind, binding_kind);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_version_no_uq" UNIQUE (entity_id, version_no);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_version_uq" UNIQUE (entity_version_id);

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."field_group_member"
  ADD CONSTRAINT "fgm_group_field_uq" UNIQUE (group_key, entity_field_id);

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_scope_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, company_code_id);

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_code_version_uq" UNIQUE (tenant_id, code, version_no);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_number_uq" UNIQUE (tenant_id, fiscal_calendar_config_id, period_number);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_sequence_uq" UNIQUE (tenant_id, fiscal_calendar_config_id, sequence_no);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_name_year_uq" UNIQUE (tenant_id, name, fiscal_year);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_scenario_line_uq" UNIQUE (tenant_id, scenario_id, line_no);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_no_uq" UNIQUE (tenant_id, formula_expression_id, version_no);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_key_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, action_key);

ALTER TABLE ONLY "control"."intake_idempotency"
  ADD CONSTRAINT "iidem_uq" UNIQUE (tenant_id, entity_code, idempotency_key);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_tenant_hook_uq" UNIQUE (tenant_id, target_hook_id);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_code_uq" UNIQUE (lifecycle_id, code);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_edge_uq" UNIQUE (lifecycle_id, from_state_id, to_state_id);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_token_action_uq" UNIQUE (execution_token, hook_action_key);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_transition_uq" UNIQUE (transition_id);

ALTER TABLE ONLY "control"."lookup_domain"
  ADD CONSTRAINT "lookup_domain_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_keycloak_credential_uq" UNIQUE NULLS NOT DISTINCT (keycloak_credential_id);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_principal_method_uq" UNIQUE (tenant_id, principal_id, method_type);

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_code_uq" UNIQUE (channel, code);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_tenant_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_version_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, template_key, channel, locale, version);

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_tenant_key_uq" UNIQUE (tenant_id, overlay_key);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_order_uq" UNIQUE (overlay_id, change_order);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_model_code_ver_uq" UNIQUE (tenant_id, planning_model_id, code, version);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_driver_ver_uq" UNIQUE (driver_id, version);

ALTER TABLE ONLY "control"."planning_driver_version"
  ADD CONSTRAINT "pdv_driver_version_uq" UNIQUE (driver_id, version_number);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_priority_uq" UNIQUE (policy_id, priority);

ALTER TABLE ONLY "control"."policy_rule_version"
  ADD CONSTRAINT "prv_natural_uq" UNIQUE (policy_rule_id, version_no);

ALTER TABLE ONLY "control"."policy_rule_version"
  ADD CONSTRAINT "prv_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."policy_test_case"
  ADD CONSTRAINT "ptc_name_uq" UNIQUE (tenant_id, policy_definition_id, test_name);

ALTER TABLE ONLY "control"."policy_test_case"
  ADD CONSTRAINT "ptc_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_key_uq" UNIQUE (tenant_id, rate_table_id, effective_from, sequence_no);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."record_edit_lock"
  ADD CONSTRAINT "rel_one_lock_per_doc" UNIQUE (tenant_id, aggregate_entity_name, aggregate_record_id);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_code_uq" UNIQUE (setup_workspace_id, code);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_route_uq" UNIQUE (setup_workspace_id, route_segment);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_workspace_uq" UNIQUE (workspace_id);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_group_version_uq" UNIQUE (tenant_id, tax_group_id, version_no);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_code_uq" UNIQUE (code);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_code_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, code);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_tenant_id_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, id);

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_priority_uq" UNIQUE NULLS NOT DISTINCT (workflow_template_id, stage_no, priority);

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_stage_no_uq" UNIQUE (workflow_template_id, stage_no);

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_book_nonempty" CHECK (btrim(book_code) <> ''::text);

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_method_chk" CHECK (posting_method = ANY (ARRAY['MIRROR'::text, 'EXCLUDE'::text, 'REMAP'::text]));

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_advance_pct_chk" CHECK (advance_pct IS NULL OR advance_pct >= 0::numeric AND advance_pct <= 100::numeric);

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_encumbrance_chk" CHECK (encumbrance_behavior = ANY (ARRAY['NONE'::text, 'STANDARD'::text, 'STATISTICAL_ONLY'::text]));

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_multiyear_chk" CHECK (multi_year_strategy = ANY (ARRAY['CURRENT_YEAR_ONLY'::text, 'HORIZON_SPREAD'::text, 'FULL_RESERVE'::text]));

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_retention_pct_chk" CHECK (retention_pct IS NULL OR retention_pct >= 0::numeric AND retention_pct <= 100::numeric);

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_type_chk" CHECK (commitment_type = ANY (ARRAY['ONE_TIME'::text, 'FIXED_RECURRING'::text, 'MILESTONE'::text, 'USAGE_BASED'::text, 'ESCALATING'::text, 'RETENTION_RELEASE'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_deferral_chk" CHECK (deferral_periods IS NULL OR deferral_periods > 0);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_direction_chk" CHECK (direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text, 'BILATERAL'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_matching_chk" CHECK (matching_type = ANY (ARRAY['NONE'::text, 'TWO_WAY'::text, 'THREE_WAY'::text, 'FOUR_WAY'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'superseded'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_subledger_chk" CHECK (subledger_type = ANY (ARRAY['AP'::text, 'AR'::text, 'ASSET'::text, 'INVENTORY'::text, 'WIP'::text, 'COMMISSION'::text, 'NONE'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_timing_chk" CHECK (recognition_timing = ANY (ARRAY['IMMEDIATE'::text, 'DEFERRED'::text, 'SCHEDULED'::text, 'EVENT_DRIVEN'::text]));

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_type_chk" CHECK (profile_type = ANY (ARRAY['STANDARD'::text, 'ACCRUAL'::text, 'PREPAYMENT'::text, 'CAPITALIZATION'::text, 'RECLASS'::text, 'INTERCOMPANY'::text, 'FX_REVALUATION'::text, 'REVERSAL'::text, 'STATISTICAL'::text, 'COMMITMENT'::text, 'ENCUMBRANCE'::text, 'MILESTONE'::text, 'LEASE'::text, 'REVENUE_POINT'::text, 'REVENUE_OVER_TIME'::text, 'DEFERRED_REVENUE'::text, 'COGS'::text]));

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_behavior_chk" CHECK (behavior = ANY (ARRAY['REQUIRED'::text, 'OPTIONAL'::text, 'DERIVE_IF_MISSING'::text, 'FIXED_VALUE'::text, 'FORBIDDEN'::text]));

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_source_chk" CHECK (derive_source = ANY (ARRAY['FROM_DOCUMENT'::text, 'FROM_LINE'::text, 'FROM_OU'::text, 'FROM_INTENT'::text, 'FROM_COMMITMENT'::text, 'FROM_CONTRACT'::text, 'FROM_CUSTOMER'::text, 'FROM_PRODUCT'::text, 'FIXED'::text, 'INHERIT'::text]));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_amount_chk" CHECK (amount_source = ANY (ARRAY['DOCUMENT_TOTAL'::text, 'LINE_AMOUNT'::text, 'TAX_AMOUNT'::text, 'CALCULATED'::text, 'REMAINDER'::text, 'COMMITMENT_AMOUNT'::text, 'MILESTONE_AMOUNT'::text, 'FULFILLED_AMOUNT'::text, 'REVENUE_AMOUNT'::text, 'COGS_AMOUNT'::text, 'DISCOUNT_AMOUNT'::text, 'ADVANCE_AMOUNT'::text, 'ADVANCE_RECOVERY'::text, 'RETENTION_AMOUNT'::text, 'RETENTION_BALANCE'::text, 'PENALTY_AMOUNT'::text, 'REBATE_AMOUNT'::text, 'NET_PAYABLE'::text, 'DISCOUNT_EARNED'::text, 'NET_AFTER_DISCOUNT'::text, 'SCF_FINANCIER_AMOUNT'::text, 'COMPONENT_BUCKET'::text]));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_capitalization_behavior_chk" CHECK (capitalization_behavior IS NULL OR (capitalization_behavior = ANY (ARRAY['FOLLOW_LINE'::text, 'ALWAYS_CAPITALIZE'::text, 'NEVER_CAPITALIZE'::text])));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_component_account_chk" CHECK (account_source <> 'FROM_COMPONENT_POLICY'::text OR amount_source = 'COMPONENT_BUCKET'::text);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_component_bucket_chk" CHECK (amount_source = 'COMPONENT_BUCKET'::text AND (component_bucket = ANY (ARRAY['DISTRIBUTABLE_COST'::text, 'BASE_COST'::text, 'COST_REDUCTION'::text, 'COST_ADDITION'::text, 'SEPARATE_DEBIT'::text, 'SEPARATE_CREDIT'::text, 'RECOVERABLE_TAX'::text, 'NONRECOVERABLE_TAX'::text, 'WHT_LIABILITY'::text, 'RETENTION_LIABILITY'::text, 'SELF_ASSESSED_INPUT'::text, 'SELF_ASSESSED_OUTPUT'::text, 'SETTLEMENT_DISCOUNT'::text, 'MEMO'::text])) OR amount_source <> 'COMPONENT_BUCKET'::text AND component_bucket IS NULL);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_desc_nonempty" CHECK (btrim(description) <> ''::text);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_distribution_behavior_chk" CHECK (distribution_behavior IS NULL OR (distribution_behavior = ANY (ARRAY['INHERIT_LINE'::text, 'APPORTION_TO_LINES'::text, 'NO_COST_DISTRIBUTION'::text])));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_pct_chk" CHECK (amount_percentage IS NULL OR amount_percentage >= 0::numeric AND amount_percentage <= 100::numeric);

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_side_chk" CHECK (posting_side = ANY (ARRAY['DEBIT'::text, 'CREDIT'::text]));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_source_chk" CHECK (account_source = ANY (ARRAY['FIXED'::text, 'FROM_INTENT'::text, 'FROM_CATEGORY'::text, 'POSTING_ROLE'::text, 'FROM_COMPONENT_POLICY'::text]));

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_source_key_chk" CHECK (account_source <> 'POSTING_ROLE'::text OR account_lookup_key IS NOT NULL);

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_commitment_chk" CHECK (commitment_action = ANY (ARRAY['NONE'::text, 'CREATE'::text, 'INCREASE'::text, 'RELEASE_PARTIAL'::text, 'RELEASE_FULL'::text, 'CANCEL'::text]));

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_event_nonempty" CHECK (btrim(event_code) <> ''::text);

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_method_chk" CHECK (revenue_recognition_method = ANY (ARRAY['POINT_IN_TIME'::text, 'OVER_TIME'::text, 'PCT_COMPLETION'::text, 'INPUT_METHOD'::text, 'OUTPUT_METHOD'::text]));

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_apr_chk" CHECK (discount_apr IS NULL OR discount_apr >= 0::numeric);

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_discount_chk" CHECK (discount_model IS NULL OR (discount_model = ANY (ARRAY['BUYER_FUNDED'::text, 'SCF_SPLIT'::text, 'SUPPLIER_INITIATED'::text])));

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_min_amt_chk" CHECK (discount_min_amount IS NULL OR discount_min_amount >= 0::numeric);

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_scf_pct_chk" CHECK (scf_split_pct IS NULL OR scf_split_pct >= 0::numeric AND scf_split_pct <= 100::numeric);

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_settle_chk" CHECK (settlement_method = ANY (ARRAY['PAYMENT'::text, 'COLLECTION'::text, 'NETTING'::text, 'OFFSET'::text, 'WRITE_OFF'::text, 'PREPAID'::text, 'SCF_FINANCED'::text, 'NONE'::text]));

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_tolerance_chk" CHECK (settlement_tolerance >= 0::numeric AND settlement_tolerance <= 100::numeric);

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_autonomy_chk" CHECK (autonomy_level = ANY (ARRAY['disabled'::text, 'suggest'::text, 'assist'::text, 'auto'::text]));

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_confidence_chk" CHECK (min_confidence_for_auto IS NULL OR min_confidence_for_auto >= 0::numeric AND min_confidence_for_auto <= 1::numeric);

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_effective_order" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_assist_chk" CHECK (min_for_assist >= 0::numeric AND min_for_assist <= 1::numeric);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_auto_chk" CHECK (min_for_auto >= 0::numeric AND min_for_auto <= 1::numeric);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_drift_chk" CHECK (drift_alert_below IS NULL OR drift_alert_below >= 0::numeric AND drift_alert_below <= 1::numeric);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_suggest_chk" CHECK (min_for_suggest >= 0::numeric AND min_for_suggest <= 1::numeric);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_threshold_order" CHECK (min_for_suggest <= min_for_assist AND min_for_assist <= min_for_auto);

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_window_pos" CHECK (drift_window_hours > 0);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_feature_chk" CHECK (feature_stats IS NULL OR jsonb_typeof(feature_stats) = 'object'::text);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_mean_range_chk" CHECK (mean_confidence >= 0::numeric AND mean_confidence <= 1::numeric);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_model_nonempty" CHECK (btrim(model_id) <> ''::text);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_p5_range_chk" CHECK (p5_confidence IS NULL OR p5_confidence >= 0::numeric AND p5_confidence <= 1::numeric);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_p95_range_chk" CHECK (p95_confidence IS NULL OR p95_confidence >= 0::numeric AND p95_confidence <= 1::numeric);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_percentile_order" CHECK (p5_confidence IS NULL OR p95_confidence IS NULL OR p5_confidence <= p95_confidence);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_sample_pos" CHECK (sample_size > 0);

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_std_nonneg_chk" CHECK (std_dev_confidence >= 0::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_acq_role_chk" CHECK (acquisition_posting_role_code IS NOT NULL OR cwip_posting_role_code IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_book_nonempty" CHECK (btrim(book_code) <> ''::text);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_cap_currency_chk" CHECK (capitalization_threshold = 0::numeric OR capitalization_currency IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_depr_life_chk" CHECK (NOT is_depreciable OR depreciation_method = 'no_depreciation'::text OR useful_life_months IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_depr_method_chk" CHECK (NOT is_depreciable OR depreciation_method IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_depr_roles_chk" CHECK (NOT is_depreciable OR depreciation_method IS NULL OR depreciation_method = 'no_depreciation'::text OR acquisition_posting_role_code IS NOT NULL AND accum_depr_posting_role_code IS NOT NULL AND depr_expense_posting_role_code IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_nodepr_life_chk" CHECK (depreciation_method IS NULL OR depreciation_method <> 'no_depreciation'::text OR useful_life_months IS NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_residual_amount_chk" CHECK (residual_value_mode <> 'amount'::text OR residual_value_amount IS NOT NULL AND residual_value_amount >= 0::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_residual_mode_chk" CHECK (residual_value_mode = ANY (ARRAY['amount'::text, 'percent'::text, 'zero'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_residual_pct_chk" CHECK (residual_value_mode <> 'percent'::text OR residual_value_pct IS NOT NULL AND residual_value_pct >= 0::numeric AND residual_value_pct <= 100::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_residual_zero_chk" CHECK (residual_value_mode <> 'zero'::text OR residual_value_amount IS NULL AND residual_value_pct IS NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_start_rule_chk" CHECK (depreciation_start_rule = ANY (ARRAY['in_service_date'::text, 'capitalization_date'::text, 'next_period'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_threshold_pos" CHECK (capitalization_threshold >= 0::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_useful_life_pos" CHECK (useful_life_months IS NULL OR useful_life_months > 0);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_acq_role_chk" CHECK (acquisition_posting_role_code IS NOT NULL OR cwip_posting_role_code IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_book_category_chk" CHECK (btrim(book_category) <> ''::text);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_class_code_chk" CHECK (btrim(asset_class_code) <> ''::text);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_depr_life_chk" CHECK (NOT is_depreciable OR depreciation_method = 'no_depreciation'::text OR useful_life_months IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_depr_method_chk" CHECK (NOT is_depreciable OR depreciation_method IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_depr_roles_chk" CHECK (NOT is_depreciable OR depreciation_method IS NULL OR depreciation_method = 'no_depreciation'::text OR acquisition_posting_role_code IS NOT NULL AND accum_depr_posting_role_code IS NOT NULL AND depr_expense_posting_role_code IS NOT NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_framework_chk" CHECK (btrim(framework) <> ''::text);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_life_range_chk" CHECK (useful_life_min_months IS NULL AND useful_life_max_months IS NULL OR useful_life_min_months IS NOT NULL AND useful_life_max_months IS NOT NULL AND useful_life_min_months > 0 AND useful_life_max_months >= useful_life_min_months AND (useful_life_months IS NULL OR useful_life_months >= useful_life_min_months AND useful_life_months <= useful_life_max_months));

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_nodepr_life_chk" CHECK (depreciation_method IS NULL OR depreciation_method <> 'no_depreciation'::text OR useful_life_months IS NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_residual_amount_chk" CHECK (residual_value_mode <> 'amount'::text OR residual_value_amount IS NOT NULL AND residual_value_amount >= 0::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_residual_mode_chk" CHECK (residual_value_mode = ANY (ARRAY['amount'::text, 'percent'::text, 'zero'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_residual_pct_chk" CHECK (residual_value_mode <> 'percent'::text OR residual_value_pct IS NOT NULL AND residual_value_pct >= 0::numeric AND residual_value_pct <= 100::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_residual_zero_chk" CHECK (residual_value_mode <> 'zero'::text OR residual_value_amount IS NULL AND residual_value_pct IS NULL);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_start_rule_chk" CHECK (depreciation_start_rule = ANY (ARRAY['in_service_date'::text, 'capitalization_date'::text, 'next_period'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_template_code_chk" CHECK (btrim(template_code) <> ''::text);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_threshold_mult_chk" CHECK (capitalization_threshold_multiplier >= 0::numeric);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_useful_life_pos" CHECK (useful_life_months IS NULL OR useful_life_months > 0);

ALTER TABLE ONLY "control"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_days_chk" CHECK (retention_days >= 1 AND retention_days <= 3650);

ALTER TABLE ONLY "control"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_effective_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_revision_chk" CHECK (revision >= 1);

ALTER TABLE ONLY "control"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]));

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_chk" CHECK (rotation_epoch >= 1 AND key_version >= 1);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_provider_chk" CHECK (provider_id = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text]));

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_revoke_chk" CHECK (status = 'revoked'::text AND revoked_at IS NOT NULL OR status <> 'revoked'::text);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'revoked'::text]));

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_rotation_epoch_check" CHECK (rotation_epoch >= 1);

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_epoch_provider_chk" CHECK (provider_id = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text]));

ALTER TABLE ONLY "control"."auth_entitlement_target_policy"
  ADD CONSTRAINT "auth_entitlement_target_policy_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."auth_entitlement_target_policy"
  ADD CONSTRAINT "auth_entitlement_target_policy_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."auth_entitlement_target_policy"
  ADD CONSTRAINT "auth_entitlement_target_policy_target_chk" CHECK (target_kind = 'module'::text AND module_id IS NOT NULL AND feature_id IS NULL OR target_kind = 'feature'::text AND feature_id IS NOT NULL AND module_id IS NULL);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_code_chk" CHECK (canonical_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'::text);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_entity_operation_chk" CHECK ((entity_id IS NULL) = (operation_code IS NULL));

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_operation_code_chk" CHECK (operation_code IS NULL OR operation_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_risk_chk" CHECK (risk_tier = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_kind_chk" CHECK (scope_kind = ANY (ARRAY['tenant'::text, 'company_code'::text, 'legal_entity'::text, 'operating_organization'::text]));

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_propagation_chk" CHECK (propagation_mode = ANY (ARRAY['none'::text, 'hierarchy'::text, 'member_companies'::text, 'resource_only'::text]));

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_provenance_chk" CHECK (btrim(provenance_ref) <> ''::text);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_resource_chk" CHECK (propagation_mode <> 'resource_only'::text OR requires_resource_scope);

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_version_chk" CHECK (policy_version > 0);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_bic_logic_chk" CHECK (NOT is_bic_required OR is_bic_allowed);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_country_upper_chk" CHECK (country_code::text = upper(country_code::text));

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_currency_upper_chk" CHECK (currency_code IS NULL OR currency_code::text = upper(currency_code::text));

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_iban_prefix_chk" CHECK (iban_country_prefix IS NULL OR iban_country_prefix::text = upper(iban_country_prefix::text));

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_validation_schema_chk" CHECK (validation_schema IS NULL OR jsonb_typeof(validation_schema) = 'object'::text);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_credential_configured_chk" CHECK (credential_status = 'not_configured'::text OR credential_reference IS NOT NULL);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_credential_pair_chk" CHECK ((credential_provider IS NULL) = (credential_reference IS NULL));

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_credential_status_chk" CHECK (credential_status = ANY (ARRAY['not_configured'::text, 'configured'::text, 'validation_failed'::text, 'rotation_required'::text, 'revoked'::text]));

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_test_latency_chk" CHECK (last_connection_test_latency_ms IS NULL OR last_connection_test_latency_ms >= 0);

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_test_status_chk" CHECK (last_connection_test_status = ANY (ARRAY['not_tested'::text, 'passed'::text, 'failed'::text, 'unavailable'::text]));

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_category_chk" CHECK (category = ANY (ARRAY['base'::text, 'foundation'::text, 'coa_framework'::text, 'industry_pack'::text, 'module_pack'::text]));

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_status_chk" CHECK (status = ANY (ARRAY['applied'::text, 'rolled_back'::text, 'failed'::text]));

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_account_strategy_chk" CHECK (account_strategy = ANY (ARRAY['same'::text, 'map'::text, 'profile'::text]));

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_amount_strategy_chk" CHECK (amount_strategy = ANY (ARRAY['mirror'::text, 'multiply'::text, 'formula'::text, 'suppress'::text]));

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_code_nonempty" CHECK (btrim(rule_code) <> ''::text);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_diff_books_chk" CHECK (source_book_id <> target_book_id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_formula_chk" CHECK (amount_strategy <> 'formula'::text OR amount_formula IS NOT NULL);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_lag_chk" CHECK (recognition_timing <> 'deferred'::text OR recognition_lag_periods > 0);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_map_chk" CHECK (account_strategy <> 'map'::text OR account_mapping IS NOT NULL);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_multiplier_chk" CHECK (amount_strategy <> 'multiply'::text OR amount_multiplier IS NOT NULL);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_name_nonempty" CHECK (btrim(rule_name) <> ''::text);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_profile_chk" CHECK (account_strategy <> 'profile'::text OR target_profile_id IS NOT NULL);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_recognition_timing_chk" CHECK (recognition_timing = ANY (ARRAY['simultaneous'::text, 'deferred'::text, 'on_close'::text]));

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_block_range_chk" CHECK (block_at_pct >= 0::numeric AND block_at_pct <= 100::numeric);

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_netting_chk" CHECK (commitment_netting = ANY (ARRAY['actuals_only'::text, 'actuals_plus_committed'::text, 'actuals_plus_committed_plus_forecast'::text]));

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_ou_scope_chk" CHECK (ou_scope = ANY (ARRAY['exact'::text, 'subtree'::text, 'full'::text]));

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_period_chk" CHECK (period_scope = ANY (ARRAY['current_period'::text, 'fiscal_year'::text, 'rolling_12m'::text]));

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_threshold_order" CHECK (block_at_pct >= warn_at_pct);

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_warn_range_chk" CHECK (warn_at_pct >= 0::numeric AND warn_at_pct <= 100::numeric);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_capex_curr_req_chk" CHECK (capex_screening_threshold IS NULL OR capex_screening_currency IS NOT NULL);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_capex_nonneg_chk" CHECK (capex_screening_threshold IS NULL OR capex_screening_threshold >= 0::numeric);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_company_scope_chk" CHECK (scope_type <> 'COMPANY'::text OR scope_id = company_code_id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_deny_flags_chk" CHECK (mapping_mode <> 'DENY'::text OR is_default = false AND is_selectable = false);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_mapping_mode_chk" CHECK (mapping_mode = ANY (ARRAY['ALLOW'::text, 'DENY'::text]));

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_scope_tenant_chk" CHECK (scope_type = 'TENANT'::text AND company_code_id IS NULL AND scope_id IS NULL OR scope_type <> 'TENANT'::text AND company_code_id IS NOT NULL AND scope_id IS NOT NULL);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_scope_type_chk" CHECK (scope_type = ANY (ARRAY['TENANT'::text, 'COMPANY'::text, 'SITE'::text, 'SUPPLIER_PROFILE'::text, 'COST_CENTER'::text, 'PROJECT'::text]));

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_company_scope_chk" CHECK (scope_type <> 'COMPANY'::text OR scope_id = company_code_id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_mapping_mode_chk" CHECK (mapping_mode = ANY (ARRAY['ALLOW'::text, 'DENY'::text]));

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_reorder_nonneg_chk" CHECK ((default_reorder_point IS NULL OR default_reorder_point >= 0::numeric) AND (default_reorder_qty IS NULL OR default_reorder_qty >= 0::numeric) AND (default_safety_stock IS NULL OR default_safety_stock >= 0::numeric));

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_scope_tenant_chk" CHECK (scope_type = 'TENANT'::text AND company_code_id IS NULL AND scope_id IS NULL OR scope_type <> 'TENANT'::text AND company_code_id IS NOT NULL AND scope_id IS NOT NULL);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_scope_type_chk" CHECK (scope_type = ANY (ARRAY['TENANT'::text, 'COMPANY'::text, 'SITE'::text, 'WAREHOUSE'::text]));

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_stocking_status_chk" CHECK (stocking_status = ANY (ARRAY['stocked'::text, 'non_stock'::text, 'blocked'::text, 'made_to_order'::text]));

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_company_scope_chk" CHECK (scope_type <> 'COMPANY'::text OR scope_id = company_code_id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_deny_flags_chk" CHECK (mapping_mode <> 'DENY'::text OR is_default = false AND is_selectable = false);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_mapping_mode_chk" CHECK (mapping_mode = ANY (ARRAY['ALLOW'::text, 'DENY'::text]));

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_rev_method_chk" CHECK (revenue_recognition_method IS NULL OR (revenue_recognition_method = ANY (ARRAY['POINT_IN_TIME'::text, 'OVER_TIME'::text, 'PCT_COMPLETION'::text, 'INPUT_METHOD'::text, 'OUTPUT_METHOD'::text])));

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_scope_tenant_chk" CHECK (scope_type = 'TENANT'::text AND company_code_id IS NULL AND scope_id IS NULL OR scope_type <> 'TENANT'::text AND company_code_id IS NOT NULL AND scope_id IS NOT NULL);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_scope_type_chk" CHECK (scope_type = ANY (ARRAY['TENANT'::text, 'COMPANY'::text, 'SITE'::text, 'CUSTOMER_PROFILE'::text, 'SALES_CHANNEL'::text, 'PROFIT_CENTER'::text, 'COST_CENTER'::text]));

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_conf_auto_chk" CHECK (min_confidence_auto >= 0::numeric AND min_confidence_auto <= 100::numeric);

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_conf_order_chk" CHECK (min_confidence_auto >= min_confidence_suggest);

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_conf_sugg_chk" CHECK (min_confidence_suggest >= 0::numeric AND min_confidence_suggest <= 100::numeric);

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_strategy_chk" CHECK (crosswalk_strategy = ANY (ARRAY['EXACT_ONLY'::text, 'BEST_MATCH'::text, 'AI_ASSISTED'::text]));

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_condition_chk" CHECK (condition_type = ANY (ARRAY['AMOUNT_ABOVE'::text, 'AMOUNT_BELOW'::text, 'IS_RECURRING'::text, 'IS_ONE_TIME'::text, 'COMPANY_MATCH'::text, 'PROCUREMENT_METHOD'::text, 'CROSS_BORDER'::text, 'DOC_TYPE_MATCH'::text, 'COMMODITY_MATCH'::text, 'SUPPLIER_MATCH'::text, 'CUSTOMER_MATCH'::text, 'CUSTOMER_TIER'::text, 'CONTRACT_TYPE_MATCH'::text, 'FLOW_MATCH'::text, 'CHANNEL_MATCH'::text, 'FALLBACK'::text]));

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_domain_chk" CHECK (resolved_domain IS NULL OR (resolved_domain = ANY (ARRAY['OPEX'::text, 'CAPEX'::text, 'REVENUE'::text, 'COST_OF_SALES'::text, 'TRANSFER'::text, 'REGULATORY'::text, 'ADMIN'::text, 'DEFERRED_REVENUE'::text])));

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_source_chk" CHECK (classification_source = ANY (ARRAY['COMMODITY_CATEGORY'::text, 'PRODUCT'::text, 'SERVICE'::text, 'ITEM_GROUP'::text, 'REVENUE_TYPE'::text]));

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_code_chk" CHECK (btrim(code_from) <> ''::text);

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 100::numeric);

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_match_mode_chk" CHECK (match_mode = ANY (ARRAY['EXACT'::text, 'RANGE'::text, 'PREFIX'::text, 'CROSSWALK'::text]));

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_range_chk" CHECK (code_to IS NULL OR code_to >= code_from);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "company_fiscal_calendar_assignment_dates_chk" CHECK (effective_fiscal_year_to IS NULL OR effective_fiscal_year_from <= effective_fiscal_year_to);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "company_fiscal_calendar_assignment_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_category_chk" CHECK (category = ANY (ARRAY['api'::text, 'file_transfer'::text, 'messaging'::text, 'erp'::text, 'payment'::text, 'custom'::text]));

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_code_fmt" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_hc_chk" CHECK (jsonb_typeof(health_check_config) = 'object'::text);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_name_fmt" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_schema_chk" CHECK (jsonb_typeof(config_schema) = 'object'::text);

ALTER TABLE ONLY "control"."connector_type"
  ADD CONSTRAINT "connector_type_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_kind_check" CHECK (kind ~ '^[a-z_*][a-z0-9_*]*$'::text AND length(kind) <= 64);

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_max_items_check" CHECK (max_items IS NULL OR max_items > 0);

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_max_storage_bytes_check" CHECK (max_storage_bytes IS NULL OR max_storage_bytes > 0);

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_warn_at_pct_check" CHECK (warn_at_pct >= 1 AND warn_at_pct <= 100);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_code_fmt" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_concurrency_chk" CHECK (concurrency_limit IS NULL OR concurrency_limit > 0);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_cron_fmt" CHECK (btrim(cron_expression) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_handler_fmt" CHECK (btrim(handler_type) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_name_fmt" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_payload_chk" CHECK (jsonb_typeof(payload_template) = 'object'::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_priority_chk" CHECK (priority >= '-10'::integer AND priority <= 10);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_queue_fmt" CHECK (btrim(target_queue) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_retries_chk" CHECK (max_retries >= 0);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_timezone_fmt" CHECK (btrim(timezone) <> ''::text);

ALTER TABLE ONLY "control"."cron_schedule"
  ADD CONSTRAINT "cron_schedule_window_chk" CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_acct_class_chk" CHECK (scope_account_class IS NULL OR (scope_account_class = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text])));

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_behavior_chk" CHECK (behavior = ANY (ARRAY['REQUIRED'::text, 'OPTIONAL'::text, 'FORBIDDEN'::text, 'DERIVE_IF_MISSING'::text, 'INHERIT_FROM_HEADER'::text, 'FIXED_VALUE'::text]));

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_code_chk" CHECK (btrim(policy_code) <> ''::text);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_derive_chk" CHECK (behavior <> 'DERIVE_IF_MISSING'::text OR derive_source IS NOT NULL);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_fixed_chk" CHECK (behavior <> 'FIXED_VALUE'::text OR fixed_value_id IS NOT NULL);

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_subledger_chk" CHECK (scope_subledger_type IS NULL OR (scope_subledger_type = ANY (ARRAY['AP'::text, 'AR'::text, 'ASSET'::text, 'INVENTORY'::text, 'WIP'::text, 'COMMISSION'::text, 'NONE'::text])));

ALTER TABLE ONLY "control"."document_lookup"
  ADD CONSTRAINT "dl_base_filters_chk" CHECK (jsonb_typeof(base_filters) = 'object'::text);

ALTER TABLE ONLY "control"."document_lookup"
  ADD CONSTRAINT "dl_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."document_lookup"
  ADD CONSTRAINT "dl_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_code_fmt_chk" CHECK (entity_code ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_color_fmt_chk" CHECK (color_token IS NULL OR color_token ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_composite_idx_chk" CHECK (jsonb_typeof(composite_indexes) = 'array'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_create_mode_chk" CHECK (create_mode = ANY (ARRAY['FORM_ONLY'::text, 'EARLY_DRAFT'::text, 'DIRECT_CREATE'::text, 'SOURCE_DOCUMENT_CREATE'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_discriminator_chk" CHECK ((discriminator_column IS NULL) = (discriminator_value IS NULL));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_display_cfg_chk" CHECK (jsonb_typeof(display_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_draft_ttl_chk" CHECK (draft_ttl_hours IS NULL OR draft_ttl_hours > 0);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_feature_flags_chk" CHECK (jsonb_typeof(feature_flags) = 'object'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_icon_fmt_chk" CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_mapping_mode_chk" CHECK (mapping_mode = ANY (ARRAY['exclusive'::text, 'shared'::text, 'virtual'::text, 'inherited'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_numbering_strategy_chk" CHECK (numbering_strategy = ANY (ARRAY['none'::text, 'manual'::text, 'auto'::text, 'auto_or_manual'::text, 'AUTO_ON_CREATE'::text, 'AUTO_ON_PROMOTE'::text, 'AUTO_ON_SUBMIT'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_partition_chk" CHECK (NOT is_partition_child OR partition_parent_id IS NOT NULL);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_plane_eligibility_chk" CHECK (cardinality(plane_eligibility) > 0 AND plane_eligibility <@ ARRAY['neon'::text, 'admin'::text, 'mesh'::text]);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_primary_key_fmt_chk" CHECK (primary_key IS NULL OR primary_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_read_capability_chk" CHECK (read_capability = ANY (ARRAY['none'::text, 'generic'::text, 'facade'::text, 'projection'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_runtime_identity_chk" CHECK (NOT runtime_enabled OR primary_key IS NOT NULL);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_runtime_read_chk" CHECK (NOT runtime_enabled OR read_capability <> 'none'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_shared_disc_chk" CHECK (mapping_mode <> 'shared'::text OR discriminator_column IS NOT NULL);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_short_fmt_chk" CHECK (entity_short IS NULL OR entity_short ~ '^[A-Z][A-Z0-9_]{1,11}$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_slug_fmt_chk" CHECK (slug IS NULL OR slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'DEPRECATED'::text, 'SUSPENDED'::text, 'ARCHIVED'::text]));

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_tenant_column_fmt_chk" CHECK (tenant_column IS NULL OR tenant_column ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_tenant_naming_chk" CHECK (ownership_model <> 'tenant'::text OR table_schema = 'document'::text AND table_name ~ '^t_[a-z][a-z0-9_]{1,11}_[a-z][a-z0-9_]{1,60}$'::text);

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_write_capability_chk" CHECK (write_capability = ANY (ARRAY['none'::text, 'generic'::text, 'facade'::text, 'append_only'::text]));

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_action_code_chk" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_capability_chk" CHECK (capability = ANY (ARRAY['allowed'::text, 'denied'::text, 'requires_permission'::text]));

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_permission_consistency_chk" CHECK (capability = 'requires_permission'::text AND required_permission IS NOT NULL OR capability <> 'requires_permission'::text AND required_permission IS NULL);

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_cache_policy_chk" CHECK (jsonb_typeof(cache_policy) = 'object'::text);

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_class_key_chk" CHECK (class_key = ANY (ARRAY['REFERENCE'::text, 'MASTER'::text, 'CONTROL'::text, 'DOCUMENT'::text, 'DOCUMENT_RELATION'::text, 'LEDGER'::text, 'LOG'::text, 'AGGREGATE'::text, 'DIMENSION'::text, 'RELATION'::text, '*'::text]));

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_compliance_chk" CHECK (jsonb_typeof(compliance_profile) = 'object'::text);

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_default_gov_chk" CHECK (default_governance_level = ANY (valid_governance_levels));

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_default_tier_chk" CHECK (default_security_tier = ANY (ARRAY['platform_critical'::text, 'tenant_critical'::text, 'operational'::text, 'config'::text]));

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_field_flag_rules_chk" CHECK (jsonb_typeof(field_flag_rules) = 'array'::text);

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_field_flag_rules_schema_chk" CHECK (control.is_valid_entity_field_flag_rules(field_flag_rules));

ALTER TABLE ONLY "control"."entity_class_profile"
  ADD CONSTRAINT "ecp_security_tiers_chk" CHECK (jsonb_typeof(security_tiers) = 'object'::text);

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_diff_chk" CHECK (jsonb_typeof(contract_diff) = 'array'::text);

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_hashes_chk" CHECK ((before_hash IS NULL OR before_hash ~ '^[0-9a-f]{64}$'::text) AND (after_hash IS NULL OR after_hash ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_transition_chk" CHECK (transition = ANY (ARRAY['draft_created'::text, 'owner_patched'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'rollback_published'::text]));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_bool_naming_chk" CHECK (data_type <> 'boolean'::text OR name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_canonical_tenant_chk" CHECK (entity_version_id IS NOT NULL OR tenant_id IS NULL);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_cardinality_chk" CHECK (cardinality = ANY (ARRAY['one'::text, 'many'::text, 'zero_or_one'::text]));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_column_name_fmt_chk" CHECK (column_name = ''::text OR column_name ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_computed_chk" CHECK (NOT is_computed OR compute_mode IS NOT NULL);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_computed_writeonce_chk" CHECK (NOT (is_computed AND is_write_once));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_custom_prefix_chk" CHECK (origin <> 'business'::text OR column_name = ''::text OR column_name ~ '^cus_[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_display_mode_chk" CHECK (display_mode IS NULL OR (display_mode = ANY (ARRAY['date'::text, 'dateTime'::text])));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_display_mode_kind_chk" CHECK (display_mode IS NULL OR display_mode = 'dateTime'::text OR temporal_kind = 'businessDate'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_enum_requires_chk" CHECK (data_type <> 'enum'::text OR enum_config IS NOT NULL OR enum_domain_code IS NOT NULL);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_enum_xor_chk" CHECK (NOT (enum_config IS NOT NULL AND enum_domain_code IS NOT NULL));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_filter_config_obj_chk" CHECK (filter_config IS NULL OR jsonb_typeof(filter_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_fk_on_delete_chk" CHECK (fk_on_delete = ANY (ARRAY['restrict'::text, 'cascade'::text, 'set_null'::text, 'set_default'::text, 'no_action'::text]));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_group_key_fmt_chk" CHECK (group_key IS NULL OR group_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_id_suffix_chk" CHECK (name !~~ like_escape('%\_id'::text, '\'::text) OR (data_type = ANY (ARRAY['uuid'::text, 'reference'::text, 'uuid_array'::text, 'uuid[]'::text])));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_origin_chk" CHECK (origin = ANY (ARRAY['system'::text, 'standard'::text, 'business'::text]));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_projection_alias_fmt_chk" CHECK (projection_alias_of IS NULL OR projection_alias_of ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_temporal_kind_chk" CHECK (temporal_kind IS NULL OR (temporal_kind = ANY (ARRAY['businessDate'::text, 'instant'::text, 'zonedDateTime'::text])));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_temporal_period_chk" CHECK (affects_posting_period = false OR temporal_kind = 'businessDate'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_unique_scope_chk" CHECK (unique_scope IS NULL OR is_unique = true);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_unique_scope_val_chk" CHECK (unique_scope IS NULL OR (unique_scope = ANY (ARRAY['global'::text, 'tenant'::text, 'entity_instance'::text])));

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_v2_type_config_chk" CHECK (jsonb_typeof(type_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_writeonce_readonly_chk" CHECK (NOT (is_write_once AND is_read_only));

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_column_span_chk" CHECK (column_span IS NULL OR column_span >= 1 AND column_span <= 12);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_density_chk" CHECK (density IS NULL OR (density = ANY (ARRAY['compact'::text, 'comfortable'::text, 'document'::text])));

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_editability_expr_chk" CHECK (editability_expr IS NULL OR jsonb_typeof(editability_expr) = 'object'::text);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_renderer_config_chk" CHECK (jsonb_typeof(renderer_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_visibility_expr_chk" CHECK (visibility_expr IS NULL OR jsonb_typeof(visibility_expr) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_effective_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_flow_code_fmt" CHECK (flow_code ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'superseded'::text, 'archived'::text]));

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_trigger_chk" CHECK (trigger_context = ANY (ARRAY['new'::text, 'edit'::text, 'approve'::text, 'duplicate'::text, 'read_only'::text, 'clone'::text]));

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_version_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_deriv_expr_chk" CHECK (derivation_mode IS NULL OR derivation_mode = 'manual'::text OR derive_expression IS NOT NULL);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_deriv_mode_chk" CHECK (derivation_mode IS NULL OR (derivation_mode = ANY (ARRAY['derived_locked'::text, 'derived_overrideable'::text, 'manual'::text])));

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_display_size_chk" CHECK (display_size IS NULL OR (display_size = ANY (ARRAY['prominent'::text, 'standard'::text, 'compact'::text])));

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_mode_chk" CHECK (mode = ANY (ARRAY['required'::text, 'editable'::text, 'readonly'::text, 'hidden'::text, 'summary_only'::text, 'chip'::text]));

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_override_perm_chk" CHECK (override_permission IS NULL OR derivation_mode = 'derived_overrideable'::text);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_required_chk" CHECK (required_when IS NULL OR jsonb_typeof(required_when) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_section_key_fmt" CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_span_chk" CHECK (span = ANY (ARRAY[1, 2, 3]));

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_summary_role_chk" CHECK (summary_role IS NULL OR (summary_role = ANY (ARRAY['total'::text, 'subtotal'::text, 'addition'::text, 'deduction'::text, 'line_badge'::text, 'warning'::text, 'meta'::text])));

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_visible_chk" CHECK (visible_when IS NULL OR jsonb_typeof(visible_when) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_default_row_chk" CHECK (default_row IS NULL OR jsonb_typeof(default_row) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_field_codes_chk" CHECK (field_codes IS NULL OR jsonb_typeof(field_codes) = 'array'::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_label_nonempty" CHECK (btrim(label) <> ''::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_min_max_rows_chk" CHECK (min_rows IS NULL OR max_rows IS NULL OR min_rows <= max_rows);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_reveal_chk" CHECK (reveal_behavior = ANY (ARRAY['auto_expand'::text, 'honor_default'::text]));

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_section_key_fmt" CHECK (section_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_section_shape_chk" CHECK (section_type = 'repeater'::text AND entity_code IS NOT NULL AND btrim(entity_code) <> ''::text AND payload_key IS NOT NULL AND btrim(payload_key) <> ''::text AND field_codes IS NOT NULL AND jsonb_typeof(field_codes) = 'array'::text AND jsonb_array_length(field_codes) > 0 OR section_type = 'singleton'::text AND entity_code IS NOT NULL AND btrim(entity_code) <> ''::text AND payload_key IS NOT NULL AND btrim(payload_key) <> ''::text OR section_type = 'summary'::text AND entity_code IS NULL AND payload_key IS NULL OR section_type = 'fields'::text);

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_section_type_chk" CHECK (section_type = ANY (ARRAY['fields'::text, 'repeater'::text, 'singleton'::text, 'summary'::text]));

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_visible_when_chk" CHECK (visible_when IS NULL OR jsonb_typeof(visible_when) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_advance_chk" CHECK (jsonb_typeof(advance_rule) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_layout_chk" CHECK (layout_hint = ANY (ARRAY['two_column'::text, 'single_column'::text, 'summary_side'::text, 'line_editor'::text, 'grid'::text, 'card'::text]));

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_skip_when_chk" CHECK (skip_when IS NULL OR jsonb_typeof(skip_when) = 'object'::text);

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_step_key_fmt" CHECK (step_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_conditions_chk" CHECK (conditions IS NULL OR jsonb_typeof(conditions) = 'object'::text);

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_entity_name_chk" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_entity_chk" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_planes_chk" CHECK (cardinality(applies_to_planes) > 0 AND applies_to_planes <@ ARRAY['neon'::text, 'admin'::text, 'mesh'::text]);

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_reason_chk" CHECK (disabled_reason IS NULL OR btrim(disabled_reason) <> ''::text);

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_status_chk" CHECK (btrim(record_status) <> ''::text);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_allowed_chk" CHECK (btrim(allowed_chars) <> ''::text);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_max_length_chk" CHECK (max_length IS NULL OR max_length >= 1 AND max_length <= 128);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_number_field_chk" CHECK (btrim(number_field) <> ''::text);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_reset_chk" CHECK (reset_strategy = ANY (ARRAY['never'::text, 'yearly'::text, 'fiscal_yearly'::text, 'monthly'::text, 'quarterly'::text]));

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_scope_chk" CHECK (uniqueness_scope = ANY (ARRAY['tenant'::text, 'company'::text, 'global'::text]));

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_segments_chk" CHECK (jsonb_typeof(segments) = 'array'::text);

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_segments_schema_chk" CHECK (control.is_valid_entity_number_segments(segments));

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_period_chk" CHECK (period_number >= 0 AND period_number <= 16);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_quarter_chk" CHECK (quarter_number >= 0 AND quarter_number <= 4);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_scope_chk" CHECK (btrim(scope_key) <> ''::text);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_value_chk" CHECK (last_value >= 0);

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_year_chk" CHECK (fiscal_year = 0 OR fiscal_year >= 2000 AND fiscal_year <= 2099);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_execution_target_chk" CHECK (execution_target IS NULL OR execution_target ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_handler_chk" CHECK (handler_type = ANY (ARRAY['NAVIGATE'::text, 'API'::text, 'MODAL'::text, 'INLINE'::text]));

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_placement_chk" CHECK (placement = ANY (ARRAY['PRIMARY'::text, 'TOOLBAR'::text, 'OVERFLOW'::text, 'CONTEXT'::text, 'COMMAND'::text]));

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_plane_filter_chk" CHECK (plane_filter IS NULL OR plane_filter <@ ARRAY['neon'::text, 'admin'::text, 'mesh'::text]);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_selection_config_object_chk" CHECK (selection_config IS NULL OR jsonb_typeof(selection_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_surface_chk" CHECK (surface = ANY (ARRAY['LIST'::text, 'DETAIL'::text, 'BOTH'::text, 'PALETTE_ONLY'::text, 'HIDDEN'::text]));

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_surface_hidden_chk" CHECK (surface <> 'HIDDEN'::text OR placement = 'COMMAND'::text);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_access_chk" CHECK (access_mode = ANY (ARRAY['default_deny'::text, 'default_allow'::text, 'explicit'::text]));

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_audit_chk" CHECK (audit_mode = ANY (ARRAY['enabled'::text, 'disabled'::text, 'sampling'::text]));

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_cache_chk" CHECK (jsonb_typeof(cache_flags) = 'object'::text);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_company_scope_chk" CHECK (company_scope_mode = ANY (ARRAY['none'::text, 'single'::text, 'subtree'::text, 'full'::text]));

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_extended_scope_chk" CHECK (jsonb_typeof(extended_scope) = 'object'::text);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_field_scope_eval_chk" CHECK (field_scope_eval_order = ANY (ARRAY['row_first'::text, 'field_first'::text, 'parallel'::text]));

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_filters_chk" CHECK (jsonb_typeof(default_filters) = 'object'::text);

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_retention_chk" CHECK (jsonb_typeof(retention_policy) = 'object'::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_catalog_diag_chk" CHECK (jsonb_typeof(catalog_diagnostics) = 'object'::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_catalog_hash_fmt_chk" CHECK (catalog_compiled_hash IS NULL OR length(catalog_compiled_hash) >= 64);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_catalog_status_chk" CHECK (catalog_status = ANY (ARRAY['NOT_BUILT'::text, 'READY'::text, 'BLOCKED'::text]));

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_execution_diag_chk" CHECK (jsonb_typeof(execution_diagnostics) = 'object'::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_execution_hash_fmt_chk" CHECK (execution_compiled_hash IS NULL OR length(execution_compiled_hash) >= 64);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_execution_status_chk" CHECK (execution_status = ANY (ARRAY['NOT_APPLICABLE'::text, 'NOT_BUILT'::text, 'READY'::text, 'BLOCKED'::text]));

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_hash_fmt_chk" CHECK (last_compiled_hash IS NULL OR length(last_compiled_hash) >= 64);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_m3_hashes_chk" CHECK ((contract_hash IS NULL OR contract_hash ~ '^[0-9a-f]{64}$'::text) AND (materialized_hash IS NULL OR materialized_hash ~ '^[0-9a-f]{64}$'::text) AND (admin_compiled_hash IS NULL OR admin_compiled_hash ~ '^[0-9a-f]{64}$'::text) AND (neon_compiled_hash IS NULL OR neon_compiled_hash ~ '^[0-9a-f]{64}$'::text) AND (mesh_compiled_hash IS NULL OR mesh_compiled_hash ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_precedence_chk" CHECK (applied_precedence >= 0);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_provenance_chk" CHECK (jsonb_typeof(provenance) = 'object'::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_readiness_diagnostics_chk" CHECK (jsonb_typeof(readiness_diagnostics) = 'array'::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_readiness_status_chk" CHECK (readiness_status = ANY (ARRAY['NOT_READY'::text, 'VALIDATING'::text, 'READY'::text, 'BLOCKED'::text]));

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_source_layer_chk" CHECK (source_layer = ANY (ARRAY['platform'::text, 'blueprint'::text, 'overlay'::text]));

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_source_ref_chk" CHECK (source_ref IS NULL OR btrim(source_ref) <> ''::text);

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_summary_chk" CHECK (jsonb_typeof(status_summary) = 'object'::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_kind_chk" CHECK (relation_kind = ANY (ARRAY['belongs_to'::text, 'has_many'::text, 'm2m'::text]));

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_on_delete_chk" CHECK (on_delete = ANY (ARRAY['restrict'::text, 'cascade'::text, 'set_null'::text, 'set_default'::text, 'no_action'::text]));

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_record_filter_chk" CHECK (jsonb_typeof(record_filter) = 'object'::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_resolution_config_chk" CHECK (resolution_kind = 'fk'::text AND (relation_kind = 'm2m'::text OR fk_field IS NOT NULL) OR resolution_kind = 'polymorphic'::text AND source_type_field IS NOT NULL AND source_type_value IS NOT NULL AND source_id_field IS NOT NULL OR resolution_kind = 'array_fk'::text AND fk_field IS NOT NULL AND relation_kind = 'has_many'::text OR resolution_kind = 'join'::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_resolution_kind_chk" CHECK (resolution_kind = ANY (ARRAY['fk'::text, 'polymorphic'::text, 'join'::text, 'array_fk'::text]));

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_target_chk" CHECK (btrim(target_entity) <> ''::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_ui_chk" CHECK (jsonb_typeof(ui_behavior) = 'object'::text);

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_v2_mutation_owner_chk" CHECK (mutation_owner = ANY (ARRAY['generic'::text, 'workspace'::text, 'handler'::text, 'read_only'::text]));

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_config_chk" CHECK (jsonb_typeof(binding_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_kind_chk" CHECK (scope_kind = ANY (ARRAY['tenant'::text, 'company_code'::text, 'legal_entity'::text, 'operating_organization'::text]));

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_mode_chk" CHECK (binding_kind = ANY (ARRAY['tenant_constant'::text, 'resource_column'::text, 'resolver'::text]));

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_shape_chk" CHECK (binding_kind = 'tenant_constant'::text AND scope_kind = 'tenant'::text AND source_column IS NULL AND resolver_key IS NULL OR binding_kind = 'resource_column'::text AND source_column ~ '^[a-z][a-z0-9_]{0,62}$'::text AND resolver_key IS NULL OR binding_kind = 'resolver'::text AND source_column IS NULL AND resolver_key ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_column_count_chk" CHECK (column_count IS NULL OR (column_count = ANY (ARRAY[1, 2, 3, 4])));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_density_chk" CHECK (density IS NULL OR (density = ANY (ARRAY['compact'::text, 'comfortable'::text, 'document'::text])));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_icon_fmt_chk" CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_kind_chk" CHECK (kind = ANY (ARRAY['fields'::text, 'list'::text, 'print'::text, 'document_identity_summary'::text, 'document_lines'::text, 'document_rows'::text, 'document_components'::text, 'document_accounting'::text, 'document_matching_panel'::text, 'line_items'::text, 'child_records'::text, 'distributions'::text, 'summary_cards'::text, 'attachments'::text, 'comments'::text, 'workflow'::text, 'lifecycle'::text, 'versions'::text, 'compare'::text, 'activity_log'::text, 'audit_trail'::text, 'flow'::text, 'postings_preview'::text, 'custom'::text]));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_mode_chk" CHECK (mode = ANY (ARRAY['create'::text, 'edit'::text, 'view'::text, 'list'::text, 'print'::text]));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_parent_not_self_chk" CHECK (parent_surface_id IS NULL OR parent_surface_id <> id);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_placement_chk" CHECK (placement = ANY (ARRAY['main'::text, 'header'::text, 'context_panel'::text, 'subroute'::text, 'toolbar'::text, 'action_only'::text, 'mount_only'::text]));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_print_span_chk" CHECK (print_span IS NULL OR (print_span = ANY (ARRAY['full'::text, 'half'::text])));

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_slot_key_fmt_chk" CHECK (slot_key IS NULL OR slot_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_surface_key_fmt_chk" CHECK (surface_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_visibility_expr_chk" CHECK (visibility_expr IS NULL OR jsonb_typeof(visibility_expr) = 'object'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_behaviors_chk" CHECK (jsonb_typeof(behaviors) = 'object'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_break_glass_chk" CHECK (approval_break_glass = false AND approval_break_glass_reason IS NULL AND approval_break_glass_ticket IS NULL OR approval_break_glass = true AND btrim(COALESCE(approval_break_glass_reason, ''::text)) <> ''::text AND btrim(COALESCE(approval_break_glass_ticket, ''::text)) <> ''::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_change_type_chk" CHECK (change_type IS NULL OR (change_type = ANY (ARRAY['structural'::text, 'behavioral'::text, 'governance'::text, 'label'::text, 'fix'::text])));

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_contract_document_chk" CHECK (contract_document IS NULL OR jsonb_typeof(contract_document) = 'object'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_contract_hash_chk" CHECK (contract_hash IS NULL OR contract_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_effective_window_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_hash_fmt_chk" CHECK (version_hash IS NULL OR length(version_hash) >= 64);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_override_quorum_chk" CHECK (emergency_override_at IS NULL OR emergency_override_by IS NOT NULL AND emergency_override_reason IS NOT NULL AND btrim(emergency_override_reason) <> ''::text AND emergency_override_ticket IS NOT NULL AND btrim(emergency_override_ticket) <> ''::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_projection_hash_chk" CHECK (projection_hash IS NULL OR projection_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_revision_reason_chk" CHECK (version_no <= 1 OR change_type IS NOT NULL OR change_summary IS NOT NULL);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text, 'APPROVED'::text, 'EFFECTIVE'::text, 'SUPERSEDED'::text, 'ARCHIVED'::text, 'REJECTED'::text, 'WITHDRAWN'::text]));

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_validation_diagnostics_chk" CHECK (jsonb_typeof(validation_diagnostics) = 'array'::text);

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_validation_status_chk" CHECK (validation_status = ANY (ARRAY['NOT_VALIDATED'::text, 'VALID'::text, 'INVALID'::text]));

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_version_no_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_api_key_chk" CHECK (api_exposure <> 'API'::text OR (key_strategy = ANY (ARRAY['single'::text, 'natural'::text])));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_api_read_chk" CHECK (api_exposure <> 'API'::text OR read_capability <> 'none'::text);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_backing_type_chk" CHECK (backing_type = ANY (ARRAY['table'::text, 'view'::text, 'materialized_view'::text, 'external'::text, 'virtual'::text]));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_catalog_exposure_chk" CHECK (api_exposure = ANY (ARRAY['NONE'::text, 'CATALOG_ONLY'::text, 'API'::text]));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_hash_fmt_chk" CHECK (contract_hash IS NULL OR length(contract_hash) >= 64);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_key_strategy_chk" CHECK (key_strategy = ANY (ARRAY['none'::text, 'single'::text, 'composite'::text, 'natural'::text]));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_primary_key_fmt_chk" CHECK (primary_key IS NULL OR primary_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_read_capability_chk" CHECK (read_capability = ANY (ARRAY['none'::text, 'generic'::text, 'facade'::text, 'projection'::text]));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_source_kind_chk" CHECK (source_kind = ANY (ARRAY['explicit'::text, 'derived'::text, 'overlay'::text]));

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_tenant_column_fmt_chk" CHECK (tenant_column IS NULL OR tenant_column ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_v2_json_object_chk" CHECK (jsonb_typeof(identity_config) = 'object'::text AND jsonb_typeof(search_config) = 'object'::text AND jsonb_typeof(data_policy) = 'object'::text AND jsonb_typeof(concurrency_config) = 'object'::text AND jsonb_typeof(storage_config) = 'object'::text);

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_write_capability_chk" CHECK (write_capability = ANY (ARRAY['none'::text, 'generic'::text, 'facade'::text, 'append_only'::text]));

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_flag_type_chk" CHECK (flag_type = ANY (ARRAY['release_gate'::text, 'capability_toggle'::text, 'experiment'::text]));

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_overrides_chk" CHECK (tenant_overrides IS NULL OR jsonb_typeof(tenant_overrides) = 'object'::text);

ALTER TABLE ONLY "control"."feature_flag"
  ADD CONSTRAINT "ff_rollout_chk" CHECK (rollout_pct IS NULL OR rollout_pct >= 0 AND rollout_pct <= 100);

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_columns_chk" CHECK (columns = ANY (ARRAY[1, 2, 3]));

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_key_fmt_chk" CHECK (group_key ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_label_chk" CHECK (btrim(label) <> ''::text);

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_page_span_chk" CHECK (page_span = ANY (ARRAY['full'::text, 'half'::text]));

ALTER TABLE ONLY "control"."field_group"
  ADD CONSTRAINT "fg_ui_intent_chk" CHECK (ui_intent IS NULL OR (ui_intent = ANY (ARRAY['what'::text, 'how_much'::text, 'where_it_costs'::text, 'classify'::text, 'tax'::text, 'discount'::text, 'retention'::text, 'charges'::text, 'delivery'::text, 'budget'::text, 'reference_links'::text, 'accounting'::text])));

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_mask_strategy_chk" CHECK (mask_strategy = ANY (ARRAY['null'::text, 'partial'::text, 'hash'::text, 'encrypt'::text, 'tokenise'::text]));

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_pii_class_chk" CHECK (pii_classification IS NULL OR (pii_classification = ANY (ARRAY['none'::text, 'quasi'::text, 'direct'::text, 'sensitive'::text, 'special_category'::text])));

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_policy_type_chk" CHECK (policy_type = ANY (ARRAY['read'::text, 'write'::text, 'mask'::text, 'redact'::text]));

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_scope_chk" CHECK (scope = ANY (ARRAY['global'::text, 'module'::text, 'tenant'::text]));

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_mode_chk" CHECK (rollout_mode = ANY (ARRAY['observe'::text, 'enforce'::text]));

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_anchor_day_chk" CHECK (anchor_day >= 1 AND anchor_day <= 31);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_anchor_month_chk" CHECK (anchor_month >= 1 AND anchor_month <= 12);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_dates_chk" CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_label_chk" CHECK (fiscal_year_label_rule = ANY (ARRAY['start_year'::text, 'end_year'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_leap_rule_chk" CHECK (leap_week_rule = ANY (ARRAY['none'::text, 'last_period'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_period_count_chk" CHECK (periods_per_year >= 1 AND periods_per_year <= 16);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_start_rule_chk" CHECK (year_start_rule = ANY (ARRAY['fixed_date'::text, 'first_on_or_after'::text, 'last_on_or_before'::text, 'nearest_weekday'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_type_chk" CHECK (calendar_type = ANY (ARRAY['monthly'::text, 'four_four_five'::text, 'four_five_four'::text, 'five_four_four'::text, 'thirteen_period'::text, 'custom'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fiscal_calendar_config_weekday_chk" CHECK (week_start_day >= 1 AND week_start_day <= 7);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_anchor_chk" CHECK (anchor = ANY (ARRAY['sequence'::text, 'year_start'::text, 'year_end'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_duration_unit_chk" CHECK (duration_unit = ANY (ARRAY['point'::text, 'day'::text, 'week'::text, 'month'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_duration_value_chk" CHECK (duration_value >= 1 AND duration_value <= 53);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_name_chk" CHECK (btrim(name_template) <> ''::text);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_number_chk" CHECK (period_number >= 0 AND period_number <= 16);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_quarter_chk" CHECK (quarter_number IS NULL OR quarter_number >= 1 AND quarter_number <= 4);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_sequence_chk" CHECK (sequence_no >= 0 AND sequence_no <= 32);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fiscal_calendar_period_rule_type_chk" CHECK (period_type = ANY (ARRAY['opening'::text, 'normal'::text, 'adjustment'::text, 'closing'::text]));

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_approval_order_chk" CHECK (approved_at IS NULL OR locked_at IS NOT NULL);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_approve_pair_chk" CHECK ((approved_at IS NULL) = (approved_by IS NULL));

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_fiscal_year_chk" CHECK (fiscal_year >= 2000 AND fiscal_year <= 2099);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_lock_pair_chk" CHECK ((locked_at IS NULL) = (locked_by IS NULL));

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_period_type_chk" CHECK (budget_period_type = ANY (ARRAY['annual'::text, 'quarterly'::text, 'monthly'::text]));

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'locked'::text, 'approved'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_superseded_pair_chk" CHECK ((superseded_by_id IS NULL) = (superseded_at IS NULL));

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_period_range_chk" CHECK (period_from >= 1 AND period_from <= 16 AND period_to >= 1 AND period_to <= 16 AND period_from <= period_to);

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_probability_chk" CHECK (probability_weight >= 0::numeric AND probability_weight <= 1::numeric);

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_spread_chk" CHECK (spread_method = ANY (ARRAY['EVEN'::text, 'FRONT_LOADED'::text, 'BACK_LOADED'::text, 'SEASONAL'::text, 'STEP'::text, 'CUSTOM'::text]));

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fl_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'excluded'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_schema_chk" CHECK (jsonb_typeof(input_schema) = 'object'::text AND jsonb_typeof(output_schema) = 'object'::text AND jsonb_typeof(default_rounding) = 'object'::text AND jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."formula_expression"
  ADD CONSTRAINT "formula_expression_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text, 'archived'::text]));

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_effective_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_json_chk" CHECK (jsonb_typeof(expression_body) = 'object'::text AND jsonb_typeof(input_defaults) = 'object'::text AND jsonb_typeof(output_mapping) = 'object'::text AND jsonb_typeof(rounding_config) = 'object'::text AND jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_no_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'effective'::text, 'superseded'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_age_chk" CHECK (maximum_rate_age_days IS NULL OR maximum_rate_age_days >= 0);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_context_chk" CHECK (btrim(transaction_context) <> ''::text);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_dates_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_manual_approval_chk" CHECK (NOT manual_override_approval_required OR manual_override_allowed);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_missing_behavior_chk" CHECK (missing_rate_behavior = ANY (ARRAY['block'::text, 'manual_with_approval'::text, 'fallback'::text]));

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_not_self_superseding_chk" CHECK (supersedes_id IS NULL OR supersedes_id <> id);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_priority_chk" CHECK (priority >= 0 AND priority <= 1000);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_rate_types_chk" CHECK ((default_rate_type = ANY (ARRAY['SPOT'::text, 'PERIOD_AVG'::text, 'PERIOD_END'::text, 'BUDGET'::text, 'CONTRACTED'::text, 'HISTORICAL'::text])) AND (revaluation_rate_type = ANY (ARRAY['SPOT'::text, 'PERIOD_AVG'::text, 'PERIOD_END'::text, 'BUDGET'::text, 'CONTRACTED'::text, 'HISTORICAL'::text])));

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_scope_chk" CHECK (ledger_book_id IS NULL OR company_code_id IS NOT NULL);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_sources_chk" CHECK (jsonb_typeof(preferred_sources) = 'array'::text);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_triangulation_chk" CHECK (NOT allow_triangulation OR pivot_currency_code IS NOT NULL);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_version_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_config_chk" CHECK (handler_config IS NULL OR jsonb_typeof(handler_config) = 'object'::text);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_contract_role_chk" CHECK (default_contract_role = ANY (ARRAY['contract'::text, 'extension'::text]));

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_handler_type_chk" CHECK (handler_type = ANY (ARRAY['built_in'::text, 'emit_event'::text, 'webhook'::text]));

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_key_chk" CHECK (btrim(action_key) <> ''::text);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_label_chk" CHECK (btrim(label) <> ''::text);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_origin_chk" CHECK (origin = ANY (ARRAY['system'::text, 'tenant'::text]));

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_origin_tenant_chk" CHECK (origin = 'system'::text AND tenant_id IS NULL OR origin = 'tenant'::text AND tenant_id IS NOT NULL);

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_safety_level_chk" CHECK (default_safety_level = ANY (ARRAY['required'::text, 'narrowable'::text, 'replaceable'::text]));

ALTER TABLE ONLY "control"."intake_idempotency"
  ADD CONSTRAINT "iidem_entity_fmt" CHECK (entity_code ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "control"."intake_idempotency"
  ADD CONSTRAINT "iidem_key_fmt" CHECK (btrim(idempotency_key) <> ''::text);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_reason_nonempty" CHECK (btrim(reason) <> ''::text);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_status_chk" CHECK (status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text, 'revoked'::text]));

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_amount_chk" CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_contract_chk" CHECK (contract_value_min IS NULL OR contract_value_max IS NULL OR contract_value_min <= contract_value_max);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_hash_fmt_chk" CHECK (definition_hash IS NULL OR length(definition_hash) >= 64);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lifecycle_version_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_config_chk" CHECK (replacement_config IS NULL OR jsonb_typeof(replacement_config) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_kind_chk" CHECK (override_kind = ANY (ARRAY['suppress'::text, 'replace'::text, 'add_before'::text, 'add_after'::text]));

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_replacement_chk" CHECK (override_kind = 'suppress'::text AND replacement_action IS NULL OR override_kind <> 'suppress'::text AND replacement_action IS NOT NULL);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_state_flags_chk" CHECK (jsonb_typeof(state_flags) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_terminal_initial_chk" CHECK (NOT (is_initial = true AND is_terminal = true));

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_rules_chk" CHECK (jsonb_typeof(rules) = 'array'::text);

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_no_self_loop_chk" CHECK (from_state_id <> to_state_id);

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_op_code_chk" CHECK (btrim(operation_code) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_action_chk" CHECK (btrim(hook_action_key) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_completed_after_start" CHECK (completed_at IS NULL OR completed_at >= executed_at);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_duration_nonneg" CHECK (duration_ms IS NULL OR duration_ms >= 0);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_event_seq_pos" CHECK (transition_event_seq >= 1);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_failed_has_msg" CHECK (status <> 'failed'::text OR error_message IS NOT NULL);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_source_type_chk" CHECK (btrim(source_doc_type) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_status_chk" CHECK (status = ANY (ARRAY['completed'::text, 'partial'::text, 'failed'::text, 'skipped'::text, 'in_progress'::text]));

ALTER TABLE ONLY "control"."lifecycle_transition_execution"
  ADD CONSTRAINT "lte_token_chk" CHECK (length(execution_token) >= 16);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_conditions_chk" CHECK (conditions IS NULL OR jsonb_typeof(conditions) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_nonempty_chk" CHECK (required_operations IS NOT NULL OR workflow_definition_id IS NOT NULL OR conditions IS NOT NULL OR threshold_rules IS NOT NULL OR policy_rule_id IS NOT NULL);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_ops_chk" CHECK (required_operations IS NULL OR jsonb_typeof(required_operations) = 'array'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_policy_path_chk" CHECK (resolves_via <> 'policy'::text OR policy_rule_id IS NOT NULL);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_resolves_via_chk" CHECK (resolves_via = ANY (ARRAY['workflow'::text, 'policy'::text]));

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_threshold_chk" CHECK (threshold_rules IS NULL OR jsonb_typeof(threshold_rules) = 'array'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_workflow_path_chk" CHECK (resolves_via <> 'workflow'::text OR workflow_definition_id IS NOT NULL);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_action_chk" CHECK (btrim(action) <> ''::text);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_contract_role_chk" CHECK (contract_role = ANY (ARRAY['contract'::text, 'extension'::text]));

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_contract_system_chk" CHECK (contract_role = 'extension'::text OR origin = 'system'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_layer_rank_chk" CHECK (origin = 'system'::text AND layer_rank = 10 OR origin = 'tenant'::text AND layer_rank = 20 OR origin = 'overlay'::text AND layer_rank = 30);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_origin_chk" CHECK (origin = ANY (ARRAY['system'::text, 'tenant'::text, 'overlay'::text]));

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_overlay_id_chk" CHECK (origin = 'overlay'::text AND overlay_id IS NOT NULL OR origin <> 'overlay'::text AND overlay_id IS NULL);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_required_contract_chk" CHECK (safety_level <> 'required'::text OR contract_role = 'contract'::text);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_safety_level_chk" CHECK (safety_level = ANY (ARRAY['required'::text, 'narrowable'::text, 'replaceable'::text]));

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_sort_origin_chk" CHECK (origin = 'system'::text AND sort_order >= 0 AND sort_order <= 999 OR origin = 'tenant'::text AND sort_order >= 1000 AND sort_order <= 1999 OR origin = 'overlay'::text AND sort_order >= 2000);

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_timing_chk" CHECK (timing = ANY (ARRAY['before'::text, 'after'::text]));

ALTER TABLE ONLY "control"."lookup_domain"
  ADD CONSTRAINT "lookup_domain_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text);

ALTER TABLE ONLY "control"."lookup_domain"
  ADD CONSTRAINT "lookup_domain_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."lookup_domain"
  ADD CONSTRAINT "lookup_domain_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text);

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_system_consistency" CHECK (is_system = true AND tenant_id IS NULL OR is_system = false AND tenant_id IS NOT NULL);

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_match_chk" CHECK (match_type = ANY (ARRAY['three_way'::text, 'two_way'::text, 'no_match'::text, 'evaluated_receipt'::text, 'commitment_delivery'::text, 'commitment_price'::text]));

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_scope_chk" CHECK (company_code_id IS NULL OR tenant_id IS NOT NULL);

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_type_chk" CHECK (tolerance_type = ANY (ARRAY['quantity_pct'::text, 'price_pct'::text, 'amount_abs'::text]));

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_value_pos_chk" CHECK (tolerance_value >= 0::numeric);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_duration_pos_chk" CHECK (duration_ms IS NULL OR duration_ms >= 0);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_entity_code_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_error_obj_chk" CHECK (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object'::text);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_error_pair_chk" CHECK (result = 'success'::text OR error_detail IS NOT NULL);

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_result_chk" CHECK (result = ANY (ARRAY['success'::text, 'partial'::text, 'failed'::text]));

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_change_type_chk" CHECK (change_type = ANY (ARRAY['add_field'::text, 'remove_field'::text, 'update_field'::text, 'reorder_fields'::text, 'update_entity_config'::text, 'add_overlay'::text, 'remove_overlay'::text, 'add_flow'::text, 'update_flow'::text, 'publish_flow'::text, 'retire_flow'::text, 'add_flow_step'::text, 'update_flow_step'::text, 'remove_flow_step'::text, 'reorder_flow_steps'::text, 'bind_flow_field'::text, 'update_flow_field'::text, 'unbind_flow_field'::text]));

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_entity_code_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_review_chk" CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL));

ALTER TABLE ONLY "control"."metadata_change_request"
  ADD CONSTRAINT "mcr_status_chk" CHECK (status = ANY (ARRAY['submitted'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'applied'::text]));

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_authority_chk" CHECK (authority = 'keycloak'::text);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_contact_link_chk" CHECK (
CASE method_type
    WHEN 'email'::text THEN contact_link_id IS NOT NULL
    WHEN 'sms'::text THEN contact_link_id IS NOT NULL
    WHEN 'totp'::text THEN contact_link_id IS NULL
    WHEN 'webauthn'::text THEN contact_link_id IS NULL
    WHEN 'backup'::text THEN contact_link_id IS NULL
    ELSE true
END);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_enrolled_at_chk" CHECK (is_enabled = false OR enrolled_at IS NOT NULL);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_primary_requires_active" CHECK (NOT is_primary OR is_enabled AND is_verified);

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_sync_status_chk" CHECK (keycloak_sync_status::text = ANY (ARRAY['pending'::text, 'synced'::text, 'drift'::text, 'error'::text]));

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_verified_at_chk" CHECK (is_verified = false OR verified_at IS NOT NULL);

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_adapter_fmt" CHECK (btrim(adapter_key) <> ''::text);

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_code_fmt" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_health_chk" CHECK (health = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text]));

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "notification_provider_priority_chk" CHECK (priority >= 1);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_channels_chk" CHECK (array_length(channels, 1) >= 1);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_condition_chk" CHECK (condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'::text);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_dedup_chk" CHECK (dedup_window_ms >= 0);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_event_chk" CHECK (btrim(event_type) <> ''::text);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_recipient_chk" CHECK (jsonb_typeof(recipient_rules) = 'object'::text);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_template_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_workflow_phase_chk" CHECK (workflow_phase IS NULL OR (workflow_phase = ANY (ARRAY['in_workflow'::text, 'post_workflow'::text])));

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_body_chk" CHECK (num_nonnulls(body_text, body_html, body_json) >= 1);

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_key_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_locale_chk" CHECK (btrim(locale) <> ''::text);

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]));

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_condition_chk" CHECK (condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'::text);

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_event_nonempty" CHECK (btrim(event_type) <> ''::text);

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_topic_nonempty" CHECK (btrim(topic) <> ''::text);

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_conflict_chk" CHECK (conflict_mode = ANY (ARRAY['fail'::text, 'overwrite'::text, 'merge'::text]));

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_key_chk" CHECK (btrim(overlay_key) <> ''::text);

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_kind_chk" CHECK (kind = ANY (ARRAY['addField'::text, 'removeField'::text, 'modifyField'::text, 'tweakPolicy'::text, 'overrideValidation'::text, 'overrideUi'::text, 'addIndex'::text, 'removeIndex'::text, 'tweakRelation'::text]));

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_order_chk" CHECK (change_order >= 1);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_path_chk" CHECK (btrim(path) <> ''::text);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_remove_no_value_chk" CHECK (kind <> 'removeField'::text OR value IS NULL);

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_value_chk" CHECK (value IS NULL OR jsonb_typeof(value) = 'object'::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_allowed_values_chk" CHECK (allowed_values IS NULL OR jsonb_typeof(allowed_values) = 'array'::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_cache_ttl_chk" CHECK (cache_ttl_seconds >= 0 AND cache_ttl_seconds <= 86400);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_control_chk" CHECK (control_level = ANY (ARRAY['system_controlled'::text, 'tenant_configurable'::text, 'tenant_owned'::text]));

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_name_chk" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_namespace_fmt" CHECK (namespace ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text);

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_owner_chk" CHECK (owner_model = ANY (ARRAY['product'::text, 'tenant'::text]));

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_reload_chk" CHECK (runtime_reload = ANY (ARRAY['immediate'::text, 'next_request'::text, 'next_login'::text, 'restart'::text, 'external_provider'::text]));

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_type_chk" CHECK (data_type = ANY (ARRAY['boolean'::text, 'integer'::text, 'number'::text, 'string'::text, 'enum'::text, 'duration'::text, 'json'::text]));

ALTER TABLE ONLY "control"."parameter_definition"
  ADD CONSTRAINT "parameter_definition_visibility_chk" CHECK (tenant_visibility = ANY (ARRAY['hidden'::text, 'readonly'::text, 'configurable'::text]));

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_amount_chk" CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_amount_nonneg" CHECK ((min_amount IS NULL OR min_amount >= 0::numeric) AND (max_amount IS NULL OR max_amount >= 0::numeric));

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_cutoff_tz_pair_chk" CHECK (cutoff_time_local IS NULL AND timezone_code IS NULL OR cutoff_time_local IS NOT NULL AND timezone_code IS NOT NULL);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_country_upper_chk" CHECK (counterparty_country_code IS NULL OR counterparty_country_code::text = upper(counterparty_country_code::text));

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_currency_upper_chk" CHECK (currency_code IS NULL OR currency_code::text = upper(currency_code::text));

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_book_nonempty" CHECK (btrim(book_code) <> ''::text);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_clearing_nonempty" CHECK (btrim(clearing_posting_role_code) <> ''::text);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_effective_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_settlement_nonempty" CHECK (btrim(settlement_posting_role_code) <> ''::text);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_aggregation_chk" CHECK (aggregation_method = ANY (ARRAY['SUM'::text, 'AVERAGE'::text, 'WEIGHTED_AVG'::text, 'LAST'::text, 'FIRST'::text, 'MIN'::text, 'MAX'::text, 'COUNT'::text]));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_data_type_chk" CHECK (data_type = ANY (ARRAY['NUMERIC'::text, 'INTEGER'::text, 'PERCENTAGE'::text, 'CURRENCY'::text, 'BOOLEAN'::text]));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_derived_input_excl" CHECK (NOT (is_input AND is_derived));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_min_max_chk" CHECK (max_value IS NULL OR min_value IS NULL OR min_value <= max_value);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'draft'::text]));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_time_alloc_chk" CHECK (time_allocation = ANY (ARRAY['PERIOD_END'::text, 'PERIOD_START'::text, 'PERIOD_AVG'::text, 'POINT_IN_TIME'::text]));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_type_chk" CHECK (driver_type = ANY (ARRAY['QUANTITY'::text, 'RATE'::text, 'PERCENTAGE'::text, 'CURRENCY'::text, 'INDEX'::text, 'RATIO'::text, 'HEADCOUNT'::text, 'GROWTH_RATE'::text]));

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "pd_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_growth_method_chk" CHECK (growth_method IS NULL OR (growth_method = ANY (ARRAY['COMPOUND'::text, 'LINEAR'::text, 'STEP'::text, 'SEASONAL'::text, 'CUSTOM'::text])));

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_period_range_chk" CHECK (period_from >= 1 AND period_from <= 16 AND period_to >= 1 AND period_to <= 16 AND period_from <= period_to);

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_source_chk" CHECK (source = ANY (ARRAY['MANUAL'::text, 'HISTORICAL'::text, 'STATISTICAL'::text, 'EXTERNAL'::text, 'MODEL_OUTPUT'::text, 'IMPORTED'::text]));

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "da_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'draft'::text, 'excluded'::text]));

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_decimal_chk" CHECK (decimal_places >= 0 AND decimal_places <= 8);

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_formula_present_chk" CHECK (expression IS NOT NULL OR formula_json IS NOT NULL);

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_rounding_chk" CHECK (rounding_mode = ANY (ARRAY['HALF_UP'::text, 'HALF_DOWN'::text, 'HALF_EVEN'::text, 'CEILING'::text, 'FLOOR'::text, 'TRUNCATE'::text]));

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'draft'::text]));

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_type_chk" CHECK (formula_type = ANY (ARRAY['EXPRESSION'::text, 'LOOKUP_TABLE'::text, 'CONDITIONAL'::text, 'RULE_SET'::text, 'SCRIPT'::text]));

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "pdf_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "control"."planning_driver_version"
  ADD CONSTRAINT "pdv_reason_chk" CHECK (snapshot_reason = ANY (ARRAY['MANUAL'::text, 'APPROVAL'::text, 'PERIOD_CLOSE'::text, 'REFORECAST'::text, 'IMPORT'::text, 'ROLLBACK'::text]));

ALTER TABLE ONLY "control"."planning_driver_version"
  ADD CONSTRAINT "pdv_version_chk" CHECK (version_number >= 1);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_effective_order_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_entity_type_nonempty" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_eval_mode_chk" CHECK (evaluation_mode = ANY (ARRAY['first_match'::text, 'accumulate'::text, 'all'::text]));

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_priority_pos" CHECK (priority > 0);

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_version_pos" CHECK (version_no > 0);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_action_chk" CHECK (action = ANY (ARRAY['allow'::text, 'deny'::text, 'warn'::text, 'require_workflow'::text, 'escalate'::text, 'budget_check'::text]));

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_approvers_chk" CHECK (approvers IS NULL OR jsonb_typeof(approvers) = 'array'::text);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_confidence_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_priority_pos" CHECK (priority > 0);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_score_chk" CHECK (score IS NULL OR score >= 0::numeric AND score <= 1::numeric);

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_sla_pos" CHECK (sla_hours IS NULL OR sla_hours > 0);

ALTER TABLE ONLY "control"."policy_rule_version"
  ADD CONSTRAINT "prv_version_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "control"."policy_rule_version"
  ADD CONSTRAINT "prv_window_chk" CHECK (effective_until IS NULL OR effective_from <= effective_until);

ALTER TABLE ONLY "control"."polymorphic_child_binding"
  ADD CONSTRAINT "pcb_binding_kind_chk" CHECK (binding_kind = ANY (ARRAY['fk'::text, 'polymorphic'::text]));

ALTER TABLE ONLY "control"."polymorphic_child_binding"
  ADD CONSTRAINT "pcb_kind_consistency_chk" CHECK (binding_kind = 'fk'::text AND fk_field IS NOT NULL AND source_doc_type_value IS NULL OR binding_kind = 'polymorphic'::text AND source_doc_type_value IS NOT NULL AND fk_field IS NULL);

ALTER TABLE ONLY "control"."polymorphic_child_binding"
  ADD CONSTRAINT "pcb_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."polymorphic_child_binding"
  ADD CONSTRAINT "pcb_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_dates_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_priority_chk" CHECK (priority >= 0 AND priority <= 1000);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_role_chk" CHECK (posting_role_code ~ '^[a-z][a-z0-9_.]*$'::text);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "posting_role_account_map_version_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_canonical_chk" CHECK (canonical_role_code ~ '^[a-z][a-z0-9_.]*$'::text);

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_code_chk" CHECK (alias_code ~ '^[a-z][a-z0-9_.]*$'::text);

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_country_fmt_chk" CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_currency_fmt_chk" CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."rate_table"
  ADD CONSTRAINT "rate_table_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text, 'archived'::text]));

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_effective_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_json_chk" CHECK (jsonb_typeof(key_values) = 'object'::text AND jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_range_chk" CHECK (range_until IS NULL OR range_from IS NULL OR range_until >= range_from);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_sequence_chk" CHECK (sequence_no >= 1);

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_value_chk" CHECK (rate_value IS NOT NULL OR amount_value IS NOT NULL);

ALTER TABLE ONLY "control"."record_edit_lock"
  ADD CONSTRAINT "rel_expiry_after_acq" CHECK (expires_at > acquired_at);

ALTER TABLE ONLY "control"."record_edit_lock"
  ADD CONSTRAINT "rel_token_nonempty" CHECK (btrim(lock_token) <> ''::text);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_method_chk" CHECK (method = ANY (ARRAY['ROUND_HALF_UP'::text, 'ROUND_HALF_EVEN'::text, 'ROUND_DOWN'::text, 'ROUND_UP'::text]));

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_min_unit_chk" CHECK (minimum_unit IS NULL OR minimum_unit > 0::numeric);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_precision_chk" CHECK (precision_digits IS NULL OR precision_digits >= 0 AND precision_digits <= 6);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_code_chk" CHECK (code ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_contributors_chk" CHECK (jsonb_typeof(contributing_module_codes) = 'array'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_icon_chk" CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_permissions_chk" CHECK (jsonb_typeof(required_permissions) = 'array'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_required_modules_chk" CHECK (jsonb_typeof(required_module_codes) = 'array'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_route_chk" CHECK (route_segment ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_scopes_chk" CHECK (jsonb_typeof(supported_scope_types) = 'array'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_sections_chk" CHECK (jsonb_typeof(sections) = 'array'::text);

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text, 'ARCHIVED'::text]));

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_capabilities_chk" CHECK (jsonb_typeof(capabilities) = 'object'::text);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_code_chk" CHECK (code ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_config_chk" CHECK (jsonb_typeof(config) = 'object'::text);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_route_chk" CHECK (route_slug ~ '^[a-z][a-z0-9-]*$'::text);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_scope_policies_chk" CHECK (jsonb_typeof(scope_policies) = 'array'::text);

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text, 'ARCHIVED'::text]));

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_book_code_nonempty" CHECK (btrim(book_code) <> ''::text);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_posting_role_nonempty" CHECK (btrim(posting_role_code) <> ''::text);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_override_chk" CHECK (rate_override IS NULL OR rate_override >= 0::numeric);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_seq_chk" CHECK (calculation_seq > 0);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_not_self_superseding_chk" CHECK (supersedes_id IS NULL OR supersedes_id <> id);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_version_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_basis_chk" CHECK (calculation_basis = ANY (ARRAY['LINE_NET'::text, 'LINE_GROSS'::text, 'DOCUMENT_NET'::text, 'DOCUMENT_GROSS'::text, 'PAYMENT_AMOUNT'::text]));

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_direction_chk" CHECK (tax_direction = ANY (ARRAY['PURCHASE'::text, 'SALE'::text, 'PAYMENT'::text, 'IMPORT'::text, 'EXPORT'::text, 'BOTH'::text]));

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_rate_chk" CHECK (rate_kind = 'PERCENT'::text AND rate_value >= 0::numeric AND rate_value <= 100::numeric OR (rate_kind = ANY (ARRAY['FIXED'::text, 'PER_UNIT'::text])) AND rate_value >= 0::numeric);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_rate_currency_chk" CHECK (rate_kind = 'PERCENT'::text OR rate_currency IS NOT NULL);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_rate_kind_chk" CHECK (rate_kind = ANY (ARRAY['PERCENT'::text, 'FIXED'::text, 'PER_UNIT'::text]));

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_recover_chk" CHECK (recoverability_mode = ANY (ARRAY['FULL'::text, 'PARTIAL'::text, 'NONE'::text, 'CONDITIONAL'::text]));

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_recover_pct_chk" CHECK (recoverability_mode <> 'PARTIAL'::text OR recoverability_percent IS NOT NULL);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_recover_range" CHECK (recoverability_percent IS NULL OR recoverability_percent >= 0::numeric AND recoverability_percent <= 100::numeric);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_reverse_chk" CHECK (reverse_charge_mode = ANY (ARRAY['NONE'::text, 'SELF_ASSESS'::text, 'FULL'::text]));

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_wht_basis_chk" CHECK (wht_basis IS NULL OR (wht_basis = ANY (ARRAY['GROSS'::text, 'NET_OF_INDIRECT_TAX'::text, 'PAYMENT_ONLY'::text])));

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_entity_codes_nonempty" CHECK (scope_doc_entity_codes IS NULL OR cardinality(scope_doc_entity_codes) >= 1);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_priority_chk" CHECK (priority >= 0 AND priority <= 1000);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_shipto_shipfrom_excl" CHECK (NOT (requires_shipto_shipfrom_match AND requires_shipto_shipfrom_mismatch));

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_status_chk" CHECK (scope_counterparty_tax_status IS NULL OR (scope_counterparty_tax_status = ANY (ARRAY['REGISTERED'::text, 'UNREGISTERED'::text, 'EXEMPT'::text, 'FOREIGN'::text, 'TREATY'::text])));

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_label_nonempty" CHECK (btrim(label) <> ''::text);

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_commitment_chk" CHECK (commitment_action = ANY (ARRAY['NONE'::text, 'CREATE'::text, 'INCREASE'::text, 'RELEASE_PARTIAL'::text, 'RELEASE_FULL'::text, 'CANCEL'::text]));

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_direction_chk" CHECK (direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text, 'BILATERAL'::text]));

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_event_nonempty" CHECK (btrim(event_code) <> ''::text);

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_flow_nonempty" CHECK (btrim(flow_code) <> ''::text);

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_seq_positive" CHECK (event_seq > 0);

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_amount_pos" CHECK (threshold_amount > 0::numeric);

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_effective_order" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_reset_chk" CHECK (reset_period = ANY (ARRAY['fiscal_year'::text, 'calendar_year'::text, 'contract'::text]));

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_section_nonempty" CHECK (section_code IS NULL OR btrim(section_code) <> ''::text);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_effective_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_rules_chk" CHECK (jsonb_typeof(rules) = 'array'::text);

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_chain_chk" CHECK (jsonb_typeof(escalation_chain) = 'array'::text);

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_timers_chk" CHECK (jsonb_typeof(timers) = 'array'::text);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_behaviors_chk" CHECK (jsonb_typeof(behaviors) = 'object'::text);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_hash_fmt_chk" CHECK (compiled_hash IS NULL OR length(compiled_hash) >= 64);

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_version_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_assign_to_chk" CHECK (jsonb_typeof(assign_to) = 'object'::text AND assign_to ? 'type'::text);

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_conditions_chk" CHECK (conditions IS NULL OR jsonb_typeof(conditions) = 'object'::text);

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_priority_chk" CHECK (priority > 0);

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_mode_chk" CHECK (mode = ANY (ARRAY['serial'::text, 'parallel'::text]));

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_quorum_chk" CHECK (quorum IS NULL OR jsonb_typeof(quorum) = 'object'::text AND quorum ? 'strategy'::text AND ((quorum ->> 'strategy'::text) = ANY (ARRAY['count'::text, 'percent'::text, 'unanimous'::text])));

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_stage_no_chk" CHECK (stage_no > 0);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_exact_published_window_excl" EXCLUDE USING gist (entity_id WITH =, operation_code WITH =, tstzrange(effective_from, effective_until, '[)'::text) WITH &&) WHERE (status = 'published'::text AND entity_id IS NOT NULL);

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_published_code_window_excl" EXCLUDE USING gist (canonical_code WITH =, tstzrange(effective_from, effective_until, '[)'::text) WITH &&) WHERE (status = 'published'::text);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "cfca_no_overlap" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, int4range(effective_fiscal_year_from::integer, COALESCE(effective_fiscal_year_to::integer + 1, 32768), '[)'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_no_equal_priority_overlap" EXCLUDE USING gist (tenant_id WITH =, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, transaction_context WITH =, priority WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_company_method_excl" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, payment_method_id WITH =, direction WITH =, COALESCE(currency_code, '***'::character(3)) WITH =, daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_one_default_excl" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, direction WITH =, COALESCE(currency_code, '***'::character(3)) WITH =, daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)'::text) WITH &&) WHERE (is_default = true AND status = 'active'::text);

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_company_method_excl" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, payment_method_id WITH =, direction WITH =, book_code WITH =, daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_no_equal_priority_overlap" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, ledger_book_id WITH =, posting_role_code WITH =, priority WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_profile_role_book_temporal_excl" EXCLUDE USING gist (tenant_id WITH =, supplier_profile_id WITH =, posting_role_code WITH =, book_code WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (is_active = true);

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_active_overlap_excl" EXCLUDE USING gist (tenant_id WITH =, tax_group_id WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_temporal_excl" EXCLUDE USING gist (tenant_id WITH =, jurisdiction_id WITH =, tax_type_id WITH =, tax_direction WITH =, COALESCE(component_code, ''::text) WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (is_active = true);

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_effective_overlap_excl" EXCLUDE USING gist (tenant_id WITH =, jurisdiction_id WITH =, tax_type_id WITH =, COALESCE(section_code, ''::text) WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (is_active = true);

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_book_rule"
  ADD CONSTRAINT "apbr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_commitment_config"
  ADD CONSTRAINT "apcc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_default_tax_group_fk" FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_profile_fk" FOREIGN KEY (accounting_profile_id) REFERENCES master.accounting_profile(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_supersedes_fk" FOREIGN KEY (supersedes_id) REFERENCES control.acct_profile_config(id);

ALTER TABLE ONLY "control"."acct_profile_config"
  ADD CONSTRAINT "apc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_dimtype_fk" FOREIGN KEY (dimension_type_id) REFERENCES master.dimension_type(id);

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_fbval_fk" FOREIGN KEY (fallback_value_id) REFERENCES master.dimension_value(id);

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_fixval_fk" FOREIGN KEY (fixed_value_id) REFERENCES master.dimension_value(id);

ALTER TABLE ONLY "control"."acct_profile_dimension_rule"
  ADD CONSTRAINT "apdr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_event_fk" FOREIGN KEY (profile_event_id, tenant_id) REFERENCES control.acct_profile_event(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_entry_template"
  ADD CONSTRAINT "apet_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_event_code_fk" FOREIGN KEY (event_code) REFERENCES control.transaction_event_catalog(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."acct_profile_event"
  ADD CONSTRAINT "ape_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_paired_fk" FOREIGN KEY (paired_profile_id) REFERENCES master.accounting_profile(id);

ALTER TABLE ONLY "control"."acct_profile_revenue_config"
  ADD CONSTRAINT "aprc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_config_fk" FOREIGN KEY (profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."acct_profile_settlement_config"
  ADD CONSTRAINT "apsc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_override_policy_fk" FOREIGN KEY (override_policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."ai_action_policy"
  ADD CONSTRAINT "aap_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."ai_confidence_threshold"
  ADD CONSTRAINT "act_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_superseded_by_fk" FOREIGN KEY (superseded_by_id) REFERENCES control.ai_drift_baseline(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."ai_drift_baseline"
  ADD CONSTRAINT "adb_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_class_fk" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."asset_class_book_policy"
  ADD CONSTRAINT "acbp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."asset_class_book_policy_template"
  ADD CONSTRAINT "acbpt_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_category_fk" FOREIGN KEY (category_id) REFERENCES shared.auth_permission_category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."auth_permission"
  ADD CONSTRAINT "auth_permission_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."auth_permission_scope_policy"
  ADD CONSTRAINT "auth_permission_scope_policy_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."bank_format_rule"
  ADD CONSTRAINT "bfr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."bank_interface_profile"
  ADD CONSTRAINT "bip_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."blueprint_registry"
  ADD CONSTRAINT "br_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_applied_by_fk" FOREIGN KEY (applied_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_blueprint_fk" FOREIGN KEY (blueprint_code) REFERENCES control.blueprint_registry(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."blueprint_tenant_application"
  ADD CONSTRAINT "tba_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_source_book_fk" FOREIGN KEY (tenant_id, source_book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_target_book_fk" FOREIGN KEY (tenant_id, target_book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "control"."book_posting_rule"
  ADD CONSTRAINT "bpr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_book_fk" FOREIGN KEY (book_id) REFERENCES master.ledger_book(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_override_policy_fk" FOREIGN KEY (override_policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."budget_check_config"
  ADD CONSTRAINT "bcc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_asset_class_fk" FOREIGN KEY (tenant_id, default_asset_class_id) REFERENCES master.asset_class(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_budget_profile_fk" FOREIGN KEY (tenant_id, default_budget_profile_id) REFERENCES master.budget_profile(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_capex_currency_fk" FOREIGN KEY (capex_screening_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_gl_fk" FOREIGN KEY (tenant_id, default_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_intent_fk" FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_tax_group_fk" FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_buy_policy"
  ADD CONSTRAINT "ccbpol_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_cogs_gl_fk" FOREIGN KEY (tenant_id, default_cogs_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_inventory_gl_fk" FOREIGN KEY (tenant_id, default_inventory_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_ppv_gl_fk" FOREIGN KEY (tenant_id, default_price_variance_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_inventory_policy"
  ADD CONSTRAINT "ccipol_wip_gl_fk" FOREIGN KEY (tenant_id, default_wip_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_accounting_profile_fk" FOREIGN KEY (tenant_id, default_accounting_profile_id) REFERENCES master.accounting_profile(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_cogs_profile_fk" FOREIGN KEY (tenant_id, paired_cogs_profile_id) REFERENCES master.accounting_profile(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_defrev_gl_fk" FOREIGN KEY (tenant_id, default_deferred_revenue_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_intent_fk" FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_revenue_gl_fk" FOREIGN KEY (tenant_id, default_revenue_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_tax_group_fk" FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_category_sell_policy"
  ADD CONSTRAINT "ccselpol_unbilled_gl_fk" FOREIGN KEY (tenant_id, default_unbilled_ar_gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."commodity_classification_config"
  ADD CONSTRAINT "clscfg_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_intent_fk" FOREIGN KEY (resolved_intent_id) REFERENCES master.business_intent(id);

ALTER TABLE ONLY "control"."commodity_classification_to_intent_rule"
  ADD CONSTRAINT "cir_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."commodity_code_to_category_rule"
  ADD CONSTRAINT "ccrr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "cfca_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "cfca_config_fk" FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config(tenant_id, id);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "cfca_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."company_fiscal_calendar_assignment"
  ADD CONSTRAINT "cfca_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."content_quota"
  ADD CONSTRAINT "content_quota_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_company_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_depends_type_fk" FOREIGN KEY (depends_on_type_id) REFERENCES master.dimension_type(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_fixed_value_fk" FOREIGN KEY (fixed_value_id) REFERENCES master.dimension_value(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."dimension_policy"
  ADD CONSTRAINT "dp_type_fk" FOREIGN KEY (tenant_id, dimension_type_id) REFERENCES master.dimension_type(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."dimension_policy_allowed_value"
  ADD CONSTRAINT "dpav_policy_fk" FOREIGN KEY (policy_id) REFERENCES control.dimension_policy(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."dimension_policy_allowed_value"
  ADD CONSTRAINT "dpav_value_fk" FOREIGN KEY (dimension_value_id) REFERENCES master.dimension_value(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_class_profile_fk" FOREIGN KEY (entity_class) REFERENCES control.entity_class_profile(class_key) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity"
  ADD CONSTRAINT "entity_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_action_rule"
  ADD CONSTRAINT "ear_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_source_version_fk" FOREIGN KEY (source_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_contract_transition"
  ADD CONSTRAINT "ect_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_enum_domain_fk" FOREIGN KEY (enum_domain_code) REFERENCES control.lookup_domain(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_field"
  ADD CONSTRAINT "ef_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_field_fk" FOREIGN KEY (entity_field_id) REFERENCES control.entity_field(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_surface_fk" FOREIGN KEY (entity_surface_id) REFERENCES control.entity_surface(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_field_surface"
  ADD CONSTRAINT "efsurf_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_flow"
  ADD CONSTRAINT "eflow_supersedes_fk" FOREIGN KEY (supersedes_flow_id) REFERENCES control.entity_flow(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_field_fk" FOREIGN KEY (entity_field_id) REFERENCES control.entity_field(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_flow_field"
  ADD CONSTRAINT "eff_step_fk" FOREIGN KEY (flow_step_id) REFERENCES control.entity_flow_step(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_flow_section"
  ADD CONSTRAINT "efsec_step_fk" FOREIGN KEY (flow_step_id) REFERENCES control.entity_flow_step(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_flow_step"
  ADD CONSTRAINT "efs_flow_fk" FOREIGN KEY (flow_id) REFERENCES control.entity_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_lifecycle"
  ADD CONSTRAINT "el_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_lifecycle_state_mask"
  ADD CONSTRAINT "elsm_lifecycle_state_fk" FOREIGN KEY (lifecycle_state_id) REFERENCES control.lifecycle_state(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_company_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_numbering_config"
  ADD CONSTRAINT "encfg_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_company_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_config_fk" FOREIGN KEY (config_id) REFERENCES control.entity_numbering_config(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_numbering_counter"
  ADD CONSTRAINT "enctr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_entity_v2_fk" FOREIGN KEY (entity_id_v2) REFERENCES control.entity(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_exact_permission_v2_fk" FOREIGN KEY (entity_id_v2, operation_code_v2, permission_id_v2) REFERENCES control.auth_permission(entity_id, operation_code, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE ONLY "control"."entity_operation"
  ADD CONSTRAINT "eo_permission_v2_fk" FOREIGN KEY (permission_id_v2) REFERENCES control.auth_permission(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_policy"
  ADD CONSTRAINT "ep_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_draft_version_fk" FOREIGN KEY (current_draft_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_publish_state"
  ADD CONSTRAINT "eps_published_version_fk" FOREIGN KEY (published_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_relation"
  ADD CONSTRAINT "er_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_operation_fk" FOREIGN KEY (entity_operation_id, permission_id) REFERENCES control.entity_operation(id, permission_id_v2) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_scope_binding"
  ADD CONSTRAINT "entity_scope_binding_policy_fk" FOREIGN KEY (scope_policy_id, permission_id, scope_kind) REFERENCES control.auth_permission_scope_policy(id, permission_id, scope_kind) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_entity_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_parent_surface_fk" FOREIGN KEY (parent_surface_id) REFERENCES control.entity_surface(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_surface"
  ADD CONSTRAINT "es_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_base_version_fk" FOREIGN KEY (base_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_derived_from_fk" FOREIGN KEY (derived_from_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_projected_by_fk" FOREIGN KEY (projected_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_published_by_fk" FOREIGN KEY (published_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_reviewed_by_fk" FOREIGN KEY (reviewed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_submitted_by_fk" FOREIGN KEY (submitted_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_supersedes_fk" FOREIGN KEY (supersedes_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_version"
  ADD CONSTRAINT "ev_validated_by_fk" FOREIGN KEY (validated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."entity_version_contract"
  ADD CONSTRAINT "evc_version_fk" FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."field_group_member"
  ADD CONSTRAINT "fgm_field_fk" FOREIGN KEY (entity_field_id) REFERENCES control.entity_field(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."field_group_member"
  ADD CONSTRAINT "fgm_group_fk" FOREIGN KEY (group_key) REFERENCES control.field_group(group_key) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."field_security_policy"
  ADD CONSTRAINT "fsp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."finance_posting_rollout_policy"
  ADD CONSTRAINT "fprp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fcc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fcc_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_id) REFERENCES control.fiscal_calendar_config(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fcc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."fiscal_calendar_config"
  ADD CONSTRAINT "fcc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fcpr_config_fk" FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fcpr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."fiscal_calendar_period_rule"
  ADD CONSTRAINT "fcpr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_approved_by_fk" FOREIGN KEY (approved_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_locked_by_fk" FOREIGN KEY (locked_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_planning_driver_version_fk" FOREIGN KEY (planning_driver_version_id) REFERENCES control.planning_driver_version(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_superseded_by_fk" FOREIGN KEY (superseded_by_id) REFERENCES control.forecast_budget_bridge(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."forecast_budget_bridge"
  ADD CONSTRAINT "fbb_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fk_fl_allocation" FOREIGN KEY (tenant_id, budget_allocation_id) REFERENCES master.budget_allocation(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fk_fl_commodity_category" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fk_fl_company_code" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "control"."forecast_line"
  ADD CONSTRAINT "fk_fl_scenario" FOREIGN KEY (tenant_id, scenario_id) REFERENCES document.forecast_scenario(tenant_id, id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "control"."formula_expression_version"
  ADD CONSTRAINT "formula_expression_version_formula_fk" FOREIGN KEY (tenant_id, formula_expression_id) REFERENCES control.formula_expression(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_book_fk" FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_pivot_currency_fk" FOREIGN KEY (pivot_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_id) REFERENCES control.fx_policy(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."fx_policy"
  ADD CONSTRAINT "fx_policy_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."hook_action_registry"
  ADD CONSTRAINT "har_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_intent_fk" FOREIGN KEY (intent_id) REFERENCES master.business_intent(id);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_profile_fk" FOREIGN KEY (override_profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id);

ALTER TABLE ONLY "control"."intent_profile_override"
  ADD CONSTRAINT "ipo_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_intent_fk" FOREIGN KEY (intent_id) REFERENCES master.business_intent(id);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_profile_fk" FOREIGN KEY (resolved_profile_config_id, tenant_id) REFERENCES control.acct_profile_config(id, tenant_id);

ALTER TABLE ONLY "control"."intent_to_accounting_profile_rule"
  ADD CONSTRAINT "iprr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle"
  ADD CONSTRAINT "lc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_hook_fk" FOREIGN KEY (target_hook_id) REFERENCES control.lifecycle_transition_hook(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_hook_override"
  ADD CONSTRAINT "lho_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_state"
  ADD CONSTRAINT "ls_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_timer_policy"
  ADD CONSTRAINT "ltp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_from_state_fk" FOREIGN KEY (from_state_id) REFERENCES control.lifecycle_state(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_transition"
  ADD CONSTRAINT "lt_to_state_fk" FOREIGN KEY (to_state_id) REFERENCES control.lifecycle_state(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_policy_rule_fk" FOREIGN KEY (policy_rule_id) REFERENCES control.policy_rule(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_transition_fk" FOREIGN KEY (transition_id) REFERENCES control.lifecycle_transition(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lifecycle_transition_gate"
  ADD CONSTRAINT "ltg_workflow_definition_fk" FOREIGN KEY (workflow_definition_id) REFERENCES control.workflow_definition(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_overlay_fk" FOREIGN KEY (overlay_id) REFERENCES control."overlay"(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."lifecycle_transition_hook"
  ADD CONSTRAINT "lth_transition_fk" FOREIGN KEY (transition_id) REFERENCES control.lifecycle_transition(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_domain_fk" FOREIGN KEY (domain_code) REFERENCES control.lookup_domain(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."lookup_value"
  ADD CONSTRAINT "lookup_value_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."match_tolerance_config"
  ADD CONSTRAINT "mtc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_applied_by_fk" FOREIGN KEY (applied_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_change_request_fk" FOREIGN KEY (change_request_id) REFERENCES control.metadata_change_request(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."metadata_change_application_log"
  ADD CONSTRAINT "mcal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_contact_link_fk" FOREIGN KEY (tenant_id, contact_link_id) REFERENCES master.contact_link(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."mfa_config"
  ADD CONSTRAINT "mfa_config_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."notification_provider"
  ADD CONSTRAINT "nprov_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."notification_routing_rule"
  ADD CONSTRAINT "nrr_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."notification_template"
  ADD CONSTRAINT "ntmpl_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_handler_id_fk" FOREIGN KEY (handler_id) REFERENCES control.hook_action_registry(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."outbox_routing_rule"
  ADD CONSTRAINT "orr_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_entity_fk" FOREIGN KEY (base_entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."overlay"
  ADD CONSTRAINT "ov_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_overlay_fk" FOREIGN KEY (overlay_id) REFERENCES control."overlay"(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."overlay_change"
  ADD CONSTRAINT "oc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_bank_account_link_fk" FOREIGN KEY (tenant_id, bank_account_link_id) REFERENCES master.bank_account_link(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_payment_method_fk" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_company_policy"
  ADD CONSTRAINT "pmcp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_bank_account_link_fk" FOREIGN KEY (tenant_id, bank_account_link_id) REFERENCES master.bank_account_link(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_country_fk" FOREIGN KEY (counterparty_country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_interface_profile_fk" FOREIGN KEY (tenant_id, bank_interface_profile_id) REFERENCES control.bank_interface_profile(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_payment_method_fk" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_method_interface_binding"
  ADD CONSTRAINT "pmib_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_payment_method_fk" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."payment_settlement_rule"
  ADD CONSTRAINT "psr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."planning_driver"
  ADD CONSTRAINT "fk_pd_planning_model" FOREIGN KEY (tenant_id, planning_model_id) REFERENCES master.planning_model(tenant_id, id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "fk_da_company_code" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "fk_da_driver" FOREIGN KEY (driver_id) REFERENCES control.planning_driver(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "control"."planning_driver_assumption"
  ADD CONSTRAINT "fk_da_scenario" FOREIGN KEY (tenant_id, scenario_id) REFERENCES document.forecast_scenario(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "control"."planning_driver_formula"
  ADD CONSTRAINT "fk_pdf_driver" FOREIGN KEY (driver_id) REFERENCES control.planning_driver(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "control"."planning_driver_version"
  ADD CONSTRAINT "fk_pdv_driver" FOREIGN KEY (driver_id) REFERENCES control.planning_driver(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_module_fk" FOREIGN KEY (module_id) REFERENCES shared.module(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."policy_definition"
  ADD CONSTRAINT "pdef_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_budget_check_fk" FOREIGN KEY (budget_check_config_id) REFERENCES control.budget_check_config(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."policy_rule"
  ADD CONSTRAINT "prule_policy_fk" FOREIGN KEY (policy_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."policy_test_case"
  ADD CONSTRAINT "ptc_policy_fk" FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_account_fk" FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_book_fk" FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_id) REFERENCES control.posting_role_account_map(tenant_id, id);

ALTER TABLE ONLY "control"."posting_role_account_map"
  ADD CONSTRAINT "pram_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."posting_role_alias"
  ADD CONSTRAINT "posting_role_alias_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."rate_table_row"
  ADD CONSTRAINT "rate_table_row_table_fk" FOREIGN KEY (tenant_id, rate_table_id) REFERENCES control.rate_table(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."rounding_rule"
  ADD CONSTRAINT "rr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_owner_module_fk" FOREIGN KEY (owner_module_id) REFERENCES shared.module(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."setup_domain"
  ADD CONSTRAINT "setup_domain_workspace_fk" FOREIGN KEY (setup_workspace_id) REFERENCES control.setup_workspace(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."setup_workspace"
  ADD CONSTRAINT "setup_workspace_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES shared.workspace(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_gl_account_fk" FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_profile_fk" FOREIGN KEY (tenant_id, supplier_profile_id) REFERENCES master.company_code_supplier_profile(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."supplier_posting_override"
  ADD CONSTRAINT "spo_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_jurisdiction_fk" FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_rounding_rule_fk" FOREIGN KEY (tenant_id, rounding_rule_id) REFERENCES control.rounding_rule(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_group"
  ADD CONSTRAINT "tg_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_group_fk" FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_schedule_fk" FOREIGN KEY (tenant_id, tax_rate_schedule_id) REFERENCES control.tax_rate_schedule(tenant_id, id);

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."tax_group_component"
  ADD CONSTRAINT "tgc_version_fk" FOREIGN KEY (tenant_id, tax_group_version_id) REFERENCES control.tax_group_version(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_group_fk" FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_rounding_fk" FOREIGN KEY (tenant_id, rounding_rule_id) REFERENCES control.rounding_rule(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_id) REFERENCES control.tax_group_version(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_group_version"
  ADD CONSTRAINT "tgv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_jurisdiction_fk" FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."tax_rate_schedule"
  ADD CONSTRAINT "trs_type_fk" FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_billfrom_jur_fk" FOREIGN KEY (tenant_id, scope_billfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_billto_jur_fk" FOREIGN KEY (tenant_id, scope_billto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_commodity_category_fk" FOREIGN KEY (tenant_id, scope_commodity_category_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_shipfrom_jur_fk" FOREIGN KEY (tenant_id, scope_shipfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_shipto_jur_fk" FOREIGN KEY (tenant_id, scope_shipto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_tax_group_fk" FOREIGN KEY (tenant_id, resolved_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "control"."tax_resolution_rule"
  ADD CONSTRAINT "trr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."transaction_event_catalog"
  ADD CONSTRAINT "tec_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_event_code_fk" FOREIGN KEY (event_code) REFERENCES control.transaction_event_catalog(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."transaction_flow_template"
  ADD CONSTRAINT "tft_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_currency_fk" FOREIGN KEY (threshold_currency) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_jurisdiction_fk" FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_tax_type_fk" FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."wht_threshold_config"
  ADD CONSTRAINT "wtc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."workflow_definition"
  ADD CONSTRAINT "wdef_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."workflow_sla_policy"
  ADD CONSTRAINT "wsla_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_sla_fk" FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."workflow_template"
  ADD CONSTRAINT "wtpl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."workflow_template_rule"
  ADD CONSTRAINT "wtr_template_fk" FOREIGN KEY (workflow_template_id) REFERENCES control.workflow_template(id) ON DELETE CASCADE;

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_sla_fk" FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy(id) ON DELETE SET NULL;

ALTER TABLE ONLY "control"."workflow_template_stage"
  ADD CONSTRAINT "wts_template_fk" FOREIGN KEY (workflow_template_id) REFERENCES control.workflow_template(id) ON DELETE CASCADE;
