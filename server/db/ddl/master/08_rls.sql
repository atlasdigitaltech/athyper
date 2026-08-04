-- ============================================================================
-- master/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "master"."accounting_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."address" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."address" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."address_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."address_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_assignment_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_assignment_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_book" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_book" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_class" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_class" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_component" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."asset_component" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_chunk" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_chunk" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_revision" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_revision" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_source" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_knowledge_source" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_message" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_message" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_support_session" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_support_session" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_support_session_audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_support_session_audit" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_thread" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."atlas_thread" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."attachment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."attachment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."attachment_comment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."attachment_comment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_delegation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_delegation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_delegation_grant" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_delegation_grant" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_deny_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_deny_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group_member" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group_member" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group_role" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_group_role" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_override" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_plane_membership" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_plane_membership" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_record_acl" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_record_acl" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_role" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_role" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_role_permission" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_role_permission" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_scope_target" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."auth_scope_target" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account_house_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account_house_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_account_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_party" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."bank_party" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."brand_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."brand_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."business_partner" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."business_partner" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."business_partner_network_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."business_partner_network_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."career_band" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."career_band" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."career_level" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."career_level" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."chart_of_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."chart_of_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_draft" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_draft" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_feed_cursor" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_feed_cursor" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_mention" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_mention" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_reaction" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."comment_reaction" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."commodity_category" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."commodity_category" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."commodity_classification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."commodity_classification" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_book_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_book_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_chart_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_chart_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_customer_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_customer_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_gl_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_gl_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_supplier_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."company_code_supplier_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."condition_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."condition_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_email" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_email" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_phone" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."contact_phone" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."content_item" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."content_item" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."conversation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."conversation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."conversation_participant" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."conversation_participant" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."cost_center" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."cost_center" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer_app_index" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer_app_index" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer_qualification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."customer_qualification" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."dashboard" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."dashboard" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."dashboard_widget" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."dashboard_widget" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."designation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."designation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."dimension_set" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."dimension_set" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."document" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."document" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee_leave_enrollment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee_leave_enrollment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee_statutory_enrollment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."employee_statutory_enrollment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."employment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."employment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."entity_document_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."entity_document_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."external_reference" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."external_reference" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."filter_preset" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."filter_preset" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."fiscal_period" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."fiscal_period" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."fx_rate" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."fx_rate" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."gl_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."gl_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."intercompany_trading_pair" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."intercompany_trading_pair" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."item" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."item" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."job" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."job" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."job_family" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."job_family" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."job_function" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."job_function" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."label" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."label" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."label_entity_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."label_entity_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_plan" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_plan" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_plan_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_plan_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."leave_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."ledger_book" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."ledger_book" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_business_partner_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_business_partner_link" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_identity_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_identity_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_network_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."legal_entity_network_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."letterhead" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."letterhead" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."lifecycle_instance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."lifecycle_instance" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."multipart_upload" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."multipart_upload" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."notification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."notification" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."operating_organization" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."operating_organization" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."operating_organization_company" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."operating_organization_company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."org_unit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."org_unit" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."organization_tax_registration" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."organization_tax_registration" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."owner_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."owner_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_contact_person" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_contact_person" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_contact_role" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_contact_role" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_assessment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_assessment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_dimension_score" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_dimension_score" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_driver" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_driver" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_evidence" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_evidence" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_mitigation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_mitigation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_review_event" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."party_risk_review_event" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_component" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_component" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_grade" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_grade" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_group" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_group" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_structure" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_structure" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_structure_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."pay_structure_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."payment_method" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."payment_method" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."person" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."person" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."person_sensitive_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."person_sensitive_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."position" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."position" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_identity_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_identity_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_relationship" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_relationship" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_ui_preference" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_ui_preference" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_ui_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."principal_ui_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."procurement_organization_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."procurement_organization_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."product" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."product" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."profit_center" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."profit_center" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."project" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."project" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."project_item" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."project_item" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."record_bookmark" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."record_bookmark" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."sales_organization_profile" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."sales_organization_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."saved_view" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."saved_view" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."shift_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."shift_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."site" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."site" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."statutory_scheme" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."statutory_scheme" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier_app_index" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier_app_index" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier_qualification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."supplier_qualification" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."team" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."team" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."team_member" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."team_member" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."template_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."template_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant_relationship" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant_relationship" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant_risk_source_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."tenant_risk_source_config" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."warehouse" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."warehouse" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_pattern" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_pattern" FORCE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_pattern_day" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "master"."work_pattern_day" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ap_tenant_isolation" ON "master"."accounting_profile"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id'::text, true)::uuid);

CREATE POLICY "admin_read" ON "master"."address"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."address"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."address"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."address"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."address"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."address"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."address_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."address_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."address_link"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."address_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."address_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."address_link"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."asset"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."asset"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."asset"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."asset"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."asset"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."asset"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."asset_assignment_history"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."asset_book"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."asset_book"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."asset_book"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."asset_book"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."asset_book"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."asset_book"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."asset_class"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."asset_class"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."asset_class"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."asset_class"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."asset_class"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."asset_class"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."asset_component"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."asset_component"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."asset_component"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."asset_component"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."asset_component"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."asset_component"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "master"."atlas_knowledge_chunk"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."atlas_knowledge_chunk"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "master"."atlas_knowledge_revision"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."atlas_knowledge_revision"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "master"."atlas_knowledge_source"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."atlas_knowledge_source"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."atlas_message"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."atlas_message"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."atlas_message"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "master"."atlas_message"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "master"."atlas_message"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "atlas_support_origin_session" ON "master"."atlas_support_session"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (origin_tenant_id = shared.current_tenant_id() AND origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text)
  WITH CHECK (origin_tenant_id = shared.current_tenant_id() AND origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND plane = 'admin'::text AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text);

CREATE POLICY "atlas_support_origin_audit" ON "master"."atlas_support_session_audit"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK ((EXISTS ( SELECT 1
   FROM master.atlas_support_session s
  WHERE s.id = atlas_support_session_audit.session_id AND s.origin_tenant_id = shared.current_tenant_id() AND s.origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text)));

CREATE POLICY "admin_read" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "atlas_maintenance_read" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin_atlas_maintenance
  USING (true);

CREATE POLICY "atlas_maintenance_write" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperadmin_atlas_maintenance
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = owner_principal_id AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text));

CREATE POLICY "tenant_read" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "master"."atlas_thread"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, true))
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, conversation_id, true));

CREATE POLICY "admin_read" ON "master"."attachment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."attachment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."attachment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."attachment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."attachment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."attachment_comment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."attachment_comment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."attachment_comment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."attachment_comment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."attachment_comment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_delegation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_insert" ON "master"."auth_delegation"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_delegation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_update" ON "master"."auth_delegation"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code())
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_delegation_grant"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_insert" ON "master"."auth_delegation_grant"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_delegation_grant"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_update" ON "master"."auth_delegation_grant"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code())
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_deny_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_deny_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_group"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_group"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_group_member"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_group_member"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_group_role"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_group_role"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_override"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_override"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_plane_membership"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_plane_membership"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_record_acl"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_insert" ON "master"."auth_record_acl"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_record_acl"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_runtime_update" ON "master"."auth_record_acl"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code())
  WITH CHECK (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_role"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_role"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_role_permission"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_role_permission"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "auth_v2_admin_all" ON "master"."auth_scope_target"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_v2_runtime_read" ON "master"."auth_scope_target"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id() AND plane_code = master.current_auth_plane_code());

CREATE POLICY "admin_read" ON "master"."bank_account"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."bank_account"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."bank_account"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."bank_account"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."bank_account"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."bank_account"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."bank_account_house_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."bank_account_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."bank_account_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."bank_account_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."bank_account_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."bank_account_link"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."bank_party"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."bank_party"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."bank_party"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."bank_party"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."bank_party"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."bank_party"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."brand_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."brand_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."brand_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."brand_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."brand_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."business_partner"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."business_partner"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."business_partner"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."business_partner"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."business_partner"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."business_partner"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."business_partner_network_link"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."career_band"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."career_band"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."career_band"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."career_band"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."career_band"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."career_band"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."career_level"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."career_level"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."career_level"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."career_level"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."career_level"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."career_level"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."chart_of_account"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."comment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."comment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."comment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."comment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."comment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND commenter_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND commenter_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_insert" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "master"."comment_draft"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_all" ON "master"."comment_feed_cursor"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_rw" ON "master"."comment_feed_cursor"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id_soft())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."comment_mention"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."comment_mention"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."comment_mention"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."comment_mention"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."comment_reaction"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."comment_reaction"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."comment_reaction"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_insert" ON "master"."comment_reaction"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."comment_reaction"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."commodity_category"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."commodity_classification"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code_book_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code_chart_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code_customer_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code_gl_account"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."company_code_supplier_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_modify" ON "master"."condition_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read" ON "master"."condition_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "tenant_delete" ON "master"."condition_type"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "tenant_insert" ON "master"."condition_type"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "tenant_read" ON "master"."condition_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL AND is_system = true);

CREATE POLICY "tenant_update" ON "master"."condition_type"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND is_system = false)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "admin_read" ON "master"."contact_email"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."contact_email"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."contact_email"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."contact_email"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."contact_email"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."contact_email"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."contact_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."contact_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."contact_link"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."contact_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."contact_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."contact_link"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."contact_phone"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."content_item"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."content_item"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."content_item"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."content_item"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."content_item"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."content_item"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."conversation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."conversation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "atlas_app_insert_scope" ON "master"."conversation"
  AS RESTRICTIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (type = 'atlas_agent'::text);

CREATE POLICY "atlas_app_update_scope" ON "master"."conversation"
  AS RESTRICTIVE
  FOR UPDATE
  TO athyperapp
  USING (type = 'atlas_agent'::text)
  WITH CHECK (type = 'atlas_agent'::text);

CREATE POLICY "atlas_maintenance_read" ON "master"."conversation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin_atlas_maintenance
  USING (type = 'atlas_agent'::text);

CREATE POLICY "atlas_maintenance_write" ON "master"."conversation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin_atlas_maintenance
  USING (type = 'atlas_agent'::text)
  WITH CHECK (type = 'atlas_agent'::text);

CREATE POLICY "tenant_insert" ON "master"."conversation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (type <> 'atlas_agent'::text OR created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND (NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]))));

CREATE POLICY "tenant_read" ON "master"."conversation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (type <> 'atlas_agent'::text OR master.fn_atlas_conversation_access(tenant_id, id, false)));

CREATE POLICY "tenant_update" ON "master"."conversation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (type <> 'atlas_agent'::text OR master.fn_atlas_conversation_access(tenant_id, id, true)))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (type <> 'atlas_agent'::text OR master.fn_atlas_conversation_access(tenant_id, id, true)));

CREATE POLICY "admin_read" ON "master"."conversation_participant"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."conversation_participant"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "atlas_app_insert_scope" ON "master"."conversation_participant"
  AS RESTRICTIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (master.fn_is_atlas_conversation(tenant_id, conversation_id));

CREATE POLICY "atlas_app_update_scope" ON "master"."conversation_participant"
  AS RESTRICTIVE
  FOR UPDATE
  TO athyperapp
  USING (master.fn_is_atlas_conversation(tenant_id, conversation_id))
  WITH CHECK (master.fn_is_atlas_conversation(tenant_id, conversation_id));

CREATE POLICY "tenant_insert" ON "master"."conversation_participant"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (NOT master.fn_is_atlas_conversation(tenant_id, conversation_id) OR created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND (NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text])) AND (principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND role = 'owner'::text OR master.fn_atlas_conversation_access(tenant_id, conversation_id, true))));

CREATE POLICY "tenant_read" ON "master"."conversation_participant"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (NOT master.fn_is_atlas_conversation(tenant_id, conversation_id) OR master.fn_atlas_conversation_access(tenant_id, conversation_id, false)));

CREATE POLICY "tenant_update" ON "master"."conversation_participant"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (NOT master.fn_is_atlas_conversation(tenant_id, conversation_id) OR master.fn_atlas_conversation_access(tenant_id, conversation_id, true) OR principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND master.fn_atlas_conversation_access(tenant_id, conversation_id, false)))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (NOT master.fn_is_atlas_conversation(tenant_id, conversation_id) OR master.fn_atlas_conversation_access(tenant_id, conversation_id, true) OR principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid));

CREATE POLICY "admin_read" ON "master"."cost_center"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."cost_center"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."cost_center"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."cost_center"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."cost_center"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."cost_center"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."customer"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."customer"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."customer"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."customer"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."customer"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."customer"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."customer_app_index"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."customer_app_index"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."customer_app_index"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."customer_qualification"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."dashboard"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."dashboard"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."dashboard"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (scope = ANY (ARRAY['personal'::text, 'shared'::text])) AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND (owner_principal_id IS NULL OR owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)));

CREATE POLICY "tenant_read_nonpersonal" ON "master"."dashboard"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (scope = ANY (ARRAY['shared'::text, 'system'::text])));

CREATE POLICY "tenant_read_personal" ON "master"."dashboard"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "master"."dashboard"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid));

CREATE POLICY "admin_read" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (EXISTS ( SELECT 1
   FROM master.dashboard d
  WHERE d.id = dashboard_widget.dashboard_id AND d.tenant_id = dashboard_widget.tenant_id AND (d.scope = 'personal'::text AND d.owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR d.scope = 'shared'::text AND d.created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))));

CREATE POLICY "tenant_insert" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (EXISTS ( SELECT 1
   FROM master.dashboard d
  WHERE d.id = dashboard_widget.dashboard_id AND d.tenant_id = dashboard_widget.tenant_id AND (d.scope = 'personal'::text AND d.owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR d.scope = 'shared'::text AND d.created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))));

CREATE POLICY "tenant_read" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (EXISTS ( SELECT 1
   FROM master.dashboard d
  WHERE d.id = dashboard_widget.dashboard_id AND d.tenant_id = dashboard_widget.tenant_id AND ((d.scope = ANY (ARRAY['shared'::text, 'system'::text])) OR d.scope = 'personal'::text AND d.owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))));

CREATE POLICY "tenant_update" ON "master"."dashboard_widget"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (EXISTS ( SELECT 1
   FROM master.dashboard d
  WHERE d.id = dashboard_widget.dashboard_id AND d.tenant_id = dashboard_widget.tenant_id AND (d.scope = 'personal'::text AND d.owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR d.scope = 'shared'::text AND d.created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (EXISTS ( SELECT 1
   FROM master.dashboard d
  WHERE d.id = dashboard_widget.dashboard_id AND d.tenant_id = dashboard_widget.tenant_id AND (d.scope = 'personal'::text AND d.owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR d.scope = 'shared'::text AND d.created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))));

CREATE POLICY "admin_read" ON "master"."designation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."designation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."designation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."designation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."designation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."designation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."dimension_set"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."document"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."document"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."document"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."document"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."document"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."employee"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."employee"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."employee"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."employee"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."employee"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."employee"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."employee_leave_enrollment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."employee_statutory_enrollment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."employment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."employment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."employment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."employment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."employment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."employment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."entity_document_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."entity_document_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."entity_document_link"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."entity_document_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."entity_document_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."external_reference"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."external_reference"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."external_reference"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."external_reference"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."external_reference"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."external_reference"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_insert" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read_own" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read_shared" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND is_shared = true);

CREATE POLICY "tenant_update" ON "master"."filter_preset"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."fiscal_period"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."fx_rate"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."fx_rate"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."fx_rate"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."fx_rate"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."fx_rate"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."gl_account"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."gl_account"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."gl_account"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."gl_account"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."gl_account"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."gl_account"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."intercompany_trading_pair"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."item"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."item"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."item"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."item"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."item"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."item"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."job"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."job"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."job"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."job"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."job"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."job"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."job_family"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."job_family"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."job_family"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."job_family"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."job_family"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."job_family"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."job_function"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."job_function"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."job_function"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."job_function"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."job_function"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."job_function"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."label"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."label"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."label"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."label"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."label"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."label_entity_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."label_entity_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "open_read" ON "master"."label_entity_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin_read" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."leave_plan"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."leave_plan_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."leave_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."leave_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."leave_type"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."leave_type"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."leave_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."leave_type"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."ledger_book"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."legal_entity"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."legal_entity_business_partner_link"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."legal_entity_identity_binding"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."legal_entity_identity_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."legal_entity_identity_binding"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."legal_entity_network_account"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."letterhead"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."letterhead"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."letterhead"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."letterhead"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."letterhead"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."lifecycle_instance"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."lifecycle_instance"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."lifecycle_instance"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."lifecycle_instance"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."lifecycle_instance"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."multipart_upload"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."notification"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."notification"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."notification"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."notification"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."notification"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND recipient_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND recipient_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."operating_organization"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."operating_organization_company"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."org_unit"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."org_unit"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."org_unit"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."org_unit"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."org_unit"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."org_unit"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."organization_tax_registration"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."owner_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."owner_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."owner_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."owner_type"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false)
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "tenant_write" ON "master"."owner_type"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false);

CREATE POLICY "admin_read" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."party_contact_person"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."party_contact_role"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_contact_role"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."party_contact_role"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."party_contact_role"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_contact_role"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."party_risk_assessment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_assessment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."party_risk_assessment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_assessment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."party_risk_assessment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."party_risk_dimension_score"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_dimension_score"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."party_risk_dimension_score"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_dimension_score"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."party_risk_dimension_score"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."party_risk_driver"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_driver"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."party_risk_driver"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_driver"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."party_risk_evidence"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_evidence"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."party_risk_evidence"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_evidence"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."party_risk_evidence"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."party_risk_mitigation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."party_risk_review_event"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."party_risk_review_event"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."party_risk_review_event"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."party_risk_review_event"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."pay_component"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."pay_component"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."pay_component"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."pay_component"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."pay_component"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."pay_component"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."pay_grade"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."pay_group"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."pay_group"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."pay_group"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."pay_group"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."pay_group"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."pay_group"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."pay_structure"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."pay_structure_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."payment_method"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."payment_method"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."payment_method"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."payment_method"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."payment_method"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."payment_method"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."person"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."person"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."person"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."person"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."person"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."person"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "hr_pii_delete" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND ('PPL.PII.EDIT'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text))));

CREATE POLICY "hr_pii_insert" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND ('PPL.PII.EDIT'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text))));

CREATE POLICY "hr_pii_read" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (('PPL.PII.VIEW'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text))) OR ('PPL.PII.EDIT'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text)))));

CREATE POLICY "hr_pii_update" ON "master"."person_sensitive_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND ('PPL.PII.EDIT'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text))))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND ('PPL.PII.EDIT'::text = ANY (string_to_array(COALESCE(current_setting('app.permissions'::text, true), ''::text), ','::text))));

CREATE POLICY "admin_read" ON "master"."position"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."position"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."position"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."position"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."position"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."position"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."principal"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."principal"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."principal_identity_binding"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal_identity_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."principal_identity_binding"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."principal_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."principal_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id_soft() OR to_tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."principal_relationship"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id())
  WITH CHECK (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_insert" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "master"."principal_ui_preference"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."principal_ui_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."principal_ui_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."principal_ui_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "master"."principal_ui_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "master"."principal_ui_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."procurement_organization_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."product"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."product"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."product"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."product"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."product"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."product"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."profit_center"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."profit_center"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."profit_center"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."profit_center"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."profit_center"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."profit_center"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."project"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."project"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."project"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."project"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."project"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."project"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."project_item"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."project_item"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."project_item"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."project_item"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."project_item"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."project_item"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."record_bookmark"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."record_bookmark"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."record_bookmark"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_insert" ON "master"."record_bookmark"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "master"."record_bookmark"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."sales_organization_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."saved_view"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."saved_view"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."saved_view"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (scope = ANY (ARRAY['personal'::text, 'shared'::text])) AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND (owner_principal_id IS NULL OR owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)));

CREATE POLICY "tenant_read_nonpersonal" ON "master"."saved_view"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND (scope = ANY (ARRAY['shared'::text, 'system'::text])));

CREATE POLICY "tenant_read_personal" ON "master"."saved_view"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "master"."saved_view"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid))
  WITH CHECK (tenant_id = shared.current_tenant_id() AND (scope = 'personal'::text AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid OR scope = 'shared'::text AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid));

CREATE POLICY "admin_read" ON "master"."shift_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."shift_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."shift_type"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."shift_type"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."shift_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."shift_type"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."site"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."site"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."site"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."site"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."site"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."site"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."statutory_scheme"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."supplier"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."supplier"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."supplier"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."supplier"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."supplier"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."supplier"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."supplier_app_index"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."supplier_app_index"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "master"."supplier_app_index"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."supplier_qualification"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."team"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."team"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."team"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."team"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."team"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."team_member"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."team_member"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."team_member"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."team_member"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."team_member"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."template"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."template_binding"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."template_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."template_binding"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."template_binding"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."tenant"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."tenant"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "self_read" ON "master"."tenant"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "master"."tenant_profile"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."tenant_profile"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "master"."tenant_profile"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."tenant_profile"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."tenant_profile"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id_soft() OR to_tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."tenant_relationship"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id())
  WITH CHECK (from_tenant_id = shared.current_tenant_id() OR to_tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."tenant_risk_source_config"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."warehouse"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."warehouse"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."warehouse"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."warehouse"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."warehouse"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."warehouse"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."work_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."work_pattern"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "master"."work_pattern_day"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT EXECUTE ON FUNCTION "master".auth_v2_permission_is_effective(p_permission_id uuid, p_plane_code text, p_at timestamp with time zone) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".auth_v2_permission_is_effective(p_permission_id uuid, p_plane_code text, p_at timestamp with time zone) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".auth_v2_principal_has_plane(p_tenant_id uuid, p_plane_code text, p_principal_id uuid, p_at timestamp with time zone) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".auth_v2_principal_has_plane(p_tenant_id uuid, p_plane_code text, p_principal_id uuid, p_at timestamp with time zone) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".current_auth_plane_code() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".current_auth_plane_code() TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".current_auth_plane_code_soft() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".current_auth_plane_code_soft() TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_assert_tenant_session(p_tenant_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_assert_tenant_session(p_tenant_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_atlas_conversation_access(p_tenant_id uuid, p_conversation_id uuid, p_owner_only boolean) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_atlas_conversation_access(p_tenant_id uuid, p_conversation_id uuid, p_owner_only boolean) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_check_tenant_code_available(p_realm_key text, p_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_check_tenant_code_available(p_realm_key text, p_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_create_owner_contact_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text, p_line1 text, p_line2 text, p_city text, p_region text, p_postal_code text, p_country_code text, p_email text, p_phone text, p_actor_id uuid, p_address_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_create_owner_contact_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text, p_line1 text, p_line2 text, p_city text, p_region text, p_postal_code text, p_country_code text, p_email text, p_phone text, p_actor_id uuid, p_address_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_is_atlas_conversation(p_tenant_id uuid, p_conversation_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_is_atlas_conversation(p_tenant_id uuid, p_conversation_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_lookup_tenant_for_auth(p_realm_key text, p_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_lookup_tenant_for_auth(p_realm_key text, p_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_register_tenant(p_code text, p_name text, p_display_name text, p_realm_key text, p_region text, p_subscription text, p_admin_email text, p_admin_given_name text, p_admin_family_name text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_register_tenant(p_code text, p_name text, p_display_name text, p_realm_key text, p_region text, p_subscription text, p_admin_email text, p_admin_given_name text, p_admin_family_name text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_require_tenant_session(p_tenant_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_require_tenant_session(p_tenant_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_resolve_principal_ui(p_tenant_id uuid, p_principal_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_resolve_principal_ui(p_tenant_id uuid, p_principal_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_set_primary_address_link(p_tenant_id uuid, p_address_link_id uuid, p_actor_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_set_primary_address_link(p_tenant_id uuid, p_address_link_id uuid, p_actor_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_set_primary_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_set_primary_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_set_principal_ui_preference(p_tenant_id uuid, p_principal_id uuid, p_preference_code text, p_surface_code text, p_preference_value jsonb) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_set_principal_ui_preference(p_tenant_id uuid, p_principal_id uuid, p_preference_code text, p_surface_code text, p_preference_value jsonb) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_update_tenant_profile(p_tenant_id uuid, p_name text, p_display_name text, p_region text, p_metadata jsonb, p_actor_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_update_tenant_profile(p_tenant_id uuid, p_name text, p_display_name text, p_region text, p_metadata jsonb, p_actor_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_valid_owner_type(p_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_valid_owner_type(p_code text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".fn_verify_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".fn_verify_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".resolve_fiscal_period(p_tenant_id uuid, p_company_code_id uuid, p_posting_date date, p_include_special boolean) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "master".resolve_fiscal_period(p_tenant_id uuid, p_company_code_id uuid, p_posting_date date, p_include_special boolean) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".resolve_fiscal_period(p_tenant_id uuid, p_company_code_id uuid, p_posting_date date, p_include_special boolean) TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".trg_allocate_atlas_message_sequence() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_auth_permission_plane_guard() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_auth_permission_plane_guard() TO athyperapp;

GRANT EXECUTE ON FUNCTION "master".trg_enforce_created_by() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_atlas_conversation_mutation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_atlas_message_mutation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_atlas_participant_insert() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_atlas_participant_mutation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_atlas_thread_mutation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_guard_scope_owner_immutable() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_sync_deleted_at_with_status() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_validate_atlas_participant_cursor() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "master".trg_validate_atlas_thread_envelope() TO athyperadmin;

GRANT DELETE ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."accounting_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."accounting_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."address" TO athyperadmin;

GRANT DELETE ON TABLE "master"."address" TO athyperapp;

GRANT INSERT ON TABLE "master"."address" TO athyperapp;

GRANT SELECT ON TABLE "master"."address" TO athyperapp;

GRANT UPDATE ON TABLE "master"."address" TO athyperapp;

GRANT DELETE ON TABLE "master"."address_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."address_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."address_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."address_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."address_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."address_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."address_link" TO athyperadmin;

GRANT DELETE ON TABLE "master"."address_link" TO athyperapp;

GRANT INSERT ON TABLE "master"."address_link" TO athyperapp;

GRANT SELECT ON TABLE "master"."address_link" TO athyperapp;

GRANT UPDATE ON TABLE "master"."address_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."asset" TO athyperadmin;

GRANT INSERT ON TABLE "master"."asset" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."asset" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."asset" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."asset" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."asset" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset" TO athyperapp;

GRANT DELETE ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT INSERT ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."asset_assignment_history" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_assignment_history" TO athyperapp;

GRANT DELETE ON TABLE "master"."asset_book" TO athyperadmin;

GRANT INSERT ON TABLE "master"."asset_book" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."asset_book" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_book" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."asset_book" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."asset_book" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."asset_book" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_book" TO athyperapp;

GRANT DELETE ON TABLE "master"."asset_class" TO athyperadmin;

GRANT INSERT ON TABLE "master"."asset_class" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."asset_class" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_class" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."asset_class" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."asset_class" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."asset_class" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_class" TO athyperapp;

GRANT DELETE ON TABLE "master"."asset_component" TO athyperadmin;

GRANT INSERT ON TABLE "master"."asset_component" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."asset_component" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_component" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."asset_component" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."asset_component" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."asset_component" TO athyperadmin;

GRANT SELECT ON TABLE "master"."asset_component" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_knowledge_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_chunk" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_knowledge_revision" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_revision" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_knowledge_source" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_knowledge_source" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_message" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_message" TO athyperapp;

GRANT SELECT ON TABLE "master"."atlas_message" TO athyperapp;

GRANT UPDATE ON TABLE "master"."atlas_message" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_support_session" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_support_session" TO athyperapp;

GRANT SELECT ON TABLE "master"."atlas_support_session" TO athyperapp;

GRANT UPDATE ON TABLE "master"."atlas_support_session" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_support_session_audit" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_support_session_audit" TO athyperapp;

GRANT SELECT ON TABLE "master"."atlas_support_session_audit" TO athyperapp;

GRANT DELETE ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT INSERT ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."atlas_thread" TO athyperadmin;

GRANT SELECT ON TABLE "master"."atlas_thread" TO athyperadmin_atlas_maintenance;

GRANT UPDATE ON TABLE "master"."atlas_thread" TO athyperadmin_atlas_maintenance;

GRANT INSERT ON TABLE "master"."atlas_thread" TO athyperapp;

GRANT SELECT ON TABLE "master"."atlas_thread" TO athyperapp;

GRANT UPDATE ON TABLE "master"."atlas_thread" TO athyperapp;

GRANT DELETE ON TABLE "master"."attachment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."attachment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."attachment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."attachment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."attachment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."attachment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment" TO athyperapp;

GRANT DELETE ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."attachment_comment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment_comment" TO athyperapp;

GRANT DELETE ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT INSERT ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."attachment_folder" TO athyperadmin;

GRANT SELECT ON TABLE "master"."attachment_folder" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_delegation_permission_scope_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_current_group_member_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_group_member_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_current_group_role_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_group_role_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_current_plane_membership_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_current_plane_membership_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_delegation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_delegation" TO athyperapp;

GRANT SELECT ON TABLE "master"."auth_delegation" TO athyperapp;

GRANT UPDATE ON TABLE "master"."auth_delegation" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_delegation_grant" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_delegation_grant" TO athyperapp;

GRANT SELECT ON TABLE "master"."auth_delegation_grant" TO athyperapp;

GRANT UPDATE ON TABLE "master"."auth_delegation_grant" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_deny_rule" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_deny_rule" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_group" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_group" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_group" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_group" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_group" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_group" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_group_member" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group_member" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_group_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_group_role" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_override" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_override" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_override" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_override" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_override" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_override" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_override" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_override" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_plane_membership" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_plane_membership" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_published_role_permission_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_published_role_permission_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_record_acl" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_record_acl" TO athyperapp;

GRANT SELECT ON TABLE "master"."auth_record_acl" TO athyperapp;

GRANT UPDATE ON TABLE "master"."auth_record_acl" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_role" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_role" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_role" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_role" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_role" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_role" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_role_permission" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_role_permission" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_scope_target" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_scope_target" TO athyperapp;

GRANT DELETE ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT INSERT ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."auth_scope_target_resolved_v" TO athyperadmin;

GRANT SELECT ON TABLE "master"."auth_scope_target_resolved_v" TO athyperapp;

GRANT DELETE ON TABLE "master"."bank_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."bank_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."bank_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."bank_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."bank_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."bank_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."bank_account" TO athyperadmin;

GRANT DELETE ON TABLE "master"."bank_account" TO athyperapp;

GRANT INSERT ON TABLE "master"."bank_account" TO athyperapp;

GRANT SELECT ON TABLE "master"."bank_account" TO athyperapp;

GRANT UPDATE ON TABLE "master"."bank_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT INSERT ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT SELECT ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."bank_account_house_config" TO athyperadmin;

GRANT DELETE ON TABLE "master"."bank_account_house_config" TO athyperapp;

GRANT INSERT ON TABLE "master"."bank_account_house_config" TO athyperapp;

GRANT SELECT ON TABLE "master"."bank_account_house_config" TO athyperapp;

GRANT UPDATE ON TABLE "master"."bank_account_house_config" TO athyperapp;

GRANT DELETE ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."bank_account_link" TO athyperadmin;

GRANT DELETE ON TABLE "master"."bank_account_link" TO athyperapp;

GRANT INSERT ON TABLE "master"."bank_account_link" TO athyperapp;

GRANT SELECT ON TABLE "master"."bank_account_link" TO athyperapp;

GRANT UPDATE ON TABLE "master"."bank_account_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."bank_party" TO athyperadmin;

GRANT INSERT ON TABLE "master"."bank_party" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."bank_party" TO athyperadmin;

GRANT SELECT ON TABLE "master"."bank_party" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."bank_party" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."bank_party" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."bank_party" TO athyperadmin;

GRANT DELETE ON TABLE "master"."bank_party" TO athyperapp;

GRANT INSERT ON TABLE "master"."bank_party" TO athyperapp;

GRANT SELECT ON TABLE "master"."bank_party" TO athyperapp;

GRANT UPDATE ON TABLE "master"."bank_party" TO athyperapp;

GRANT DELETE ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."brand_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."brand_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."budget_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."budget_allocation" TO athyperapp;

GRANT DELETE ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."budget_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."budget_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."business_intent" TO athyperadmin;

GRANT INSERT ON TABLE "master"."business_intent" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."business_intent" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_intent" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."business_intent" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."business_intent" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."business_intent" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_intent" TO athyperapp;

GRANT DELETE ON TABLE "master"."business_partner" TO athyperadmin;

GRANT INSERT ON TABLE "master"."business_partner" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."business_partner" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."business_partner" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."business_partner" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."business_partner" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner" TO athyperapp;

GRANT DELETE ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT INSERT ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."business_partner_network_capability" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_network_capability" TO athyperapp;

GRANT DELETE ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."business_partner_network_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_network_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."business_partner_relation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."business_partner_relation" TO athyperapp;

GRANT DELETE ON TABLE "master"."career_band" TO athyperadmin;

GRANT INSERT ON TABLE "master"."career_band" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."career_band" TO athyperadmin;

GRANT SELECT ON TABLE "master"."career_band" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."career_band" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."career_band" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."career_band" TO athyperadmin;

GRANT SELECT ON TABLE "master"."career_band" TO athyperapp;

GRANT DELETE ON TABLE "master"."career_level" TO athyperadmin;

GRANT INSERT ON TABLE "master"."career_level" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."career_level" TO athyperadmin;

GRANT SELECT ON TABLE "master"."career_level" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."career_level" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."career_level" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."career_level" TO athyperadmin;

GRANT SELECT ON TABLE "master"."career_level" TO athyperapp;

GRANT DELETE ON TABLE "master"."certification" TO athyperadmin;

GRANT INSERT ON TABLE "master"."certification" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."certification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."certification" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."certification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."certification" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."certification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."certification" TO athyperapp;

GRANT DELETE ON TABLE "master"."certification_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."certification_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."certification_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."certification_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."certification_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."certification_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."certification_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."certification_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT INSERT ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT SELECT ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."change_reason_code" TO athyperadmin;

GRANT SELECT ON TABLE "master"."change_reason_code" TO athyperapp;

GRANT DELETE ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."chart_of_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."chart_of_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."comment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."comment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."comment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."comment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."comment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."comment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment" TO athyperapp;

GRANT DELETE ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT INSERT ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."comment_draft" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_draft" TO athyperapp;

GRANT DELETE ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT INSERT ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."comment_feed_cursor" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_feed_cursor" TO athyperapp;

GRANT DELETE ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT INSERT ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."comment_mention" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_mention" TO athyperapp;

GRANT DELETE ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT INSERT ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."comment_reaction" TO athyperadmin;

GRANT SELECT ON TABLE "master"."comment_reaction" TO athyperapp;

GRANT DELETE ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT INSERT ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT SELECT ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."commodity_category" TO athyperadmin;

GRANT SELECT ON TABLE "master"."commodity_category" TO athyperapp;

GRANT DELETE ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT INSERT ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."commodity_classification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."commodity_classification" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_book_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_book_assignment" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_chart_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_chart_assignment" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_customer_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_customer_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_dimension_default" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_dimension_default" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_gl_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_gl_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."company_code_supplier_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."company_code_supplier_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."condition_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."condition_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."condition_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."condition_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."condition_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."condition_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."condition_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."condition_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."contact_email" TO athyperadmin;

GRANT INSERT ON TABLE "master"."contact_email" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."contact_email" TO athyperadmin;

GRANT SELECT ON TABLE "master"."contact_email" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."contact_email" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."contact_email" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."contact_email" TO athyperadmin;

GRANT DELETE ON TABLE "master"."contact_email" TO athyperapp;

GRANT INSERT ON TABLE "master"."contact_email" TO athyperapp;

GRANT SELECT ON TABLE "master"."contact_email" TO athyperapp;

GRANT UPDATE ON TABLE "master"."contact_email" TO athyperapp;

GRANT DELETE ON TABLE "master"."contact_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."contact_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."contact_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."contact_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."contact_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."contact_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."contact_link" TO athyperadmin;

GRANT DELETE ON TABLE "master"."contact_link" TO athyperapp;

GRANT INSERT ON TABLE "master"."contact_link" TO athyperapp;

GRANT SELECT ON TABLE "master"."contact_link" TO athyperapp;

GRANT UPDATE ON TABLE "master"."contact_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT INSERT ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT SELECT ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."contact_marketing_consent" TO athyperadmin;

GRANT SELECT ON TABLE "master"."contact_marketing_consent" TO athyperapp;

GRANT DELETE ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT INSERT ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT SELECT ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."contact_phone" TO athyperadmin;

GRANT DELETE ON TABLE "master"."contact_phone" TO athyperapp;

GRANT INSERT ON TABLE "master"."contact_phone" TO athyperapp;

GRANT SELECT ON TABLE "master"."contact_phone" TO athyperapp;

GRANT UPDATE ON TABLE "master"."contact_phone" TO athyperapp;

GRANT DELETE ON TABLE "master"."content_item" TO athyperadmin;

GRANT INSERT ON TABLE "master"."content_item" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."content_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."content_item" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."content_item" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."content_item" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."content_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."content_item" TO athyperapp;

GRANT DELETE ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."content_item_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."content_item_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."conversation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."conversation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."conversation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."conversation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."conversation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."conversation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."conversation" TO athyperadmin;

GRANT DELETE ON TABLE "master"."conversation" TO athyperadmin_atlas_maintenance;

GRANT SELECT ON TABLE "master"."conversation" TO athyperadmin_atlas_maintenance;

GRANT UPDATE ON TABLE "master"."conversation" TO athyperadmin_atlas_maintenance;

GRANT INSERT ON TABLE "master"."conversation" TO athyperapp;

GRANT SELECT ON TABLE "master"."conversation" TO athyperapp;

GRANT UPDATE ON TABLE "master"."conversation" TO athyperapp;

GRANT DELETE ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT INSERT ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT SELECT ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."conversation_participant" TO athyperadmin;

GRANT INSERT ON TABLE "master"."conversation_participant" TO athyperapp;

GRANT SELECT ON TABLE "master"."conversation_participant" TO athyperapp;

GRANT UPDATE ON TABLE "master"."conversation_participant" TO athyperapp;

GRANT DELETE ON TABLE "master"."cost_center" TO athyperadmin;

GRANT INSERT ON TABLE "master"."cost_center" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."cost_center" TO athyperadmin;

GRANT SELECT ON TABLE "master"."cost_center" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."cost_center" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."cost_center" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."cost_center" TO athyperadmin;

GRANT SELECT ON TABLE "master"."cost_center" TO athyperapp;

GRANT DELETE ON TABLE "master"."customer" TO athyperadmin;

GRANT INSERT ON TABLE "master"."customer" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."customer" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."customer" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."customer" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."customer" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer" TO athyperapp;

GRANT DELETE ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT INSERT ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."customer_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_app_index" TO athyperapp;

GRANT DELETE ON TABLE "master"."customer_block" TO athyperadmin;

GRANT INSERT ON TABLE "master"."customer_block" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."customer_block" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_block" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."customer_block" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."customer_block" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."customer_block" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_block" TO athyperapp;

GRANT DELETE ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT INSERT ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."customer_qualification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."customer_qualification" TO athyperapp;

GRANT DELETE ON TABLE "master"."dashboard" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dashboard" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dashboard" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dashboard" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dashboard" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dashboard" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dashboard" TO athyperadmin;

GRANT DELETE ON TABLE "master"."dashboard" TO athyperapp;

GRANT INSERT ON TABLE "master"."dashboard" TO athyperapp;

GRANT SELECT ON TABLE "master"."dashboard" TO athyperapp;

GRANT UPDATE ON TABLE "master"."dashboard" TO athyperapp;

GRANT DELETE ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dashboard_widget" TO athyperadmin;

GRANT DELETE ON TABLE "master"."dashboard_widget" TO athyperapp;

GRANT INSERT ON TABLE "master"."dashboard_widget" TO athyperapp;

GRANT SELECT ON TABLE "master"."dashboard_widget" TO athyperapp;

GRANT UPDATE ON TABLE "master"."dashboard_widget" TO athyperapp;

GRANT DELETE ON TABLE "master"."designation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."designation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."designation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."designation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."designation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."designation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."designation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."designation" TO athyperapp;

GRANT DELETE ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dimension_set" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_set" TO athyperapp;

GRANT DELETE ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dimension_set_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_set_item" TO athyperapp;

GRANT DELETE ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dimension_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT INSERT ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."dimension_value" TO athyperadmin;

GRANT SELECT ON TABLE "master"."dimension_value" TO athyperapp;

GRANT DELETE ON TABLE "master"."document" TO athyperadmin;

GRANT INSERT ON TABLE "master"."document" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."document" TO athyperadmin;

GRANT SELECT ON TABLE "master"."document" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."document" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."document" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."document" TO athyperadmin;

GRANT SELECT ON TABLE "master"."document" TO athyperapp;

GRANT DELETE ON TABLE "master"."employee" TO athyperadmin;

GRANT INSERT ON TABLE "master"."employee" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."employee" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."employee" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."employee" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."employee" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee" TO athyperapp;

GRANT DELETE ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."employee_leave_enrollment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee_leave_enrollment" TO athyperapp;

GRANT DELETE ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."employee_statutory_enrollment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employee_statutory_enrollment" TO athyperapp;

GRANT DELETE ON TABLE "master"."employment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."employment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."employment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."employment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."employment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."employment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."employment" TO athyperapp;

GRANT DELETE ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."entity_document_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."entity_document_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."external_reference" TO athyperadmin;

GRANT INSERT ON TABLE "master"."external_reference" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."external_reference" TO athyperadmin;

GRANT SELECT ON TABLE "master"."external_reference" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."external_reference" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."external_reference" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."external_reference" TO athyperadmin;

GRANT SELECT ON TABLE "master"."external_reference" TO athyperapp;

GRANT DELETE ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT INSERT ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT SELECT ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."filter_preset" TO athyperadmin;

GRANT SELECT ON TABLE "master"."filter_preset" TO athyperapp;

GRANT DELETE ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT INSERT ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT SELECT ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."fiscal_period" TO athyperadmin;

GRANT SELECT ON TABLE "master"."fiscal_period" TO athyperapp;

GRANT DELETE ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT INSERT ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT SELECT ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."fx_rate" TO athyperadmin;

GRANT SELECT ON TABLE "master"."fx_rate" TO athyperapp;

GRANT DELETE ON TABLE "master"."gl_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."gl_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."gl_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."gl_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."gl_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."gl_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."gl_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."gl_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT INSERT ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT SELECT ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."holiday_calendar" TO athyperadmin;

GRANT SELECT ON TABLE "master"."holiday_calendar" TO athyperapp;

GRANT DELETE ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT INSERT ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT SELECT ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."holiday_calendar_day" TO athyperadmin;

GRANT SELECT ON TABLE "master"."holiday_calendar_day" TO athyperapp;

GRANT DELETE ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT INSERT ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT SELECT ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."intercompany_trading_pair" TO athyperadmin;

GRANT SELECT ON TABLE "master"."intercompany_trading_pair" TO athyperapp;

GRANT DELETE ON TABLE "master"."item" TO athyperadmin;

GRANT INSERT ON TABLE "master"."item" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."item" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."item" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."item" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."item" TO athyperapp;

GRANT DELETE ON TABLE "master"."job" TO athyperadmin;

GRANT INSERT ON TABLE "master"."job" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."job" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."job" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."job" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."job" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job" TO athyperapp;

GRANT DELETE ON TABLE "master"."job_family" TO athyperadmin;

GRANT INSERT ON TABLE "master"."job_family" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."job_family" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job_family" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."job_family" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."job_family" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."job_family" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job_family" TO athyperapp;

GRANT DELETE ON TABLE "master"."job_function" TO athyperadmin;

GRANT INSERT ON TABLE "master"."job_function" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."job_function" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job_function" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."job_function" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."job_function" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."job_function" TO athyperadmin;

GRANT SELECT ON TABLE "master"."job_function" TO athyperapp;

GRANT DELETE ON TABLE "master"."label" TO athyperadmin;

GRANT INSERT ON TABLE "master"."label" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."label" TO athyperadmin;

GRANT SELECT ON TABLE "master"."label" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."label" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."label" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."label" TO athyperadmin;

GRANT DELETE ON TABLE "master"."label" TO athyperapp;

GRANT INSERT ON TABLE "master"."label" TO athyperapp;

GRANT SELECT ON TABLE "master"."label" TO athyperapp;

GRANT UPDATE ON TABLE "master"."label" TO athyperapp;

GRANT DELETE ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."label_entity_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."label_entity_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT INSERT ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."leave_plan" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_plan" TO athyperapp;

GRANT DELETE ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT INSERT ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."leave_plan_rule" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_plan_rule" TO athyperapp;

GRANT DELETE ON TABLE "master"."leave_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."leave_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."leave_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."leave_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."leave_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."leave_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."leave_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT INSERT ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT SELECT ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."ledger_book" TO athyperadmin;

GRANT SELECT ON TABLE "master"."ledger_book" TO athyperapp;

GRANT DELETE ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT INSERT ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."legal_entity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity" TO athyperapp;

GRANT DELETE ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT INSERT ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."legal_entity_business_partner_link" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_business_partner_link" TO athyperapp;

GRANT DELETE ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT INSERT ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."legal_entity_identity_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_identity_binding" TO athyperapp;

GRANT DELETE ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."legal_entity_network_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."legal_entity_network_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."letterhead" TO athyperadmin;

GRANT INSERT ON TABLE "master"."letterhead" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."letterhead" TO athyperadmin;

GRANT SELECT ON TABLE "master"."letterhead" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."letterhead" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."letterhead" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."letterhead" TO athyperadmin;

GRANT SELECT ON TABLE "master"."letterhead" TO athyperapp;

GRANT DELETE ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT INSERT ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT SELECT ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."lifecycle_instance" TO athyperadmin;

GRANT SELECT ON TABLE "master"."lifecycle_instance" TO athyperapp;

GRANT DELETE ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT INSERT ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT SELECT ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."multipart_upload" TO athyperadmin;

GRANT SELECT ON TABLE "master"."multipart_upload" TO athyperapp;

GRANT DELETE ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."mv_company_postable_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."mv_company_postable_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."network_provider" TO athyperadmin;

GRANT INSERT ON TABLE "master"."network_provider" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."network_provider" TO athyperadmin;

GRANT SELECT ON TABLE "master"."network_provider" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."network_provider" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."network_provider" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."network_provider" TO athyperadmin;

GRANT SELECT ON TABLE "master"."network_provider" TO athyperapp;

GRANT DELETE ON TABLE "master"."notification" TO athyperadmin;

GRANT INSERT ON TABLE "master"."notification" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."notification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."notification" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."notification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."notification" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."notification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."notification" TO athyperapp;

GRANT DELETE ON TABLE "master"."notification_default" TO athyperadmin;

GRANT INSERT ON TABLE "master"."notification_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."notification_default" TO athyperadmin;

GRANT SELECT ON TABLE "master"."notification_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."notification_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."notification_default" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."notification_default" TO athyperadmin;

GRANT SELECT ON TABLE "master"."notification_default" TO athyperapp;

GRANT DELETE ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT INSERT ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT SELECT ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."operating_organization" TO athyperadmin;

GRANT SELECT ON TABLE "master"."operating_organization" TO athyperapp;

GRANT DELETE ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT INSERT ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT SELECT ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."operating_organization_company" TO athyperadmin;

GRANT SELECT ON TABLE "master"."operating_organization_company" TO athyperapp;

GRANT DELETE ON TABLE "master"."org_unit" TO athyperadmin;

GRANT INSERT ON TABLE "master"."org_unit" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."org_unit" TO athyperadmin;

GRANT SELECT ON TABLE "master"."org_unit" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."org_unit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."org_unit" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."org_unit" TO athyperadmin;

GRANT SELECT ON TABLE "master"."org_unit" TO athyperapp;

GRANT DELETE ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT INSERT ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT SELECT ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."organization_tax_registration" TO athyperadmin;

GRANT SELECT ON TABLE "master"."organization_tax_registration" TO athyperapp;

GRANT DELETE ON TABLE "master"."owner_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."owner_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."owner_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."owner_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."owner_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."owner_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."owner_type" TO athyperadmin;

GRANT DELETE ON TABLE "master"."owner_type" TO athyperapp;

GRANT INSERT ON TABLE "master"."owner_type" TO athyperapp;

GRANT SELECT ON TABLE "master"."owner_type" TO athyperapp;

GRANT UPDATE ON TABLE "master"."owner_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_contact_person" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_contact_person" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_contact_role" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_contact_role" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_governance_relation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_governance_relation" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_identifier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_identifier" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_assessment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_assessment" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_dimension_score" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_dimension_score" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_driver" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_driver" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_evidence" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_evidence" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_mitigation" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_mitigation" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_risk_review_event" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_risk_review_event" TO athyperapp;

GRANT DELETE ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."party_tax_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."party_tax_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."pay_component" TO athyperadmin;

GRANT INSERT ON TABLE "master"."pay_component" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."pay_component" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_component" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."pay_component" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."pay_component" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."pay_component" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_component" TO athyperapp;

GRANT DELETE ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT INSERT ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."pay_grade" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_grade" TO athyperapp;

GRANT DELETE ON TABLE "master"."pay_group" TO athyperadmin;

GRANT INSERT ON TABLE "master"."pay_group" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."pay_group" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_group" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."pay_group" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."pay_group" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."pay_group" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_group" TO athyperapp;

GRANT DELETE ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT INSERT ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."pay_structure" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_structure" TO athyperapp;

GRANT DELETE ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT INSERT ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."pay_structure_line" TO athyperadmin;

GRANT SELECT ON TABLE "master"."pay_structure_line" TO athyperapp;

GRANT DELETE ON TABLE "master"."payment_method" TO athyperadmin;

GRANT INSERT ON TABLE "master"."payment_method" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."payment_method" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_method" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."payment_method" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."payment_method" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."payment_method" TO athyperadmin;

GRANT DELETE ON TABLE "master"."payment_method" TO athyperapp;

GRANT INSERT ON TABLE "master"."payment_method" TO athyperapp;

GRANT SELECT ON TABLE "master"."payment_method" TO athyperapp;

GRANT UPDATE ON TABLE "master"."payment_method" TO athyperapp;

GRANT DELETE ON TABLE "master"."payment_term" TO athyperadmin;

GRANT INSERT ON TABLE "master"."payment_term" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."payment_term" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."payment_term" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."payment_term" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."payment_term" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term" TO athyperapp;

GRANT DELETE ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT INSERT ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."payment_term_clause" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term_clause" TO athyperapp;

GRANT DELETE ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT INSERT ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."payment_term_discount_tier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."payment_term_discount_tier" TO athyperapp;

GRANT DELETE ON TABLE "master"."person" TO athyperadmin;

GRANT INSERT ON TABLE "master"."person" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."person" TO athyperadmin;

GRANT SELECT ON TABLE "master"."person" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."person" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."person" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."person" TO athyperadmin;

GRANT SELECT ON TABLE "master"."person" TO athyperapp;

GRANT DELETE ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."person_sensitive_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."person_sensitive_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."planning_model" TO athyperadmin;

GRANT INSERT ON TABLE "master"."planning_model" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."planning_model" TO athyperadmin;

GRANT SELECT ON TABLE "master"."planning_model" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."planning_model" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."planning_model" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."planning_model" TO athyperadmin;

GRANT SELECT ON TABLE "master"."planning_model" TO athyperapp;

GRANT DELETE ON TABLE "master"."position" TO athyperadmin;

GRANT INSERT ON TABLE "master"."position" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."position" TO athyperadmin;

GRANT SELECT ON TABLE "master"."position" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."position" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."position" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."position" TO athyperadmin;

GRANT SELECT ON TABLE "master"."position" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_identity_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_identity_binding" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_notification_preference" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_notification_preference" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_relationship" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_relationship" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_ui_preference" TO athyperadmin;

GRANT DELETE ON TABLE "master"."principal_ui_preference" TO athyperapp;

GRANT INSERT ON TABLE "master"."principal_ui_preference" TO athyperapp;

GRANT SELECT ON TABLE "master"."principal_ui_preference" TO athyperapp;

GRANT UPDATE ON TABLE "master"."principal_ui_preference" TO athyperapp;

GRANT DELETE ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."principal_ui_profile" TO athyperadmin;

GRANT DELETE ON TABLE "master"."principal_ui_profile" TO athyperapp;

GRANT INSERT ON TABLE "master"."principal_ui_profile" TO athyperapp;

GRANT SELECT ON TABLE "master"."principal_ui_profile" TO athyperapp;

GRANT UPDATE ON TABLE "master"."principal_ui_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."print_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."print_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."print_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."print_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."print_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."print_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."print_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."print_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."procurement_organization_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."procurement_organization_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."product" TO athyperadmin;

GRANT INSERT ON TABLE "master"."product" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."product" TO athyperadmin;

GRANT SELECT ON TABLE "master"."product" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."product" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."product" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."product" TO athyperadmin;

GRANT SELECT ON TABLE "master"."product" TO athyperapp;

GRANT DELETE ON TABLE "master"."profit_center" TO athyperadmin;

GRANT INSERT ON TABLE "master"."profit_center" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."profit_center" TO athyperadmin;

GRANT SELECT ON TABLE "master"."profit_center" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."profit_center" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."profit_center" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."profit_center" TO athyperadmin;

GRANT SELECT ON TABLE "master"."profit_center" TO athyperapp;

GRANT DELETE ON TABLE "master"."project" TO athyperadmin;

GRANT INSERT ON TABLE "master"."project" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."project" TO athyperadmin;

GRANT SELECT ON TABLE "master"."project" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."project" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."project" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."project" TO athyperadmin;

GRANT SELECT ON TABLE "master"."project" TO athyperapp;

GRANT DELETE ON TABLE "master"."project_item" TO athyperadmin;

GRANT INSERT ON TABLE "master"."project_item" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."project_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."project_item" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."project_item" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."project_item" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."project_item" TO athyperadmin;

GRANT SELECT ON TABLE "master"."project_item" TO athyperapp;

GRANT DELETE ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT INSERT ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT SELECT ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."record_bookmark" TO athyperadmin;

GRANT SELECT ON TABLE "master"."record_bookmark" TO athyperapp;

GRANT DELETE ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT INSERT ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."risk_dimension" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_dimension" TO athyperapp;

GRANT DELETE ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT INSERT ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."risk_driver_registry" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_driver_registry" TO athyperapp;

GRANT DELETE ON TABLE "master"."risk_model" TO athyperadmin;

GRANT INSERT ON TABLE "master"."risk_model" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."risk_model" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_model" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."risk_model" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."risk_model" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."risk_model" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_model" TO athyperapp;

GRANT DELETE ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT INSERT ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."risk_model_dimension" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_model_dimension" TO athyperapp;

GRANT DELETE ON TABLE "master"."risk_source" TO athyperadmin;

GRANT INSERT ON TABLE "master"."risk_source" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."risk_source" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_source" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."risk_source" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."risk_source" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."risk_source" TO athyperadmin;

GRANT SELECT ON TABLE "master"."risk_source" TO athyperapp;

GRANT DELETE ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."sales_organization_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."sales_organization_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."saved_view" TO athyperadmin;

GRANT INSERT ON TABLE "master"."saved_view" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."saved_view" TO athyperadmin;

GRANT SELECT ON TABLE "master"."saved_view" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."saved_view" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."saved_view" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."saved_view" TO athyperadmin;

GRANT DELETE ON TABLE "master"."saved_view" TO athyperapp;

GRANT INSERT ON TABLE "master"."saved_view" TO athyperapp;

GRANT SELECT ON TABLE "master"."saved_view" TO athyperapp;

GRANT UPDATE ON TABLE "master"."saved_view" TO athyperapp;

GRANT DELETE ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT INSERT ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT SELECT ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."scoped_setting" TO athyperadmin;

GRANT SELECT ON TABLE "master"."scoped_setting" TO athyperapp;

GRANT DELETE ON TABLE "master"."shift_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."shift_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."shift_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."shift_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."shift_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."shift_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."shift_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."shift_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."site" TO athyperadmin;

GRANT INSERT ON TABLE "master"."site" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."site" TO athyperadmin;

GRANT SELECT ON TABLE "master"."site" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."site" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."site" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."site" TO athyperadmin;

GRANT SELECT ON TABLE "master"."site" TO athyperapp;

GRANT DELETE ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT INSERT ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT SELECT ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."statutory_scheme" TO athyperadmin;

GRANT SELECT ON TABLE "master"."statutory_scheme" TO athyperapp;

GRANT DELETE ON TABLE "master"."supplier" TO athyperadmin;

GRANT INSERT ON TABLE "master"."supplier" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."supplier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."supplier" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."supplier" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."supplier" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier" TO athyperapp;

GRANT DELETE ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT INSERT ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."supplier_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_app_index" TO athyperapp;

GRANT DELETE ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT INSERT ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."supplier_block" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_block" TO athyperapp;

GRANT DELETE ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT INSERT ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."supplier_commodity_category" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_commodity_category" TO athyperapp;

GRANT DELETE ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT INSERT ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."supplier_qualification" TO athyperadmin;

GRANT SELECT ON TABLE "master"."supplier_qualification" TO athyperapp;

GRANT DELETE ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tax_jurisdiction" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tax_jurisdiction" TO athyperapp;

GRANT DELETE ON TABLE "master"."tax_type" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tax_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tax_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tax_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tax_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tax_type" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tax_type" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tax_type" TO athyperapp;

GRANT DELETE ON TABLE "master"."team" TO athyperadmin;

GRANT INSERT ON TABLE "master"."team" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."team" TO athyperadmin;

GRANT SELECT ON TABLE "master"."team" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."team" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."team" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."team" TO athyperadmin;

GRANT SELECT ON TABLE "master"."team" TO athyperapp;

GRANT DELETE ON TABLE "master"."team_member" TO athyperadmin;

GRANT INSERT ON TABLE "master"."team_member" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."team_member" TO athyperadmin;

GRANT SELECT ON TABLE "master"."team_member" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."team_member" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."team_member" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."team_member" TO athyperadmin;

GRANT SELECT ON TABLE "master"."team_member" TO athyperapp;

GRANT DELETE ON TABLE "master"."template" TO athyperadmin;

GRANT INSERT ON TABLE "master"."template" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."template" TO athyperadmin;

GRANT SELECT ON TABLE "master"."template" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."template" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."template" TO athyperadmin;

GRANT SELECT ON TABLE "master"."template" TO athyperapp;

GRANT DELETE ON TABLE "master"."template_binding" TO athyperadmin;

GRANT INSERT ON TABLE "master"."template_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."template_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."template_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."template_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."template_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."template_binding" TO athyperadmin;

GRANT SELECT ON TABLE "master"."template_binding" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_identity_domain" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_identity_domain" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_identity_provider" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_identity_provider" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_parameter_definition" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_parameter_definition" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_parameter_value" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_parameter_value" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_profile" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_profile" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_relationship" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_relationship" TO athyperapp;

GRANT DELETE ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT INSERT ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."tenant_risk_source_config" TO athyperadmin;

GRANT SELECT ON TABLE "master"."tenant_risk_source_config" TO athyperapp;

GRANT DELETE ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT INSERT ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT SELECT ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."trusted_device" TO athyperadmin;

GRANT SELECT ON TABLE "master"."trusted_device" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_bank_account_link_resolved" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_bank_account_link_resolved" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_bank_account_resolved" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_bank_account_resolved" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_business_partner_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_address" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_business_partner_app_index" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_app_index" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_business_partner_bank_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_bank_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_business_partner_governance_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_governance_summary" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_business_partner_role_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_business_partner_role_summary" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_company_code_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_company_code_address" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_contact_summary" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_contact_summary" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_effective_principal_ui" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_effective_principal_ui" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_employee" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_employee" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_employee" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_employee" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_employee" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_employee" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_employee" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_employee" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_entity_commodity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_entity_commodity" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_resolved_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_resolved_address" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_resolved_identity" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_resolved_identity" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_site_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_site_address" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_supplier_address" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_supplier_address" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_supplier_bank_account" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_supplier_bank_account" TO athyperapp;

GRANT DELETE ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT INSERT ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."v_tenant_risk_source_config" TO athyperadmin;

GRANT SELECT ON TABLE "master"."v_tenant_risk_source_config" TO athyperapp;

GRANT DELETE ON TABLE "master"."warehouse" TO athyperadmin;

GRANT INSERT ON TABLE "master"."warehouse" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."warehouse" TO athyperadmin;

GRANT SELECT ON TABLE "master"."warehouse" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."warehouse" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."warehouse" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."warehouse" TO athyperadmin;

GRANT SELECT ON TABLE "master"."warehouse" TO athyperapp;

GRANT DELETE ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."work_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_assignment" TO athyperapp;

GRANT DELETE ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT INSERT ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."work_pattern" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_pattern" TO athyperapp;

GRANT DELETE ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT INSERT ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT REFERENCES ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT TRIGGER ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT TRUNCATE ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT UPDATE ON TABLE "master"."work_pattern_day" TO athyperadmin;

GRANT SELECT ON TABLE "master"."work_pattern_day" TO athyperapp;
