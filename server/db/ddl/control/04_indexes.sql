-- ============================================================================
-- control/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX apbr_config_book_active_pidx ON control.acct_profile_book_rule USING btree (profile_config_id, book_code) WHERE is_active = true;

CREATE INDEX apbr_config_idx ON control.acct_profile_book_rule USING btree (profile_config_id);

CREATE INDEX apcc_config_idx ON control.acct_profile_commitment_config USING btree (profile_config_id);

CREATE INDEX apc_active_pidx ON control.acct_profile_config USING btree (tenant_id, direction) WHERE is_active = true;

CREATE INDEX apc_direction_idx ON control.acct_profile_config USING btree (tenant_id, direction);

CREATE INDEX apc_effective_idx ON control.acct_profile_config USING btree (tenant_id, effective_from, effective_to);

CREATE INDEX apc_flow_idx ON control.acct_profile_config USING gin (applicable_flow_codes);

CREATE INDEX apc_profile_idx ON control.acct_profile_config USING btree (accounting_profile_id);

CREATE INDEX apdr_config_idx ON control.acct_profile_dimension_rule USING btree (profile_config_id, dimension_type_id);

CREATE INDEX apdr_priority_idx ON control.acct_profile_dimension_rule USING btree (profile_config_id, priority) WHERE is_active = true;

CREATE INDEX apet_event_idx ON control.acct_profile_entry_template USING btree (profile_event_id);

CREATE INDEX apet_event_seq_active_pidx ON control.acct_profile_entry_template USING btree (profile_event_id, line_seq) WHERE is_active = true;

CREATE INDEX ape_config_event_active_pidx ON control.acct_profile_event USING btree (profile_config_id, event_code) WHERE is_active = true;

CREATE INDEX ape_config_idx ON control.acct_profile_event USING btree (profile_config_id);

CREATE INDEX ape_event_idx ON control.acct_profile_event USING btree (event_code);

CREATE INDEX aprc_config_idx ON control.acct_profile_revenue_config USING btree (profile_config_id);

CREATE INDEX aprc_paired_idx ON control.acct_profile_revenue_config USING btree (paired_profile_id) WHERE paired_profile_id IS NOT NULL;

CREATE INDEX apsc_config_idx ON control.acct_profile_settlement_config USING btree (profile_config_id);

CREATE INDEX aap_tenant_action_idx ON control.ai_action_policy USING btree (tenant_id, action_code, doc_class) WHERE is_active = true;

CREATE INDEX act_tenant_action_idx ON control.ai_confidence_threshold USING btree (tenant_id, action_code, doc_class, model_id) WHERE is_active = true;

CREATE UNIQUE INDEX adb_current_uq ON control.ai_drift_baseline USING btree (tenant_id, action_code, COALESCE(doc_class, ''::text), model_id) WHERE is_current = true;

CREATE INDEX adb_scope_history_idx ON control.ai_drift_baseline USING btree (tenant_id, action_code, model_id, baseline_date DESC);

CREATE INDEX acbp_company_idx ON control.asset_class_book_policy USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX acbp_resolution_idx ON control.asset_class_book_policy USING btree (tenant_id, company_code_id, asset_class_id, book_code, effective_from DESC) WHERE is_active = true;

CREATE INDEX acbpt_global_resolution_idx ON control.asset_class_book_policy_template USING btree (template_code, asset_class_code, book_category, effective_from DESC, priority DESC) WHERE tenant_id IS NULL AND is_active = true;

CREATE INDEX acbpt_template_category_idx ON control.asset_class_book_policy_template USING btree (template_code, book_category) WHERE is_active = true;

CREATE INDEX acbpt_tenant_resolution_idx ON control.asset_class_book_policy_template USING btree (tenant_id, template_code, asset_class_code, book_category, effective_from DESC, priority DESC) WHERE tenant_id IS NOT NULL AND is_active = true;

CREATE INDEX atlas_conversation_retention_active_idx ON control.atlas_conversation_retention_policy USING btree (tenant_id, revision DESC) WHERE status = 'active'::text;

CREATE UNIQUE INDEX atlas_tenant_provider_credential_active_uq ON control.atlas_tenant_provider_credential USING btree (tenant_id, provider_id) WHERE status = 'active'::text;

CREATE INDEX atlas_tenant_provider_credential_rotation_idx ON control.atlas_tenant_provider_credential USING btree (tenant_id, key_version, status);

CREATE UNIQUE INDEX auth_permission_code_idx ON control.auth_permission USING btree (canonical_code, plane_code);

CREATE INDEX auth_permission_entity_operation_idx ON control.auth_permission USING btree (entity_id, operation_code, id) WHERE entity_id IS NOT NULL;

CREATE INDEX auth_permission_plane_code_active_idx ON control.auth_permission USING btree (plane_code, id) WHERE status = 'published'::text;

CREATE INDEX auth_permission_scope_policy_active_idx ON control.auth_permission_scope_policy USING btree (permission_id, scope_kind) WHERE status = 'published'::text;

CREATE UNIQUE INDEX bfr_applicability_uq ON control.bank_format_rule USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), country_code, payment_network, direction, COALESCE(currency_code, '***'::bpchar)) WHERE status = 'active'::text;

CREATE INDEX bfr_resolve_idx ON control.bank_format_rule USING btree (country_code, payment_network, direction, priority DESC) WHERE status = 'active'::text;

CREATE INDEX ix_bip_connection_readiness ON control.bank_interface_profile USING btree (tenant_id, credential_status, last_connection_test_status, status);

CREATE INDEX br_status_active_pidx ON control.blueprint_registry USING btree (category, code) WHERE status = 'active'::text;

CREATE INDEX tba_status_pidx ON control.blueprint_tenant_application USING btree (tenant_id, status) WHERE status <> 'applied'::text;

CREATE INDEX tba_tenant_idx ON control.blueprint_tenant_application USING btree (tenant_id);

CREATE INDEX bpr_active_pidx ON control.book_posting_rule USING btree (tenant_id, company_code_id, source_book_id) WHERE is_active = true;

CREATE INDEX bpr_company_idx ON control.book_posting_rule USING btree (tenant_id, company_code_id);

CREATE INDEX bpr_source_book_idx ON control.book_posting_rule USING btree (tenant_id, source_book_id);

CREATE INDEX bcc_tenant_idx ON control.budget_check_config USING btree (tenant_id);

CREATE UNIQUE INDEX ccbpol_default_scope_uq ON control.commodity_category_buy_policy USING btree (tenant_id, commodity_category_id, company_code_id, scope_type, scope_id) WHERE is_active = true AND scope_type <> 'TENANT'::text AND mapping_mode = 'ALLOW'::text AND is_default = true;

CREATE UNIQUE INDEX ccbpol_default_tenant_uq ON control.commodity_category_buy_policy USING btree (tenant_id, commodity_category_id) WHERE is_active = true AND scope_type = 'TENANT'::text AND mapping_mode = 'ALLOW'::text AND is_default = true;

CREATE INDEX ccbpol_scope_idx ON control.commodity_category_buy_policy USING btree (tenant_id, commodity_category_id, business_intent_id, scope_type, scope_id, effective_from DESC) WHERE is_active = true;

CREATE INDEX ccipol_scope_idx ON control.commodity_category_inventory_policy USING btree (tenant_id, commodity_category_id, scope_type, scope_id, effective_from DESC) WHERE is_active = true;

CREATE UNIQUE INDEX ccselpol_default_scope_uq ON control.commodity_category_sell_policy USING btree (tenant_id, commodity_category_id, company_code_id, scope_type, scope_id) WHERE is_active = true AND scope_type <> 'TENANT'::text AND mapping_mode = 'ALLOW'::text AND is_default = true;

CREATE UNIQUE INDEX ccselpol_default_tenant_uq ON control.commodity_category_sell_policy USING btree (tenant_id, commodity_category_id) WHERE is_active = true AND scope_type = 'TENANT'::text AND mapping_mode = 'ALLOW'::text AND is_default = true;

CREATE INDEX ccselpol_scope_idx ON control.commodity_category_sell_policy USING btree (tenant_id, commodity_category_id, business_intent_id, scope_type, scope_id, effective_from DESC) WHERE is_active = true;

CREATE INDEX cir_class_idx ON control.commodity_classification_to_intent_rule USING btree (classification_source, classification_id);

CREATE INDEX cir_effective_idx ON control.commodity_classification_to_intent_rule USING btree (tenant_id, effective_from, effective_to) WHERE is_active = true;

CREATE INDEX cir_priority_idx ON control.commodity_classification_to_intent_rule USING btree (tenant_id, classification_id, priority) WHERE is_active = true;

CREATE UNIQUE INDEX ccrr_active_priority_uq ON control.commodity_code_to_category_rule USING btree (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true;

CREATE INDEX ccrr_category_idx ON control.commodity_code_to_category_rule USING btree (tenant_id, commodity_category_id);

CREATE INDEX ccrr_domain_range_pidx ON control.commodity_code_to_category_rule USING btree (tenant_id, commodity_domain_code, code_from, code_to) WHERE is_active = true;

CREATE INDEX cfca_company_year_idx ON control.company_fiscal_calendar_assignment USING btree (tenant_id, company_code_id, effective_fiscal_year_from, effective_fiscal_year_to) WHERE status = 'active'::text;

CREATE INDEX cq_tenant_active_idx ON control.content_quota USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX cron_schedule_active_idx ON control.cron_schedule USING btree (is_enabled, effective_from, effective_until) WHERE is_enabled = true;

CREATE INDEX cron_schedule_tenant_idx ON control.cron_schedule USING btree (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX dp_account_class_idx ON control.dimension_policy USING btree (tenant_id, scope_account_class) WHERE scope_account_class IS NOT NULL AND is_active = true;

CREATE INDEX dp_company_idx ON control.dimension_policy USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL AND is_active = true;

CREATE INDEX dp_type_idx ON control.dimension_policy USING btree (tenant_id, dimension_type_id) WHERE is_active = true;

CREATE INDEX dpav_policy_idx ON control.dimension_policy_allowed_value USING btree (policy_id);

CREATE INDEX dpav_value_idx ON control.dimension_policy_allowed_value USING btree (dimension_value_id);

CREATE INDEX ix_dl_active ON control.document_lookup USING btree (lookup_code) WHERE status = 'active'::text;

CREATE INDEX ix_dl_child_entity ON control.document_lookup USING btree (child_entity);

CREATE INDEX entity_code_idx ON control.entity USING btree (entity_code);

CREATE INDEX entity_module_idx ON control.entity USING btree (module_id, entity_class);

CREATE INDEX entity_plane_eligibility_gin ON control.entity USING gin (plane_eligibility);

CREATE INDEX entity_runtime_eligibility_idx ON control.entity USING btree (runtime_enabled, tenant_id, status) WHERE runtime_enabled = true;

CREATE INDEX entity_tenant_class_idx ON control.entity USING btree (tenant_id, entity_class, status) WHERE status = 'ACTIVE'::text;

CREATE INDEX entity_tenant_code_idx ON control.entity USING btree (tenant_id, entity_code);

CREATE INDEX entity_tenant_unprovisioned_pidx ON control.entity USING btree (tenant_id) WHERE ownership_model = 'tenant'::text AND provisioned_at IS NULL;

CREATE UNIQUE INDEX ear_legacy_binding_uq_idx ON control.entity_action_rule USING btree (entity_code, status, action_code) WHERE entity_version_id IS NULL;

CREATE UNIQUE INDEX ear_v2_binding_uq_idx ON control.entity_action_rule USING btree (tenant_id, entity_version_id, status, action_code) NULLS NOT DISTINCT WHERE entity_version_id IS NOT NULL;

CREATE INDEX ix_ear_entity_action ON control.entity_action_rule USING btree (entity_code, action_code);

CREATE INDEX ix_ear_entity_status ON control.entity_action_rule USING btree (entity_code, status);

CREATE UNIQUE INDEX ect_request_key_uq ON control.entity_contract_transition USING btree (entity_id, transition, request_key) WHERE request_key IS NOT NULL;

CREATE INDEX ect_version_timeline_idx ON control.entity_contract_transition USING btree (entity_version_id, occurred_at, id);

CREATE INDEX ef_canonical_idx ON control.entity_field USING btree (origin, name) WHERE entity_version_id IS NULL;

CREATE UNIQUE INDEX ef_canonical_name_uidx ON control.entity_field USING btree (name) WHERE entity_version_id IS NULL;

CREATE INDEX ef_custom_unprov_pidx ON control.entity_field USING btree (tenant_id) WHERE origin = 'business'::text AND provisioned_at IS NULL;

CREATE INDEX ef_filterable_pidx ON control.entity_field USING btree (entity_version_id) WHERE is_filterable = true;

CREATE UNIQUE INDEX ef_primary_amount_uq ON control.entity_field USING btree (entity_version_id) WHERE is_primary_amount = true AND entity_version_id IS NOT NULL;

CREATE UNIQUE INDEX ef_primary_currency_uq ON control.entity_field USING btree (entity_version_id) WHERE is_primary_currency = true AND entity_version_id IS NOT NULL;

CREATE INDEX ef_projection_alias_idx ON control.entity_field USING btree (entity_version_id, projection_alias_of) WHERE projection_alias_of IS NOT NULL;

CREATE INDEX ef_searchable_pidx ON control.entity_field USING btree (entity_version_id) WHERE is_searchable = true;

CREATE UNIQUE INDEX ef_version_name_uidx ON control.entity_field USING btree (entity_version_id, name) WHERE entity_version_id IS NOT NULL;

CREATE INDEX ef_version_sort_idx ON control.entity_field USING btree (entity_version_id, sort_order) WHERE entity_version_id IS NOT NULL;

CREATE INDEX ix_entity_field_defaults ON control.entity_field USING btree (entity_version_id, name) WHERE defaults IS NOT NULL;

CREATE INDEX efsurf_field_idx ON control.entity_field_surface USING btree (entity_field_id);

CREATE INDEX efsurf_surface_order_idx ON control.entity_field_surface USING btree (entity_surface_id, sort_order, entity_field_id);

CREATE INDEX efsurf_tenant_surface_field_idx ON control.entity_field_surface USING btree (tenant_id, entity_surface_id, entity_field_id);

CREATE UNIQUE INDEX eflow_default_per_ctx_uq ON control.entity_flow USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_version_id, trigger_context) WHERE is_default = true AND status = 'active'::text;

COMMENT ON INDEX "control"."eflow_default_per_ctx_uq" IS 'Exactly one active default flow per (tenant, entity_version, trigger_context).';

CREATE INDEX eflow_entity_version_idx ON control.entity_flow USING btree (entity_version_id, status) WHERE status = 'active'::text;

CREATE INDEX eff_field_idx ON control.entity_flow_field USING btree (entity_field_id);

CREATE INDEX eff_mode_step_idx ON control.entity_flow_field USING btree (flow_step_id, mode, sort_order);

CREATE INDEX eff_step_idx ON control.entity_flow_field USING btree (flow_step_id, sort_order);

CREATE INDEX efs_flow_idx ON control.entity_flow_step USING btree (flow_id, sort_order);

CREATE INDEX el_entity_idx ON control.entity_lifecycle USING btree (entity_name, priority);

CREATE UNIQUE INDEX elsm_legacy_binding_uq_idx ON control.entity_lifecycle_state_mask USING btree (tenant_id, entity_name, record_status) NULLS NOT DISTINCT WHERE entity_version_id IS NULL;

CREATE INDEX elsm_lookup_idx ON control.entity_lifecycle_state_mask USING btree (entity_name, record_status, tenant_id);

CREATE UNIQUE INDEX elsm_v2_binding_uq_idx ON control.entity_lifecycle_state_mask USING btree (tenant_id, entity_version_id, lifecycle_state_id) NULLS NOT DISTINCT WHERE entity_version_id IS NOT NULL AND lifecycle_state_id IS NOT NULL;

CREATE INDEX encfg_entity_active_pidx ON control.entity_numbering_config USING btree (entity_id, tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX encfg_tenant_active_pidx ON control.entity_numbering_config USING btree (tenant_id, entity_id) WHERE is_active = true;

CREATE UNIQUE INDEX encfg_v2_binding_uq_idx ON control.entity_numbering_config USING btree (tenant_id, entity_version_id, company_code_id, number_field) NULLS NOT DISTINCT WHERE entity_version_id IS NOT NULL;

CREATE INDEX enctr_company_idx ON control.entity_numbering_counter USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX enctr_config_idx ON control.entity_numbering_counter USING btree (config_id);

CREATE INDEX entity_operation_v2_exact_permission_idx ON control.entity_operation USING btree (entity_id_v2, operation_code_v2, permission_id_v2) WHERE v2_publication_status IS NOT NULL;

CREATE INDEX eo_entity_surface_idx ON control.entity_operation USING btree (entity_name, surface, placement) WHERE is_enabled = true;

CREATE UNIQUE INDEX eo_v2_binding_uq_idx ON control.entity_operation USING btree (tenant_id, entity_version_id, permission_code) NULLS NOT DISTINCT WHERE entity_version_id IS NOT NULL;

CREATE INDEX ep_eval_order_pidx ON control.entity_policy USING btree (tenant_id, field_scope_eval_order) WHERE field_scope_eval_order <> 'row_first'::text;

CREATE INDEX eps_precedence_idx ON control.entity_publish_state USING btree (applied_precedence DESC) WHERE source_layer <> 'platform'::text;

CREATE INDEX eps_source_layer_idx ON control.entity_publish_state USING btree (source_layer, source_ref) WHERE source_layer <> 'platform'::text;

CREATE INDEX entity_scope_binding_published_idx ON control.entity_scope_binding USING btree (plane_code, entity_id, entity_operation_id, permission_id) WHERE status = 'published'::text;

CREATE INDEX es_active_pidx ON control.entity_surface USING btree (entity_id, mode, placement, sort_order) WHERE is_enabled = true;

CREATE INDEX es_entity_kind_idx ON control.entity_surface USING btree (entity_id, kind) WHERE is_enabled = true;

CREATE INDEX es_entity_mode_order_idx ON control.entity_surface USING btree (entity_id, mode, sort_order, surface_key);

CREATE UNIQUE INDEX es_legacy_binding_uq_idx ON control.entity_surface USING btree (tenant_id, entity_id, mode, surface_key) NULLS NOT DISTINCT WHERE entity_version_id IS NULL;

CREATE INDEX es_parent_slot_idx ON control.entity_surface USING btree (parent_surface_id, slot_key, sort_order) WHERE parent_surface_id IS NOT NULL AND is_enabled = true;

CREATE INDEX es_tenant_entity_mode_key_idx ON control.entity_surface USING btree (tenant_id, entity_id, mode, surface_key);

CREATE UNIQUE INDEX es_v2_binding_uq_idx ON control.entity_surface USING btree (tenant_id, entity_version_id, v2_mode, surface_key) NULLS NOT DISTINCT WHERE entity_version_id IS NOT NULL;

CREATE INDEX ev_contract_hash_idx ON control.entity_version USING btree (contract_hash) WHERE contract_hash IS NOT NULL;

CREATE INDEX ev_entity_status_idx ON control.entity_version USING btree (entity_id, status, version_no DESC);

CREATE UNIQUE INDEX ev_one_open_work_version_uq ON control.entity_version USING btree (tenant_id, entity_id) NULLS NOT DISTINCT WHERE status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text]);

CREATE UNIQUE INDEX ev_single_draft_uidx ON control.entity_version USING btree (entity_id) WHERE is_working_copy = true;

CREATE UNIQUE INDEX ev_single_effective_uidx ON control.entity_version USING btree (entity_id) WHERE status = 'EFFECTIVE'::text;

CREATE INDEX evc_execution_status_idx ON control.entity_version_contract USING btree (api_exposure, read_capability, write_capability);

CREATE INDEX evc_physical_binding_idx ON control.entity_version_contract USING btree (table_schema, table_name);

CREATE INDEX ff_flag_type_idx ON control.feature_flag USING btree (flag_type) WHERE is_enabled = true;

CREATE INDEX ix_fprp_resolve ON control.finance_posting_rollout_policy USING btree (tenant_id, company_code_id, effective_from DESC) WHERE status = 'active'::text;

CREATE INDEX fcc_tenant_status_idx ON control.fiscal_calendar_config USING btree (tenant_id, status, code, version_no DESC);

CREATE INDEX fcpr_config_order_idx ON control.fiscal_calendar_period_rule USING btree (tenant_id, fiscal_calendar_config_id, sequence_no) WHERE status = 'active'::text;

CREATE INDEX fbb_driver_version_idx ON control.forecast_budget_bridge USING btree (planning_driver_version_id) WHERE planning_driver_version_id IS NOT NULL;

CREATE INDEX fbb_tenant_year_status_idx ON control.forecast_budget_bridge USING btree (tenant_id, fiscal_year, status);

CREATE INDEX idx_fl_account ON control.forecast_line USING btree (gl_account_id, fiscal_year) WHERE gl_account_id IS NOT NULL;

CREATE INDEX idx_fl_allocation ON control.forecast_line USING btree (budget_allocation_id) WHERE budget_allocation_id IS NOT NULL;

CREATE INDEX idx_fl_commodity_category ON control.forecast_line USING btree (tenant_id, commodity_category_id, fiscal_year) WHERE commodity_category_id IS NOT NULL;

CREATE INDEX idx_fl_company_code ON control.forecast_line USING btree (company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX idx_fl_cost_center ON control.forecast_line USING btree (cost_center_id) WHERE cost_center_id IS NOT NULL;

CREATE INDEX idx_fl_driver ON control.forecast_line USING btree (driver_id) WHERE driver_id IS NOT NULL;

CREATE INDEX idx_fl_scenario ON control.forecast_line USING btree (scenario_id);

CREATE INDEX formula_expression_tenant_status_idx ON control.formula_expression USING btree (tenant_id, status, code);

CREATE INDEX formula_expression_version_effective_idx ON control.formula_expression_version USING btree (tenant_id, formula_expression_id, effective_from DESC) WHERE status = 'effective'::text;

CREATE UNIQUE INDEX formula_expression_version_one_effective_uq ON control.formula_expression_version USING btree (tenant_id, formula_expression_id) WHERE status = 'effective'::text;

CREATE INDEX ix_fx_policy_resolution ON control.fx_policy USING btree (tenant_id, transaction_context, company_code_id, ledger_book_id, effective_from, priority DESC) WHERE status = 'active'::text;

CREATE UNIQUE INDEX ux_fx_policy_active_scope_version ON control.fx_policy USING btree (tenant_id, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid), transaction_context, effective_from, priority, version_no) WHERE status = ANY (ARRAY['draft'::text, 'active'::text]);

CREATE INDEX iidem_expires_idx ON control.intake_idempotency USING btree (expires_at);

CREATE INDEX ipo_active_pidx ON control.intent_profile_override USING btree (tenant_id, intent_id) WHERE is_active = true;

CREATE INDEX ipo_intent_idx ON control.intent_profile_override USING btree (intent_id);

CREATE INDEX iprr_active_pidx ON control.intent_to_accounting_profile_rule USING btree (tenant_id, priority) WHERE is_active = true;

CREATE INDEX iprr_effective_idx ON control.intent_to_accounting_profile_rule USING btree (tenant_id, effective_from, effective_to) WHERE is_active = true;

CREATE INDEX iprr_intent_idx ON control.intent_to_accounting_profile_rule USING btree (tenant_id, intent_id, priority) WHERE is_active = true;

CREATE INDEX lc_stale_pidx ON control.lifecycle USING btree (id) WHERE definition_hash IS NULL AND is_active = true;

CREATE INDEX lc_tenant_active_idx ON control.lifecycle USING btree (tenant_id, is_active) WHERE is_active = true;

CREATE INDEX lho_tenant_active_idx ON control.lifecycle_hook_override USING btree (tenant_id, is_active) WHERE is_active = true;

CREATE INDEX ls_lifecycle_idx ON control.lifecycle_state USING btree (lifecycle_id, sort_order);

CREATE UNIQUE INDEX ls_single_initial_uidx ON control.lifecycle_state USING btree (lifecycle_id) WHERE is_initial = true;

CREATE INDEX lt_from_active_idx ON control.lifecycle_transition USING btree (lifecycle_id, from_state_id) WHERE is_active = true;

CREATE INDEX lt_to_idx ON control.lifecycle_transition USING btree (lifecycle_id, to_state_id);

CREATE INDEX lte_failed_idx ON control.lifecycle_transition_execution USING btree (tenant_id, executed_at DESC) WHERE status = 'failed'::text;

CREATE INDEX lte_in_progress_idx ON control.lifecycle_transition_execution USING btree (executed_at) WHERE status = 'in_progress'::text;

CREATE INDEX lte_principal_recent_idx ON control.lifecycle_transition_execution USING btree (tenant_id, principal_id, executed_at DESC) WHERE principal_id IS NOT NULL;

CREATE INDEX lte_source_doc_idx ON control.lifecycle_transition_execution USING btree (tenant_id, source_doc_type, source_doc_id, executed_at DESC);

CREATE INDEX ltg_policy_rule_pidx ON control.lifecycle_transition_gate USING btree (policy_rule_id) WHERE resolves_via = 'policy'::text AND policy_rule_id IS NOT NULL;

CREATE INDEX lth_required_pidx ON control.lifecycle_transition_hook USING btree (transition_id) WHERE safety_level = 'required'::text AND is_active = true;

CREATE INDEX lth_transition_exec_idx ON control.lifecycle_transition_hook USING btree (transition_id, timing, sort_order) WHERE is_active = true;

CREATE INDEX lookup_domain_active_pidx ON control.lookup_domain USING btree (code) WHERE status = 'active'::text;

CREATE INDEX lookup_value_domain_idx ON control.lookup_value USING btree (domain_code);

CREATE UNIQUE INDEX lookup_value_global_uq ON control.lookup_value USING btree (domain_code, code) WHERE tenant_id IS NULL;

CREATE INDEX lookup_value_tenant_idx ON control.lookup_value USING btree (tenant_id, domain_code) WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX lookup_value_tenant_uq ON control.lookup_value USING btree (tenant_id, domain_code, code) WHERE tenant_id IS NOT NULL;

CREATE INDEX lookup_value_validation_idx ON control.lookup_value USING btree (domain_code, code) WHERE status = 'active'::text;

CREATE INDEX mtc_resolution_idx ON control.match_tolerance_config USING btree (entity_name, match_type, tolerance_type, tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX mcal_change_request_idx ON control.metadata_change_application_log USING btree (change_request_id, applied_at DESC);

CREATE INDEX mcal_compiler_run_idx ON control.metadata_change_application_log USING btree (compiler_run_id) WHERE compiler_run_id IS NOT NULL;

CREATE INDEX mcal_failed_idx ON control.metadata_change_application_log USING btree (tenant_id, applied_at DESC) WHERE result <> 'success'::text;

CREATE INDEX mfa_config_contact_link_idx ON control.mfa_config USING btree (tenant_id, contact_link_id) WHERE contact_link_id IS NOT NULL;

CREATE INDEX mfa_config_principal_idx ON control.mfa_config USING btree (tenant_id, principal_id);

CREATE INDEX mfa_config_sync_drift_pidx ON control.mfa_config USING btree (tenant_id) WHERE keycloak_sync_status::text = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE UNIQUE INDEX ux_mfa_config_one_primary ON control.mfa_config USING btree (tenant_id, principal_id) WHERE is_primary = true AND is_enabled = true AND is_verified = true;

CREATE INDEX nprov_channel_active_idx ON control.notification_provider USING btree (channel, priority) WHERE is_enabled = true;

CREATE INDEX nprov_health_pidx ON control.notification_provider USING btree (health) WHERE health = ANY (ARRAY['degraded'::text, 'down'::text]);

CREATE INDEX nrr_condition_gin ON control.notification_routing_rule USING gin (condition_expr) WHERE condition_expr IS NOT NULL;

CREATE INDEX nrr_entity_type_pidx ON control.notification_routing_rule USING btree (event_type, entity_type) WHERE entity_type IS NOT NULL AND is_enabled = true;

CREATE INDEX nrr_event_active_idx ON control.notification_routing_rule USING btree (event_type, sort_order) WHERE is_enabled = true;

CREATE INDEX nrr_phase_event_idx ON control.notification_routing_rule USING btree (workflow_phase, event_type) WHERE is_enabled = true;

CREATE INDEX nrr_tenant_idx ON control.notification_routing_rule USING btree (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX ntmpl_key_channel_locale_idx ON control.notification_template USING btree (template_key, channel, locale) WHERE status = 'active'::text;

CREATE INDEX ntmpl_tenant_key_idx ON control.notification_template USING btree (tenant_id, template_key, channel, locale) WHERE tenant_id IS NOT NULL AND status = 'active'::text;

CREATE INDEX orr_event_type_idx ON control.outbox_routing_rule USING btree (event_type, sort_order) WHERE is_enabled = true;

CREATE INDEX orr_tenant_event_idx ON control.outbox_routing_rule USING btree (tenant_id, event_type) WHERE is_enabled = true;

CREATE INDEX ov_tenant_active_idx ON control."overlay" USING btree (tenant_id, base_entity_id, priority) WHERE is_active = true;

CREATE INDEX oc_overlay_ordered_idx ON control.overlay_change USING btree (overlay_id, change_order);

CREATE INDEX parameter_definition_namespace_idx ON control.parameter_definition USING btree (namespace, sort_order, code) WHERE status = 'active'::text;

CREATE INDEX parameter_definition_visibility_idx ON control.parameter_definition USING btree (tenant_visibility, control_level) WHERE status = 'active'::text;

CREATE INDEX ix_pmcp_company_readiness ON control.payment_method_company_policy USING btree (tenant_id, company_code_id, direction, effective_from DESC, priority DESC) WHERE status = 'active'::text;

CREATE INDEX pmcp_default_pidx ON control.payment_method_company_policy USING btree (tenant_id, company_code_id, direction) WHERE is_default = true AND status = 'active'::text;

CREATE INDEX ix_pmib_deterministic_resolution ON control.payment_method_interface_binding USING btree (tenant_id, payment_method_id, direction, effective_from DESC, priority DESC, id) WHERE status = 'active'::text;

CREATE INDEX pmib_company_idx ON control.payment_method_interface_binding USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX pmib_resolve_idx ON control.payment_method_interface_binding USING btree (tenant_id, payment_method_id, direction, priority DESC) WHERE status = 'active'::text;

CREATE INDEX ix_psr_company_readiness ON control.payment_settlement_rule USING btree (tenant_id, company_code_id, payment_method_id, direction, book_code, effective_from DESC) WHERE status = 'active'::text;

CREATE INDEX idx_pd_model ON control.planning_driver USING btree (planning_model_id);

CREATE INDEX idx_pd_status ON control.planning_driver USING btree (planning_model_id, status) WHERE status = 'active'::text;

CREATE INDEX idx_pd_tenant ON control.planning_driver USING btree (tenant_id);

CREATE INDEX idx_da_active ON control.planning_driver_assumption USING btree (driver_id, status) WHERE status = 'active'::text;

CREATE INDEX idx_da_company_code ON control.planning_driver_assumption USING btree (company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX idx_da_driver ON control.planning_driver_assumption USING btree (driver_id);

CREATE INDEX idx_da_fiscal ON control.planning_driver_assumption USING btree (driver_id, fiscal_year);

CREATE INDEX idx_da_scenario ON control.planning_driver_assumption USING btree (scenario_id) WHERE scenario_id IS NOT NULL;

CREATE INDEX idx_pdf_active ON control.planning_driver_formula USING btree (driver_id, status) WHERE status = 'active'::text;

CREATE INDEX idx_pdf_driver ON control.planning_driver_formula USING btree (driver_id);

CREATE INDEX idx_pdf_effective ON control.planning_driver_formula USING btree (driver_id, effective_from, effective_to);

CREATE INDEX idx_pdv_driver ON control.planning_driver_version USING btree (driver_id);

CREATE INDEX pdef_effective_idx ON control.policy_definition USING btree (tenant_id, entity_type, effective_from, effective_until);

CREATE INDEX pdef_global_entity_active_pidx ON control.policy_definition USING btree (entity_type, priority) WHERE tenant_id IS NULL AND is_active = true;

CREATE INDEX pdef_module_idx ON control.policy_definition USING btree (module_id) WHERE module_id IS NOT NULL;

CREATE INDEX pdef_tenant_entity_active_idx ON control.policy_definition USING btree (tenant_id, entity_type, priority) WHERE is_active = true;

CREATE INDEX prule_bcc_idx ON control.policy_rule USING btree (budget_check_config_id) WHERE budget_check_config_id IS NOT NULL;

CREATE INDEX prule_policy_priority_idx ON control.policy_rule USING btree (policy_id, priority);

CREATE INDEX prv_policy_id_idx ON control.policy_rule_version USING btree (policy_id, published_at DESC);

CREATE INDEX prv_rule_id_idx ON control.policy_rule_version USING btree (policy_rule_id, version_no DESC);

CREATE INDEX ptc_policy_idx ON control.policy_test_case USING btree (tenant_id, policy_definition_id, is_active);

CREATE INDEX ix_pcb_active ON control.polymorphic_child_binding USING btree (binding_code) WHERE status = 'active'::text;

CREATE INDEX ix_pcb_parent_child ON control.polymorphic_child_binding USING btree (parent_entity_code, child_entity_code);

CREATE INDEX pram_account_idx ON control.posting_role_account_map USING btree (tenant_id, gl_account_id);

CREATE INDEX pram_book_idx ON control.posting_role_account_map USING btree (tenant_id, company_code_id, ledger_book_id);

CREATE INDEX pram_resolution_idx ON control.posting_role_account_map USING btree (tenant_id, company_code_id, ledger_book_id, posting_role_code, priority DESC, effective_from DESC) WHERE status = 'active'::text;

CREATE UNIQUE INDEX posting_role_alias_global_uq ON control.posting_role_alias USING btree (alias_code, COALESCE(source_domain_code, ''::text)) WHERE tenant_id IS NULL;

CREATE INDEX posting_role_alias_resolution_idx ON control.posting_role_alias USING btree (alias_code, tenant_id) WHERE status = 'active'::text;

CREATE UNIQUE INDEX posting_role_alias_tenant_uq ON control.posting_role_alias USING btree (tenant_id, alias_code, COALESCE(source_domain_code, ''::text)) WHERE tenant_id IS NOT NULL;

CREATE INDEX rate_table_tenant_status_idx ON control.rate_table USING btree (tenant_id, status, code);

CREATE INDEX rate_table_row_lookup_idx ON control.rate_table_row USING btree (tenant_id, rate_table_id, effective_from DESC, sequence_no);

CREATE INDEX idx_rel_expires_at ON control.record_edit_lock USING btree (expires_at);

CREATE INDEX idx_rel_tenant_entity ON control.record_edit_lock USING btree (tenant_id, aggregate_entity_name);

CREATE INDEX setup_domain_contributors_gin_idx ON control.setup_domain USING gin (contributing_module_codes);

CREATE INDEX setup_domain_owner_module_idx ON control.setup_domain USING btree (owner_module_id) WHERE is_active = true;

CREATE INDEX setup_domain_scopes_gin_idx ON control.setup_domain USING gin (supported_scope_types);

CREATE INDEX setup_domain_workspace_order_idx ON control.setup_domain USING btree (setup_workspace_id, sort_order) WHERE is_active = true;

CREATE INDEX spo_profile_effective_pidx ON control.supplier_posting_override USING btree (tenant_id, supplier_profile_id, effective_from) WHERE is_active = true;

CREATE INDEX spo_profile_idx ON control.supplier_posting_override USING btree (tenant_id, supplier_profile_id);

CREATE INDEX spo_role_idx ON control.supplier_posting_override USING btree (tenant_id, posting_role_code);

CREATE INDEX ix_tax_group_rounding_rule ON control.tax_group USING btree (tenant_id, rounding_rule_id) WHERE rounding_rule_id IS NOT NULL;

CREATE INDEX tg_jurisdiction_pidx ON control.tax_group USING btree (tenant_id, jurisdiction_id) WHERE is_active = true AND jurisdiction_id IS NOT NULL;

CREATE INDEX ix_tgc_version_order ON control.tax_group_component USING btree (tenant_id, tax_group_version_id, calculation_seq) WHERE status::text = 'active'::text;

CREATE UNIQUE INDEX ux_tgc_active_version_rate ON control.tax_group_component USING btree (tenant_id, tax_group_id, COALESCE(tax_group_version_id, '00000000-0000-0000-0000-000000000000'::uuid), tax_rate_schedule_id) WHERE status::text = 'active'::text;

CREATE UNIQUE INDEX ux_tgc_active_version_seq ON control.tax_group_component USING btree (tenant_id, tax_group_id, COALESCE(tax_group_version_id, '00000000-0000-0000-0000-000000000000'::uuid), calculation_seq) WHERE status::text = 'active'::text;

CREATE INDEX ix_tgv_effective ON control.tax_group_version USING btree (tenant_id, tax_group_id, effective_from DESC) WHERE status = 'active'::text;

CREATE INDEX trs_direction_pidx ON control.tax_rate_schedule USING btree (tenant_id, tax_direction) WHERE is_active = true;

CREATE INDEX trs_jurisdiction_idx ON control.tax_rate_schedule USING btree (tenant_id, jurisdiction_id, tax_type_id) WHERE is_active = true;

CREATE INDEX trs_wht_pidx ON control.tax_rate_schedule USING btree (tenant_id, jurisdiction_id) WHERE wht_basis IS NOT NULL AND is_active = true;

CREATE INDEX trr_entity_codes_pidx ON control.tax_resolution_rule USING gin (scope_doc_entity_codes) WHERE is_active = true;

CREATE INDEX trr_group_pidx ON control.tax_resolution_rule USING btree (tenant_id, resolved_tax_group_id) WHERE is_active = true;

CREATE INDEX trr_resolution_pidx ON control.tax_resolution_rule USING btree (tenant_id, scope_shipto_jurisdiction_id, priority DESC) WHERE is_active = true;

CREATE INDEX tec_active_code_pidx ON control.transaction_event_catalog USING btree (code) WHERE is_active = true;

CREATE INDEX tft_flow_active_pidx ON control.transaction_flow_template USING btree (flow_code, direction, event_seq) WHERE is_active = true;

CREATE UNIQUE INDEX tft_flow_event_uq ON control.transaction_flow_template USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), flow_code, event_code);

CREATE INDEX ix_wtc_resolution ON control.wht_threshold_config USING btree (tenant_id, jurisdiction_id, tax_type_id, effective_from DESC) WHERE is_active = true;

CREATE INDEX wtc_jurisdiction_active_pidx ON control.wht_threshold_config USING btree (tenant_id, jurisdiction_id, tax_type_id) WHERE is_active = true;

CREATE UNIQUE INDEX wdef_active_open_uidx ON control.workflow_definition USING btree (tenant_id, entity_type) WHERE is_active = true AND effective_to IS NULL;

CREATE INDEX wdef_entity_active_idx ON control.workflow_definition USING btree (tenant_id, entity_type) WHERE is_active = true;

CREATE INDEX wtpl_stale_pidx ON control.workflow_template USING btree (id) WHERE compiled_hash IS NULL AND is_active = true;

CREATE INDEX wtpl_tenant_active_idx ON control.workflow_template USING btree (tenant_id, is_active) WHERE is_active = true;

CREATE INDEX wtr_template_stage_idx ON control.workflow_template_rule USING btree (workflow_template_id, stage_no, priority);

CREATE INDEX wts_template_ordered_idx ON control.workflow_template_stage USING btree (workflow_template_id, stage_no);
