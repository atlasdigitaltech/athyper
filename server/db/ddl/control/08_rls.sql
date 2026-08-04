-- ============================================================================
-- control/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "control"."acct_profile_book_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_book_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_commitment_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_commitment_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_dimension_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_dimension_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_entry_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_entry_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_event" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_event" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_revenue_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_revenue_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_settlement_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."acct_profile_settlement_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_action_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_action_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_confidence_threshold" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_confidence_threshold" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_drift_baseline" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."ai_drift_baseline" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."asset_class_book_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."asset_class_book_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."asset_class_book_policy_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."asset_class_book_policy_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_conversation_retention_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_conversation_retention_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_tenant_provider_credential" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_tenant_provider_credential" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_tenant_provider_credential_epoch" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."atlas_tenant_provider_credential_epoch" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_entitlement_target_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_entitlement_target_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_permission" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_permission" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_permission_scope_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."auth_permission_scope_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."bank_format_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."bank_format_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."bank_interface_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."bank_interface_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."blueprint_registry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."blueprint_registry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."blueprint_tenant_application" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."blueprint_tenant_application" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."book_posting_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."book_posting_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."budget_check_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."budget_check_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_buy_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_buy_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_inventory_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_inventory_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_sell_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_category_sell_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_classification_to_intent_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."commodity_classification_to_intent_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."company_fiscal_calendar_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."company_fiscal_calendar_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."content_quota" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."content_quota" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_action_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_action_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_contract_transition" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_contract_transition" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_field" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_field" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_field_surface" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_field_surface" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_field" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_field" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_section" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_section" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_step" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_flow_step" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_lifecycle" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_lifecycle" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_lifecycle_state_mask" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_lifecycle_state_mask" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_numbering_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_numbering_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_numbering_counter" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_numbering_counter" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_operation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_operation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_publish_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_publish_state" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_relation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_relation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_scope_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_scope_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_surface" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_surface" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_version_contract" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."entity_version_contract" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_group" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_group" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_group_member" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_group_member" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_security_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."field_security_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."finance_posting_rollout_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."finance_posting_rollout_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."fiscal_calendar_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."fiscal_calendar_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."fiscal_calendar_period_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."fiscal_calendar_period_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."forecast_budget_bridge" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."forecast_budget_bridge" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."formula_expression" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."formula_expression" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."formula_expression_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."formula_expression_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."fx_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."fx_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."hook_action_registry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."hook_action_registry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."intent_profile_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."intent_profile_override" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."intent_to_accounting_profile_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."intent_to_accounting_profile_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_hook_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_hook_override" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_state" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_timer_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_timer_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_execution" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_execution" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_gate" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_gate" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_hook" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lifecycle_transition_hook" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lookup_domain" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lookup_domain" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."lookup_value" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."lookup_value" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."metadata_change_application_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."metadata_change_application_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."mfa_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."mfa_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_provider" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_provider" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_routing_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_routing_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."notification_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."outbox_routing_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."outbox_routing_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."overlay" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."overlay" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."overlay_change" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."overlay_change" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_method_company_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_method_company_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_method_interface_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_method_interface_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_settlement_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."payment_settlement_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."posting_role_account_map" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."posting_role_account_map" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."posting_role_alias" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."posting_role_alias" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."rate_table" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."rate_table" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."rate_table_row" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."rate_table_row" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."record_edit_lock" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."record_edit_lock" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."setup_domain" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."setup_domain" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."setup_workspace" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."setup_workspace" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."supplier_posting_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."supplier_posting_override" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."tax_group_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."tax_group_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."tax_resolution_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."tax_resolution_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."transaction_event_catalog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."transaction_event_catalog" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."transaction_flow_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."transaction_flow_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."wht_threshold_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."wht_threshold_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_definition" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_definition" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_sla_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_sla_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template_stage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "control"."workflow_template_stage" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_book_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_commitment_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_dimension_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_entry_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_event"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_revenue_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."acct_profile_settlement_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."ai_action_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."ai_action_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."ai_action_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."ai_drift_baseline"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."ai_drift_baseline"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."ai_drift_baseline"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."asset_class_book_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."asset_class_book_policy_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scoped_read" ON "control"."asset_class_book_policy_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_delete" ON "control"."asset_class_book_policy_template"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."asset_class_book_policy_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "control"."asset_class_book_policy_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "atlas_byok_tenant_scope" ON "control"."atlas_tenant_provider_credential"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "atlas_byok_epoch_tenant_scope" ON "control"."atlas_tenant_provider_credential_epoch"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "authorization_v2_admin" ON "control"."auth_entitlement_target_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v2_runtime_read" ON "control"."auth_entitlement_target_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (true);

CREATE POLICY "authorization_v2_admin" ON "control"."auth_permission"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v2_runtime_read" ON "control"."auth_permission"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (true);

CREATE POLICY "authorization_v2_admin" ON "control"."auth_permission_scope_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v2_runtime_read" ON "control"."auth_permission_scope_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (true);

CREATE POLICY "admin_read" ON "control"."bank_format_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."bank_format_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."bank_format_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."bank_format_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."bank_format_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."bank_interface_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."bank_interface_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."bank_interface_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."bank_interface_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."bank_interface_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."blueprint_registry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "open_read" ON "control"."blueprint_registry"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_write" ON "control"."blueprint_tenant_application"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scoped_read" ON "control"."blueprint_tenant_application"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."book_posting_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."budget_check_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."budget_check_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."budget_check_config"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())
  WITH CHECK (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."commodity_category_buy_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."commodity_category_inventory_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."commodity_category_sell_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."commodity_classification_to_intent_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."company_fiscal_calendar_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."content_quota"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."content_quota"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."content_quota"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."content_quota"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."content_quota"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."content_quota"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."entity"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "m1_admin_all" ON "control"."entity_action_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_action_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_action_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_action_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_action_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m3_admin_all" ON "control"."entity_contract_transition"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m3_scoped_read" ON "control"."entity_contract_transition"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m3_tenant_write" ON "control"."entity_contract_transition"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."entity_field"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_field"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_field"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_field"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_field"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."entity_field_surface"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_field_surface"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_field_surface"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_field_surface"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_field_surface"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "m1_admin_all" ON "control"."entity_flow"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_flow"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_flow"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_flow"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_flow"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_admin_all" ON "control"."entity_flow_field"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_flow_field"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_flow_field"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_flow_field"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_flow_field"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_admin_all" ON "control"."entity_flow_section"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_flow_section"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_flow_section"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_flow_section"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_flow_section"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_admin_all" ON "control"."entity_flow_step"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_flow_step"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_flow_step"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_flow_step"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_flow_step"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."entity_lifecycle"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_lifecycle"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_lifecycle"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_lifecycle"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_lifecycle"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "m1_admin_all" ON "control"."entity_lifecycle_state_mask"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_lifecycle_state_mask"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_lifecycle_state_mask"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_lifecycle_state_mask"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_lifecycle_state_mask"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_admin_all" ON "control"."entity_numbering_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_numbering_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_numbering_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_numbering_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_numbering_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_admin_all" ON "control"."entity_numbering_counter"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m1_scoped_read" ON "control"."entity_numbering_counter"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m1_tenant_delete" ON "control"."entity_numbering_counter"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_insert" ON "control"."entity_numbering_counter"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "m1_tenant_update" ON "control"."entity_numbering_counter"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."entity_operation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_operation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_operation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_operation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_operation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."entity_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."entity_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."entity_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."entity_publish_state"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_publish_state"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_publish_state"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_publish_state"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_publish_state"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."entity_relation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_relation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_relation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_relation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_relation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "authorization_v2_admin" ON "control"."entity_scope_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v2_runtime_read" ON "control"."entity_scope_binding"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (true);

CREATE POLICY "admin_read" ON "control"."entity_surface"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_surface"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_surface"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_surface"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_surface"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."entity_version"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."entity_version_contract"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."entity_version_contract"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."entity_version_contract"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "control"."entity_version_contract"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."entity_version_contract"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "control"."field_group"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_read_fg" ON "control"."field_group"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."field_group"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_write_fg" ON "control"."field_group"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_read_fg" ON "control"."field_group"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_read" ON "control"."field_group_member"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_read_fgm" ON "control"."field_group_member"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."field_group_member"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_write_fgm" ON "control"."field_group_member"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_read_fgm" ON "control"."field_group_member"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_read" ON "control"."field_security_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."field_security_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."field_security_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."field_security_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."field_security_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "control"."finance_posting_rollout_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."fiscal_calendar_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."fiscal_calendar_period_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."forecast_budget_bridge"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."forecast_budget_bridge"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."forecast_budget_bridge"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."formula_expression"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."formula_expression_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."fx_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."fx_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."fx_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."fx_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."fx_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."hook_action_registry"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."hook_action_registry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."hook_action_registry"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."hook_action_registry"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."hook_action_registry"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."intent_profile_override"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."intent_profile_override"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."intent_profile_override"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."intent_profile_override"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."intent_profile_override"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (status = ANY (ARRAY['pending_approval'::text, 'inactive'::text])))
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."intent_to_accounting_profile_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_hook_override"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_hook_override"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_hook_override"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_hook_override"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."lifecycle_hook_override"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_state"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_state"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_state"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_state"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle_state"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_timer_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_timer_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_timer_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_timer_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle_timer_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_transition"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_transition"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_transition"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_transition"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle_transition"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."lifecycle_transition_execution"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_transition_execution"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_transition_execution"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."lifecycle_transition_execution"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_transition_gate"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_transition_gate"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_transition_gate"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_transition_gate"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle_transition_gate"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."lifecycle_transition_hook"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."lifecycle_transition_hook"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."lifecycle_transition_hook"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."lifecycle_transition_hook"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."lifecycle_transition_hook"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."lookup_domain"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "open_read" ON "control"."lookup_domain"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_write" ON "control"."lookup_value"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scoped_read" ON "control"."lookup_value"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."lookup_value"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false)
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "tenant_write" ON "control"."lookup_value"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."metadata_change_application_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."metadata_change_application_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."metadata_change_application_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."mfa_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."notification_provider"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."notification_provider"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."notification_provider"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_read" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."notification_routing_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."notification_template"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."notification_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."notification_template"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."notification_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."notification_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."notification_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."outbox_routing_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scoped_read" ON "control"."outbox_routing_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "control"."overlay"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."overlay"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."overlay"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."overlay"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."overlay"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."overlay_change"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."overlay_change"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."overlay_change"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."overlay_change"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."overlay_change"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."payment_method_company_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."payment_method_interface_binding"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."payment_method_interface_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."payment_method_interface_binding"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."payment_method_interface_binding"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."payment_method_interface_binding"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."payment_settlement_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."payment_settlement_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."payment_settlement_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."payment_settlement_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."payment_settlement_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "pram_admin" ON "control"."posting_role_account_map"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "pram_delete" ON "control"."posting_role_account_map"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "pram_insert" ON "control"."posting_role_account_map"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "pram_read" ON "control"."posting_role_account_map"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "pram_update" ON "control"."posting_role_account_map"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "posting_role_alias_admin" ON "control"."posting_role_alias"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "posting_role_alias_delete" ON "control"."posting_role_alias"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "posting_role_alias_insert" ON "control"."posting_role_alias"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "posting_role_alias_read" ON "control"."posting_role_alias"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "posting_role_alias_update" ON "control"."posting_role_alias"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."rate_table"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."rate_table"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."rate_table"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."rate_table"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."rate_table"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."rate_table"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."rate_table_row"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."record_edit_lock"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."record_edit_lock"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."record_edit_lock"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "control"."record_edit_lock"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_write" ON "control"."record_edit_lock"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."setup_domain"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "platform_read" ON "control"."setup_domain"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_write" ON "control"."setup_workspace"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "platform_read" ON "control"."setup_workspace"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_read" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."supplier_posting_override"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "control"."tax_group_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."tax_resolution_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."tax_resolution_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."tax_resolution_rule"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())
  WITH CHECK (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_write" ON "control"."transaction_event_catalog"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "open_read" ON "control"."transaction_event_catalog"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_write" ON "control"."transaction_flow_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scoped_read" ON "control"."transaction_flow_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_insert" ON "control"."transaction_flow_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "control"."transaction_flow_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "control"."wht_threshold_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "control"."wht_threshold_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "control"."wht_threshold_config"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())
  WITH CHECK (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "control"."workflow_definition"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."workflow_definition"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."workflow_definition"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."workflow_definition"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."workflow_definition"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."workflow_sla_policy"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."workflow_sla_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."workflow_sla_policy"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."workflow_sla_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."workflow_sla_policy"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."workflow_template"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."workflow_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."workflow_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."workflow_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."workflow_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."workflow_template_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."workflow_template_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."workflow_template_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."workflow_template_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."workflow_template_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "control"."workflow_template_stage"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "control"."workflow_template_stage"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "control"."workflow_template_stage"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "control"."workflow_template_stage"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "control"."workflow_template_stage"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT EXECUTE ON FUNCTION "control".canonical_posting_role_code(p_tenant_id uuid, p_role_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".canonical_posting_role_code(p_tenant_id uuid, p_role_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".fiscal_calendar_year_start(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "control".fiscal_calendar_year_start(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".fiscal_calendar_year_start(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".fn_valid_lookup(p_domain_code text, p_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".fn_valid_lookup(p_domain_code text, p_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".fn_valid_lookup_nullable(p_domain_code text, p_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".fn_valid_lookup_nullable(p_domain_code text, p_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".generate_fiscal_periods(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer, p_actor_id uuid, p_calendar_config_id uuid, p_replace_future boolean) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".generate_fiscal_periods(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer, p_actor_id uuid, p_calendar_config_id uuid, p_replace_future boolean) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".preview_fiscal_calendar(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "control".preview_fiscal_calendar(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".preview_fiscal_calendar(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".resolve_admin_permission_entitlement(p_permission_id uuid, p_at timestamp with time zone) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_bank_format_rule(p_tenant_id uuid, p_country_code character, p_payment_network text, p_direction text, p_currency_code character) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_bank_format_rule(p_tenant_id uuid, p_country_code character, p_payment_network text, p_direction text, p_currency_code character) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".resolve_bank_interface(p_tenant_id uuid, p_payment_method_id uuid, p_direction text, p_company_code_id uuid, p_bank_account_link_id uuid, p_currency_code character, p_counterparty_country_code character, p_payment_network text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_bank_interface(p_tenant_id uuid, p_payment_method_id uuid, p_direction text, p_company_code_id uuid, p_bank_account_link_id uuid, p_currency_code character, p_counterparty_country_code character, p_payment_network text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".resolve_company_fiscal_calendar(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "control".resolve_company_fiscal_calendar(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_company_fiscal_calendar(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".resolve_posting_role_account(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_posting_role_account(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date) TO athyperapp;

GRANT EXECUTE ON FUNCTION "control".resolve_posting_role_account_trace(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "control".resolve_posting_role_account_trace(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date) TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_book_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_book_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_commitment_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_commitment_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_dimension_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_dimension_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_entry_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_entry_template" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_event" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_event" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_revenue_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_revenue_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."acct_profile_settlement_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."acct_profile_settlement_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."ai_action_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_action_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT INSERT ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."ai_confidence_threshold" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_confidence_threshold" TO athyperapp;

GRANT DELETE ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT INSERT ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."ai_drift_baseline" TO athyperadmin;

GRANT SELECT ON TABLE "control"."ai_drift_baseline" TO athyperapp;

GRANT DELETE ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."asset_class_book_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."asset_class_book_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT INSERT ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."asset_class_book_policy_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."asset_class_book_policy_template" TO athyperapp;

GRANT DELETE ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."atlas_conversation_retention_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT INSERT ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT SELECT ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT INSERT ON TABLE "control"."atlas_tenant_provider_credential" TO athyperapp;

GRANT SELECT ON TABLE "control"."atlas_tenant_provider_credential" TO athyperapp;

GRANT UPDATE ON TABLE "control"."atlas_tenant_provider_credential" TO athyperapp;

GRANT DELETE ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT INSERT ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT SELECT ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT INSERT ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT SELECT ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT UPDATE ON TABLE "control"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT DELETE ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."auth_entitlement_target_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_entitlement_target_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT INSERT ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."auth_permission" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_permission" TO athyperapp;

GRANT DELETE ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."auth_permission_scope_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."auth_permission_scope_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."bank_format_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."bank_format_rule" TO athyperapp;

GRANT SELECT ON TABLE "control"."bank_format_rule" TO athyperapp;

GRANT UPDATE ON TABLE "control"."bank_format_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT INSERT ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT SELECT ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."bank_interface_profile" TO athyperadmin;

GRANT INSERT ON TABLE "control"."bank_interface_profile" TO athyperapp;

GRANT SELECT ON TABLE "control"."bank_interface_profile" TO athyperapp;

GRANT UPDATE ON TABLE "control"."bank_interface_profile" TO athyperapp;

GRANT DELETE ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT INSERT ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT SELECT ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."blueprint_registry" TO athyperadmin;

GRANT SELECT ON TABLE "control"."blueprint_registry" TO athyperapp;

GRANT DELETE ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT INSERT ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT SELECT ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."blueprint_tenant_application" TO athyperadmin;

GRANT SELECT ON TABLE "control"."blueprint_tenant_application" TO athyperapp;

GRANT DELETE ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."book_posting_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."book_posting_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."budget_check_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."budget_check_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_category_buy_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_buy_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_category_inventory_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_inventory_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_category_sell_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_category_sell_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_classification_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_classification_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_classification_to_intent_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."commodity_code_to_category_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."commodity_code_to_category_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperadmin;

GRANT DELETE ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperapp;

GRANT INSERT ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperapp;

GRANT SELECT ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperapp;

GRANT UPDATE ON TABLE "control"."company_fiscal_calendar_assignment" TO athyperapp;

GRANT DELETE ON TABLE "control"."connector_type" TO athyperadmin;

GRANT INSERT ON TABLE "control"."connector_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."connector_type" TO athyperadmin;

GRANT SELECT ON TABLE "control"."connector_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."connector_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."connector_type" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."connector_type" TO athyperadmin;

GRANT SELECT ON TABLE "control"."connector_type" TO athyperapp;

GRANT DELETE ON TABLE "control"."content_quota" TO athyperadmin;

GRANT INSERT ON TABLE "control"."content_quota" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."content_quota" TO athyperadmin;

GRANT SELECT ON TABLE "control"."content_quota" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."content_quota" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."content_quota" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."content_quota" TO athyperadmin;

GRANT SELECT ON TABLE "control"."content_quota" TO athyperapp;

GRANT DELETE ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."cron_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."cron_schedule" TO athyperapp;

GRANT DELETE ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."dimension_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."dimension_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT INSERT ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT SELECT ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."dimension_policy_allowed_value" TO athyperadmin;

GRANT SELECT ON TABLE "control"."dimension_policy_allowed_value" TO athyperapp;

GRANT DELETE ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT INSERT ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT SELECT ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."document_lookup" TO athyperadmin;

GRANT SELECT ON TABLE "control"."document_lookup" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_action_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_action_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_class_profile" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_class_profile" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_contract_transition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_contract_transition" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_field" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_field" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_field" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_field" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_field" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_field" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_field" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_field" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_field_surface" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_field_surface" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_flow" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_flow_field" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_field" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_flow_section" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_section" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_flow_step" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_flow_step" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_lifecycle" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_lifecycle" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_lifecycle_state_mask" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_lifecycle_state_mask" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_numbering_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_numbering_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_numbering_counter" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_numbering_counter" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_operation" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_operation" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_publish_state" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_publish_state" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_relation" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_relation" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_scope_binding" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_scope_binding" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_surface" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_surface" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_version" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_version" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_version" TO athyperapp;

GRANT DELETE ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT INSERT ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."entity_version_contract" TO athyperadmin;

GRANT SELECT ON TABLE "control"."entity_version_contract" TO athyperapp;

GRANT DELETE ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT INSERT ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT SELECT ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."feature_flag" TO athyperadmin;

GRANT SELECT ON TABLE "control"."feature_flag" TO athyperapp;

GRANT DELETE ON TABLE "control"."field_group" TO athyperadmin;

GRANT INSERT ON TABLE "control"."field_group" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."field_group" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_group" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."field_group" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."field_group" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."field_group" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_group" TO athyperapp;

GRANT DELETE ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT INSERT ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."field_group_member" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_group_member" TO athyperapp;

GRANT DELETE ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."field_security_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."field_security_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."finance_posting_rollout_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."finance_posting_rollout_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."fiscal_calendar_config" TO athyperadmin;

GRANT DELETE ON TABLE "control"."fiscal_calendar_config" TO athyperapp;

GRANT INSERT ON TABLE "control"."fiscal_calendar_config" TO athyperapp;

GRANT SELECT ON TABLE "control"."fiscal_calendar_config" TO athyperapp;

GRANT UPDATE ON TABLE "control"."fiscal_calendar_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."fiscal_calendar_period_rule" TO athyperadmin;

GRANT DELETE ON TABLE "control"."fiscal_calendar_period_rule" TO athyperapp;

GRANT INSERT ON TABLE "control"."fiscal_calendar_period_rule" TO athyperapp;

GRANT SELECT ON TABLE "control"."fiscal_calendar_period_rule" TO athyperapp;

GRANT UPDATE ON TABLE "control"."fiscal_calendar_period_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT INSERT ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT SELECT ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."forecast_budget_bridge" TO athyperadmin;

GRANT SELECT ON TABLE "control"."forecast_budget_bridge" TO athyperapp;

GRANT DELETE ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT INSERT ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT SELECT ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."forecast_line" TO athyperadmin;

GRANT SELECT ON TABLE "control"."forecast_line" TO athyperapp;

GRANT DELETE ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT INSERT ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT SELECT ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."formula_expression" TO athyperadmin;

GRANT SELECT ON TABLE "control"."formula_expression" TO athyperapp;

GRANT DELETE ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT INSERT ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."formula_expression_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."formula_expression_version" TO athyperapp;

GRANT DELETE ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."fx_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."fx_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT INSERT ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT SELECT ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."hook_action_registry" TO athyperadmin;

GRANT SELECT ON TABLE "control"."hook_action_registry" TO athyperapp;

GRANT DELETE ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT INSERT ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."intake_idempotency" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intake_idempotency" TO athyperapp;

GRANT DELETE ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT INSERT ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."intent_profile_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intent_profile_override" TO athyperapp;

GRANT DELETE ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."intent_to_accounting_profile_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_hook_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_hook_override" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_state" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_state" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_timer_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_timer_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_transition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_transition_execution" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_execution" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_transition_gate" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_gate" TO athyperapp;

GRANT DELETE ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lifecycle_transition_hook" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lifecycle_transition_hook" TO athyperapp;

GRANT DELETE ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lookup_domain" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lookup_domain" TO athyperapp;

GRANT DELETE ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT INSERT ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT SELECT ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."lookup_value" TO athyperadmin;

GRANT DELETE ON TABLE "control"."lookup_value" TO athyperapp;

GRANT INSERT ON TABLE "control"."lookup_value" TO athyperapp;

GRANT SELECT ON TABLE "control"."lookup_value" TO athyperapp;

GRANT UPDATE ON TABLE "control"."lookup_value" TO athyperapp;

GRANT DELETE ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."match_tolerance_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."match_tolerance_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT INSERT ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT SELECT ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."metadata_change_application_log" TO athyperadmin;

GRANT SELECT ON TABLE "control"."metadata_change_application_log" TO athyperapp;

GRANT DELETE ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT INSERT ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT SELECT ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."metadata_change_request" TO athyperadmin;

GRANT SELECT ON TABLE "control"."metadata_change_request" TO athyperapp;

GRANT DELETE ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."mfa_config" TO athyperadmin;

GRANT DELETE ON TABLE "control"."mfa_config" TO athyperapp;

GRANT INSERT ON TABLE "control"."mfa_config" TO athyperapp;

GRANT SELECT ON TABLE "control"."mfa_config" TO athyperapp;

GRANT UPDATE ON TABLE "control"."mfa_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT INSERT ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."notification_provider" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_provider" TO athyperapp;

GRANT DELETE ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."notification_routing_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_routing_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."notification_template" TO athyperadmin;

GRANT INSERT ON TABLE "control"."notification_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."notification_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."notification_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."notification_template" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."notification_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."notification_template" TO athyperapp;

GRANT DELETE ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."outbox_routing_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."outbox_routing_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."overlay" TO athyperadmin;

GRANT INSERT ON TABLE "control"."overlay" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."overlay" TO athyperadmin;

GRANT SELECT ON TABLE "control"."overlay" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."overlay" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."overlay" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."overlay" TO athyperadmin;

GRANT SELECT ON TABLE "control"."overlay" TO athyperapp;

GRANT DELETE ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT INSERT ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT SELECT ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."overlay_change" TO athyperadmin;

GRANT SELECT ON TABLE "control"."overlay_change" TO athyperapp;

GRANT DELETE ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT INSERT ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."parameter_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."parameter_definition" TO athyperapp;

GRANT DELETE ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."payment_method_company_policy" TO athyperadmin;

GRANT DELETE ON TABLE "control"."payment_method_company_policy" TO athyperapp;

GRANT INSERT ON TABLE "control"."payment_method_company_policy" TO athyperapp;

GRANT SELECT ON TABLE "control"."payment_method_company_policy" TO athyperapp;

GRANT UPDATE ON TABLE "control"."payment_method_company_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT INSERT ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT SELECT ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."payment_method_interface_binding" TO athyperadmin;

GRANT INSERT ON TABLE "control"."payment_method_interface_binding" TO athyperapp;

GRANT SELECT ON TABLE "control"."payment_method_interface_binding" TO athyperapp;

GRANT UPDATE ON TABLE "control"."payment_method_interface_binding" TO athyperapp;

GRANT DELETE ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."payment_settlement_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."payment_settlement_rule" TO athyperapp;

GRANT SELECT ON TABLE "control"."payment_settlement_rule" TO athyperapp;

GRANT UPDATE ON TABLE "control"."payment_settlement_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT INSERT ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."planning_driver" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver" TO athyperapp;

GRANT DELETE ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT INSERT ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."planning_driver_assumption" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_assumption" TO athyperapp;

GRANT DELETE ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT INSERT ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."planning_driver_formula" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_formula" TO athyperapp;

GRANT DELETE ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT INSERT ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."planning_driver_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."planning_driver_version" TO athyperapp;

GRANT DELETE ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT INSERT ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."policy_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_definition" TO athyperapp;

GRANT DELETE ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."policy_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT INSERT ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."policy_rule_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_rule_version" TO athyperapp;

GRANT DELETE ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT INSERT ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."policy_test_case" TO athyperadmin;

GRANT SELECT ON TABLE "control"."policy_test_case" TO athyperapp;

GRANT DELETE ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT INSERT ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT SELECT ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."polymorphic_child_binding" TO athyperadmin;

GRANT SELECT ON TABLE "control"."polymorphic_child_binding" TO athyperapp;

GRANT DELETE ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT INSERT ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT SELECT ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."posting_role_account_map" TO athyperadmin;

GRANT DELETE ON TABLE "control"."posting_role_account_map" TO athyperapp;

GRANT INSERT ON TABLE "control"."posting_role_account_map" TO athyperapp;

GRANT SELECT ON TABLE "control"."posting_role_account_map" TO athyperapp;

GRANT UPDATE ON TABLE "control"."posting_role_account_map" TO athyperapp;

GRANT DELETE ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT INSERT ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT SELECT ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."posting_role_alias" TO athyperadmin;

GRANT DELETE ON TABLE "control"."posting_role_alias" TO athyperapp;

GRANT INSERT ON TABLE "control"."posting_role_alias" TO athyperapp;

GRANT SELECT ON TABLE "control"."posting_role_alias" TO athyperapp;

GRANT UPDATE ON TABLE "control"."posting_role_alias" TO athyperapp;

GRANT DELETE ON TABLE "control"."rate_table" TO athyperadmin;

GRANT INSERT ON TABLE "control"."rate_table" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."rate_table" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rate_table" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."rate_table" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."rate_table" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."rate_table" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rate_table" TO athyperapp;

GRANT DELETE ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT INSERT ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."rate_table_row" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rate_table_row" TO athyperapp;

GRANT DELETE ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT INSERT ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT SELECT ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."record_edit_lock" TO athyperadmin;

GRANT SELECT ON TABLE "control"."record_edit_lock" TO athyperapp;

GRANT DELETE ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."rounding_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."rounding_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT INSERT ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT SELECT ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."setup_domain" TO athyperadmin;

GRANT SELECT ON TABLE "control"."setup_domain" TO athyperapp;

GRANT DELETE ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT INSERT ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT SELECT ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."setup_workspace" TO athyperadmin;

GRANT SELECT ON TABLE "control"."setup_workspace" TO athyperapp;

GRANT DELETE ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT INSERT ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."supplier_posting_override" TO athyperadmin;

GRANT SELECT ON TABLE "control"."supplier_posting_override" TO athyperapp;

GRANT DELETE ON TABLE "control"."tax_group" TO athyperadmin;

GRANT INSERT ON TABLE "control"."tax_group" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."tax_group" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."tax_group" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."tax_group" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."tax_group" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group" TO athyperapp;

GRANT DELETE ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT INSERT ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."tax_group_component" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group_component" TO athyperapp;

GRANT DELETE ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT INSERT ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."tax_group_version" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_group_version" TO athyperapp;

GRANT DELETE ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."tax_rate_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_rate_schedule" TO athyperapp;

GRANT DELETE ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."tax_resolution_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."tax_resolution_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT INSERT ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT SELECT ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."transaction_event_catalog" TO athyperadmin;

GRANT SELECT ON TABLE "control"."transaction_event_catalog" TO athyperapp;

GRANT DELETE ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT INSERT ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."transaction_flow_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."transaction_flow_template" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_acct_profile_full" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_acct_profile_full" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_active_flow_templates" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_active_flow_templates" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_authorization_v2_deferred_constraints" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_authorization_v2_operation_publication" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_blueprint_catalogue" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_blueprint_catalogue" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_entity_field_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_field_contract_audit" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_entity_field_rule_coverage" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_field_rule_coverage" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_entity_surface_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_entity_surface_contract_audit" TO athyperapp;

GRANT DELETE ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT INSERT ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."v_meta_entity_contract_audit" TO athyperadmin;

GRANT SELECT ON TABLE "control"."v_meta_entity_contract_audit" TO athyperapp;

GRANT DELETE ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT INSERT ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."wht_threshold_config" TO athyperadmin;

GRANT SELECT ON TABLE "control"."wht_threshold_config" TO athyperapp;

GRANT DELETE ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT INSERT ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."workflow_definition" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_definition" TO athyperapp;

GRANT DELETE ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT INSERT ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."workflow_sla_policy" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_sla_policy" TO athyperapp;

GRANT DELETE ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT INSERT ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."workflow_template" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template" TO athyperapp;

GRANT DELETE ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT INSERT ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."workflow_template_rule" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template_rule" TO athyperapp;

GRANT DELETE ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT INSERT ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT REFERENCES ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT TRIGGER ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT TRUNCATE ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT UPDATE ON TABLE "control"."workflow_template_stage" TO athyperadmin;

GRANT SELECT ON TABLE "control"."workflow_template_stage" TO athyperapp;
