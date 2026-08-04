-- ============================================================================
-- master/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "asset_assign_hist_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_support_session_audit"
  ADD CONSTRAINT "atlas_support_session_audit_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_pkey" PRIMARY KEY (conversation_id);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."attachment_folder"
  ADD CONSTRAINT "af_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bank_account_link_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."career_band"
  ADD CONSTRAINT "career_band_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."career_level"
  ADD CONSTRAINT "career_level_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."certification_type"
  ADD CONSTRAINT "ctype_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "chart_of_account_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."comment_feed_cursor"
  ADD CONSTRAINT "cfc_pk" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."comment_mention"
  ADD CONSTRAINT "cm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."comment_reaction"
  ADD CONSTRAINT "cr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "commodity_classification_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."contact_marketing_consent"
  ADD CONSTRAINT "contact_marketing_consent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."customer_app_index"
  ADD CONSTRAINT "customer_app_index_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."designation"
  ADD CONSTRAINT "designation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "dimension_set_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."filter_preset"
  ADD CONSTRAINT "filter_preset_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."label"
  ADD CONSTRAINT "label_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_pkey" PRIMARY KEY (entity);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."leave_type"
  ADD CONSTRAINT "leave_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "ledger_book_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."network_provider"
  ADD CONSTRAINT "np_pkey" PRIMARY KEY (code);

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notification_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_contact_role"
  ADD CONSTRAINT "pcr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."pay_grade"
  ADD CONSTRAINT "pay_grade_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_pkey" PRIMARY KEY (tenant_id, operating_organization_id);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."record_bookmark"
  ADD CONSTRAINT "record_bookmark_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."risk_dimension"
  ADD CONSTRAINT "rd_pkey" PRIMARY KEY (code);

ALTER TABLE ONLY "master"."risk_driver_registry"
  ADD CONSTRAINT "rdr_pkey" PRIMARY KEY (code);

ALTER TABLE ONLY "master"."risk_model"
  ADD CONSTRAINT "rm_pkey" PRIMARY KEY (code, version);

ALTER TABLE ONLY "master"."risk_model_dimension"
  ADD CONSTRAINT "rmd_pkey" PRIMARY KEY (model_code, model_version, dimension_code);

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_pkey" PRIMARY KEY (code);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_pkey" PRIMARY KEY (tenant_id, operating_organization_id);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."scoped_setting"
  ADD CONSTRAINT "scoped_setting_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."shift_type"
  ADD CONSTRAINT "shift_type_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."supplier_app_index"
  ADD CONSTRAINT "supplier_app_index_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."team_member"
  ADD CONSTRAINT "team_member_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."trusted_device"
  ADD CONSTRAINT "trusted_device_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "warehouse_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_owner_purpose_address_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, owner_type, owner_id, purpose, role_qualifier, address_id);

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_tenant_company_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "asset_assign_hist_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_asset_type_uq" UNIQUE (tenant_id, asset_id, book_type);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_tenant_id_asset_uq" UNIQUE (tenant_id, id, asset_id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_parent_child_uq" UNIQUE (tenant_id, parent_asset_id, component_asset_id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_ordinal_uq" UNIQUE (tenant_id, revision_id, ordinal);

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_source_version_uq" UNIQUE (tenant_id, source_id, source_version_id);

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_tenant_uq" UNIQUE (tenant_id, source_kind, source_id);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_scope_id_uq" UNIQUE (tenant_id, conversation_id, plane, id);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_sequence_uq" UNIQUE (tenant_id, conversation_id, sequence);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_scope_uq" UNIQUE (tenant_id, conversation_id, plane);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_tenant_conversation_uq" UNIQUE (tenant_id, conversation_id);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_boundary_uq" UNIQUE (tenant_id, plane_code, id);

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_uq" UNIQUE (tenant_id, plane_code, delegation_id, permission_id, scope_target_id);

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_boundary_uq" UNIQUE (tenant_id, plane_code, id);

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_uq" UNIQUE (tenant_id, plane_code, code);

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_uq" UNIQUE (tenant_id, plane_code, group_id, principal_id);

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_uq" UNIQUE (tenant_id, plane_code, group_id, role_id, scope_target_id);

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_uq" UNIQUE (tenant_id, plane_code, principal_id);

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_uq" UNIQUE (tenant_id, plane_code, entity_id, record_id, permission_id, subject_kind, principal_id, group_id);

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_boundary_uq" UNIQUE (tenant_id, plane_code, id);

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_uq" UNIQUE (tenant_id, plane_code, code);

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_uq" UNIQUE (tenant_id, plane_code, role_id, permission_id);

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_boundary_uq" UNIQUE (tenant_id, plane_code, id);

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_uq" UNIQUE (tenant_id, plane_code, scope_kind, scope_key);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_link_uq" UNIQUE (tenant_id, bank_account_link_id);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bank_account_link_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_tenant_code_uq" UNIQUE (tenant_id, budget_profile_id, code);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_bp_provider_doctype_dir_uq" UNIQUE (tenant_id, business_partner_id, provider_code, document_type_id, document_direction);

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_bp_provider_uq" UNIQUE (tenant_id, business_partner_id, provider_code);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_from_to_type_uq" UNIQUE (tenant_id, from_bp_id, to_bp_id, relation_type);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."career_band"
  ADD CONSTRAINT "career_band_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."career_band"
  ADD CONSTRAINT "career_band_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."career_level"
  ADD CONSTRAINT "career_level_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."career_level"
  ADD CONSTRAINT "career_level_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "chart_of_account_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "chart_of_account_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_one_per_target_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, principal_id, entity_type, entity_id, parent_comment_id);

ALTER TABLE ONLY "master"."comment_feed_cursor"
  ADD CONSTRAINT "cfc_unique" UNIQUE (tenant_id, principal_id, entity_type, entity_id);

ALTER TABLE ONLY "master"."comment_mention"
  ADD CONSTRAINT "cm_unique" UNIQUE (tenant_id, context_type, comment_id, mentioned_id);

ALTER TABLE ONLY "master"."comment_reaction"
  ADD CONSTRAINT "cr_unique" UNIQUE (tenant_id, context_type, comment_id, principal_id, reaction_type);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_owner_code_uq" UNIQUE (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_company_book_uq" UNIQUE (tenant_id, company_code_id, book_id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_unique" UNIQUE (tenant_id, company_code_id, chart_of_account_id, assignment_type);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_customer_company_uq" UNIQUE (tenant_id, customer_id, company_code_id);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_unique" UNIQUE (tenant_id, company_code_id, gl_account_id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_supplier_company_uq" UNIQUE (tenant_id, supplier_id, company_code_id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_contact_link_uq" UNIQUE (tenant_id, contact_link_id);

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."contact_marketing_consent"
  ADD CONSTRAINT "contact_marketing_consent_owner_uq" UNIQUE (tenant_id, owner_type, owner_id);

ALTER TABLE ONLY "master"."contact_marketing_consent"
  ADD CONSTRAINT "contact_marketing_consent_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_contact_link_uq" UNIQUE (tenant_id, contact_link_id);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_slug_uq" UNIQUE (tenant_id, parent_id, locale_code, slug);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_edge_uq" UNIQUE (tenant_id, source_content_item_id, target_content_item_id, relation_type);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_unique" UNIQUE (tenant_id, conversation_id, principal_id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_company_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_bp_uq" UNIQUE (tenant_id, business_partner_id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_tenant_code_uq" UNIQUE (tenant_id, customer_code);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."customer_app_index"
  ADD CONSTRAINT "customer_app_index_tenant_cus_uq" UNIQUE (tenant_id, customer_id);

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_customer_uq" UNIQUE (tenant_id, customer_id);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_ordinal_bp_uq" UNIQUE NULLS NOT DISTINCT (dashboard_id, breakpoint_code, ordinal_no);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_widget_bp_uq" UNIQUE NULLS NOT DISTINCT (dashboard_id, widget_code, breakpoint_code);

ALTER TABLE ONLY "master"."designation"
  ADD CONSTRAINT "designation_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."designation"
  ADD CONSTRAINT "designation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "dimension_set_hash_uq" UNIQUE (tenant_id, set_hash);

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "dimension_set_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_set_ordinal_uq" UNIQUE (dimension_set_id, ordinal);

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_set_type_uq" UNIQUE (dimension_set_id, dimension_type_id);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_tenant_empno_uq" UNIQUE (tenant_id, employee_number);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_uq" UNIQUE (tenant_id, employee_id, leave_plan_id, effective_from);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_uq" UNIQUE (tenant_id, employee_id, statutory_scheme_id, effective_from);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_number_uq" UNIQUE (tenant_id, employment_number);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_source_uq" UNIQUE (tenant_id, source_system, external_id);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."filter_preset"
  ADD CONSTRAINT "filter_preset_name_unique" UNIQUE (tenant_id, principal_id, entity_code, name);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_company_year_period_uq" UNIQUE (tenant_id, company_code_id, fiscal_year, period_number);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_chart_code_uq" UNIQUE (tenant_id, chart_of_account_id, code);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_calendar_date_uq" UNIQUE (holiday_calendar_id, holiday_date);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_direction_uq" UNIQUE (tenant_id, source_company_code_id, counterparty_company_code_id);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_company_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."label"
  ADD CONSTRAINT "label_natural_uq" UNIQUE NULLS NOT DISTINCT (entity, code, locale_code, tenant_id);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_code_uq" UNIQUE (tenant_id, leave_plan_id, rule_code);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."leave_type"
  ADD CONSTRAINT "leave_type_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."leave_type"
  ADD CONSTRAINT "leave_type_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "ledger_book_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "ledger_book_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_le_bp_type_uq" UNIQUE (tenant_id, legal_entity_id, business_partner_id, relationship_type);

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_alias_provider_uq" UNIQUE (provider_code, realm_key, org_alias);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_legal_entity_provider_uq" UNIQUE (tenant_id, legal_entity_id, provider_code);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_subject_provider_uq" UNIQUE (provider_code, realm_key, subject_id);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_le_provider_account_uq" UNIQUE (tenant_id, legal_entity_id, provider_code, account_code, account_role);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_entity_uq" UNIQUE (tenant_id, entity_name, entity_id, lifecycle_id);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_upload_id_uq" UNIQUE (tenant_id, upload_id);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_tenant_domain_code_uq" UNIQUE (tenant_id, domain, code);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_membership_uq" UNIQUE (tenant_id, operating_organization_id, company_code_id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_contact_role"
  ADD CONSTRAINT "pcr_contact_role_uq" UNIQUE (tenant_id, party_contact_person_id, role_code);

ALTER TABLE ONLY "master"."party_contact_role"
  ADD CONSTRAINT "pcr_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_owner_scheme_uq" UNIQUE (tenant_id, owner_type, owner_id, scheme, value);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_assessment_dim_uq" UNIQUE (assessment_id, dimension_code);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_owner_country_uq" UNIQUE (tenant_id, owner_type, owner_id, country_code);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."pay_grade"
  ADD CONSTRAINT "pay_grade_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."pay_grade"
  ADD CONSTRAINT "pay_grade_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_component_uq" UNIQUE (tenant_id, pay_structure_id, pay_component_id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_no_uq" UNIQUE (tenant_id, pay_structure_id, line_no);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_tenant_code_ver_uq" UNIQUE (tenant_id, code, version);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_term_code_uq" UNIQUE (tenant_id, payment_term_id, clause_code);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_term_seq_uq" UNIQUE (tenant_id, payment_term_id, sequence_no);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_term_tier_uq" UNIQUE (payment_term_id, tier_no);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_number_uq" UNIQUE (tenant_id, person_number);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_person_uq" UNIQUE (tenant_id, person_id);

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_tenant_code_ver_uq" UNIQUE (tenant_id, code, version);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_principal_realm_provider_uq" UNIQUE (tenant_id, principal_id, realm_key, provider_code);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_subject_realm_provider_uq" UNIQUE (tenant_id, realm_key, provider_code, subject_id);

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_natural_key_uq" UNIQUE (tenant_id, principal_id, plane_key, event_code, channel);

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_keycloak_uq" UNIQUE NULLS NOT DISTINCT (keycloak_id);

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_principal_uq" UNIQUE (tenant_id, principal_id);

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_pair_type_uq" UNIQUE (from_tenant_id, from_principal_id, to_tenant_id, to_principal_id, relationship_type);

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, principal_id, preference_code, surface_code);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_principal_uq" UNIQUE (tenant_id, principal_id);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_company_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_proj_code_uq" UNIQUE (tenant_id, project_id, code);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."record_bookmark"
  ADD CONSTRAINT "record_bookmark_unique" UNIQUE (tenant_id, principal_id, entity_code, record_id);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."scoped_setting"
  ADD CONSTRAINT "scoped_setting_uq" UNIQUE (tenant_id, scope_kind, scope_id, section_code, setting_key);

ALTER TABLE ONLY "master"."shift_type"
  ADD CONSTRAINT "shift_type_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."shift_type"
  ADD CONSTRAINT "shift_type_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_bp_uq" UNIQUE (tenant_id, business_partner_id);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_tenant_code_uq" UNIQUE (tenant_id, supplier_code);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."supplier_app_index"
  ADD CONSTRAINT "supplier_app_index_tenant_sup_uq" UNIQUE (tenant_id, supplier_id);

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_supplier_category_uq" UNIQUE (tenant_id, supplier_id, commodity_category_id);

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_supplier_uq" UNIQUE (tenant_id, supplier_id);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_realm_code_uq" UNIQUE (realm_key, code);

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_tenant_domain_uq" UNIQUE (tenant_id, domain);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_tenant_alias_uq" UNIQUE (tenant_id, keycloak_alias);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_code_uq" UNIQUE (tenant_id, parameter_code);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_tenant_uq" UNIQUE (tenant_id);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_pair_type_uq" UNIQUE (from_tenant_id, to_tenant_id, relationship_type);

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_source_uq" UNIQUE (tenant_id, source_code);

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."trusted_device"
  ADD CONSTRAINT "trusted_device_token_uq" UNIQUE (tenant_id, principal_id, device_token_hash);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "warehouse_site_code_uq" UNIQUE (tenant_id, site_id, code);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "warehouse_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_no_uq" UNIQUE (tenant_id, work_pattern_id, day_no);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_code_fmt" CHECK (code ~ '^[A-Z][A-Z0-9_]*$'::text);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_direction_chk" CHECK (direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text, 'BILATERAL'::text]));

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_subledger_chk" CHECK (subledger_type = ANY (ARRAY['AP'::text, 'AR'::text, 'ASSET'::text, 'INVENTORY'::text, 'WIP'::text, 'COMMISSION'::text, 'NONE'::text]));

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_code_fmt" CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'::text);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_country_upper_chk" CHECK (country_code IS NULL OR country_code = upper(country_code));

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_lat_range_chk" CHECK (latitude IS NULL OR latitude >= '-90'::integer::numeric AND latitude <= 90::numeric);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_line1_nonempty_chk" CHECK (line1 IS NULL OR btrim(line1) <> ''::text);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_lon_range_chk" CHECK (longitude IS NULL OR longitude >= '-180'::integer::numeric AND longitude <= 180::numeric);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_postal_nonempty_chk" CHECK (postal_code IS NULL OR btrim(postal_code) <> ''::text);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_temporal_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_acquisition_cost_pos" CHECK (acquisition_cost >= 0::numeric);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_disposal_proceeds_pos" CHECK (disposal_proceeds IS NULL OR disposal_proceeds >= 0::numeric);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_in_service_after_acq" CHECK (in_service_date IS NULL OR in_service_date >= acquisition_date);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_residual_value_pos" CHECK (residual_value >= 0::numeric);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_useful_life_pos" CHECK (useful_life_months > 0);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "asset_assign_hist_dates_chk" CHECK (effective_to IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_accum_depr_pos" CHECK (accumulated_depreciation >= 0::numeric);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_bonus_pct_chk" CHECK (bonus_depreciation_pct >= 0::numeric AND bonus_depreciation_pct <= 100::numeric);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_cost_basis_pos" CHECK (cost_basis >= 0::numeric);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_impairment_pos" CHECK (cumulative_impairment >= 0::numeric);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_no_over_depr" CHECK (accumulated_depreciation <= (cost_basis + cumulative_revaluation - cumulative_impairment - residual_value));

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_residual_pos" CHECK (residual_value >= 0::numeric);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "asset_book_useful_life_pos" CHECK (useful_life_months > 0);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_depr_nature_chk" CHECK ((asset_nature <> ALL (ARRAY['land'::text, 'cwip'::text])) OR is_depreciable = false);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_life_policy_chk" CHECK (useful_life_override_policy = ANY (ARRAY['allow'::text, 'require'::text, 'forbid'::text]));

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_nature_chk" CHECK (asset_nature = ANY (ARRAY['tangible'::text, 'intangible'::text, 'land'::text, 'cwip'::text, 'rou'::text, 'leasehold_improvement'::text]));

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "asset_class_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_cost_pos" CHECK (allocated_cost >= 0::numeric);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_dates_chk" CHECK (effective_to IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_life_pos" CHECK (useful_life_months > 0);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_no_self_ref" CHECK (parent_asset_id IS DISTINCT FROM component_asset_id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "asset_component_pct_chk" CHECK (pct_of_parent > 0::numeric AND pct_of_parent <= 100::numeric);

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_range_chk" CHECK (character_start >= 0 AND character_end > character_start);

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_status_chk" CHECK (index_status = ANY (ARRAY['pending'::text, 'indexing'::text, 'ready'::text, 'failed'::text, 'deleted'::text]));

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'indexing'::text, 'ready'::text, 'failed'::text, 'superseded'::text, 'deleted'::text]));

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_version_chk" CHECK (btrim(source_version_id) <> ''::text);

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_id_chk" CHECK (btrim(source_id) <> ''::text);

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_kind_chk" CHECK (source_kind = ANY (ARRAY['record'::text, 'attachment'::text, 'content'::text]));

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_permission_chk" CHECK (btrim(permission_code) <> ''::text);

ALTER TABLE ONLY "master"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'deleted'::text]));

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_citation_refs_chk" CHECK (jsonb_typeof(citation_refs) = 'array'::text);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_blocks_chk" CHECK (jsonb_typeof(content_blocks) = 'array'::text);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_ref_chk" CHECK (protected_content_ref IS NULL OR btrim(protected_content_ref) <> ''::text);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_storage_chk" CHECK (protected_content_ref IS NULL OR content_blocks = '[]'::jsonb);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_error_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])) AND terminal_error_class IS NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])) AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_parent_chk" CHECK (parent_message_id IS NULL OR parent_message_id <> id);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_result_cards_chk" CHECK (jsonb_typeof(result_cards) = 'array'::text);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_role_chk" CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text, 'system'::text]));

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_sequence_chk" CHECK (sequence > 0);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_terminal_chk" CHECK (status = 'pending'::text AND terminal_at IS NULL OR (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL);

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_tool_refs_chk" CHECK (jsonb_typeof(tool_refs) = 'array'::text);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_binding_hash_chk" CHECK (session_binding_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_end_chk" CHECK (status = 'active'::text AND ended_at IS NULL OR status <> 'active'::text AND ended_at IS NOT NULL);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_plane_chk" CHECK (plane = 'admin'::text);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_scope_chk" CHECK (cardinality(allowed_scopes) >= 1 AND cardinality(allowed_scopes) <= 4 AND allowed_scopes <@ ARRAY['permission_denial.explain'::text, 'principal.find_current_scope'::text, 'policy_trace.explain'::text, 'tenant_health.summarize'::text]);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'ended'::text]));

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_time_chk" CHECK (expires_at > issued_at);

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_token_hash_chk" CHECK (token_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "master"."atlas_support_session_audit"
  ADD CONSTRAINT "atlas_support_audit_event_chk" CHECK (event = ANY (ARRAY['access_started'::text, 'data_read'::text, 'exported'::text, 'access_ended'::text, 'access_denied'::text]));

ALTER TABLE ONLY "master"."atlas_support_session_audit"
  ADD CONSTRAINT "atlas_support_audit_hash_chk" CHECK (resource_hash IS NULL OR resource_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_expiry_chk" CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_legal_hold_chk" CHECK (legal_hold = false AND legal_hold_reference IS NULL OR legal_hold = true AND legal_hold_reference IS NOT NULL AND btrim(legal_hold_reference) <> ''::text);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_purge_chk" CHECK (purge_after IS NULL OR purge_after > created_at);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_retention_policy_chk" CHECK (retention_policy_id IS NULL OR btrim(retention_policy_id) <> ''::text);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_row_version_chk" CHECK (row_version >= 1);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_sequence_chk" CHECK (last_message_sequence >= 0);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_blocks_chk" CHECK (summary_blocks IS NULL OR jsonb_typeof(summary_blocks) = 'array'::text);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_ref_chk" CHECK (protected_summary_ref IS NULL OR btrim(protected_summary_ref) <> ''::text);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_storage_chk" CHECK (summary_blocks IS NULL OR protected_summary_ref IS NULL);

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_version_chk" CHECK (summary_version >= 0);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_bucket_chk" CHECK (btrim(storage_bucket) <> ''::text);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_expiry_chk" CHECK (expires_at IS NULL OR retention_until IS NULL OR expires_at <= retention_until);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_file_name_chk" CHECK (btrim(file_name) <> ''::text);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_key_chk" CHECK (btrim(storage_key) <> ''::text);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_ref_count_chk" CHECK (reference_count >= 0);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_shard_chk" CHECK (shard IS NULL OR shard >= 0);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_size_chk" CHECK (size_bytes IS NULL OR size_bytes >= 0);

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_status_chk" CHECK (status = ANY (ARRAY['uploaded'::text, 'active'::text, 'archived'::text, 'quarantined'::text, 'deleted'::text, 'failed'::text, 'orphaned'::text]));

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_text_extraction_status_chk" CHECK (text_extraction_status IS NULL OR (text_extraction_status = ANY (ARRAY['pending'::text, 'extracted'::text, 'skipped'::text, 'failed'::text])));

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_version_chk" CHECK (version_no >= 1);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_content_chk" CHECK (btrim(content) <> ''::text);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_mentions_chk" CHECK (mentions IS NULL OR jsonb_typeof(mentions) = 'array'::text);

ALTER TABLE ONLY "master"."attachment_folder"
  ADD CONSTRAINT "af_entity_id_chk" CHECK (btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "master"."attachment_folder"
  ADD CONSTRAINT "af_entity_type_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "master"."attachment_folder"
  ADD CONSTRAINT "af_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_no_self_chk" CHECK (delegator_id <> delegate_id);

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_window_chk" CHECK (effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_subject_chk" CHECK (subject_kind = 'principal'::text AND principal_id IS NOT NULL AND group_id IS NULL AND policy_code IS NULL AND policy_version IS NULL OR subject_kind = 'group'::text AND group_id IS NOT NULL AND principal_id IS NULL AND policy_code IS NULL AND policy_version IS NULL OR subject_kind = 'hard_policy'::text AND policy_code IS NOT NULL AND policy_version IS NOT NULL AND principal_id IS NULL AND group_id IS NULL);

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_window_chk" CHECK (effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_subject_chk" CHECK (subject_kind = 'principal'::text AND principal_id IS NOT NULL AND group_id IS NULL OR subject_kind = 'group'::text AND group_id IS NOT NULL AND principal_id IS NULL);

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_kind_chk" CHECK (role_kind = ANY (ARRAY['system'::text, 'custom'::text]));

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_window_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_kind_chk" CHECK (scope_kind = ANY (ARRAY['tenant'::text, 'company_code'::text, 'legal_entity'::text, 'operating_organization'::text]));

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_shape_chk" CHECK (scope_kind = 'tenant'::text AND tenant_scope_id = tenant_id AND company_code_id IS NULL AND legal_entity_id IS NULL AND operating_organization_id IS NULL OR scope_kind = 'company_code'::text AND company_code_id IS NOT NULL AND tenant_scope_id IS NULL AND legal_entity_id IS NULL AND operating_organization_id IS NULL OR scope_kind = 'legal_entity'::text AND legal_entity_id IS NOT NULL AND tenant_scope_id IS NULL AND company_code_id IS NULL AND operating_organization_id IS NULL OR scope_kind = 'operating_organization'::text AND operating_organization_id IS NOT NULL AND tenant_scope_id IS NULL AND company_code_id IS NULL AND legal_entity_id IS NULL);

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_acct_id_nonempty" CHECK (btrim(account_id_value) <> ''::text);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_bank_country_chk" CHECK (bank_country_override IS NULL OR bank_country_override::text = upper(bank_country_override::text));

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_bank_identity_chk" CHECK (bank_party_id IS NOT NULL OR bank_name_override IS NOT NULL AND bank_country_override IS NOT NULL);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_bic_fmt_chk" CHECK (bic_override IS NULL OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'::text);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_code_fmt_chk" CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'::text);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_correspondent_not_self_chk" CHECK (correspondent_bank_party_id IS NULL OR correspondent_bank_party_id <> bank_party_id);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_currency_upper_chk" CHECK (currency_code::text = upper(currency_code::text));

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_holder_nonempty" CHECK (btrim(account_holder_name) <> ''::text);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_last4_chk" CHECK (account_last4 IS NULL OR account_last4 ~ '^[A-Z0-9]{4}$'::text);

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_verified_at_chk" CHECK (is_verified = false OR verified_at IS NOT NULL);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_default_coll_chk" CHECK (NOT is_default_collection OR is_collection_enabled);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_default_disb_chk" CHECK (NOT is_default_disbursement OR is_disbursement_enabled);

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bal_temporal_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_bic_fmt_chk" CHECK (bic IS NULL OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'::text);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_country_upper_chk" CHECK (country_code::text = upper(country_code::text));

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_nat_code_pair_chk" CHECK (national_bank_code_type IS NULL AND national_bank_code IS NULL OR national_bank_code_type IS NOT NULL AND national_bank_code IS NOT NULL);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_direction_chk" CHECK (direction = ANY (ARRAY['LTR'::text, 'RTL'::text]));

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_locale_chk" CHECK (btrim(default_locale) <> ''::text);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_allocated_nonneg" CHECK (allocated_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_consumed_nonneg" CHECK (consumed_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_fund_center_present" CHECK (cost_center_id IS NOT NULL OR project_id IS NOT NULL OR gl_account_id IS NOT NULL);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_no_self_carry" CHECK (carry_forward_from_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_overspend_chk" CHECK (overspend_policy = ANY (ARRAY['BLOCK'::text, 'WARN'::text, 'ALLOW'::text, 'ESCALATE'::text]));

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_released_nonneg" CHECK (released_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_reserved_nonneg" CHECK (reserved_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'exhausted'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_strategy_chk" CHECK (multi_year_strategy IS NULL OR (multi_year_strategy = ANY (ARRAY['CURRENT_YEAR_ONLY'::text, 'HORIZON_SPREAD'::text, 'FULL_RESERVE'::text])));

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "balloc_tolerance_chk" CHECK (tolerance_pct >= 0::numeric AND tolerance_pct <= 100::numeric);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_consumed_lte_total" CHECK (consumed_amount <= total_amount);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_consumed_nonneg" CHECK (consumed_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_no_self_parent" CHECK (parent_profile_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_overspend_chk" CHECK (overspend_policy = ANY (ARRAY['BLOCK'::text, 'WARN'::text, 'ALLOW'::text, 'ESCALATE'::text]));

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_reserved_lte_total" CHECK (reserved_amount <= total_amount);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_reserved_nonneg" CHECK (reserved_amount >= 0::numeric);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_source_chk" CHECK (fund_source = ANY (ARRAY['INTERNAL'::text, 'EXTERNAL'::text, 'GRANT'::text, 'DONATION'::text, 'LOAN'::text, 'MIXED'::text]));

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_strategy_chk" CHECK (multi_year_strategy = ANY (ARRAY['CURRENT_YEAR_ONLY'::text, 'HORIZON_SPREAD'::text, 'FULL_RESERVE'::text]));

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_tolerance_chk" CHECK (tolerance_pct >= 0::numeric AND tolerance_pct <= 100::numeric);

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_type_chk" CHECK (fund_type = ANY (ARRAY['OPERATING'::text, 'CAPITAL'::text, 'GRANT'::text, 'PROJECT'::text, 'RESERVE'::text, 'CONTINGENCY'::text, 'REVOLVING'::text]));

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "bp_valid_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_depth_chk" CHECK (depth >= 0);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_domain_chk" CHECK (domain = ANY (ARRAY['OPEX'::text, 'CAPEX'::text, 'REVENUE'::text, 'COST_OF_SALES'::text, 'TRANSFER'::text, 'REGULATORY'::text, 'ADMIN'::text, 'DEFERRED_REVENUE'::text]));

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_visibility_chk" CHECK (visibility = ANY (ARRAY['STANDARD'::text, 'RESTRICTED'::text, 'CONFIDENTIAL'::text]));

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_effective_order_chk" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_founded_year_chk" CHECK (founded_year IS NULL OR founded_year >= 1800 AND founded_year <= 2200);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_no_self_parent" CHECK (parent_business_partner_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_partner_category_chk" CHECK (partner_category = ANY (ARRAY['organization'::text, 'individual'::text, 'government'::text, 'internal'::text]));

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_reg_country_fmt_chk" CHECK (registration_country_code IS NULL OR registration_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_status_chk" CHECK (status = ANY (ARRAY['prospect'::text, 'active'::text, 'on_hold'::text, 'inactive'::text, 'blocked'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tax_country_fmt_chk" CHECK (tax_residence_country_code IS NULL OR tax_residence_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_website_fmt_chk" CHECK (website_url IS NULL OR website_url ~ '^https?://'::text);

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_direction_chk" CHECK (document_direction = ANY (ARRAY['send'::text, 'receive'::text, 'both'::text]));

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_doc_type_chk" CHECK (document_type_id = ANY (ARRAY['invoice'::text, 'credit_note'::text, 'order'::text, 'order_response'::text, 'despatch_advice'::text, 'statement'::text, 'remittance'::text, 'custom'::text]));

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_connection_status_chk" CHECK (connection_status = ANY (ARRAY['not_linked'::text, 'invited'::text, 'connected'::text, 'suspended'::text]));

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_match_confidence_chk" CHECK (match_confidence IS NULL OR match_confidence >= 0::numeric AND match_confidence <= 100::numeric);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_network_account_nonempty" CHECK (btrim(network_account_id) <> ''::text);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_sync_status_chk" CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'drift'::text, 'error'::text]));

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_verification_status_chk" CHECK (verification_status = ANY (ARRAY['unverified'::text, 'matched'::text, 'verified'::text, 'conflict'::text]));

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_custom_type_req" CHECK (relation_type <> 'custom'::text OR custom_type IS NOT NULL);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_direction_chk" CHECK (direction = ANY (ARRAY['directional'::text, 'bidirectional'::text]));

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_effective_order_chk" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_no_self_relation" CHECK (from_bp_id IS DISTINCT FROM to_bp_id);

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_relation_type_chk" CHECK (relation_type = ANY (ARRAY['distributor_of'::text, 'agent_of'::text, 'subsidiary_of'::text, 'consortium_member_of'::text, 'reseller_of'::text, 'jv_partner_of'::text, 'custom'::text]));

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text, 'terminated'::text]));

ALTER TABLE ONLY "master"."career_band"
  ADD CONSTRAINT "career_band_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."career_band"
  ADD CONSTRAINT "career_band_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."career_level"
  ADD CONSTRAINT "career_level_no_chk" CHECK (level_no >= 1);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_owner_nonempty" CHECK (btrim(owner_type) <> ''::text);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'superseded'::text]));

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_type_xor_custom" CHECK (certification_type_id IS NOT NULL AND custom_name IS NULL OR certification_type_id IS NULL AND custom_name IS NOT NULL);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_validity_order" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."certification_type"
  ADD CONSTRAINT "ctype_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_-]*$'::text);

ALTER TABLE ONLY "master"."certification_type"
  ADD CONSTRAINT "ctype_custom_tenant" CHECK (NOT is_custom OR tenant_id IS NOT NULL);

ALTER TABLE ONLY "master"."certification_type"
  ADD CONSTRAINT "ctype_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."certification_type"
  ADD CONSTRAINT "ctype_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_category_chk" CHECK (category = ANY (ARRAY['workflow'::text, 'accounting'::text, 'financial'::text, 'snapshot'::text]));

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_code_fmt_chk" CHECK (btrim(code) <> ''::text AND code = lower(code));

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_severity_chk" CHECK (severity = ANY (ARRAY['normal'::text, 'elevated'::text, 'critical'::text]));

ALTER TABLE ONLY "master"."change_reason_code"
  ADD CONSTRAINT "change_reason_code_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "chart_of_account_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "chart_of_account_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_delete_chk" CHECK (deleted_at IS NULL AND deleted_by IS NULL OR deleted_at IS NOT NULL AND deleted_by IS NOT NULL);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_depth_chk" CHECK (thread_depth >= 0 AND thread_depth <= 5);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_intent_chk" CHECK (btrim(comment_intent) <> ''::text);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_mentions_chk" CHECK (mentions IS NULL OR jsonb_typeof(mentions) = 'array'::text);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text]));

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_text_chk" CHECK (btrim(comment_text) <> ''::text);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_text_len_chk" CHECK (char_length(comment_text) <= 50000);

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_visibility_chk" CHECK (visibility = ANY (ARRAY['public'::text, 'internal'::text, 'private'::text]));

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_text_chk" CHECK (btrim(draft_text) <> ''::text);

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_text_len_chk" CHECK (char_length(draft_text) <= 50000);

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_visibility_chk" CHECK (visibility = ANY (ARRAY['public'::text, 'internal'::text, 'private'::text]));

ALTER TABLE ONLY "master"."comment_feed_cursor"
  ADD CONSTRAINT "cfc_entity_id_len" CHECK (char_length(entity_id) >= 1 AND char_length(entity_id) <= 120);

ALTER TABLE ONLY "master"."comment_feed_cursor"
  ADD CONSTRAINT "cfc_entity_type_len" CHECK (char_length(entity_type) >= 1 AND char_length(entity_type) <= 120);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_domains_array_chk" CHECK (jsonb_typeof(allowed_classification_domains) = 'array'::text);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_hs_domain_chk" CHECK (NOT is_hs_required OR allowed_classification_domains ? 'hs'::text);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_inventory_gate_chk" CHECK (inventory_allowed OR NOT is_stockable AND NOT is_consumable);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_lot_req_allowed_chk" CHECK (NOT is_lot_tracking_required OR is_lot_tracking_allowed);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_no_self_parent" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_rev_method_chk" CHECK (sales_revenue_recognition_method = ANY (ARRAY['POINT_IN_TIME'::text, 'OVER_TIME'::text, 'PCT_COMPLETION'::text, 'INPUT_METHOD'::text, 'OUTPUT_METHOD'::text]));

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_root_is_self" CHECK (parent_id IS NOT NULL OR root_category_id = id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_serial_req_allowed_chk" CHECK (NOT is_serial_tracking_required OR is_serial_tracking_allowed);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "commodity_category_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_confidence_range" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 100::numeric);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_country_fmt_chk" CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_date_format_chk" CHECK (date_format IS NULL OR (date_format = ANY (ARRAY['%d %b %Y'::text, '%d-%b-%Y'::text, '%d/%m/%Y'::text, '%m/%d/%Y'::text, '%Y-%m-%d'::text])));

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_fy_start_chk" CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "company_code_week_start_chk" CHECK (week_start IS NULL OR (week_start = ANY (ARRAY[0, 1, 6])));

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_dates_chk" CHECK (effective_to IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_dates" CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_block_reason_chk" CHECK (NOT is_blocked OR block_reason IS NOT NULL);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_credit_limit_currency_fmt_chk" CHECK (credit_limit_currency_code IS NULL OR credit_limit_currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_credit_limit_currency_req_chk" CHECK (credit_limit IS NULL OR credit_limit_currency_code IS NOT NULL);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_credit_nonneg" CHECK (credit_limit IS NULL OR credit_limit >= 0::numeric);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_override_chk" CHECK (allow_override OR is_mandatory);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_block_reason_chk" CHECK (NOT is_blocked OR block_reason IS NOT NULL);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_apportion_chk" CHECK (default_apportion_basis IS NULL OR (default_apportion_basis = ANY (ARRAY['value'::text, 'quantity'::text, 'weight'::text, 'equal'::text])));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_basis_chk" CHECK (default_basis = ANY (ARRAY['percent'::text, 'amount'::text, 'per_unit'::text, 'flat'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_basis_value_chk" CHECK (default_basis = 'percent'::text AND default_rate IS NOT NULL AND default_amount IS NULL OR default_basis = 'per_unit'::text AND default_rate IS NOT NULL AND default_amount IS NULL OR (default_basis = ANY (ARRAY['amount'::text, 'flat'::text])) AND default_amount IS NOT NULL AND default_rate IS NULL OR default_basis IS NULL AND default_rate IS NULL AND default_amount IS NULL);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_capitalization_policy_chk" CHECK (default_capitalization_policy = ANY (ARRAY['FOLLOW_LINE'::text, 'ALWAYS_CAPITALIZE'::text, 'NEVER_CAPITALIZE'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_cost_effect_chk" CHECK (default_cost_effect = ANY (ARRAY['REDUCE_COST'::text, 'ADD_TO_COST'::text, 'NO_COST_EFFECT'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_distribution_policy_chk" CHECK (default_distribution_policy = ANY (ARRAY['INHERIT_LINE'::text, 'APPORTION_TO_LINES'::text, 'NO_COST_DISTRIBUTION'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_posting_pattern_chk" CHECK (default_posting_pattern = ANY (ARRAY['INHERIT_LINE_ACCOUNT'::text, 'SEPARATE_ACCOUNT'::text, 'TAX_RECOVERABLE'::text, 'LIABILITY_SPLIT'::text, 'TAX_SELF_ASSESSED'::text, 'MEMO_ONLY'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_sub_type_enum_chk" CHECK (term_sub_type IS NULL OR (term_sub_type = ANY (ARRAY['settlement'::text, 'landed'::text, 'warranty'::text, 'performance'::text, 'completion'::text])));

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_sub_type_pair_chk" CHECK (term_type = 'discount'::text AND (term_sub_type IS NULL OR term_sub_type = 'settlement'::text) OR term_type = 'charge'::text AND (term_sub_type IS NULL OR term_sub_type = 'landed'::text) OR term_type = 'tax'::text AND term_sub_type IS NULL OR term_type = 'withholding'::text AND term_sub_type IS NULL OR term_type = 'retention'::text AND (term_sub_type = ANY (ARRAY['warranty'::text, 'performance'::text, 'completion'::text])) OR term_type = 'principal_marker'::text AND term_sub_type IS NULL);

ALTER TABLE ONLY "master"."condition_type"
  ADD CONSTRAINT "condition_type_term_type_chk" CHECK (term_type = ANY (ARRAY['discount'::text, 'charge'::text, 'tax'::text, 'withholding'::text, 'retention'::text, 'principal_marker'::text]));

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_bounce_count_chk" CHECK (bounce_count >= 0);

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_bounce_reason_chk" CHECK (last_bounce_reason IS NULL OR (last_bounce_reason = ANY (ARRAY['hard'::text, 'soft'::text, 'complaint'::text])));

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_domain_lower_chk" CHECK (domain IS NULL OR domain = lower(domain));

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_local_lower_chk" CHECK (local_part IS NULL OR local_part = lower(local_part));

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_auth_no_qualifier_chk" CHECK (purpose IS NULL OR (purpose <> ALL (ARRAY['login'::text, 'recovery'::text, 'mfa'::text, 'verification'::text])) OR role_qualifier IS NULL);

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_value_nonempty" CHECK (btrim(value) <> ''::text);

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_verified_at_chk" CHECK (is_verified = false OR verified_at IS NOT NULL);

ALTER TABLE ONLY "master"."contact_marketing_consent"
  ADD CONSTRAINT "contact_marketing_consent_channel_scope_chk" CHECK (channel_scope IS NULL OR array_length(channel_scope, 1) > 0);

ALTER TABLE ONLY "master"."contact_marketing_consent"
  ADD CONSTRAINT "contact_marketing_consent_consent_source_chk" CHECK (consent_source IS NULL OR (consent_source = ANY (ARRAY['web_form'::text, 'email_link'::text, 'admin'::text, 'import'::text, 'api'::text, 'mobile_app'::text, 'csv'::text])));

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_calling_code_fmt" CHECK (calling_code IS NULL OR calling_code ~ '^[1-9]\d{0,3}$'::text);

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_e164_chk" CHECK (e164 IS NULL OR e164 ~ '^\+[1-9]\d{1,14}$'::text);

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_line_type_chk" CHECK (line_type IS NULL OR (line_type = ANY (ARRAY['mobile'::text, 'landline'::text, 'voip'::text, 'unknown'::text])));

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_locale_code_chk" CHECK (btrim(locale_code) <> ''::text);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_slug_chk" CHECK (slug ~ '^[a-z][a-z0-9_-]*$'::text);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'PUBLISHED'::text, 'ARCHIVED'::text]));

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_title_chk" CHECK (btrim(title) <> ''::text);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_display_order_chk" CHECK (display_order >= 0);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_no_self_ref" CHECK (source_content_item_id IS DISTINCT FROM target_content_item_id);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_relation_type_chk" CHECK (btrim(relation_type) <> ''::text);

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_delete_chk" CHECK (deleted_at IS NULL AND deleted_by IS NULL OR deleted_at IS NOT NULL AND deleted_by IS NOT NULL);

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text]));

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_leave_chk" CHECK (left_at IS NULL OR left_at >= joined_at);

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_read_chk" CHECK (last_read_message_id IS NULL AND last_read_at IS NULL OR last_read_message_id IS NOT NULL AND last_read_at IS NOT NULL);

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_role_chk" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'observer'::text]));

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_dates_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cost_center_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_code_nonempty" CHECK (btrim(customer_code) <> ''::text);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_status_chk" CHECK (status = ANY (ARRAY['prospect'::text, 'active'::text, 'on_hold'::text, 'credit_hold'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "customer_type_chk" CHECK (customer_type = ANY (ARRAY['corporate'::text, 'individual'::text, 'government'::text, 'intercompany'::text]));

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_block_type_chk" CHECK (block_type = ANY (ARRAY['credit'::text, 'invoice'::text, 'collection'::text, 'delivery'::text, 'all'::text]));

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_lift_order_chk" CHECK (lifted_at IS NULL OR lifted_at >= blocked_at);

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_lift_reason_chk" CHECK (lifted_at IS NULL OR lift_reason IS NOT NULL);

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_reason_nonempty" CHECK (btrim(block_reason) <> ''::text);

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'lifted'::text]));

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_aml_status_chk" CHECK (aml_sanctions_status = ANY (ARRAY['not_checked'::text, 'clear'::text, 'flagged'::text, 'blocked'::text]));

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_credit_score_chk" CHECK (credit_score IS NULL OR credit_score >= 0 AND credit_score <= 1000);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_credit_status_chk" CHECK (credit_status = ANY (ARRAY['not_assessed'::text, 'approved'::text, 'conditional'::text, 'on_hold'::text, 'blocked'::text]));

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_dso_chk" CHECK (dso_days IS NULL OR dso_days >= 0);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_dunning_hold_chk" CHECK (is_dunning_eligible OR dunning_hold_reason IS NOT NULL);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_kyc_status_chk" CHECK (kyc_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'passed'::text, 'failed'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_payment_behavior_chk" CHECK (payment_behavior IS NULL OR (payment_behavior = ANY (ARRAY['excellent'::text, 'good'::text, 'average'::text, 'poor'::text, 'bad'::text])));

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_deleted_status_chk" CHECK (deleted_at IS NULL OR status = 'archived'::text);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_scope_owner_chk" CHECK (
CASE scope
    WHEN 'personal'::text THEN owner_principal_id IS NOT NULL
    WHEN 'system'::text THEN owner_principal_id IS NULL
    WHEN 'shared'::text THEN true
    ELSE false
END);

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_height_chk" CHECK (height_units >= 1 AND height_units <= 24);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_ordinal_chk" CHECK (ordinal_no >= 0);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_widget_code_chk" CHECK (btrim(widget_code) <> ''::text);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_width_chk" CHECK (width_units >= 1 AND width_units <= 24);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_x_pos_chk" CHECK (x_pos >= 0);

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_y_pos_chk" CHECK (y_pos >= 0);

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "dimension_set_count_chk" CHECK (dimension_count > 0);

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_ordinal_chk" CHECK (ordinal > 0);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_balanced_chk" CHECK (NOT is_balanced OR is_hierarchical);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_category_chk" CHECK (category = ANY (ARRAY['SYSTEM'::text, 'STANDARD'::text, 'CUSTOM'::text]));

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_depth_chk" CHECK (max_depth IS NULL OR max_depth > 0);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_source_chk" CHECK (category <> 'SYSTEM'::text OR source_entity_name IS NOT NULL AND source_table IS NOT NULL);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_blocked_chk" CHECK (status <> 'blocked'::text OR is_posting_allowed = false);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_dates_chk" CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_level_chk" CHECK (level_no >= 1);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'blocked'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text]));

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_dates_chk" CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_email_norm_chk" CHECK (email IS NULL OR email = lower(TRIM(BOTH FROM email)));

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_empno_nonempty" CHECK (btrim(employee_number) <> ''::text);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_no_self_manager" CHECK (manager_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_dates_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_dates_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_dates_chk" CHECK (termination_date IS NULL OR termination_date >= hire_date);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'terminated'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_status_consistency_chk" CHECK (employment_status = status);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_status_date_chk" CHECK (status = 'terminated'::text AND termination_date IS NOT NULL OR status <> 'terminated'::text);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_type_chk" CHECK (employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contract'::text, 'casual'::text, 'intern'::text, 'volunteer'::text]));

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_display_order_chk" CHECK (display_order >= 0);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_entity_id_chk" CHECK (btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_entity_type_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_link_kind_chk" CHECK (link_kind = ANY (ARRAY['primary'::text, 'related'::text, 'supporting'::text, 'compliance'::text, 'audit'::text]));

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_external_nonempty" CHECK (btrim(external_id) <> ''::text);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_owner_nonempty" CHECK (btrim(owner_entity) <> ''::text);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_source_nonempty" CHECK (btrim(source_system) <> ''::text);

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."external_reference"
  ADD CONSTRAINT "external_reference_valid_chk" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE ONLY "master"."filter_preset"
  ADD CONSTRAINT "filter_preset_entity_code_length" CHECK (char_length(entity_code) >= 1 AND char_length(entity_code) <= 120);

ALTER TABLE ONLY "master"."filter_preset"
  ADD CONSTRAINT "filter_preset_name_length" CHECK (char_length(name) >= 1 AND char_length(name) <= 80);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_dates_chk" CHECK (start_date <= end_date);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_period_range_chk" CHECK (period_number >= 0 AND period_number <= 16);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_status_chk" CHECK (status = ANY (ARRAY['future'::text, 'open'::text, 'soft_close'::text, 'hard_close'::text]));

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_no_same_currency" CHECK (from_currency <> to_currency);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_not_self_superseding_chk" CHECK (supersedes_id IS NULL OR supersedes_id <> id);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_rate_positive" CHECK (rate > 0::numeric);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_rate_type_chk" CHECK (rate_type = ANY (ARRAY['SPOT'::text, 'PERIOD_AVG'::text, 'PERIOD_END'::text, 'BUDGET'::text, 'CONTRACTED'::text, 'HISTORICAL'::text]));

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_source_chk" CHECK (source = ANY (ARRAY['ECB'::text, 'REUTERS'::text, 'BLOOMBERG'::text, 'CENTRAL_BANK'::text, 'MANUAL'::text, 'CUSTOM'::text, 'API'::text]));

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text]));

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_version_chk" CHECK (version_no > 0);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gl_account_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_custom_days_req" CHECK (weekend_pattern <> 'CUSTOM'::text OR weekend_days IS NOT NULL AND array_length(weekend_days, 1) > 0);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_noncustom_days" CHECK (weekend_pattern = 'CUSTOM'::text OR weekend_days IS NULL);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_weekend_chk" CHECK (weekend_pattern = ANY (ARRAY['SAT_SUN'::text, 'FRI_SAT'::text, 'FRI_ONLY'::text, 'SUN_ONLY'::text, 'CUSTOM'::text, 'NONE'::text]));

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_weekend_max_chk" CHECK (weekend_days IS NULL OR array_length(weekend_days, 1) <= 7);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_weekend_range_chk" CHECK (weekend_days IS NULL OR weekend_days <@ ARRAY[1::smallint, 2::smallint, 3::smallint, 4::smallint, 5::smallint, 6::smallint, 7::smallint]);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_day_type_chk" CHECK (day_type = ANY (ARRAY['HOLIDAY'::text, 'WORKING_OVERRIDE'::text, 'BLACKOUT'::text]));

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_observance_chk" CHECK (observance_type = ANY (ARRAY['MANDATORY'::text, 'RESTRICTED'::text, 'OPTIONAL'::text]));

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_year_chk" CHECK (calendar_year >= 2000 AND calendar_year <= 2099);

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_year_date_chk" CHECK (EXTRACT(year FROM holiday_date) = calendar_year::numeric);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_no_self_trade" CHECK (source_company_code_id IS DISTINCT FROM counterparty_company_code_id);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_settlement_mode_chk" CHECK (settlement_mode = ANY (ARRAY['open_item'::text, 'netting'::text, 'cash'::text, 'none'::text]));

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_valid_order_chk" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_classification_chk" CHECK (product_id IS NOT NULL OR commodity_category_id IS NOT NULL);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_standard_cost_chk" CHECK (valuation_method <> 'standard_cost'::text OR standard_cost IS NOT NULL);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."job_family"
  ADD CONSTRAINT "job_family_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."label"
  ADD CONSTRAINT "label_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_entity_fmt" CHECK (entity ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_name_col_fmt" CHECK (name_column ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_pk_col_fmt" CHECK (pk_column ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_schema_fmt" CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."label_entity_type"
  ADD CONSTRAINT "label_entity_type_table_fmt" CHECK (source_table ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_country_chk" CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_frequency_chk" CHECK (accrual_frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'quarterly'::text, 'annual'::text, 'on_hire'::text, 'manual'::text]));

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_json_chk" CHECK (jsonb_typeof(carry_forward_policy) = 'object'::text);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_priority_chk" CHECK (priority >= 1);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_quantity_chk" CHECK (entitlement_quantity IS NULL OR entitlement_quantity >= 0::numeric);

ALTER TABLE ONLY "master"."leave_type"
  ADD CONSTRAINT "leave_type_category_chk" CHECK (leave_category = ANY (ARRAY['annual'::text, 'sick'::text, 'maternity'::text, 'paternity'::text, 'bereavement'::text, 'unpaid'::text, 'compensatory'::text, 'study'::text, 'other'::text]));

ALTER TABLE ONLY "master"."leave_type"
  ADD CONSTRAINT "leave_type_unit_chk" CHECK (unit = ANY (ARRAY['hour'::text, 'day'::text]));

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "ledger_book_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "ledger_book_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_consolidation_ownership_chk" CHECK (consolidation_method = 'full'::text OR ownership_pct IS NOT NULL);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_effective_order_chk" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_founded_year_chk" CHECK (founded_year IS NULL OR founded_year >= 1800 AND founded_year <= 2200);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_no_self_ref" CHECK (parent_entity_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_ownership_chk" CHECK (ownership_pct IS NULL OR ownership_pct > 0::numeric AND ownership_pct <= 100::numeric);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_reg_country_fmt_chk" CHECK (registration_country_code IS NULL OR registration_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'dormant'::text, 'in_liquidation'::text, 'dissolved'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_tax_country_fmt_chk" CHECK (tax_residence_country_code IS NULL OR tax_residence_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "legal_entity_website_fmt_chk" CHECK (website_url IS NULL OR website_url ~ '^https?://'::text);

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_relationship_type_chk" CHECK (relationship_type = ANY (ARRAY['self_bp'::text, 'network_identity'::text]));

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_org_alias_nonempty" CHECK (btrim(org_alias) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_provider_code_chk" CHECK (provider_code = ANY (ARRAY['keycloak'::text, 'azure_ad'::text, 'okta'::text, 'google'::text, 'saml_generic'::text, 'oidc_generic'::text]));

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_realm_key_nonempty" CHECK (btrim(realm_key) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_subject_nonempty" CHECK (btrim(subject_id) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_sync_retry_chk" CHECK (sync_retry_count >= 0);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_sync_status_chk" CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'drift'::text, 'error'::text, 'disabled'::text]));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_account_code_nonempty" CHECK (btrim(account_code) <> ''::text);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_account_role_chk" CHECK (account_role = ANY (ARRAY['buyer'::text, 'supplier'::text, 'both'::text]));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_provider_code_chk" CHECK (provider_code = ANY (ARRAY['athyper_mesh'::text, 'peppol'::text, 'ariba'::text, 'tradeshift'::text, 'custom'::text]));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'retired'::text]));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_sync_status_chk" CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'drift'::text, 'error'::text, 'disabled'::text]));

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_valid_range_chk" CHECK (valid_until IS NULL OR valid_until > valid_from);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_opacity_chk" CHECK (watermark_opacity >= 0.00 AND watermark_opacity <= 1.00);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_entity_chk" CHECK (btrim(entity_name) <> ''::text AND btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_bucket_chk" CHECK (btrim(storage_bucket) <> ''::text);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_expiry_chk" CHECK (expires_at > created_at);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_file_chk" CHECK (btrim(file_name) <> ''::text);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_key_chk" CHECK (btrim(storage_key) <> ''::text);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_part_etags_chk" CHECK (jsonb_typeof(part_etags) = 'array'::text);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_size_chk" CHECK (size_bytes IS NULL OR size_bytes >= 0);

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_status_chk" CHECK (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completed'::text, 'aborted'::text, 'failed'::text]));

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_upload_id_chk" CHECK (btrim(upload_id) <> ''::text);

ALTER TABLE ONLY "master"."network_provider"
  ADD CONSTRAINT "np_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."network_provider"
  ADD CONSTRAINT "np_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."network_provider"
  ADD CONSTRAINT "np_network_type_chk" CHECK (network_type = ANY (ARRAY['b2b_portal'::text, 'e_invoicing'::text, 'procurement_network'::text, 'payment_network'::text, 'custom'::text]));

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_dismiss_chk" CHECK (is_dismissed = false AND dismissed_at IS NULL OR is_dismissed = true AND dismissed_at IS NOT NULL);

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_expiry_chk" CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_read_chk" CHECK (is_read = false AND read_at IS NULL OR is_read = true AND read_at IS NOT NULL);

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_title_chk" CHECK (btrim(title) <> ''::text);

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_dismiss_chk" CHECK (is_dismissed = false AND dismissed_at IS NULL OR is_dismissed = true AND dismissed_at IS NOT NULL);

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_expiry_chk" CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_read_chk" CHECK (is_read = false AND read_at IS NULL OR is_read = true AND read_at IS NOT NULL);

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_title_chk" CHECK (btrim(title) <> ''::text);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_code_fmt" CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,62}$'::text);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_domain_chk" CHECK (domain = ANY (ARRAY['procurement'::text, 'sales'::text]));

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_effective_order_chk" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_no_self_parent" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_scope_version_chk" CHECK (scope_version > 0);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "operating_organization_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_effective_order_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_role_nonempty" CHECK (btrim(participation_role) <> ''::text);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "operating_organization_company_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_type_chk" CHECK (unit_type = ANY (ARRAY['business_unit'::text, 'division'::text, 'department'::text, 'section'::text, 'team'::text, 'other'::text]));

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_valid_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_filing_chk" CHECK (filing_frequency IS NULL OR (filing_frequency = ANY (ARRAY['monthly'::text, 'bimonthly'::text, 'quarterly'::text, 'semi_annually'::text, 'annually'::text, 'on_demand'::text])));

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_number_chk" CHECK (btrim(registration_number) <> ''::text);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_type_chk" CHECK (registration_type = ANY (ARRAY['VAT'::text, 'GST'::text, 'SALES_TAX'::text, 'WHT'::text, 'TAX_ID'::text, 'CUSTOMS'::text, 'EXCISE'::text, 'OTHER'::text]));

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_category_chk" CHECK (category IS NULL OR (category = ANY (ARRAY['identity'::text, 'party'::text, 'structure'::text, 'asset'::text, 'custom'::text])));

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_]*$'::text);

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_routing_chk" CHECK (is_system = false OR schema_name IS NOT NULL AND table_name IS NOT NULL);

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_system_consistency" CHECK (is_system = true AND tenant_id IS NULL OR is_system = false AND tenant_id IS NOT NULL);

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_name_nonempty" CHECK (btrim(contact_name) <> ''::text);

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_party_nonempty" CHECK (btrim(party_type) <> ''::text);

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_party_type_chk" CHECK (party_type = ANY (ARRAY['tenant'::text, 'legal_entity'::text, 'company_code'::text, 'business_partner'::text, 'supplier'::text, 'customer'::text]));

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'departed'::text]));

ALTER TABLE ONLY "master"."party_contact_role"
  ADD CONSTRAINT "pcr_role_nonempty" CHECK (btrim(role_code) <> ''::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_authority_currency_chk" CHECK (authority_limit_amount IS NULL OR authority_limit_currency_code IS NOT NULL);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_authority_currency_fmt_chk" CHECK (authority_limit_currency_code IS NULL OR authority_limit_currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_company_name_chk" CHECK ((member_type <> ALL (ARRAY['company'::text, 'organization'::text, 'trust'::text])) OR company_name IS NOT NULL);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_control_nature_chk" CHECK (control_nature IS NULL OR (control_nature = ANY (ARRAY['equity'::text, 'voting'::text, 'appointment'::text, 'poa'::text, 'contractual'::text, 'other'::text])));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_country_fmt_chk" CHECK (member_country_code IS NULL OR member_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_directness_chk" CHECK (directness IS NULL OR (directness = ANY (ARRAY['direct'::text, 'indirect'::text, 'both'::text, 'unknown'::text])));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_evidence_status_chk" CHECK (evidence_status = ANY (ARRAY['missing'::text, 'received'::text, 'verified'::text, 'expired'::text, 'waived'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_kyc_status_chk" CHECK (kyc_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'verified'::text, 'passed'::text, 'failed'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_member_nonempty" CHECK (btrim(member_name) <> ''::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_member_type_chk" CHECK (member_type = ANY (ARRAY['individual'::text, 'organization'::text, 'company'::text, 'trust'::text, 'public_float'::text, 'external'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_ownership_range_chk" CHECK (ownership_pct IS NULL OR ownership_pct >= 0::numeric AND ownership_pct <= 100::numeric);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_party_nonempty" CHECK (btrim(party_type) <> ''::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_pct_ranges_chk" CHECK ((voting_pct IS NULL OR voting_pct >= 0::numeric AND voting_pct <= 100::numeric) AND (beneficial_ownership_pct IS NULL OR beneficial_ownership_pct >= 0::numeric AND beneficial_ownership_pct <= 100::numeric));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_pep_status_chk" CHECK (pep_status = ANY (ARRAY['unknown'::text, 'no_pep'::text, 'pep'::text, 'not_applicable'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_relation_nonempty" CHECK (btrim(relation_type) <> ''::text);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_role_ownership_chk" CHECK ((relation_type <> ALL (ARRAY['shareholder'::text, 'ubo'::text])) OR ownership_pct IS NOT NULL OR beneficial_ownership_pct IS NOT NULL);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_sanctions_status_chk" CHECK (sanctions_status = ANY (ARRAY['not_checked'::text, 'clear'::text, 'flagged'::text, 'blocked'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'resigned'::text, 'terminated'::text]));

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_term_order_chk" CHECK (end_of_term IS NULL OR appointed_date IS NULL OR end_of_term >= appointed_date);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_duns_fmt_chk" CHECK (scheme <> 'duns'::text OR value ~ '^\d{9}$'::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_gln_fmt_chk" CHECK (scheme <> 'gln'::text OR value ~ '^\d{13}$'::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_lei_fmt_chk" CHECK (scheme <> 'lei'::text OR length(value) = 20 AND value ~ '^[A-Z0-9]{20}$'::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_owner_nonempty" CHECK (btrim(owner_type) <> ''::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_peppol_fmt_chk" CHECK (scheme <> 'peppol_id'::text OR value ~ '^\d{4}:.+$'::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_scheme_nonempty" CHECK (btrim(scheme) <> ''::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'revoked'::text]));

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_validity_chk" CHECK (valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_value_nonempty" CHECK (btrim(value) <> ''::text);

ALTER TABLE ONLY "master"."party_identifier"
  ADD CONSTRAINT "pi_verified_at_chk" CHECK (is_verified = false OR verified_at IS NOT NULL);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_approved_band_chk" CHECK (status <> 'approved'::text OR risk_band <> 'unknown'::text);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_context_chk" CHECK (assessment_context = ANY (ARRAY['organization'::text, 'supplier_role'::text, 'customer_role'::text, 'project_engagement'::text]));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_override_reason_chk" CHECK (NOT is_override OR override_reason IS NOT NULL);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_override_score_chk" CHECK (override_score IS NULL OR override_score >= 0::numeric AND override_score <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_review_freq_chk" CHECK (review_frequency IS NULL OR (review_frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'annually'::text, 'on_event'::text])));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_risk_band_chk" CHECK (risk_band = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'unknown'::text]));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_score_chk" CHECK (overall_score IS NULL OR overall_score >= 0::numeric AND overall_score <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'superseded'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_subject_context_matrix_chk" CHECK (subject_type = 'business_partner'::text AND assessment_context = 'organization'::text OR subject_type = 'supplier'::text AND assessment_context = 'supplier_role'::text OR subject_type = 'customer'::text AND assessment_context = 'customer_role'::text OR subject_type = 'project_engagement'::text AND assessment_context = 'project_engagement'::text);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_subject_type_chk" CHECK (subject_type = ANY (ARRAY['business_partner'::text, 'supplier'::text, 'customer'::text, 'project_engagement'::text]));

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_superseded_chk" CHECK (superseded_by IS NULL OR status = 'superseded'::text);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_coverage_chk" CHECK (coverage_pct IS NULL OR coverage_pct >= 0::numeric AND coverage_pct <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_driver_cnt_chk" CHECK (driver_count >= 0);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_raw_score_chk" CHECK (raw_score IS NULL OR raw_score >= 0::numeric AND raw_score <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_risk_band_chk" CHECK (risk_band = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'unknown'::text]));

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_weight_chk" CHECK (weight_applied IS NULL OR weight_applied >= 0::numeric AND weight_applied <= 1::numeric);

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_impact_score_chk" CHECK (impact_score IS NULL OR impact_score >= 0::numeric AND impact_score <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_severity_chk" CHECK (severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text]));

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_source_chk" CHECK (evidence_id IS NOT NULL OR source_entity IS NOT NULL AND source_record_id IS NOT NULL);

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_confidence_chk" CHECK (confidence_score IS NULL OR confidence_score >= 0::numeric AND confidence_score <= 100::numeric);

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_evidence_type_chk" CHECK (evidence_type = ANY (ARRAY['score'::text, 'certificate'::text, 'finding'::text, 'alert'::text, 'questionnaire'::text, 'engagement'::text, 'sanction_hit'::text, 'manual_override'::text]));

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_ingested_via_chk" CHECK (ingested_via IS NULL OR (ingested_via = ANY (ARRAY['api'::text, 'file_import'::text, 'manual'::text, 'workflow'::text])));

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'ignored'::text, 'disputed'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_subject_type_chk" CHECK (subject_type = ANY (ARRAY['business_partner'::text, 'supplier'::text, 'customer'::text, 'project_engagement'::text]));

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_superseded_chk" CHECK (superseded_by IS NULL OR status = 'superseded'::text);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_approved_pair_chk" CHECK ((approved_by IS NULL) = (approved_at IS NULL));

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_completed_chk" CHECK (completed_at IS NULL OR status = 'completed'::text);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_scope_chk" CHECK (assessment_id IS NOT NULL OR driver_id IS NOT NULL);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'in_progress'::text, 'completed'::text, 'overdue'::text, 'cancelled'::text]));

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_type_chk" CHECK (mitigation_type = ANY (ARRAY['waiver'::text, 'corrective_action'::text, 'monitoring'::text, 'escalation'::text, 'rejection'::text, 'conditional_approval'::text]));

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_actor_type_chk" CHECK (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'api'::text]));

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_event_type_chk" CHECK (event_type = ANY (ARRAY['created'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'overridden'::text, 'superseded'::text, 'archived'::text, 'scheduled_review'::text]));

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_new_status_chk" CHECK (new_status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'superseded'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_risk_band_chk" CHECK (new_risk_band IS NULL OR (new_risk_band = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'unknown'::text])));

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_clearance_num_chk" CHECK (NOT has_tax_clearance OR tax_clearance_number IS NOT NULL);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_country_fmt_chk" CHECK (country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_gln_fmt_chk" CHECK (global_location_number IS NULL OR global_location_number ~ '^\d{13}$'::text);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_owner_type_chk" CHECK (owner_type = 'business_partner'::text);

ALTER TABLE ONLY "master"."party_tax_profile"
  ADD CONSTRAINT "ptp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_type_chk" CHECK (component_type = ANY (ARRAY['earning'::text, 'deduction'::text, 'employer_contribution'::text, 'statutory'::text, 'memo'::text]));

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_value_type_chk" CHECK (value_type = ANY (ARRAY['amount'::text, 'rate'::text, 'formula'::text, 'quantity'::text]));

ALTER TABLE ONLY "master"."pay_grade"
  ADD CONSTRAINT "pay_grade_amount_chk" CHECK ((min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount) AND (midpoint_amount IS NULL OR min_amount IS NULL OR midpoint_amount >= min_amount) AND (midpoint_amount IS NULL OR max_amount IS NULL OR midpoint_amount <= max_amount));

ALTER TABLE ONLY "master"."pay_grade"
  ADD CONSTRAINT "pay_grade_currency_chk" CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_country_chk" CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_currency_chk" CHECK (currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_frequency_chk" CHECK (pay_frequency = ANY (ARRAY['weekly'::text, 'bi_weekly'::text, 'semi_monthly'::text, 'monthly'::text, 'quarterly'::text]));

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_dates_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_sort_chk" CHECK (sort_order >= 0);

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_applicable_chk" CHECK (applicable_to = ANY (ARRAY['PURCHASE'::text, 'SALE'::text, 'BOTH'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_base_event_chk" CHECK (base_event = ANY (ARRAY['INVOICE_DATE'::text, 'GR_DATE'::text, 'SERVICE_ENTRY_DATE'::text, 'DELIVERY_DATE'::text, 'CERTIFIED_DATE'::text, 'CONTRACT_DATE'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_bdc_chk" CHECK (business_day_convention IS NULL OR (business_day_convention = ANY (ARRAY['NONE'::text, 'FOLLOWING'::text, 'PRECEDING'::text, 'MODIFIED_FOLLOWING'::text])));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_cod_no_days_chk" CHECK ((due_rule_type <> ALL (ARRAY['COD'::text, 'PREPAID'::text])) OR due_days IS NULL);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_dom_chk" CHECK (due_day_of_month IS NULL OR due_day_of_month >= 1 AND due_day_of_month <= 31);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_dom_only_fixed_chk" CHECK (due_rule_type = 'FIXED_DAY'::text OR due_day_of_month IS NULL);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_due_date_flex_chk" CHECK (due_date_flexibility = ANY (ARRAY['FIXED'::text, 'FLEXIBLE'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_due_days_nonneg" CHECK (due_days IS NULL OR due_days >= 0);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_due_rule_chk" CHECK (due_rule_type = ANY (ARRAY['NET_DAYS'::text, 'EOM'::text, 'FIXED_DAY'::text, 'COD'::text, 'PREPAID'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_effective_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_fixed_day_req_chk" CHECK (due_rule_type <> 'FIXED_DAY'::text OR due_day_of_month IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_grace_nonneg" CHECK (grace_days >= 0);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_installment_pos_chk" CHECK (installment_count IS NULL OR installment_count >= 1);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_month_offset_chk" CHECK (month_offset >= 0 AND month_offset <= 12);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_net_days_req_chk" CHECK (due_rule_type <> 'NET_DAYS'::text OR due_days IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_no_self_supersede" CHECK (supersedes_payment_term_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'superseded'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_amt_null_chk" CHECK (calc_mode <> 'PERCENT'::text OR default_amount IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_amt_req_chk" CHECK (calc_mode <> 'FIXED_AMOUNT'::text OR default_amount IS NOT NULL AND currency_code IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_basis_chk" CHECK (basis_amount_mode = ANY (ARRAY['GROSS'::text, 'NET_OF_TAX'::text, 'LINE_NET'::text, 'NET_OF_RETENTION'::text]));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_calc_chk" CHECK (calc_mode = ANY (ARRAY['PERCENT'::text, 'FIXED_AMOUNT'::text]));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_cap_amt_nonneg" CHECK (cumulative_cap_amount IS NULL OR cumulative_cap_amount >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_cap_pct_range_chk" CHECK (cumulative_cap_pct IS NULL OR cumulative_cap_pct >= 0::numeric AND cumulative_cap_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_cap_xor_chk" CHECK (NOT (cumulative_cap_pct IS NOT NULL AND cumulative_cap_amount IS NOT NULL));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_clause_type_chk" CHECK (clause_type = ANY (ARRAY['ADVANCE'::text, 'ADVANCE_RECOVERY'::text, 'RETENTION'::text, 'RETENTION_RELEASE'::text]));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_code_nonempty" CHECK (btrim(clause_code) <> ''::text);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_default_amt_nonneg" CHECK (default_amount IS NULL OR default_amount >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_fixed_no_bounds_chk" CHECK (flexibility_mode <> 'FIXED'::text OR min_pct IS NULL AND max_pct IS NULL AND min_amount IS NULL AND max_amount IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_flex_amt_bounds_chk" CHECK (NOT (flexibility_mode = 'FLEXIBLE'::text AND calc_mode = 'FIXED_AMOUNT'::text) OR min_amount IS NOT NULL AND max_amount IS NOT NULL AND min_amount <= max_amount AND min_pct IS NULL AND max_pct IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_flex_chk" CHECK (flexibility_mode = ANY (ARRAY['FIXED'::text, 'FLEXIBLE'::text]));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_flex_pct_bounds_chk" CHECK (NOT (flexibility_mode = 'FLEXIBLE'::text AND calc_mode = 'PERCENT'::text) OR min_pct IS NOT NULL AND max_pct IS NOT NULL AND min_pct <= max_pct AND min_amount IS NULL AND max_amount IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_max_amt_nonneg" CHECK (max_amount IS NULL OR max_amount >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_max_pct_range_chk" CHECK (max_pct IS NULL OR max_pct >= 0::numeric AND max_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_min_amt_nonneg" CHECK (min_amount IS NULL OR min_amount >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_min_pct_range_chk" CHECK (min_pct IS NULL OR min_pct >= 0::numeric AND min_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_partial_rel_chk" CHECK (partial_release_pct IS NULL OR partial_release_event IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_partial_rel_range" CHECK (partial_release_pct IS NULL OR partial_release_pct >= 0::numeric AND partial_release_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_pct_null_chk" CHECK (calc_mode <> 'FIXED_AMOUNT'::text OR default_pct IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_pct_range_chk" CHECK (default_pct IS NULL OR default_pct >= 0::numeric AND default_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_pct_req_chk" CHECK (calc_mode <> 'PERCENT'::text OR default_pct IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_recovery_end_chk" CHECK (recovery_end_before_pct IS NULL OR recovery_end_before_pct >= 0::numeric AND recovery_end_before_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_recovery_method_chk" CHECK (clause_type = 'ADVANCE_RECOVERY'::text OR recovery_method IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_recovery_range_chk" CHECK (recovery_start_after_pct IS NULL OR recovery_end_before_pct IS NULL OR recovery_start_after_pct < recovery_end_before_pct);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_recovery_start_chk" CHECK (recovery_start_after_pct IS NULL OR recovery_start_after_pct >= 0::numeric AND recovery_start_after_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_release_delay_chk" CHECK (clause_type = 'RETENTION_RELEASE'::text OR release_delay_days IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_release_delay_nonneg" CHECK (release_delay_days IS NULL OR release_delay_days >= 0);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_release_event_chk" CHECK (clause_type = 'RETENTION_RELEASE'::text OR release_event IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_rounding_chk" CHECK (rounding_method IS NULL OR (rounding_method = ANY (ARRAY['ROUND_HALF_UP'::text, 'ROUND_HALF_EVEN'::text, 'ROUND_DOWN'::text, 'ROUND_UP'::text])));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_scope_chk" CHECK (application_scope = ANY (ARRAY['HEADER'::text, 'LINE'::text, 'SCHEDULE'::text]));

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_seq_positive" CHECK (sequence_no > 0);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_settles_null_chk" CHECK ((clause_type <> ALL (ARRAY['ADVANCE'::text, 'RETENTION'::text])) OR settles_clause_code IS NULL);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_settles_req_chk" CHECK ((clause_type <> ALL (ARRAY['ADVANCE_RECOVERY'::text, 'RETENTION_RELEASE'::text])) OR settles_clause_code IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_basis_chk" CHECK (discount_basis_mode = ANY (ARRAY['GROSS'::text, 'NET'::text]));

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_days_positive" CHECK (qualify_within_days > 0);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_discount_xor_chk" CHECK (discount_pct IS NOT NULL AND discount_fixed IS NULL OR discount_pct IS NULL AND discount_fixed IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_fixed_currency_chk" CHECK (discount_fixed IS NULL OR currency_code IS NOT NULL);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_fixed_nonneg" CHECK (discount_fixed IS NULL OR discount_fixed >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_min_amt_nonneg" CHECK (min_invoice_amount IS NULL OR min_invoice_amount >= 0::numeric);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_pct_range_chk" CHECK (discount_pct IS NULL OR discount_pct >= 0::numeric AND discount_pct <= 100::numeric);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_tier_positive" CHECK (tier_no > 0);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_country_fmt_chk" CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_email_norm_chk" CHECK (primary_email IS NULL OR primary_email = lower(TRIM(BOTH FROM primary_email)));

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_first_name_nonempty" CHECK (btrim(first_name) <> ''::text);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_last_name_nonempty" CHECK (btrim(last_name) <> ''::text);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."person"
  ADD CONSTRAINT "person_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'merged'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_country_fmt_chk" CHECK (nationality_country_code IS NULL OR nationality_country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_json_chk" CHECK (jsonb_typeof(emergency_contact) = 'object'::text AND jsonb_typeof(protected_attributes) = 'object'::text AND jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_fiscal_range_chk" CHECK (fiscal_year_to >= fiscal_year_from);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_granularity_chk" CHECK (granularity = ANY (ARRAY['MONTHLY'::text, 'QUARTERLY'::text, 'SEMI_ANNUAL'::text, 'ANNUAL'::text, 'WEEKLY'::text]));

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_horizon_chk" CHECK (planning_horizon = ANY (ARRAY['ANNUAL'::text, 'MULTI_YEAR'::text, 'ROLLING_12'::text, 'ROLLING_18'::text, 'QUARTERLY'::text]));

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_no_self_base" CHECK (based_on_model_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'in_review'::text, 'approved'::text, 'locked'::text, 'archived'::text, 'cancelled'::text]));

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_type_chk" CHECK (model_type = ANY (ARRAY['TOP_DOWN'::text, 'BOTTOM_UP'::text, 'DRIVER_BASED'::text, 'ZERO_BASED'::text, 'ROLLING'::text, 'HYBRID'::text]));

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "pm_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_capacity_chk" CHECK (headcount_capacity > 0::numeric);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_no_self_ref" CHECK (reports_to_position_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'frozen'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_type_chk" CHECK (position_type = ANY (ARRAY['regular'::text, 'contract'::text, 'temporary'::text, 'internship'::text, 'vacant'::text, 'other'::text]));

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_valid_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_code_norm_chk" CHECK (code = lower(btrim(code)));

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_login_email_norm_chk" CHECK (login_email IS NULL OR login_email = lower(TRIM(BOTH FROM login_email)));

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_source_chk" CHECK (principal_source IS NULL OR (principal_source = ANY (ARRAY['internal'::text, 'scim'::text, 'saml_jit'::text, 'oidc_jit'::text, 'support_jit'::text, 'invite_jit'::text, 'import'::text, 'api'::text])));

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_audience_nonempty" CHECK (audience IS NULL OR btrim(audience) <> ''::text);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_client_id_nonempty" CHECK (client_id IS NULL OR btrim(client_id) <> ''::text);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_issuer_nonempty" CHECK (issuer IS NULL OR btrim(issuer) <> ''::text);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_provider_code_chk" CHECK (provider_code = ANY (ARRAY['keycloak'::text, 'azure_ad'::text, 'okta'::text, 'google'::text, 'saml_generic'::text, 'oidc_generic'::text]));

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_realm_key_fmt" CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'::text);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_subject_nonempty" CHECK (btrim(subject_id) <> ''::text);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_sync_retry_chk" CHECK (sync_retry_count >= 0);

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_username_norm_chk" CHECK (username IS NULL OR username = lower(btrim(username)));

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_channel_nonempty" CHECK (btrim(channel) <> ''::text);

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_event_code_nonempty" CHECK (btrim(event_code) <> ''::text);

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_plane_key_chk" CHECK (plane_key = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_supervisor_source_chk" CHECK (supervisor_source IS NULL OR (supervisor_source = ANY (ARRAY['manual'::text, 'hr_sync'::text, 'employee_record'::text, 'org_chart'::text, 'scim'::text])));

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_keycloak_username_norm_chk" CHECK (keycloak_username IS NULL OR keycloak_username = lower(btrim(keycloak_username)));

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_lifecycle_chk" CHECK (disabled_date IS NULL OR enabled_date IS NOT NULL AND disabled_date >= enabled_date);

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_sync_status_chk" CHECK (keycloak_sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'drift'::text, 'error'::text]));

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_distinct_chk" CHECK (from_tenant_id <> to_tenant_id OR from_principal_id <> to_principal_id);

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_effective_range_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_verified_chk" CHECK (verification_status <> 'verified'::text OR verified_at IS NOT NULL AND verified_method IS NOT NULL);

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_code_chk" CHECK (btrim(preference_code) <> ''::text);

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_surface_chk" CHECK (surface_code IS NULL OR btrim(surface_code) <> ''::text);

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_value_size_chk" CHECK (pg_column_size(preference_value) <= 8192);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_date_format_chk" CHECK (date_format IS NULL OR btrim(date_format) <> ''::text);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_number_format_chk" CHECK (number_format IS NULL OR btrim(number_format) <> ''::text);

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_week_start_chk" CHECK (week_start IS NULL OR week_start >= 0 AND week_start <= 6);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_color_mode_chk" CHECK (color_mode = ANY (ARRAY['color'::text, 'bw'::text, 'grayscale'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_compression_chk" CHECK (compression = ANY (ARRAY['none'::text, 'low'::text, 'medium'::text, 'high'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_dpi_pos" CHECK (quality_dpi > 0);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_duplex_chk" CHECK (duplex = ANY (ARRAY['none'::text, 'long'::text, 'short'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_margins_chk" CHECK (margins = ANY (ARRAY['normal'::text, 'narrow'::text, 'wide'::text, 'none'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_orientation_chk" CHECK (orientation = ANY (ARRAY['portrait'::text, 'landscape'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_output_format_chk" CHECK (output_format = ANY (ARRAY['pdf'::text, 'html'::text, 'png'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_paper_size_chk" CHECK (paper_size = ANY (ARRAY['A3'::text, 'A4'::text, 'A5'::text, 'B4'::text, 'Letter'::text, 'Legal'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."print_profile"
  ADD CONSTRAINT "pp_watermark_text_chk" CHECK (watermark_enabled = false OR watermark_text IS NOT NULL);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_central_buyer_company_req" CHECK (buying_model_default <> 'central_buyer'::text OR central_buyer_company_id IS NOT NULL);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_buying_model_chk" CHECK (buying_model_default = ANY (ARRAY['federated'::text, 'central_buyer'::text]));

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_currency_chk" CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "procurement_organization_profile_type_chk" CHECK (organization_type = ANY (ARRAY['central_procurement'::text, 'shared_services'::text, 'category_management'::text, 'regional_procurement'::text, 'project_procurement'::text]));

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_price_nonneg" CHECK (base_price IS NULL OR base_price >= 0::numeric);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_dates_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "profit_center_no_self_ref" CHECK (parent_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_dates_chk" CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_no_self_ref" CHECK (parent_project_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "project_valid_chk" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_dates_chk" CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_no_self_ref" CHECK (parent_item_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "project_item_pct_chk" CHECK (completion_pct >= 0::numeric AND completion_pct <= 100::numeric);

ALTER TABLE ONLY "master"."record_bookmark"
  ADD CONSTRAINT "record_bookmark_entity_code_length" CHECK (char_length(entity_code) >= 1 AND char_length(entity_code) <= 120);

ALTER TABLE ONLY "master"."record_bookmark"
  ADD CONSTRAINT "record_bookmark_record_id_nonempty" CHECK (record_id IS NOT NULL);

ALTER TABLE ONLY "master"."risk_dimension"
  ADD CONSTRAINT "rd_category_chk" CHECK (category = ANY (ARRAY['esg'::text, 'credit'::text, 'compliance'::text, 'operational'::text, 'reputational'::text, 'data_quality'::text, 'engagement'::text]));

ALTER TABLE ONLY "master"."risk_dimension"
  ADD CONSTRAINT "rd_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."risk_driver_registry"
  ADD CONSTRAINT "rdr_severity_chk" CHECK (default_severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text]));

ALTER TABLE ONLY "master"."risk_model"
  ADD CONSTRAINT "rm_algorithm_chk" CHECK (scoring_algorithm = ANY (ARRAY['weighted_average'::text, 'rule_based'::text, 'ml_model'::text, 'manual'::text]));

ALTER TABLE ONLY "master"."risk_model"
  ADD CONSTRAINT "rm_context_chk" CHECK (applicable_context = ANY (ARRAY['organization'::text, 'supplier_role'::text, 'customer_role'::text, 'project_engagement'::text, 'universal'::text]));

ALTER TABLE ONLY "master"."risk_model"
  ADD CONSTRAINT "rm_dates_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."risk_model"
  ADD CONSTRAINT "rm_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'experimental'::text]));

ALTER TABLE ONLY "master"."risk_model_dimension"
  ADD CONSTRAINT "rmd_weight_chk" CHECK (weight >= 0::numeric AND weight <= 1::numeric);

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_provider_cat_chk" CHECK (provider_category = ANY (ARRAY['esg'::text, 'credit'::text, 'sanctions'::text, 'project'::text, 'compliance'::text, 'identity'::text]));

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_refresh_chk" CHECK (refresh_mode = ANY (ARRAY['api'::text, 'file'::text, 'manual'::text, 'event'::text]));

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_source_type_chk" CHECK (source_type = ANY (ARRAY['external_provider'::text, 'internal_system'::text, 'manual'::text, 'workflow'::text]));

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text]));

ALTER TABLE ONLY "master"."risk_source"
  ADD CONSTRAINT "rks_trust_chk" CHECK (trust_level >= 1 AND trust_level <= 5);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_currency_chk" CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_selling_model_chk" CHECK (selling_model_default = ANY (ARRAY['federated'::text, 'principal_seller'::text]));

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sales_organization_profile_type_chk" CHECK (organization_type = ANY (ARRAY['central_sales'::text, 'regional_sales'::text, 'enterprise_sales'::text, 'channel_sales'::text, 'project_sales'::text]));

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_deleted_status_chk" CHECK (deleted_at IS NULL OR status = 'archived'::text);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_plane_chk" CHECK (plane_key = ANY (ARRAY['admin'::text, 'neon'::text, 'mesh'::text]));

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_scope_owner_chk" CHECK (
CASE scope
    WHEN 'personal'::text THEN owner_principal_id IS NOT NULL
    WHEN 'system'::text THEN owner_principal_id IS NULL
    WHEN 'shared'::text THEN true
    ELSE false
END);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_surface_chk" CHECK (btrim(surface_code) <> ''::text);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_target_chk" CHECK (jsonb_typeof(target) = 'object'::text);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "master"."scoped_setting"
  ADD CONSTRAINT "scoped_setting_scope_chk" CHECK (scope_kind = ANY (ARRAY['tenant'::text, 'organization'::text, 'company'::text, 'purchasing-org'::text, 'network-account'::text, 'platform'::text]));

ALTER TABLE ONLY "master"."scoped_setting"
  ADD CONSTRAINT "scoped_setting_value_size_chk" CHECK (pg_column_size(setting_value) <= 8192);

ALTER TABLE ONLY "master"."scoped_setting"
  ADD CONSTRAINT "scoped_setting_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "master"."shift_type"
  ADD CONSTRAINT "shift_type_minutes_chk" CHECK (break_minutes >= 0 AND (paid_minutes IS NULL OR paid_minutes >= 0));

ALTER TABLE ONLY "master"."shift_type"
  ADD CONSTRAINT "shift_type_time_order_chk" CHECK (is_overnight OR end_time > start_time);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_no_self_ref" CHECK (parent_site_id IS DISTINCT FROM id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_country_chk" CHECK (country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_type_chk" CHECK (scheme_type = ANY (ARRAY['pension'::text, 'social_security'::text, 'income_tax'::text, 'healthcare'::text, 'workers_comp'::text, 'other'::text]));

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_code_nonempty" CHECK (btrim(supplier_code) <> ''::text);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_status_chk" CHECK (status = ANY (ARRAY['onboarding'::text, 'active'::text, 'on_hold'::text, 'suspended'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supplier_type_chk" CHECK (supplier_type = ANY (ARRAY['general'::text, 'contractor'::text, 'manufacturer'::text, 'service'::text, 'utility'::text, 'intercompany'::text]));

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_block_type_chk" CHECK (block_type = ANY (ARRAY['procurement'::text, 'invoice'::text, 'payment'::text, 'all'::text]));

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_lift_order_chk" CHECK (lifted_at IS NULL OR lifted_at >= blocked_at);

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_lift_reason_chk" CHECK (lifted_at IS NULL OR lift_reason IS NOT NULL);

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_reason_nonempty" CHECK (btrim(block_reason) <> ''::text);

ALTER TABLE ONLY "master"."supplier_block"
  ADD CONSTRAINT "sb_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'lifted'::text]));

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_effective_order_chk" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_aml_kyc_status_chk" CHECK (aml_kyc_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'passed'::text, 'failed'::text, 'expired'::text]));

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_block_reason_chk" CHECK (NOT is_blocked OR block_reason IS NOT NULL);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_completeness_chk" CHECK (profile_completeness_pct IS NULL OR profile_completeness_pct >= 0 AND profile_completeness_pct <= 100);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_counts_chk" CHECK (sourcing_event_count >= 0 AND bid_count >= 0 AND awarded_count >= 0);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_delivery_score_chk" CHECK (delivery_score IS NULL OR delivery_score >= 0::numeric AND delivery_score <= 100::numeric);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_onboarding_status_chk" CHECK (onboarding_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'under_review'::text, 'approved'::text, 'rejected'::text]));

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_quality_score_chk" CHECK (quality_score IS NULL OR quality_score >= 0::numeric AND quality_score <= 100::numeric);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_risk_tier_chk" CHECK (risk_tier IS NULL OR (risk_tier = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_sanctions_status_chk" CHECK (sanctions_status = ANY (ARRAY['not_checked'::text, 'clear'::text, 'flagged'::text, 'blocked'::text]));

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_sla_score_chk" CHECK (sla_score IS NULL OR sla_score >= 0::numeric AND sla_score <= 100::numeric);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_filing_chk" CHECK (filing_frequency IS NULL OR (filing_frequency = ANY (ARRAY['monthly'::text, 'bimonthly'::text, 'quarterly'::text, 'semi_annually'::text, 'annually'::text, 'on_demand'::text])));

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_name_chk" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_type_chk" CHECK (jurisdiction_type = ANY (ARRAY['country'::text, 'state'::text, 'province'::text, 'county'::text, 'city'::text, 'district'::text, 'union'::text, 'special_zone'::text, 'treaty'::text]));

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]));

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_temporal_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_type_chk" CHECK (team_type = ANY (ARRAY['functional'::text, 'project'::text, 'virtual'::text]));

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_engine_chk" CHECK (engine = ANY (ARRAY['HANDLEBARS'::text, 'MJML'::text, 'REACT_PDF'::text]));

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_status_chk" CHECK (status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'PUBLISHED'::text, 'ARCHIVED'::text]));

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_entity_chk" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_operation_chk" CHECK (btrim(operation) <> ''::text);

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_variant_chk" CHECK (btrim(variant) <> ''::text);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_-]{1,62}$'::text);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_display_nonempty" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."tenant"
  ADD CONSTRAINT "tenant_realm_key_fmt" CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'::text);

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_domain_chk" CHECK (domain = lower(btrim(domain)) AND domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::text);

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_status_chk" CHECK (verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'revoked'::text]));

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_verified_chk" CHECK (verification_status = 'verified'::text AND verified_at IS NOT NULL OR verification_status <> 'verified'::text);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_alias_chk" CHECK (keycloak_alias ~ '^[a-zA-Z0-9._-]{1,128}$'::text);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_configuration_ref_chk" CHECK (configuration_ref ~ '^[a-zA-Z0-9._:/-]{1,256}$'::text);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_display_name_chk" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_feature_gate_chk" CHECK ((feature_gate = ANY (ARRAY['core'::text, 'windows-kerberos'::text])) AND (provider_type = 'windows-kerberos'::text AND protocol = 'kerberos'::text AND feature_gate = 'windows-kerberos'::text OR provider_type <> 'windows-kerberos'::text AND feature_gate = 'core'::text));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_first_login_chk" CHECK (first_login_policy = ANY (ARRAY['invite-only'::text, 'jit'::text, 'existing-users-only'::text]));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_login_mode_chk" CHECK (login_mode = ANY (ARRAY['optional'::text, 'preferred'::text, 'exclusive'::text]));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_mfa_trust_chk" CHECK (mfa_trust_policy = ANY (ARRAY['never'::text, 'conditional'::text, 'trusted-assurance'::text]));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_planes_chk" CHECK (cardinality(allowed_planes) > 0 AND allowed_planes <@ ARRAY['neon'::text, 'mesh'::text, 'admin'::text]);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_policy_chk" CHECK ((provider_type <> 'google-workspace'::text OR protocol = 'oidc'::text) AND (provider_type <> 'linkedin'::text OR protocol = 'oidc'::text AND allowed_planes <@ ARRAY['mesh'::text] AND mfa_trust_policy = 'never'::text) AND (provider_type <> 'adfs'::text OR protocol = 'saml'::text) AND (provider_type <> 'windows-kerberos'::text OR protocol = 'kerberos'::text));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_protocol_chk" CHECK (protocol = ANY (ARRAY['saml'::text, 'oidc'::text, 'kerberos'::text]));

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_realm_key_chk" CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'::text);

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_type_chk" CHECK (provider_type = ANY (ARRAY['generic'::text, 'entra-id'::text, 'google-workspace'::text, 'linkedin'::text, 'okta'::text, 'adfs'::text, 'ping'::text, 'sap-identity'::text, 'windows-kerberos'::text]));

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_allowed_values_chk" CHECK (allowed_values IS NULL OR jsonb_typeof(allowed_values) = 'array'::text);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_cache_ttl_chk" CHECK (cache_ttl_seconds >= 0 AND cache_ttl_seconds <= 86400);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_code_fmt" CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_name_chk" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_namespace_fmt" CHECK (namespace ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_reload_chk" CHECK (runtime_reload = ANY (ARRAY['immediate'::text, 'next_request'::text, 'next_login'::text, 'restart'::text, 'external_provider'::text]));

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tenant_parameter_definition_type_chk" CHECK (data_type = ANY (ARRAY['boolean'::text, 'integer'::text, 'number'::text, 'string'::text, 'enum'::text, 'duration'::text, 'json'::text]));

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_code_fmt" CHECK (parameter_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tenant_parameter_value_window_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_country_fmt_chk" CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_currency_fmt_chk" CHECK (currency_code IS NULL OR currency_code::text ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_fiscal_month_chk" CHECK (fiscal_year_start_month IS NULL OR fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_reporting_currency_fmt_chk" CHECK (reporting_currency_code IS NULL OR reporting_currency_code::text ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_week_start_chk" CHECK (week_start IS NULL OR week_start >= 0 AND week_start <= 6);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_weekend_days_range_chk" CHECK (weekend_days IS NULL OR cardinality(weekend_days) >= 1 AND cardinality(weekend_days) <= 3 AND weekend_days <@ ARRAY[0::smallint, 1::smallint, 2::smallint, 3::smallint, 4::smallint, 5::smallint, 6::smallint]);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_distinct_chk" CHECK (from_tenant_id <> to_tenant_id);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_effective_range_chk" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_external_ref_chk" CHECK (external_ref IS NULL OR btrim(external_ref) <> ''::text);

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_invited_email_norm_chk" CHECK (invited_email IS NULL OR invited_email = lower(TRIM(BOTH FROM invited_email)));

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_scopes_obj_chk" CHECK (jsonb_typeof(scopes) = 'object'::text);

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_audit_pair_chk" CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]));

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_trust_chk" CHECK (custom_trust_level IS NULL OR custom_trust_level >= 1 AND custom_trust_level <= 5);

ALTER TABLE ONLY "master"."trusted_device"
  ADD CONSTRAINT "trusted_device_expires_chk" CHECK (expires_at > created_at);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "warehouse_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "warehouse_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_dates_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_fte_chk" CHECK (fte > 0::numeric AND fte <= 1.5);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text, 'archived'::text]));

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_type_chk" CHECK (assignment_type = ANY (ARRAY['primary'::text, 'secondary'::text, 'temporary'::text, 'acting'::text]));

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_cycle_chk" CHECK (cycle_length_days >= 1 AND cycle_length_days <= 31);

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_hours_chk" CHECK (weekly_hours IS NULL OR weekly_hours >= 0::numeric);

ALTER TABLE ONLY "master"."work_pattern"
  ADD CONSTRAINT "work_pattern_type_chk" CHECK (pattern_type = ANY (ARRAY['weekly'::text, 'bi_weekly'::text, 'monthly'::text, 'rotating'::text, 'fixed'::text, 'flexible'::text]));

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_minutes_chk" CHECK (break_minutes >= 0 AND planned_minutes >= 0);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_no_chk" CHECK (day_no >= 1 AND day_no <= 31);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_planned_chk" CHECK (start_time IS NULL OR end_time IS NULL OR planned_minutes = ((EXTRACT(epoch FROM end_time - start_time) / 60::numeric)::integer - break_minutes));

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_time_chk" CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time);

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_one_primary_excl" EXCLUDE USING gist (tenant_id WITH =, owner_type WITH =, owner_id WITH =, purpose WITH =, COALESCE(role_qualifier, ''::text) WITH =, daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)'::text) WITH &&) WHERE (is_primary = true);

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bal_one_primary_excl" EXCLUDE USING gist (tenant_id WITH =, owner_type WITH =, owner_id WITH =, purpose WITH =, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)'::text) WITH &&) WHERE (is_primary = true);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_one_primary_per_domain" EXCLUDE USING btree (tenant_id WITH =, owner_type WITH =, owner_id WITH =, classification_type WITH =, domain_code WITH =) WHERE (is_primary = true);

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_cc_type_temporal_excl" EXCLUDE USING gist (tenant_id WITH =, company_code_id WITH =, dimension_type_id WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (is_active = true);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_scope_overlap_excl" EXCLUDE USING gist (tenant_id WITH =, legal_entity_id WITH =, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, jurisdiction_id WITH =, registration_type WITH =, daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]'::text) WITH &&) WHERE (status = 'active'::text);

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_no_overlap_excl" EXCLUDE USING gist (tenant_id WITH =, pay_group_id WITH =, daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)'::text) WITH &&) WHERE (status = 'active'::text AND pay_group_id IS NOT NULL);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."accounting_profile"
  ADD CONSTRAINT "ap_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_tax_jurisdiction_fk" FOREIGN KEY (tenant_id, tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."address"
  ADD CONSTRAINT "address_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_address_fk" FOREIGN KEY (tenant_id, address_id) REFERENCES master.address(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."address_link"
  ADD CONSTRAINT "address_link_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_cc_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_class_fk" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_cost_center_fk" FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_profit_center_fk" FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_project_fk" FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_supplier_fk" FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id);

ALTER TABLE ONLY "master"."asset"
  ADD CONSTRAINT "asset_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "aah_asset_fk" FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset(tenant_id, id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "aah_assigned_by_fk" FOREIGN KEY (assigned_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "aah_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "aah_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset_assignment_history"
  ADD CONSTRAINT "aah_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_asset_fk" FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset(tenant_id, id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_book_fk" FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."asset_book"
  ADD CONSTRAINT "ab_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "ac_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "ac_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.asset_class(tenant_id, id);

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "ac_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."asset_class"
  ADD CONSTRAINT "ac_uom_fk" FOREIGN KEY (default_uom_code) REFERENCES shared.uom(code);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_child_fk" FOREIGN KEY (tenant_id, component_asset_id) REFERENCES master.asset(tenant_id, id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_parent_fk" FOREIGN KEY (tenant_id, parent_asset_id) REFERENCES master.asset(tenant_id, id);

ALTER TABLE ONLY "master"."asset_component"
  ADD CONSTRAINT "acomp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_revision_fk" FOREIGN KEY (revision_id) REFERENCES master.atlas_knowledge_revision(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_source_fk" FOREIGN KEY (source_id) REFERENCES master.atlas_knowledge_source(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_parent_fk" FOREIGN KEY (tenant_id, conversation_id, plane, parent_message_id) REFERENCES master.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_run_fk" FOREIGN KEY (tenant_id, conversation_id, plane, run_id) REFERENCES event.atlas_run(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_thread_fk" FOREIGN KEY (tenant_id, conversation_id, plane) REFERENCES master.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_message"
  ADD CONSTRAINT "atlas_message_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_origin_fk" FOREIGN KEY (origin_tenant_id, origin_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_relationship_fk" FOREIGN KEY (shadow_relationship_id) REFERENCES master.principal_relationship(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_shadow_fk" FOREIGN KEY (target_tenant_id, shadow_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_support_session_audit"
  ADD CONSTRAINT "atlas_support_session_audit_session_id_fkey" FOREIGN KEY (session_id) REFERENCES master.atlas_support_session(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_conversation_fk" FOREIGN KEY (tenant_id, conversation_id) REFERENCES master.conversation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_owner_fk" FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_parent_fk" FOREIGN KEY (parent_attachment_id) REFERENCES master.attachment(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."attachment"
  ADD CONSTRAINT "attachment_uploaded_by_fk" FOREIGN KEY (uploaded_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_attachment_fk" FOREIGN KEY (tenant_id, attachment_id) REFERENCES master.attachment(tenant_id, id);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_parent_fk" FOREIGN KEY (parent_id) REFERENCES master.attachment_comment(id);

ALTER TABLE ONLY "master"."attachment_comment"
  ADD CONSTRAINT "att_comment_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."attachment_folder"
  ADD CONSTRAINT "attachment_folder_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES master.attachment_folder(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_delegate_fk" FOREIGN KEY (tenant_id, delegate_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_delegator_fk" FOREIGN KEY (tenant_id, delegator_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_delegation"
  ADD CONSTRAINT "auth_delegation_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_delegation_fk" FOREIGN KEY (tenant_id, plane_code, delegation_id) REFERENCES master.auth_delegation(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_delegation_grant"
  ADD CONSTRAINT "auth_delegation_grant_scope_fk" FOREIGN KEY (tenant_id, plane_code, scope_target_id) REFERENCES master.auth_scope_target(tenant_id, plane_code, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_scope_fk" FOREIGN KEY (tenant_id, plane_code, scope_target_id) REFERENCES master.auth_scope_target(tenant_id, plane_code, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_subject_group_fk" FOREIGN KEY (tenant_id, plane_code, group_id) REFERENCES master.auth_group(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_deny_rule"
  ADD CONSTRAINT "auth_deny_rule_subject_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group"
  ADD CONSTRAINT "auth_group_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_group_fk" FOREIGN KEY (tenant_id, plane_code, group_id) REFERENCES master.auth_group(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group_member"
  ADD CONSTRAINT "auth_group_member_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_group_fk" FOREIGN KEY (tenant_id, plane_code, group_id) REFERENCES master.auth_group(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_role_fk" FOREIGN KEY (tenant_id, plane_code, role_id) REFERENCES master.auth_role(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_group_role"
  ADD CONSTRAINT "auth_group_role_scope_fk" FOREIGN KEY (tenant_id, plane_code, scope_target_id) REFERENCES master.auth_scope_target(tenant_id, plane_code, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_override"
  ADD CONSTRAINT "auth_override_scope_fk" FOREIGN KEY (tenant_id, plane_code, scope_target_id) REFERENCES master.auth_scope_target(tenant_id, plane_code, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_plane_membership"
  ADD CONSTRAINT "auth_plane_membership_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_entity_fk" FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_exact_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_group_fk" FOREIGN KEY (tenant_id, plane_code, group_id) REFERENCES master.auth_group(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_record_acl"
  ADD CONSTRAINT "auth_record_acl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_role"
  ADD CONSTRAINT "auth_role_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_role_permission"
  ADD CONSTRAINT "auth_role_permission_role_fk" FOREIGN KEY (tenant_id, plane_code, role_id) REFERENCES master.auth_role(tenant_id, plane_code, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_operating_org_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."auth_scope_target"
  ADD CONSTRAINT "auth_scope_target_tenant_scope_fk" FOREIGN KEY (tenant_scope_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_bank_party_fk" FOREIGN KEY (tenant_id, bank_party_id) REFERENCES master.bank_party(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_correspondent_fk" FOREIGN KEY (tenant_id, correspondent_bank_party_id) REFERENCES master.bank_party(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account"
  ADD CONSTRAINT "bank_account_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_gl_account_fk" FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_link_fk" FOREIGN KEY (tenant_id, bank_account_link_id) REFERENCES master.bank_account_link(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account_house_config"
  ADD CONSTRAINT "bahc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bal_bank_account_fk" FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bal_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_account_link"
  ADD CONSTRAINT "bal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."bank_party"
  ADD CONSTRAINT "bank_party_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."brand_profile"
  ADD CONSTRAINT "brand_profile_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "fk_ba_carry_forward" FOREIGN KEY (tenant_id, carry_forward_from_id) REFERENCES master.budget_allocation(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "fk_ba_company_code" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "fk_ba_profile" FOREIGN KEY (tenant_id, budget_profile_id) REFERENCES master.budget_profile(tenant_id, id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "master"."budget_allocation"
  ADD CONSTRAINT "fk_ba_tenant" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "fk_bp_company_code" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "fk_bp_parent_profile" FOREIGN KEY (tenant_id, parent_profile_id) REFERENCES master.budget_profile(tenant_id, id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."budget_profile"
  ADD CONSTRAINT "fk_bp_tenant" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.business_intent(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."business_intent"
  ADD CONSTRAINT "bi_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_parent_fk" FOREIGN KEY (tenant_id, parent_business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_reg_country_fk" FOREIGN KEY (registration_country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tax_country_fk" FOREIGN KEY (tax_residence_country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tax_jurisdiction_fk" FOREIGN KEY (tenant_id, tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."business_partner"
  ADD CONSTRAINT "bpart_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner_network_capability"
  ADD CONSTRAINT "bpnc_provider_fk" FOREIGN KEY (provider_code) REFERENCES master.network_provider(code);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_provider_fk" FOREIGN KEY (provider_code) REFERENCES master.network_provider(code);

ALTER TABLE ONLY "master"."business_partner_network_link"
  ADD CONSTRAINT "bpnl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_from_bp_fk" FOREIGN KEY (tenant_id, from_bp_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."business_partner_relation"
  ADD CONSTRAINT "bpr_to_bp_fk" FOREIGN KEY (tenant_id, to_bp_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."career_level"
  ADD CONSTRAINT "career_level_band_fk" FOREIGN KEY (tenant_id, career_band_id) REFERENCES master.career_band(tenant_id, id);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."certification"
  ADD CONSTRAINT "cert_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "coa_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "coa_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."chart_of_account"
  ADD CONSTRAINT "coa_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_archived_by_fk" FOREIGN KEY (archived_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_commenter_fk" FOREIGN KEY (commenter_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_deleted_by_fk" FOREIGN KEY (deleted_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_parent_fk" FOREIGN KEY (parent_comment_id) REFERENCES master.comment(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."comment"
  ADD CONSTRAINT "comment_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_draft"
  ADD CONSTRAINT "cd_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_mention"
  ADD CONSTRAINT "cm_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."comment_mention"
  ADD CONSTRAINT "cm_mentioned_fk" FOREIGN KEY (mentioned_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_mention"
  ADD CONSTRAINT "cm_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_reaction"
  ADD CONSTRAINT "cr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."comment_reaction"
  ADD CONSTRAINT "cr_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."comment_reaction"
  ADD CONSTRAINT "cr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "ccat_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "ccat_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "ccat_root_category_fk" FOREIGN KEY (tenant_id, root_category_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "ccat_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."commodity_category"
  ADD CONSTRAINT "ccat_uom_fk" FOREIGN KEY (uom_code) REFERENCES shared.uom(code);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."commodity_classification"
  ADD CONSTRAINT "cc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "cc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "cc_currency_fk" FOREIGN KEY (functional_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "cc_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "cc_tax_jurisdiction_fk" FOREIGN KEY (tenant_id, tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id);

ALTER TABLE ONLY "master"."company_code"
  ADD CONSTRAINT "cc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_book_fk" FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_currency_fk" FOREIGN KEY (override_currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."company_code_book_assignment"
  ADD CONSTRAINT "ba_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_chart_fk" FOREIGN KEY (tenant_id, chart_of_account_id) REFERENCES master.chart_of_account(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code_chart_assignment"
  ADD CONSTRAINT "ccca_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_accounting_profile_fk" FOREIGN KEY (tenant_id, default_accounting_profile_id) REFERENCES master.accounting_profile(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_dimension_set_fk" FOREIGN KEY (tenant_id, default_dimension_set_id) REFERENCES master.dimension_set(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_payment_term_fk" FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_receipt_method_fk" FOREIGN KEY (tenant_id, default_receipt_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_tax_group_fk" FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_customer_profile"
  ADD CONSTRAINT "ccp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_cc_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_type_fk" FOREIGN KEY (tenant_id, dimension_type_id) REFERENCES master.dimension_type(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."company_code_dimension_default"
  ADD CONSTRAINT "ccdd_value_fk" FOREIGN KEY (tenant_id, dimension_value_id) REFERENCES master.dimension_value(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_account_fk" FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_cc_fk" FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_site_fk" FOREIGN KEY (tenant_id, default_site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_gl_account"
  ADD CONSTRAINT "ccga_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_accounting_profile_fk" FOREIGN KEY (tenant_id, default_accounting_profile_id) REFERENCES master.accounting_profile(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_default_wht_tax_group_fk" FOREIGN KEY (tenant_id, default_wht_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_dimension_set_fk" FOREIGN KEY (tenant_id, default_dimension_set_id) REFERENCES master.dimension_set(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_payment_method_id_fk" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_payment_term_fk" FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_remittance_bank_link_fk" FOREIGN KEY (tenant_id, preferred_remittance_bank_link_id) REFERENCES master.bank_account_link(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_supplier_fk" FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_tax_group_fk" FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "master"."company_code_supplier_profile"
  ADD CONSTRAINT "scp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_contact_link_fk" FOREIGN KEY (tenant_id, contact_link_id) REFERENCES master.contact_link(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."contact_email"
  ADD CONSTRAINT "contact_email_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."contact_link"
  ADD CONSTRAINT "contact_link_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_contact_link_fk" FOREIGN KEY (tenant_id, contact_link_id) REFERENCES master.contact_link(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."contact_phone"
  ADD CONSTRAINT "contact_phone_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_current_version_fk" FOREIGN KEY (current_version_id) REFERENCES snapshot.content_item_version(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.content_item(tenant_id, id);

ALTER TABLE ONLY "master"."content_item"
  ADD CONSTRAINT "content_item_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_source_fk" FOREIGN KEY (tenant_id, source_content_item_id) REFERENCES master.content_item(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_target_fk" FOREIGN KEY (tenant_id, target_content_item_id) REFERENCES master.content_item(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."content_item_link"
  ADD CONSTRAINT "cil_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_deleted_by_fk" FOREIGN KEY (deleted_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."conversation"
  ADD CONSTRAINT "conv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_conversation_fk" FOREIGN KEY (tenant_id, conversation_id) REFERENCES master.conversation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."conversation_participant"
  ADD CONSTRAINT "cp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc2_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_pc_fk" FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_person_fk" FOREIGN KEY (responsible_person_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."cost_center"
  ADD CONSTRAINT "cc_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "cust_account_manager_fk" FOREIGN KEY (tenant_id, account_manager_id) REFERENCES master.employee(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "cust_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "cust_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."customer"
  ADD CONSTRAINT "cust_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."customer_app_index"
  ADD CONSTRAINT "customer_app_index_customer_fk" FOREIGN KEY (id) REFERENCES master.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."customer_block"
  ADD CONSTRAINT "cb_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."customer_qualification"
  ADD CONSTRAINT "cq_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_owner_fk" FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dashboard"
  ADD CONSTRAINT "dash_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_dashboard_fk" FOREIGN KEY (tenant_id, dashboard_id) REFERENCES master.dashboard(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dashboard_widget"
  ADD CONSTRAINT "dw_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "ds_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."dimension_set"
  ADD CONSTRAINT "ds_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_set_fk" FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_type_fk" FOREIGN KEY (tenant_id, dimension_type_id) REFERENCES master.dimension_type(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dimension_set_item"
  ADD CONSTRAINT "dsi_value_fk" FOREIGN KEY (tenant_id, dimension_value_id) REFERENCES master.dimension_value(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dimension_type"
  ADD CONSTRAINT "dt_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_company_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_parent_fk" FOREIGN KEY (parent_id) REFERENCES master.dimension_value(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."dimension_value"
  ADD CONSTRAINT "dv_type_fk" FOREIGN KEY (tenant_id, dimension_type_id) REFERENCES master.dimension_type(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."document"
  ADD CONSTRAINT "document_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "emp_cc_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "emp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "emp_manager_fk" FOREIGN KEY (tenant_id, manager_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "emp_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "emp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."employee"
  ADD CONSTRAINT "employee_person_fk" FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."employee_leave_enrollment"
  ADD CONSTRAINT "employee_leave_enrollment_plan_fk" FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan(tenant_id, id);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."employee_statutory_enrollment"
  ADD CONSTRAINT "employee_statutory_enrollment_scheme_fk" FOREIGN KEY (tenant_id, statutory_scheme_id) REFERENCES master.statutory_scheme(tenant_id, id);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."employment"
  ADD CONSTRAINT "employment_person_fk" FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_attachment_fk" FOREIGN KEY (tenant_id, attachment_id) REFERENCES master.attachment(tenant_id, id);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "edl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."entity_document_link"
  ADD CONSTRAINT "entity_document_link_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES master.attachment_folder(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fp_calendar_config_fk" FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config(tenant_id, id);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fp_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."fiscal_period"
  ADD CONSTRAINT "fp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_from_currency_fk" FOREIGN KEY (from_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_status_changed_by_fk" FOREIGN KEY (status_changed_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_id) REFERENCES master.fx_rate(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_to_currency_fk" FOREIGN KEY (to_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."fx_rate"
  ADD CONSTRAINT "fxr_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gla_chart_fk" FOREIGN KEY (tenant_id, chart_of_account_id) REFERENCES master.chart_of_account(tenant_id, id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gla_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gla_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gla_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.gl_account(tenant_id, id);

ALTER TABLE ONLY "master"."gl_account"
  ADD CONSTRAINT "gla_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."holiday_calendar"
  ADD CONSTRAINT "hc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_calendar_fk" FOREIGN KEY (tenant_id, holiday_calendar_id) REFERENCES master.holiday_calendar(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."holiday_calendar_day"
  ADD CONSTRAINT "hcd_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_counterparty_cc_fk" FOREIGN KEY (tenant_id, counterparty_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_cust_profile_fk" FOREIGN KEY (tenant_id, mirror_customer_profile_id) REFERENCES master.company_code_customer_profile(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_source_cc_fk" FOREIGN KEY (tenant_id, source_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_sup_profile_fk" FOREIGN KEY (tenant_id, counterparty_supplier_profile_id) REFERENCES master.company_code_supplier_profile(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."intercompany_trading_pair"
  ADD CONSTRAINT "ictp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_commodity_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_product_fk" FOREIGN KEY (tenant_id, product_id) REFERENCES master.product(tenant_id, id);

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."item"
  ADD CONSTRAINT "im_uom_fk" FOREIGN KEY (uom_code) REFERENCES shared.uom(code);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_band_fk" FOREIGN KEY (tenant_id, career_band_id) REFERENCES master.career_band(tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_designation_fk" FOREIGN KEY (tenant_id, designation_id) REFERENCES master.designation(tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_family_fk" FOREIGN KEY (tenant_id, job_family_id) REFERENCES master.job_family(tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_function_fk" FOREIGN KEY (tenant_id, job_function_id) REFERENCES master.job_function(tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_grade_fk" FOREIGN KEY (tenant_id, pay_grade_id) REFERENCES master.pay_grade(tenant_id, id);

ALTER TABLE ONLY "master"."job"
  ADD CONSTRAINT "job_level_fk" FOREIGN KEY (tenant_id, career_level_id) REFERENCES master.career_level(tenant_id, id);

ALTER TABLE ONLY "master"."job_function"
  ADD CONSTRAINT "job_function_family_fk" FOREIGN KEY (tenant_id, job_family_id) REFERENCES master.job_family(tenant_id, id);

ALTER TABLE ONLY "master"."label"
  ADD CONSTRAINT "label_locale_code_fkey" FOREIGN KEY (locale_code) REFERENCES shared.locale(code) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."label"
  ADD CONSTRAINT "label_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_legal_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."leave_plan"
  ADD CONSTRAINT "leave_plan_type_fk" FOREIGN KEY (tenant_id, leave_type_id) REFERENCES master.leave_type(tenant_id, id);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_formula_fk" FOREIGN KEY (tenant_id, accrual_formula_version_id) REFERENCES control.formula_expression_version(tenant_id, id);

ALTER TABLE ONLY "master"."leave_plan_rule"
  ADD CONSTRAINT "leave_plan_rule_plan_fk" FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "lb_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "lb_currency_fk" FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."ledger_book"
  ADD CONSTRAINT "lb_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_func_curr_fk" FOREIGN KEY (functional_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_parent_fk" FOREIGN KEY (tenant_id, parent_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_rpt_curr_fk" FOREIGN KEY (reporting_currency) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."legal_entity"
  ADD CONSTRAINT "le_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_business_partner_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_business_partner_link"
  ADD CONSTRAINT "lebpl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_identity_binding"
  ADD CONSTRAINT "leib_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."legal_entity_network_account"
  ADD CONSTRAINT "lena_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."letterhead"
  ADD CONSTRAINT "letterhead_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_state_fk" FOREIGN KEY (state_id) REFERENCES control.lifecycle_state(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."lifecycle_instance"
  ADD CONSTRAINT "li_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_attachment_fk" FOREIGN KEY (attachment_id) REFERENCES master.attachment(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_initiated_by_fk" FOREIGN KEY (initiated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."multipart_upload"
  ADD CONSTRAINT "mpu_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_message_fk" FOREIGN KEY (message_id) REFERENCES event.notification_message(id) ON DELETE SET NULL;

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_recipient_fk" FOREIGN KEY (recipient_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_sender_fk" FOREIGN KEY (sender_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE "master"."notification"
  ADD CONSTRAINT "notif_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_message_fk" FOREIGN KEY (message_id) REFERENCES event.notification_message(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_recipient_fk" FOREIGN KEY (recipient_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_sender_fk" FOREIGN KEY (sender_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."notification_default"
  ADD CONSTRAINT "notif_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "oo_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "oo_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "oo_status_changed_by_fk" FOREIGN KEY (status_changed_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "oo_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."operating_organization"
  ADD CONSTRAINT "oo_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_org_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_status_changed_by_fk" FOREIGN KEY (status_changed_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."operating_organization_company"
  ADD CONSTRAINT "ooc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."org_unit"
  ADD CONSTRAINT "org_unit_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.org_unit(tenant_id, id);

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_attachment_fk" FOREIGN KEY (tenant_id, certificate_attachment_id) REFERENCES master.attachment(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_jurisdiction_fk" FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."organization_tax_registration"
  ADD CONSTRAINT "otr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."owner_type"
  ADD CONSTRAINT "owner_type_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_contact_person"
  ADD CONSTRAINT "pcp_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_contact_role"
  ADD CONSTRAINT "pcr_contact_fk" FOREIGN KEY (tenant_id, party_contact_person_id) REFERENCES master.party_contact_person(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_evidence_attachment_fk" FOREIGN KEY (evidence_attachment_id) REFERENCES master.attachment(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_member_bp_fk" FOREIGN KEY (tenant_id, member_business_partner_id) REFERENCES master.business_partner(tenant_id, id);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_reviewed_by_fk" FOREIGN KEY (reviewed_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."party_governance_relation"
  ADD CONSTRAINT "pgr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_model_fk" FOREIGN KEY (model_code, model_version) REFERENCES master.risk_model(code, version) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_superseded_by_fk" FOREIGN KEY (tenant_id, superseded_by) REFERENCES master.party_risk_assessment(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_assessment"
  ADD CONSTRAINT "pra_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_assessment_fk" FOREIGN KEY (tenant_id, assessment_id) REFERENCES master.party_risk_assessment(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_dimension_score"
  ADD CONSTRAINT "prds_dimension_fk" FOREIGN KEY (dimension_code) REFERENCES master.risk_dimension(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_assessment_fk" FOREIGN KEY (tenant_id, assessment_id) REFERENCES master.party_risk_assessment(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_dimension_score_fk" FOREIGN KEY (tenant_id, dimension_score_id) REFERENCES master.party_risk_dimension_score(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_driver_code_fk" FOREIGN KEY (driver_code) REFERENCES master.risk_driver_registry(code) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_driver"
  ADD CONSTRAINT "prd_evidence_fk" FOREIGN KEY (tenant_id, evidence_id) REFERENCES master.party_risk_evidence(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_source_fk" FOREIGN KEY (source_code) REFERENCES master.risk_source(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_superseded_by_fk" FOREIGN KEY (tenant_id, superseded_by) REFERENCES master.party_risk_evidence(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_evidence"
  ADD CONSTRAINT "pre_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_assessment_fk" FOREIGN KEY (tenant_id, assessment_id) REFERENCES master.party_risk_assessment(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_driver_fk" FOREIGN KEY (tenant_id, driver_id) REFERENCES master.party_risk_driver(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."party_risk_mitigation"
  ADD CONSTRAINT "prm_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."party_risk_review_event"
  ADD CONSTRAINT "prre_assessment_fk" FOREIGN KEY (tenant_id, assessment_id) REFERENCES master.party_risk_assessment(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."pay_component"
  ADD CONSTRAINT "pay_component_formula_fk" FOREIGN KEY (tenant_id, formula_expression_id) REFERENCES control.formula_expression(tenant_id, id);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_calendar_fk" FOREIGN KEY (tenant_id, calendar_id) REFERENCES master.holiday_calendar(tenant_id, id);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."pay_group"
  ADD CONSTRAINT "pay_group_legal_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure"
  ADD CONSTRAINT "pay_structure_group_fk" FOREIGN KEY (tenant_id, pay_group_id) REFERENCES master.pay_group(tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_component_fk" FOREIGN KEY (tenant_id, pay_component_id) REFERENCES master.pay_component(tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_formula_fk" FOREIGN KEY (tenant_id, formula_expression_id) REFERENCES control.formula_expression(tenant_id, id);

ALTER TABLE ONLY "master"."pay_structure_line"
  ADD CONSTRAINT "pay_structure_line_structure_fk" FOREIGN KEY (tenant_id, pay_structure_id) REFERENCES master.pay_structure(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_method"
  ADD CONSTRAINT "payment_method_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_calendar_fk" FOREIGN KEY (tenant_id, holiday_calendar_id) REFERENCES master.holiday_calendar(tenant_id, id);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_supersedes_fk" FOREIGN KEY (tenant_id, supersedes_payment_term_id) REFERENCES master.payment_term(tenant_id, id);

ALTER TABLE ONLY "master"."payment_term"
  ADD CONSTRAINT "pt_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_settles_fk" FOREIGN KEY (tenant_id, payment_term_id, settles_clause_code) REFERENCES master.payment_term_clause(tenant_id, payment_term_id, clause_code);

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_term_clause"
  ADD CONSTRAINT "ptc_term_fk" FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."payment_term_discount_tier"
  ADD CONSTRAINT "ptdt_term_fk" FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."person_sensitive_profile"
  ADD CONSTRAINT "person_sensitive_profile_person_fk" FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "fk_pm_based_on" FOREIGN KEY (tenant_id, based_on_model_id) REFERENCES master.planning_model(tenant_id, id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "master"."planning_model"
  ADD CONSTRAINT "fk_pm_tenant" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_cost_center_fk" FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_job_fk" FOREIGN KEY (tenant_id, job_id) REFERENCES master.job(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_legal_entity_fk" FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_org_unit_fk" FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_profit_center_fk" FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_reports_to_fk" FOREIGN KEY (tenant_id, reports_to_position_id) REFERENCES master."position"(tenant_id, id);

ALTER TABLE ONLY "master"."position"
  ADD CONSTRAINT "position_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."principal"
  ADD CONSTRAINT "principal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_identity_binding"
  ADD CONSTRAINT "pib_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_notification_preference"
  ADD CONSTRAINT "pnp_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_default_company_fk" FOREIGN KEY (tenant_id, default_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_default_cost_center_fk" FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_default_dimension_set_fk" FOREIGN KEY (tenant_id, default_dimension_set_id) REFERENCES master.dimension_set(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_default_profit_center_fk" FOREIGN KEY (tenant_id, default_profit_center_id) REFERENCES master.profit_center(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_default_project_fk" FOREIGN KEY (tenant_id, default_project_id) REFERENCES master.project(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "pp_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_cc_fk" FOREIGN KEY (default_company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_supervisor_fk" FOREIGN KEY (supervisor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_profile"
  ADD CONSTRAINT "principal_profile_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_from_principal_fk" FOREIGN KEY (from_tenant_id, from_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_relationship"
  ADD CONSTRAINT "principal_relationship_to_principal_fk" FOREIGN KEY (to_tenant_id, to_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_ui_preference"
  ADD CONSTRAINT "puipref_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_default_book_fk" FOREIGN KEY (tenant_id, default_book_id) REFERENCES master.ledger_book(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_default_company_fk" FOREIGN KEY (tenant_id, default_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_default_dashboard_fk" FOREIGN KEY (tenant_id, default_dashboard_id) REFERENCES master.dashboard(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_home_module_fk" FOREIGN KEY (home_module_code) REFERENCES shared.module(code) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_home_workspace_fk" FOREIGN KEY (home_workspace_code) REFERENCES shared.workspace(code) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_language_fk" FOREIGN KEY (language_code) REFERENCES shared.language(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_locale_fk" FOREIGN KEY (locale_code) REFERENCES shared.locale(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_timezone_fk" FOREIGN KEY (timezone_code) REFERENCES shared.timezone(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."principal_ui_profile"
  ADD CONSTRAINT "puip_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_central_buyer_company_fk" FOREIGN KEY (tenant_id, central_buyer_company_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_lead_company_fk" FOREIGN KEY (tenant_id, default_lead_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_org_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."procurement_organization_profile"
  ADD CONSTRAINT "pop_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "prod_commodity_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "prod_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "prod_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "prod_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."product"
  ADD CONSTRAINT "product_default_tax_group_fk" FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group(tenant_id, id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_parent_fk" FOREIGN KEY (tenant_id, parent_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_person_fk" FOREIGN KEY (responsible_person_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."profit_center"
  ADD CONSTRAINT "pc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_cc_fk" FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_parent_fk" FOREIGN KEY (tenant_id, parent_project_id) REFERENCES master.project(tenant_id, id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_person_fk" FOREIGN KEY (responsible_person_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."project"
  ADD CONSTRAINT "proj_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_cc_fk" FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_parent_fk" FOREIGN KEY (tenant_id, parent_item_id) REFERENCES master.project_item(tenant_id, id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_person_fk" FOREIGN KEY (responsible_person_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_project_fk" FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id);

ALTER TABLE ONLY "master"."project_item"
  ADD CONSTRAINT "pi_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."risk_driver_registry"
  ADD CONSTRAINT "rdr_dimension_fk" FOREIGN KEY (default_dimension_code) REFERENCES master.risk_dimension(code) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."risk_model_dimension"
  ADD CONSTRAINT "rmd_dimension_fk" FOREIGN KEY (dimension_code) REFERENCES master.risk_dimension(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."risk_model_dimension"
  ADD CONSTRAINT "rmd_model_fk" FOREIGN KEY (model_code, model_version) REFERENCES master.risk_model(code, version) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_booking_company_fk" FOREIGN KEY (tenant_id, default_booking_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_invoicing_company_fk" FOREIGN KEY (tenant_id, default_invoicing_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_org_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_principal_seller_company_fk" FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."sales_organization_profile"
  ADD CONSTRAINT "sop_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_owner_fk" FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."saved_view"
  ADD CONSTRAINT "sv_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_capacity_uom_fk" FOREIGN KEY (capacity_uom) REFERENCES shared.uom(code) NOT VALID;

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_manager_fk" FOREIGN KEY (manager_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_parent_fk" FOREIGN KEY (tenant_id, parent_site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."site"
  ADD CONSTRAINT "site_timezone_fk" FOREIGN KEY (timezone_code) REFERENCES shared.timezone(code);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_employee_component_fk" FOREIGN KEY (tenant_id, employee_component_id) REFERENCES master.pay_component(tenant_id, id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_employer_component_fk" FOREIGN KEY (tenant_id, employer_component_id) REFERENCES master.pay_component(tenant_id, id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_formula_fk" FOREIGN KEY (tenant_id, formula_expression_id) REFERENCES control.formula_expression(tenant_id, id);

ALTER TABLE ONLY "master"."statutory_scheme"
  ADD CONSTRAINT "statutory_scheme_rate_table_fk" FOREIGN KEY (tenant_id, rate_table_id) REFERENCES control.rate_table(tenant_id, id);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_account_manager_fk" FOREIGN KEY (tenant_id, account_manager_id) REFERENCES master.employee(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_bp_fk" FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_commodity_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_payment_method_fk" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES master.payment_method(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_payment_term_fk" FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."supplier"
  ADD CONSTRAINT "supp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."supplier_app_index"
  ADD CONSTRAINT "supplier_app_index_supplier_fk" FOREIGN KEY (id) REFERENCES master.supplier(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_category_fk" FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id);

ALTER TABLE ONLY "master"."supplier_commodity_category"
  ADD CONSTRAINT "sscat_supplier_fk" FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_supplier_fk" FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."supplier_qualification"
  ADD CONSTRAINT "sq_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_state_region_fk" FOREIGN KEY (country_code, state_region_code) REFERENCES shared.state_region(country_code, code) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."tax_jurisdiction"
  ADD CONSTRAINT "tj_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_condition_type_fk" FOREIGN KEY (condition_type_id) REFERENCES master.condition_type(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tax_type"
  ADD CONSTRAINT "tt_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_leader_fk" FOREIGN KEY (leader_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."team"
  ADD CONSTRAINT "team_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."team_member"
  ADD CONSTRAINT "tm_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."team_member"
  ADD CONSTRAINT "tm_team_fk" FOREIGN KEY (tenant_id, team_id) REFERENCES master.team(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."team_member"
  ADD CONSTRAINT "tm_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_current_version_fk" FOREIGN KEY (current_version_id) REFERENCES snapshot.template_version(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "master"."template"
  ADD CONSTRAINT "template_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_template_fk" FOREIGN KEY (tenant_id, template_id) REFERENCES master.template(tenant_id, id);

ALTER TABLE ONLY "master"."template_binding"
  ADD CONSTRAINT "template_binding_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_provider_fk" FOREIGN KEY (tenant_id, provider_id) REFERENCES master.tenant_identity_provider(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_identity_domain"
  ADD CONSTRAINT "tenant_identity_domain_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_identity_provider"
  ADD CONSTRAINT "tenant_identity_provider_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tpd_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tpd_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_parameter_definition"
  ADD CONSTRAINT "tpd_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tpv_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tpv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_parameter_value"
  ADD CONSTRAINT "tpv_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_brand_profile_fk" FOREIGN KEY (tenant_id, default_brand_profile_id) REFERENCES master.brand_profile(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_country_fk" FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_currency_fk" FOREIGN KEY (currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_language_fk" FOREIGN KEY (language_code) REFERENCES shared.language(code);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_letterhead_fk" FOREIGN KEY (tenant_id, default_letterhead_id) REFERENCES master.letterhead(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_locale_fk" FOREIGN KEY (locale_code) REFERENCES shared.locale(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_reporting_currency_fk" FOREIGN KEY (reporting_currency_code) REFERENCES shared.currency(code);

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_timezone_fk" FOREIGN KEY (timezone_code) REFERENCES shared.timezone(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_profile"
  ADD CONSTRAINT "tp_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_from_tenant_fk" FOREIGN KEY (from_tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_relationship"
  ADD CONSTRAINT "tenant_relationship_to_tenant_fk" FOREIGN KEY (to_tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_source_fk" FOREIGN KEY (source_code) REFERENCES master.risk_source(code) ON DELETE RESTRICT;

ALTER TABLE ONLY "master"."tenant_risk_source_config"
  ADD CONSTRAINT "trsc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "wh_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "wh_manager_fk" FOREIGN KEY (manager_id) REFERENCES master.principal(id);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "wh_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."warehouse"
  ADD CONSTRAINT "wh_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_cost_center_fk" FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_employment_fk" FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_job_fk" FOREIGN KEY (tenant_id, job_id) REFERENCES master.job(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_manager_fk" FOREIGN KEY (tenant_id, manager_employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_org_unit_fk" FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_position_fk" FOREIGN KEY (tenant_id, position_id) REFERENCES master."position"(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_profit_center_fk" FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "master"."work_assignment"
  ADD CONSTRAINT "work_assignment_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "master"."work_pattern_day"
  ADD CONSTRAINT "work_pattern_day_pattern_fk" FOREIGN KEY (tenant_id, work_pattern_id) REFERENCES master.work_pattern(tenant_id, id) ON DELETE CASCADE;
