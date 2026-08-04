-- ============================================================================
-- master/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX ap_subledger_idx ON master.accounting_profile USING btree (tenant_id, subledger_type, direction) WHERE is_active = true;

CREATE INDEX ap_tenant_status_idx ON master.accounting_profile USING btree (tenant_id, status) WHERE is_active = true;

CREATE INDEX address_active_pidx ON master.address USING btree (tenant_id) WHERE status = 'active'::text;

CREATE INDEX address_country_idx ON master.address USING btree (tenant_id, country_code) WHERE country_code IS NOT NULL;

CREATE UNIQUE INDEX address_dedup_uq ON master.address USING btree (tenant_id, country_code, postal_code, line1, city) WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'::text;

CREATE INDEX address_tax_jurisdiction_pidx ON master.address USING btree (tenant_id, tax_jurisdiction_id) WHERE tax_jurisdiction_id IS NOT NULL AND status = 'active'::text;

CREATE INDEX address_tenant_idx ON master.address USING btree (tenant_id);

CREATE INDEX address_link_active_pidx ON master.address_link USING btree (tenant_id, owner_type, owner_id, purpose, role_qualifier) WHERE effective_until IS NULL;

CREATE INDEX address_link_address_idx ON master.address_link USING btree (tenant_id, address_id);

CREATE INDEX address_link_default_pidx ON master.address_link USING btree (tenant_id, owner_type, owner_id) WHERE purpose = 'default'::text AND is_primary = true AND effective_until IS NULL;

CREATE INDEX address_link_owner_idx ON master.address_link USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX address_link_owner_purpose_idx ON master.address_link USING btree (tenant_id, owner_type, owner_id, purpose, role_qualifier);

CREATE INDEX address_link_primary_pidx ON master.address_link USING btree (tenant_id, owner_type, owner_id, purpose, role_qualifier) WHERE is_primary = true AND effective_until IS NULL;

CREATE INDEX asset_active_pidx ON master.asset USING btree (tenant_id, company_code_id) WHERE retired_at IS NULL;

CREATE UNIQUE INDEX asset_barcode_uq ON master.asset USING btree (tenant_id, barcode) WHERE barcode IS NOT NULL AND retired_at IS NULL;

CREATE INDEX asset_cc_idx ON master.asset USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX asset_class_idx ON master.asset USING btree (tenant_id, asset_class_id);

CREATE INDEX asset_company_idx ON master.asset USING btree (tenant_id, company_code_id);

CREATE INDEX asset_custodian_idx ON master.asset USING btree (tenant_id, custodian_id) WHERE custodian_id IS NOT NULL;

CREATE INDEX asset_pc_idx ON master.asset USING btree (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;

CREATE INDEX asset_project_idx ON master.asset USING btree (tenant_id, project_id) WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX asset_serial_number_uq ON master.asset USING btree (tenant_id, serial_number) WHERE serial_number IS NOT NULL AND retired_at IS NULL;

CREATE INDEX asset_status_idx ON master.asset USING btree (tenant_id, company_code_id, status);

CREATE INDEX asset_supplier_idx ON master.asset USING btree (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;

CREATE INDEX aah_asset_idx ON master.asset_assignment_history USING btree (tenant_id, asset_id);

CREATE INDEX aah_effective_idx ON master.asset_assignment_history USING btree (tenant_id, asset_id, assignment_type, effective_from);

CREATE INDEX aah_type_idx ON master.asset_assignment_history USING btree (tenant_id, asset_id, assignment_type);

CREATE INDEX ab_asset_idx ON master.asset_book USING btree (tenant_id, asset_id);

CREATE INDEX ab_book_type_idx ON master.asset_book USING btree (tenant_id, book_type);

CREATE INDEX ab_company_idx ON master.asset_book USING btree (tenant_id, company_code_id);

CREATE INDEX ab_next_depr_pidx ON master.asset_book USING btree (tenant_id, book_type, next_depreciation_date) WHERE next_depreciation_date IS NOT NULL;

CREATE INDEX ac_active_pidx ON master.asset_class USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX ac_nature_idx ON master.asset_class USING btree (tenant_id, asset_nature) WHERE is_active = true;

CREATE INDEX ac_parent_idx ON master.asset_class USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX acomp_active_pidx ON master.asset_component USING btree (tenant_id, parent_asset_id) WHERE is_active = true;

CREATE INDEX acomp_child_idx ON master.asset_component USING btree (tenant_id, component_asset_id);

CREATE INDEX acomp_parent_idx ON master.asset_component USING btree (tenant_id, parent_asset_id);

CREATE INDEX atlas_knowledge_chunk_ready_idx ON master.atlas_knowledge_chunk USING btree (tenant_id, revision_id, ordinal) WHERE index_status = 'ready'::text;

CREATE INDEX atlas_knowledge_revision_ready_idx ON master.atlas_knowledge_revision USING btree (tenant_id, source_id, id) WHERE status = 'ready'::text;

CREATE INDEX atlas_knowledge_source_active_idx ON master.atlas_knowledge_source USING btree (tenant_id, id) WHERE status = 'active'::text;

CREATE INDEX atlas_message_page_idx ON master.atlas_message USING btree (tenant_id, conversation_id, sequence DESC);

CREATE INDEX atlas_message_parent_idx ON master.atlas_message USING btree (tenant_id, conversation_id, parent_message_id) WHERE parent_message_id IS NOT NULL;

CREATE INDEX atlas_message_run_idx ON master.atlas_message USING btree (tenant_id, run_id, sequence) WHERE run_id IS NOT NULL;

CREATE INDEX atlas_support_session_expiry_idx ON master.atlas_support_session USING btree (expires_at) WHERE status = 'active'::text;

CREATE INDEX atlas_support_session_origin_idx ON master.atlas_support_session USING btree (origin_principal_id, status, expires_at);

CREATE INDEX atlas_support_session_target_idx ON master.atlas_support_session USING btree (target_tenant_id, status, expires_at);

CREATE UNIQUE INDEX atlas_support_session_token_uq ON master.atlas_support_session USING btree (token_hash);

CREATE INDEX atlas_support_audit_session_idx ON master.atlas_support_session_audit USING btree (session_id, occurred_at);

CREATE INDEX atlas_thread_expiry_idx ON master.atlas_thread USING btree (expires_at) WHERE expires_at IS NOT NULL AND legal_hold = false;

CREATE INDEX atlas_thread_owner_history_idx ON master.atlas_thread USING btree (tenant_id, plane, owner_principal_id, updated_at DESC NULLS LAST, conversation_id);

CREATE INDEX atlas_thread_purge_idx ON master.atlas_thread USING btree (purge_after) WHERE purge_after IS NOT NULL AND legal_hold = false;

CREATE INDEX att_expiry_pidx ON master.attachment USING btree (expires_at) WHERE expires_at IS NOT NULL AND is_auto_delete_on_expiry = true;

CREATE INDEX att_extracted_text_fts_idx ON master.attachment USING gin (to_tsvector('english'::regconfig, extracted_text)) WHERE extracted_text IS NOT NULL;

CREATE INDEX att_parent_idx ON master.attachment USING btree (tenant_id, parent_attachment_id) WHERE parent_attachment_id IS NOT NULL;

CREATE INDEX att_pii_detected_pidx ON master.attachment USING btree (tenant_id, pii_scanned_at DESC) WHERE pii_detected = true;

CREATE INDEX att_preview_pending_pidx ON master.attachment USING btree (tenant_id, created_at) WHERE is_virus_scanned = true AND preview_key IS NULL AND is_preview_generation_failed = false AND is_active = true;

CREATE INDEX att_sha256_idx ON master.attachment USING btree (tenant_id, sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX att_tenant_active_idx ON master.attachment USING btree (tenant_id, created_at DESC) WHERE is_active = true AND is_current = true;

CREATE INDEX att_text_extraction_pending_pidx ON master.attachment USING btree (tenant_id, created_at) WHERE text_extraction_status IS NULL AND is_active = true AND status = 'active'::text;

CREATE INDEX att_comment_attachment_idx ON master.attachment_comment USING btree (tenant_id, attachment_id) WHERE deleted_at IS NULL;

CREATE INDEX att_comment_author_idx ON master.attachment_comment USING btree (tenant_id, author_id) WHERE deleted_at IS NULL;

CREATE INDEX auth_delegation_current_idx ON master.auth_delegation USING btree (tenant_id, plane_code, delegate_id, delegator_id) WHERE status = 'active'::text;

CREATE INDEX auth_delegation_grant_permission_idx ON master.auth_delegation_grant USING btree (tenant_id, plane_code, permission_id, delegation_id, scope_target_id);

CREATE INDEX auth_deny_rule_current_idx ON master.auth_deny_rule USING btree (tenant_id, plane_code, permission_id, subject_kind) WHERE status = 'active'::text;

CREATE INDEX auth_group_member_current_idx ON master.auth_group_member USING btree (tenant_id, plane_code, principal_id, group_id) WHERE status = 'active'::text;

CREATE INDEX auth_group_role_current_idx ON master.auth_group_role USING btree (tenant_id, plane_code, group_id, role_id, scope_target_id) WHERE status = 'active'::text;

CREATE INDEX auth_override_current_idx ON master.auth_override USING btree (tenant_id, plane_code, principal_id, permission_id) WHERE status = 'active'::text;

CREATE INDEX auth_plane_membership_current_idx ON master.auth_plane_membership USING btree (tenant_id, plane_code, principal_id) WHERE status = 'active'::text;

CREATE INDEX auth_record_acl_current_idx ON master.auth_record_acl USING btree (tenant_id, plane_code, entity_id, record_id, permission_id, subject_kind) WHERE status = 'active'::text;

CREATE INDEX auth_role_permission_current_idx ON master.auth_role_permission USING btree (tenant_id, plane_code, role_id, permission_id) WHERE status = 'active'::text;

CREATE INDEX auth_scope_target_current_idx ON master.auth_scope_target USING btree (tenant_id, plane_code, scope_kind, id) WHERE status = 'active'::text;

CREATE INDEX bank_account_bank_party_idx ON master.bank_account USING btree (tenant_id, bank_party_id) WHERE bank_party_id IS NOT NULL;

CREATE INDEX bank_account_correspondent_idx ON master.bank_account USING btree (tenant_id, correspondent_bank_party_id) WHERE correspondent_bank_party_id IS NOT NULL;

CREATE UNIQUE INDEX bank_account_dedup_uq ON master.bank_account USING btree (tenant_id, account_id_type, COALESCE(bank_party_id, '00000000-0000-0000-0000-000000000000'::uuid), account_id_value, currency_code) WHERE status = 'active'::text;

CREATE INDEX bank_account_provider_ref_idx ON master.bank_account USING btree (tenant_id, provider_account_ref) WHERE provider_account_ref IS NOT NULL;

CREATE INDEX bank_account_tenant_idx ON master.bank_account USING btree (tenant_id);

CREATE INDEX bank_account_unverified_pidx ON master.bank_account USING btree (tenant_id) WHERE is_verified = false AND status = 'active'::text;

CREATE INDEX ix_ba_treasury_currency ON master.bank_account USING btree (tenant_id, currency_code, status);

CREATE INDEX bahc_gl_account_idx ON master.bank_account_house_config USING btree (tenant_id, gl_account_id);

CREATE INDEX ix_house_bank_payment_eligibility ON master.bank_account_house_config USING btree (tenant_id, bank_account_link_id, priority DESC) WHERE status = 'active'::text;

CREATE INDEX bal_active_pidx ON master.bank_account_link USING btree (tenant_id, owner_type, owner_id, purpose) WHERE effective_until IS NULL;

CREATE INDEX bal_bank_account_idx ON master.bank_account_link USING btree (tenant_id, bank_account_id);

CREATE INDEX bal_company_idx ON master.bank_account_link USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE UNIQUE INDEX bal_owner_account_purpose_uq ON master.bank_account_link USING btree (tenant_id, owner_type, owner_id, purpose, bank_account_id, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX bal_owner_idx ON master.bank_account_link USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX bal_owner_purpose_idx ON master.bank_account_link USING btree (tenant_id, owner_type, owner_id, purpose);

CREATE INDEX bal_primary_pidx ON master.bank_account_link USING btree (tenant_id, owner_type, owner_id, purpose) WHERE is_primary = true AND effective_until IS NULL;

CREATE INDEX ix_bal_company_effective_stage_e ON master.bank_account_link USING btree (tenant_id, owner_id, effective_from, effective_until) WHERE owner_type = 'company_code'::text;

CREATE UNIQUE INDEX bank_party_bic_uq ON master.bank_party USING btree (tenant_id, country_code, bic) WHERE bic IS NOT NULL AND status = 'active'::text;

CREATE UNIQUE INDEX bank_party_nat_code_uq ON master.bank_party USING btree (tenant_id, country_code, national_bank_code_type, national_bank_code, branch_code) WHERE national_bank_code IS NOT NULL AND status = 'active'::text;

CREATE INDEX brand_profile_active_pidx ON master.brand_profile USING btree (tenant_id) WHERE is_active = true;

CREATE UNIQUE INDEX brand_profile_default_uq ON master.brand_profile USING btree (tenant_id) WHERE is_default = true AND is_active = true;

CREATE INDEX idx_ba_company_fiscal ON master.budget_allocation USING btree (company_code_id, fiscal_year);

CREATE INDEX idx_ba_cost_center ON master.budget_allocation USING btree (cost_center_id) WHERE cost_center_id IS NOT NULL;

CREATE INDEX idx_ba_gl_account ON master.budget_allocation USING btree (gl_account_id) WHERE gl_account_id IS NOT NULL;

CREATE INDEX idx_ba_profile ON master.budget_allocation USING btree (budget_profile_id);

CREATE INDEX idx_ba_project ON master.budget_allocation USING btree (project_id) WHERE project_id IS NOT NULL;

CREATE INDEX idx_ba_status ON master.budget_allocation USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['closed'::text, 'cancelled'::text, 'exhausted'::text]);

CREATE INDEX idx_ba_tenant ON master.budget_allocation USING btree (tenant_id);

CREATE INDEX idx_bp_company ON master.budget_profile USING btree (company_code_id);

CREATE INDEX idx_bp_fiscal ON master.budget_profile USING btree (tenant_id, fiscal_year);

CREATE INDEX idx_bp_parent ON master.budget_profile USING btree (parent_profile_id) WHERE parent_profile_id IS NOT NULL;

CREATE INDEX idx_bp_status ON master.budget_profile USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['closed'::text, 'cancelled'::text]);

CREATE INDEX idx_bp_tenant ON master.budget_profile USING btree (tenant_id);

CREATE INDEX bi_parent_pidx ON master.business_intent USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX bi_tenant_domain_pidx ON master.business_intent USING btree (tenant_id, domain) WHERE is_active = true;

CREATE INDEX bi_visibility_pidx ON master.business_intent USING btree (tenant_id, visibility) WHERE is_active = true;

CREATE INDEX bpart_active_pidx ON master.business_partner USING btree (tenant_id, code) WHERE is_active = true;

CREATE INDEX bpart_category_idx ON master.business_partner USING btree (tenant_id, partner_category);

CREATE UNIQUE INDEX bpart_external_ref_uidx ON master.business_partner USING btree (tenant_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX bpart_parent_idx ON master.business_partner USING btree (tenant_id, parent_business_partner_id) WHERE parent_business_partner_id IS NOT NULL;

CREATE INDEX bpart_tax_jurisdiction_pidx ON master.business_partner USING btree (tenant_id, tax_jurisdiction_id) WHERE tax_jurisdiction_id IS NOT NULL AND is_active = true;

CREATE INDEX bpart_tenant_idx ON master.business_partner USING btree (tenant_id);

CREATE INDEX bpnc_bp_idx ON master.business_partner_network_capability USING btree (tenant_id, business_partner_id);

CREATE INDEX bpnc_provider_idx ON master.business_partner_network_capability USING btree (tenant_id, provider_code);

CREATE INDEX bpnl_bp_idx ON master.business_partner_network_link USING btree (tenant_id, business_partner_id);

CREATE INDEX bpnl_mesh_connection_code_idx ON master.business_partner_network_link USING btree (mesh_connection_code) WHERE mesh_connection_code IS NOT NULL;

CREATE INDEX bpnl_projection_sequence_idx ON master.business_partner_network_link USING btree (tenant_id, projection_sequence_no) WHERE projection_sequence_no IS NOT NULL;

CREATE INDEX bpnl_provider_idx ON master.business_partner_network_link USING btree (provider_code, network_account_id);

CREATE INDEX bpnl_sync_pidx ON master.business_partner_network_link USING btree (tenant_id, sync_status) WHERE sync_status = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE UNIQUE INDEX bpnl_verified_account_uidx ON master.business_partner_network_link USING btree (provider_code, network_account_id) WHERE verification_status = 'verified'::text;

CREATE INDEX bpr_active_pidx ON master.business_partner_relation USING btree (tenant_id, from_bp_id, to_bp_id) WHERE is_active = true;

CREATE INDEX bpr_from_bp_idx ON master.business_partner_relation USING btree (tenant_id, from_bp_id);

CREATE INDEX bpr_to_bp_idx ON master.business_partner_relation USING btree (tenant_id, to_bp_id);

CREATE INDEX bpr_type_idx ON master.business_partner_relation USING btree (tenant_id, relation_type);

CREATE INDEX cert_expiry_idx ON master.certification USING btree (tenant_id, effective_until) WHERE effective_until IS NOT NULL AND status = 'active'::text;

CREATE INDEX cert_owner_idx ON master.certification USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX cert_type_idx ON master.certification USING btree (tenant_id, certification_type_id) WHERE certification_type_id IS NOT NULL;

CREATE INDEX ctype_category_idx ON master.certification_type USING btree (category) WHERE category IS NOT NULL;

CREATE UNIQUE INDEX ctype_code_scope_uq ON master.certification_type USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE INDEX ctype_tenant_idx ON master.certification_type USING btree (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX coa_active_pidx ON master.chart_of_account USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX coa_tenant_idx ON master.chart_of_account USING btree (tenant_id);

CREATE INDEX comment_commenter_idx ON master.comment USING btree (tenant_id, commenter_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX comment_entity_idx ON master.comment USING btree (tenant_id, context_type, entity_type, entity_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX comment_fts_idx ON master.comment USING gin (to_tsvector('english'::regconfig, comment_text)) WHERE deleted_at IS NULL;

CREATE INDEX comment_intent_idx ON master.comment USING btree (tenant_id, entity_type, entity_id, comment_intent, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX comment_retention_pidx ON master.comment USING btree (tenant_id, retention_until) WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX comment_root_pidx ON master.comment USING btree (tenant_id, entity_type, entity_id, created_at DESC) WHERE parent_comment_id IS NULL AND deleted_at IS NULL;

CREATE INDEX comment_status_idx ON master.comment USING btree (tenant_id, entity_type, entity_id, status) WHERE deleted_at IS NULL;

CREATE INDEX comment_thread_idx ON master.comment USING btree (tenant_id, parent_comment_id, created_at) WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX cd_principal_entity_idx ON master.comment_draft USING btree (tenant_id, principal_id, entity_type, entity_id);

CREATE INDEX cd_principal_recent_idx ON master.comment_draft USING btree (tenant_id, principal_id, updated_at DESC);

CREATE INDEX cfc_entity_principal_idx ON master.comment_feed_cursor USING btree (tenant_id, entity_type, entity_id, principal_id);

CREATE INDEX cm_comment_idx ON master.comment_mention USING btree (tenant_id, context_type, comment_id);

CREATE INDEX cm_mentioned_idx ON master.comment_mention USING btree (tenant_id, mentioned_id, created_at DESC);

CREATE INDEX cr_comment_idx ON master.comment_reaction USING btree (tenant_id, context_type, comment_id, reaction_type);

CREATE INDEX cr_principal_idx ON master.comment_reaction USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX ccat_active_pidx ON master.commodity_category USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX ccat_buy_allowed_pidx ON master.commodity_category USING btree (tenant_id, code) WHERE buy_allowed = true;

CREATE INDEX ccat_inventory_allowed_pidx ON master.commodity_category USING btree (tenant_id, code) WHERE inventory_allowed = true;

CREATE INDEX ccat_parent_idx ON master.commodity_category USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX ccat_root_idx ON master.commodity_category USING btree (tenant_id, root_category_id);

CREATE INDEX ccat_sell_allowed_pidx ON master.commodity_category USING btree (tenant_id, code) WHERE sell_allowed = true;

CREATE INDEX ccat_tenant_idx ON master.commodity_category USING btree (tenant_id);

CREATE INDEX cc_code_idx ON master.commodity_classification USING btree (code_id, owner_type);

CREATE INDEX cc_owner_domain_pidx ON master.commodity_classification USING btree (tenant_id, owner_type, owner_id, classification_type, domain_code) WHERE is_primary = true;

CREATE INDEX cc_owner_idx ON master.commodity_classification USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX ccl_active_pidx ON master.commodity_classification USING btree (tenant_id, owner_type) WHERE is_active = true;

CREATE INDEX cc_active_pidx ON master.company_code USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX cc_legal_entity_idx ON master.company_code USING btree (tenant_id, legal_entity_id);

CREATE INDEX cc_tenant_code_id_idx ON master.company_code USING btree (tenant_id, code, id);

CREATE INDEX cc_tenant_idx ON master.company_code USING btree (tenant_id);

CREATE INDEX ba_active_pidx ON master.company_code_book_assignment USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX ba_book_idx ON master.company_code_book_assignment USING btree (tenant_id, book_id);

CREATE INDEX ba_company_idx ON master.company_code_book_assignment USING btree (tenant_id, company_code_id);

CREATE INDEX ccca_chart_idx ON master.company_code_chart_assignment USING btree (tenant_id, chart_of_account_id);

CREATE INDEX ccca_company_idx ON master.company_code_chart_assignment USING btree (tenant_id, company_code_id);

CREATE UNIQUE INDEX ccca_primary_uq ON master.company_code_chart_assignment USING btree (tenant_id, company_code_id, assignment_type) WHERE is_primary = true;

CREATE INDEX ccp_accounting_profile_idx ON master.company_code_customer_profile USING btree (tenant_id, default_accounting_profile_id) WHERE default_accounting_profile_id IS NOT NULL;

CREATE INDEX ccp_active_pidx ON master.company_code_customer_profile USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX ccp_company_idx ON master.company_code_customer_profile USING btree (tenant_id, company_code_id);

CREATE INDEX ccp_customer_idx ON master.company_code_customer_profile USING btree (tenant_id, customer_id);

CREATE INDEX ccp_receipt_method_idx ON master.company_code_customer_profile USING btree (tenant_id, default_receipt_method_id) WHERE default_receipt_method_id IS NOT NULL;

CREATE INDEX ccdd_cc_pidx ON master.company_code_dimension_default USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX ccdd_cc_type_active_pidx ON master.company_code_dimension_default USING btree (tenant_id, company_code_id, dimension_type_id) WHERE is_active = true;

CREATE INDEX ccga_account_idx ON master.company_code_gl_account USING btree (tenant_id, gl_account_id);

CREATE INDEX ccga_company_idx ON master.company_code_gl_account USING btree (tenant_id, company_code_id);

CREATE INDEX scp_accounting_profile_idx ON master.company_code_supplier_profile USING btree (tenant_id, default_accounting_profile_id) WHERE default_accounting_profile_id IS NOT NULL;

CREATE INDEX scp_active_pidx ON master.company_code_supplier_profile USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX scp_company_idx ON master.company_code_supplier_profile USING btree (tenant_id, company_code_id);

CREATE INDEX scp_payment_method_id_idx ON master.company_code_supplier_profile USING btree (tenant_id, payment_method_id) WHERE payment_method_id IS NOT NULL;

CREATE INDEX scp_remittance_bank_link_idx ON master.company_code_supplier_profile USING btree (tenant_id, preferred_remittance_bank_link_id) WHERE preferred_remittance_bank_link_id IS NOT NULL;

CREATE INDEX scp_supplier_idx ON master.company_code_supplier_profile USING btree (tenant_id, supplier_id);

CREATE INDEX ix_condition_type_sub_type ON master.condition_type USING btree (term_type, term_sub_type) WHERE term_sub_type IS NOT NULL AND status = 'active'::text;

CREATE INDEX ix_condition_type_system ON master.condition_type USING btree (term_type, sort_order) WHERE is_system = true AND status = 'active'::text;

CREATE INDEX ix_condition_type_term_type ON master.condition_type USING btree (tenant_id, term_type) WHERE status = 'active'::text;

CREATE INDEX contact_email_bounced_pidx ON master.contact_email USING btree (tenant_id) WHERE bounce_count > 0;

CREATE INDEX contact_email_disposable_pidx ON master.contact_email USING btree (tenant_id) WHERE is_disposable = true;

CREATE INDEX contact_email_domain_idx ON master.contact_email USING btree (tenant_id, domain) WHERE domain IS NOT NULL;

CREATE INDEX contact_link_owner_idx ON master.contact_link USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX contact_link_primary_purpose_idx ON master.contact_link USING btree (tenant_id, owner_type, owner_id, channel_type, purpose, role_qualifier) WHERE is_primary = true AND is_verified = true AND status = 'active'::text;

CREATE UNIQUE INDEX contact_link_value_uq ON master.contact_link USING btree (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) NULLS NOT DISTINCT;

CREATE INDEX contact_link_verified_pidx ON master.contact_link USING btree (tenant_id, owner_type, owner_id, channel_type) WHERE is_verified = true;

CREATE UNIQUE INDEX ux_contact_link_one_primary ON master.contact_link USING btree (tenant_id, owner_type, owner_id, channel_type, purpose, role_qualifier) NULLS NOT DISTINCT WHERE is_primary = true;

CREATE UNIQUE INDEX ux_contact_link_principal_login ON master.contact_link USING btree (tenant_id, lower(value)) WHERE owner_type = 'principal'::text AND channel_type = 'email'::text AND purpose = 'login'::text AND is_verified = true AND is_primary = true;

CREATE INDEX contact_marketing_consent_changed_idx ON master.contact_marketing_consent USING btree (tenant_id, status_changed_at DESC);

CREATE INDEX contact_marketing_consent_status_idx ON master.contact_marketing_consent USING btree (tenant_id, status, owner_type);

CREATE INDEX contact_phone_e164_idx ON master.contact_phone USING btree (tenant_id, e164) WHERE e164 IS NOT NULL;

CREATE INDEX content_item_fts_idx ON master.content_item USING gin (to_tsvector('english'::regconfig, (COALESCE(title, ''::text) || ' '::text) || COALESCE(summary, ''::text))) WHERE status <> 'ARCHIVED'::text;

COMMENT ON INDEX "master"."content_item_fts_idx" IS 'GIN full-text search over title + summary for GET /content/search. Updated automatically on INSERT/UPDATE. Sprint 30.';

CREATE INDEX content_item_kind_locale_idx ON master.content_item USING btree (tenant_id, kind, locale_code, status) WHERE status <> 'ARCHIVED'::text;

CREATE INDEX content_item_published_pidx ON master.content_item USING btree (tenant_id, kind, locale_code) WHERE status = 'PUBLISHED'::text;

CREATE INDEX content_item_tenant_locale_slug_idx ON master.content_item USING btree (tenant_id, locale_code, slug);

CREATE INDEX content_item_tenant_parent_idx ON master.content_item USING btree (tenant_id, parent_id);

CREATE INDEX content_item_tenant_status_kind_idx ON master.content_item USING btree (tenant_id, status, kind);

CREATE INDEX cil_source_idx ON master.content_item_link USING btree (source_content_item_id);

CREATE INDEX cil_target_idx ON master.content_item_link USING btree (target_content_item_id);

CREATE INDEX conv_entity_pidx ON master.conversation USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL AND status = 'active'::text;

CREATE INDEX conv_tenant_active_idx ON master.conversation USING btree (tenant_id, created_at DESC) WHERE status = 'active'::text AND deleted_at IS NULL;

CREATE INDEX cp_conversation_idx ON master.conversation_participant USING btree (tenant_id, conversation_id) WHERE left_at IS NULL;

CREATE INDEX cp_principal_active_idx ON master.conversation_participant USING btree (tenant_id, principal_id, joined_at DESC) WHERE left_at IS NULL;

CREATE INDEX cp_read_cursor_pidx ON master.conversation_participant USING btree (tenant_id, conversation_id, last_read_at DESC NULLS LAST) WHERE left_at IS NULL;

CREATE INDEX cc_category_idx ON master.cost_center USING btree (tenant_id, company_code_id, cost_center_category);

CREATE INDEX cc_parent_idx ON master.cost_center USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX cc_postable_pidx ON master.cost_center USING btree (tenant_id, company_code_id) WHERE is_active = true AND node_type = 'posting'::text;

CREATE INDEX cc_tenant_company_idx ON master.cost_center USING btree (tenant_id, company_code_id);

CREATE INDEX cust_active_pidx ON master.customer USING btree (tenant_id, customer_code) WHERE is_active = true;

CREATE INDEX cust_bp_idx ON master.customer USING btree (tenant_id, business_partner_id);

CREATE INDEX cust_tenant_idx ON master.customer USING btree (tenant_id);

CREATE INDEX cust_type_idx ON master.customer USING btree (tenant_id, customer_type);

CREATE INDEX cai_bp_idx ON master.customer_app_index USING btree (tenant_id, business_partner_id);

CREATE INDEX cai_customer_code_idx ON master.customer_app_index USING btree (tenant_id, customer_code);

CREATE INDEX cai_search_text_gin ON master.customer_app_index USING gin (search_text public.gin_trgm_ops);

CREATE INDEX cai_tenant_idx ON master.customer_app_index USING btree (tenant_id);

CREATE INDEX cb_active_idx ON master.customer_block USING btree (tenant_id, customer_id) WHERE is_active = true;

CREATE INDEX cb_customer_idx ON master.customer_block USING btree (tenant_id, customer_id);

CREATE INDEX cq_blocked_pidx ON master.customer_qualification USING btree (tenant_id) WHERE credit_status = 'blocked'::text AND is_active = true;

CREATE INDEX cq_credit_status_idx ON master.customer_qualification USING btree (tenant_id, credit_status);

CREATE INDEX cq_customer_idx ON master.customer_qualification USING btree (tenant_id, customer_id);

CREATE UNIQUE INDEX dash_code_uq ON master.dashboard USING btree (tenant_id, scope, owner_principal_id, code) NULLS NOT DISTINCT WHERE status = 'active'::text;

CREATE UNIQUE INDEX dash_one_default_uq ON master.dashboard USING btree (tenant_id, scope, owner_principal_id, surface_code) NULLS NOT DISTINCT WHERE is_default = true AND status = 'active'::text;

CREATE UNIQUE INDEX dash_one_home_uq ON master.dashboard USING btree (tenant_id, scope, owner_principal_id) NULLS NOT DISTINCT WHERE is_home = true AND status = 'active'::text;

CREATE INDEX dash_owner_idx ON master.dashboard USING btree (tenant_id, owner_principal_id) WHERE status = 'active'::text AND owner_principal_id IS NOT NULL;

CREATE INDEX dw_dashboard_idx ON master.dashboard_widget USING btree (tenant_id, dashboard_id);

CREATE INDEX ds_tenant_idx ON master.dimension_set USING btree (tenant_id);

CREATE INDEX dsi_set_idx ON master.dimension_set_item USING btree (dimension_set_id);

CREATE INDEX dsi_value_idx ON master.dimension_set_item USING btree (dimension_value_id);

CREATE INDEX dt_category_idx ON master.dimension_type USING btree (tenant_id, category) WHERE is_active = true;

CREATE INDEX dt_tenant_active_pidx ON master.dimension_type USING btree (tenant_id, sort_order) WHERE is_active = true;

CREATE UNIQUE INDEX dv_company_code_uq ON master.dimension_value USING btree (tenant_id, dimension_type_id, company_code_id, code) WHERE company_code_id IS NOT NULL;

CREATE INDEX dv_company_idx ON master.dimension_value USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE UNIQUE INDEX dv_global_code_uq ON master.dimension_value USING btree (tenant_id, dimension_type_id, code) WHERE company_code_id IS NULL;

CREATE INDEX dv_parent_idx ON master.dimension_value USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX dv_postable_pidx ON master.dimension_value USING btree (tenant_id, dimension_type_id) WHERE status = 'active'::text AND is_posting_allowed = true;

CREATE INDEX dv_source_idx ON master.dimension_value USING btree (source_record_id) WHERE source_record_id IS NOT NULL;

CREATE INDEX dv_type_idx ON master.dimension_value USING btree (tenant_id, dimension_type_id) WHERE is_active = true;

CREATE INDEX document_active_pidx ON master.document USING btree (tenant_id) WHERE status = 'active'::text;

CREATE INDEX document_tenant_idx ON master.document USING btree (tenant_id);

CREATE INDEX emp_active_pidx ON master.employee USING btree (tenant_id, status, termination_date) WHERE status = 'active'::text;

CREATE INDEX emp_cc_idx ON master.employee USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX emp_manager_idx ON master.employee USING btree (tenant_id, manager_id) WHERE manager_id IS NOT NULL;

CREATE INDEX emp_principal_idx ON master.employee USING btree (tenant_id, principal_id) WHERE principal_id IS NOT NULL;

CREATE INDEX emp_tenant_idx ON master.employee USING btree (tenant_id);

CREATE INDEX employee_person_idx ON master.employee USING btree (tenant_id, person_id) WHERE person_id IS NOT NULL;

CREATE UNIQUE INDEX employee_principal_uq ON master.employee USING btree (tenant_id, principal_id) WHERE principal_id IS NOT NULL;

CREATE INDEX leave_enrollment_employee_idx ON master.employee_leave_enrollment USING btree (tenant_id, employee_id, effective_from DESC);

CREATE INDEX employment_employee_idx ON master.employment USING btree (tenant_id, employee_id) WHERE employee_id IS NOT NULL;

CREATE UNIQUE INDEX employment_one_active_fulltime_per_company_uq ON master.employment USING btree (tenant_id, person_id, company_code_id) WHERE status = 'active'::text AND employment_type = 'full_time'::text;

CREATE INDEX employment_person_idx ON master.employment USING btree (tenant_id, person_id);

CREATE INDEX edl_attachment_idx ON master.entity_document_link USING btree (tenant_id, attachment_id);

CREATE INDEX edl_entity_idx ON master.entity_document_link USING btree (tenant_id, entity_type, entity_id);

CREATE INDEX external_reference_owner_idx ON master.external_reference USING btree (tenant_id, owner_entity, owner_id);

CREATE INDEX filter_preset_entity_idx ON master.filter_preset USING btree (tenant_id, entity_code) WHERE is_shared = true;

CREATE INDEX filter_preset_principal_idx ON master.filter_preset USING btree (tenant_id, principal_id, entity_code);

CREATE INDEX fp_calendar_generation_idx ON master.fiscal_period USING btree (tenant_id, company_code_id, fiscal_calendar_config_id, fiscal_year);

CREATE INDEX fp_dates_idx ON master.fiscal_period USING btree (tenant_id, start_date, end_date);

CREATE UNIQUE INDEX fp_generation_key_uq ON master.fiscal_period USING btree (tenant_id, generation_key) WHERE generation_key IS NOT NULL;

CREATE INDEX fp_open_pidx ON master.fiscal_period USING btree (tenant_id, company_code_id) WHERE status = ANY (ARRAY['open'::text, 'soft_close'::text]);

CREATE INDEX fp_status_idx ON master.fiscal_period USING btree (tenant_id, company_code_id, status);

CREATE INDEX fp_tenant_company_idx ON master.fiscal_period USING btree (tenant_id, company_code_id);

CREATE UNIQUE INDEX fxr_pair_date_uq ON master.fx_rate USING btree (tenant_id, from_currency, to_currency, rate_type, effective_date, COALESCE(effective_time, '00:00:00'::time without time zone), source) WHERE is_active = true;

CREATE INDEX fxr_pair_idx ON master.fx_rate USING btree (tenant_id, from_currency, to_currency, effective_date DESC) WHERE is_active = true;

CREATE INDEX fxr_supersedes_idx ON master.fx_rate USING btree (tenant_id, supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE UNIQUE INDEX gl_account_tenant_code_uq ON master.gl_account USING btree (tenant_id, code);

CREATE INDEX gla_chart_idx ON master.gl_account USING btree (tenant_id, chart_of_account_id);

CREATE INDEX gla_class_idx ON master.gl_account USING btree (tenant_id, chart_of_account_id, account_class);

CREATE INDEX gla_parent_idx ON master.gl_account USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX gla_postable_pidx ON master.gl_account USING btree (tenant_id, chart_of_account_id, account_class) WHERE is_active = true AND node_type = 'posting'::text;

CREATE UNIQUE INDEX hc_scope_active_uq ON master.holiday_calendar USING btree (tenant_id, COALESCE(country_code, ''::bpchar), COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status::text = 'active'::text;

CREATE INDEX hc_tenant_pidx ON master.holiday_calendar USING btree (tenant_id) WHERE status::text = 'active'::text;

CREATE INDEX hcd_calendar_year_idx ON master.holiday_calendar_day USING btree (holiday_calendar_id, calendar_year);

CREATE INDEX hcd_date_idx ON master.holiday_calendar_day USING btree (holiday_calendar_id, holiday_date);

CREATE INDEX ictp_active_pidx ON master.intercompany_trading_pair USING btree (tenant_id, source_company_code_id, counterparty_company_code_id) WHERE is_active = true;

CREATE INDEX ictp_counterparty_idx ON master.intercompany_trading_pair USING btree (tenant_id, counterparty_company_code_id);

CREATE INDEX ictp_source_idx ON master.intercompany_trading_pair USING btree (tenant_id, source_company_code_id);

CREATE INDEX im_commodity_category_idx ON master.item USING btree (tenant_id, commodity_category_id) WHERE commodity_category_id IS NOT NULL;

CREATE INDEX im_company_product_idx ON master.item USING btree (tenant_id, company_code_id, product_id) WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX im_company_product_uq ON master.item USING btree (tenant_id, company_code_id, product_id) WHERE product_id IS NOT NULL;

CREATE INDEX im_no_product_pidx ON master.item USING btree (tenant_id, company_code_id) WHERE product_id IS NULL AND is_active = true;

CREATE INDEX im_product_idx ON master.item USING btree (tenant_id, product_id) WHERE product_id IS NOT NULL;

CREATE INDEX im_reorder_pidx ON master.item USING btree (tenant_id, company_code_id) WHERE reorder_point IS NOT NULL;

CREATE INDEX im_tenant_idx ON master.item USING btree (tenant_id);

CREATE INDEX label_active_pidx ON master.label USING btree (entity, code, locale_code) WHERE status::text = 'active'::text;

CREATE INDEX label_tenant_pidx ON master.label USING btree (tenant_id, entity, code) WHERE tenant_id IS NOT NULL;

CREATE INDEX ledger_book_active_pidx ON master.ledger_book USING btree (tenant_id) WHERE is_active = true;

CREATE UNIQUE INDEX ledger_book_primary_uq ON master.ledger_book USING btree (tenant_id) WHERE is_primary = true;

CREATE INDEX ledger_book_tenant_idx ON master.ledger_book USING btree (tenant_id);

CREATE INDEX le_active_pidx ON master.legal_entity USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX le_parent_idx ON master.legal_entity USING btree (tenant_id, parent_entity_id) WHERE parent_entity_id IS NOT NULL;

CREATE INDEX le_tenant_idx ON master.legal_entity USING btree (tenant_id);

CREATE INDEX lebpl_business_partner_idx ON master.legal_entity_business_partner_link USING btree (tenant_id, business_partner_id);

CREATE INDEX lebpl_legal_entity_idx ON master.legal_entity_business_partner_link USING btree (tenant_id, legal_entity_id);

CREATE UNIQUE INDEX lebpl_one_active_self_bp_uidx ON master.legal_entity_business_partner_link USING btree (tenant_id, legal_entity_id) WHERE relationship_type = 'self_bp'::text AND status = 'active'::text;

CREATE INDEX leib_legal_entity_idx ON master.legal_entity_identity_binding USING btree (tenant_id, legal_entity_id);

CREATE INDEX leib_sync_pidx ON master.legal_entity_identity_binding USING btree (tenant_id, sync_status) WHERE sync_status = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE INDEX lena_account_idx ON master.legal_entity_network_account USING btree (provider_code, account_code);

CREATE UNIQUE INDEX lena_default_buyer_uq ON master.legal_entity_network_account USING btree (tenant_id, legal_entity_id, provider_code) WHERE is_default = true AND is_active = true AND (account_role = ANY (ARRAY['buyer'::text, 'both'::text]));

CREATE UNIQUE INDEX lena_default_supplier_uq ON master.legal_entity_network_account USING btree (tenant_id, legal_entity_id, provider_code) WHERE is_default = true AND is_active = true AND (account_role = ANY (ARRAY['supplier'::text, 'both'::text]));

CREATE INDEX lena_legal_entity_idx ON master.legal_entity_network_account USING btree (tenant_id, legal_entity_id);

CREATE INDEX lena_mesh_account_id_idx ON master.legal_entity_network_account USING btree (mesh_account_id) WHERE mesh_account_id IS NOT NULL;

CREATE INDEX lena_sync_pidx ON master.legal_entity_network_account USING btree (tenant_id, sync_status) WHERE sync_status = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE INDEX letterhead_active_pidx ON master.letterhead USING btree (tenant_id) WHERE is_active = true;

CREATE INDEX letterhead_cc_idx ON master.letterhead USING btree (company_code_id) WHERE company_code_id IS NOT NULL;

CREATE UNIQUE INDEX letterhead_default_uq ON master.letterhead USING btree (tenant_id) WHERE is_default = true AND is_active = true;

CREATE INDEX li_entity_idx ON master.lifecycle_instance USING btree (tenant_id, entity_name, entity_id);

CREATE INDEX li_state_idx ON master.lifecycle_instance USING btree (tenant_id, lifecycle_id, state_id);

CREATE INDEX mpu_expiry_pidx ON master.multipart_upload USING btree (expires_at) WHERE status = ANY (ARRAY['initiated'::text, 'uploading'::text]);

CREATE INDEX mpu_tenant_status_idx ON master.multipart_upload USING btree (tenant_id, status, created_at DESC);

CREATE INDEX mv_cpa_account_idx ON master.mv_company_postable_account USING btree (tenant_id, company_code_id, gl_account_id);

CREATE INDEX mv_cpa_class_idx ON master.mv_company_postable_account USING btree (tenant_id, company_code_id, account_class);

CREATE UNIQUE INDEX mv_cpa_lookup_idx ON master.mv_company_postable_account USING btree (tenant_id, company_code_id, account_code);

CREATE INDEX notif_category_unread_pidx ON ONLY master.notification USING btree (tenant_id, recipient_id, category, created_at DESC) WHERE is_read = false AND category IS NOT NULL;

CREATE INDEX notif_entity_pidx ON ONLY master.notification USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX notif_expiry_pidx ON ONLY master.notification USING btree (expires_at) WHERE expires_at IS NOT NULL;

CREATE UNIQUE INDEX notif_msg_recipient_channel_uidx ON ONLY master.notification USING btree (tenant_id, message_id, recipient_id, channel, created_at) WHERE message_id IS NOT NULL;

CREATE INDEX notif_recipient_idx ON ONLY master.notification USING btree (tenant_id, recipient_id, created_at DESC);

CREATE INDEX notif_recipient_unread_pidx ON ONLY master.notification USING btree (tenant_id, recipient_id, created_at DESC) WHERE is_read = false AND is_dismissed = false;

CREATE INDEX notification_default_expires_at_idx ON master.notification_default USING btree (expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX notification_default_tenant_id_entity_type_entity_id_idx ON master.notification_default USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE UNIQUE INDEX notification_default_tenant_id_message_id_recipient_id_chan_idx ON master.notification_default USING btree (tenant_id, message_id, recipient_id, channel, created_at) WHERE message_id IS NOT NULL;

CREATE INDEX notification_default_tenant_id_recipient_id_category_create_idx ON master.notification_default USING btree (tenant_id, recipient_id, category, created_at DESC) WHERE is_read = false AND category IS NOT NULL;

CREATE INDEX notification_default_tenant_id_recipient_id_created_at_idx ON master.notification_default USING btree (tenant_id, recipient_id, created_at DESC) WHERE is_read = false AND is_dismissed = false;

CREATE INDEX notification_default_tenant_id_recipient_id_created_at_idx1 ON master.notification_default USING btree (tenant_id, recipient_id, created_at DESC);

CREATE INDEX operating_organization_parent_idx ON master.operating_organization USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX operating_organization_tenant_status_idx ON master.operating_organization USING btree (tenant_id, domain, status, code);

CREATE INDEX operating_organization_company_company_idx ON master.operating_organization_company USING btree (tenant_id, company_code_id, operating_organization_id) WHERE status = 'active'::text;

CREATE INDEX operating_organization_company_effective_idx ON master.operating_organization_company USING btree (tenant_id, operating_organization_id, effective_from, effective_until) WHERE status = 'active'::text;

CREATE INDEX operating_organization_company_org_idx ON master.operating_organization_company USING btree (tenant_id, operating_organization_id, company_code_id) WHERE status = 'active'::text;

CREATE INDEX org_unit_company_idx ON master.org_unit USING btree (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

CREATE INDEX org_unit_parent_idx ON master.org_unit USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX org_unit_path_idx ON master.org_unit USING btree (tenant_id, path) WHERE path IS NOT NULL;

CREATE INDEX ix_otr_company_effective ON master.organization_tax_registration USING btree (tenant_id, company_code_id, effective_from DESC) WHERE status = 'active'::text;

CREATE INDEX ix_otr_legal_entity_effective ON master.organization_tax_registration USING btree (tenant_id, legal_entity_id, effective_from DESC) WHERE status = 'active'::text;

CREATE INDEX owner_type_category_idx ON master.owner_type USING btree (category, sort_order) WHERE status = 'active'::text;

CREATE UNIQUE INDEX owner_type_system_code_uq ON master.owner_type USING btree (code) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX owner_type_tenant_code_uq ON master.owner_type USING btree (tenant_id, code) WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX pcp_one_active_primary_uq ON master.party_contact_person USING btree (tenant_id, party_type, party_id) WHERE is_primary = true AND is_active = true;

CREATE INDEX pcp_party_idx ON master.party_contact_person USING btree (tenant_id, party_type, party_id);

CREATE INDEX pcp_primary_pidx ON master.party_contact_person USING btree (tenant_id, party_type, party_id) WHERE is_primary = true AND is_active = true;

CREATE INDEX pcr_contact_idx ON master.party_contact_role USING btree (tenant_id, party_contact_person_id);

CREATE INDEX pcr_role_idx ON master.party_contact_role USING btree (tenant_id, role_code);

CREATE INDEX pgr_active_shareholders_pidx ON master.party_governance_relation USING btree (tenant_id, party_type, party_id) WHERE relation_type = 'shareholder'::text AND is_active = true;

CREATE INDEX pgr_compliance_idx ON master.party_governance_relation USING btree (tenant_id, kyc_status, sanctions_status, pep_status) WHERE is_active = true;

CREATE INDEX pgr_member_bp_idx ON master.party_governance_relation USING btree (tenant_id, member_business_partner_id) WHERE member_business_partner_id IS NOT NULL;

CREATE INDEX pgr_party_idx ON master.party_governance_relation USING btree (tenant_id, party_type, party_id);

CREATE INDEX pgr_relation_type_idx ON master.party_governance_relation USING btree (tenant_id, party_type, party_id, relation_type);

CREATE INDEX pgr_review_due_idx ON master.party_governance_relation USING btree (tenant_id, next_review_at) WHERE is_active = true AND next_review_at IS NOT NULL;

CREATE INDEX pi_owner_idx ON master.party_identifier USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX pi_scheme_value_idx ON master.party_identifier USING btree (tenant_id, scheme, value);

CREATE INDEX pi_unverified_pidx ON master.party_identifier USING btree (tenant_id, owner_type, owner_id) WHERE is_verified = false AND status = 'active'::text;

CREATE UNIQUE INDEX pra_active_context_uq ON master.party_risk_assessment USING btree (tenant_id, subject_type, subject_id, assessment_context) WHERE status = 'approved'::text;

CREATE INDEX pra_bp_idx ON master.party_risk_assessment USING btree (tenant_id, business_partner_id, assessment_context);

CREATE INDEX pra_review_pidx ON master.party_risk_assessment USING btree (tenant_id, next_review_at) WHERE status = 'approved'::text AND next_review_at IS NOT NULL;

CREATE INDEX prds_assessment_idx ON master.party_risk_dimension_score USING btree (assessment_id);

CREATE INDEX prd_assessment_idx ON master.party_risk_driver USING btree (assessment_id);

CREATE INDEX prd_dimension_score_idx ON master.party_risk_driver USING btree (dimension_score_id) WHERE dimension_score_id IS NOT NULL;

CREATE INDEX prd_evidence_idx ON master.party_risk_driver USING btree (evidence_id) WHERE evidence_id IS NOT NULL;

CREATE INDEX pre_active_pidx ON master.party_risk_evidence USING btree (tenant_id, business_partner_id) WHERE status = 'active'::text;

CREATE INDEX pre_bp_idx ON master.party_risk_evidence USING btree (tenant_id, business_partner_id, status);

CREATE INDEX pre_source_date_idx ON master.party_risk_evidence USING btree (source_code, evidence_date DESC);

CREATE UNIQUE INDEX pre_source_ref_uq ON master.party_risk_evidence USING btree (tenant_id, business_partner_id, source_code, source_reference) WHERE source_reference IS NOT NULL AND status <> 'superseded'::text;

CREATE INDEX pre_subject_idx ON master.party_risk_evidence USING btree (tenant_id, subject_type, subject_id);

CREATE INDEX prm_assessment_idx ON master.party_risk_mitigation USING btree (assessment_id) WHERE assessment_id IS NOT NULL;

CREATE INDEX prm_bp_idx ON master.party_risk_mitigation USING btree (tenant_id, business_partner_id, status);

CREATE INDEX prm_overdue_pidx ON master.party_risk_mitigation USING btree (tenant_id, due_date) WHERE (status = ANY (ARRAY['approved'::text, 'in_progress'::text])) AND due_date IS NOT NULL;

CREATE INDEX prre_assessment_idx ON master.party_risk_review_event USING btree (assessment_id, created_at DESC);

CREATE INDEX prre_tenant_idx ON master.party_risk_review_event USING btree (tenant_id, created_at DESC);

CREATE INDEX ptp_clearance_expiry_idx ON master.party_tax_profile USING btree (tenant_id, tax_clearance_expiry_date) WHERE has_tax_clearance = true AND tax_clearance_expiry_date IS NOT NULL;

CREATE INDEX ptp_country_idx ON master.party_tax_profile USING btree (tenant_id, country_code);

CREATE INDEX ptp_owner_idx ON master.party_tax_profile USING btree (tenant_id, owner_type, owner_id);

CREATE INDEX pay_component_type_idx ON master.pay_component USING btree (tenant_id, component_type, status);

CREATE INDEX pay_group_company_idx ON master.pay_group USING btree (tenant_id, company_code_id);

CREATE UNIQUE INDEX pay_structure_one_active_per_group_uq ON master.pay_structure USING btree (tenant_id, pay_group_id, effective_from) WHERE status = 'active'::text AND pay_group_id IS NOT NULL;

CREATE INDEX ix_payment_term_current_catalog ON master.payment_term USING btree (tenant_id, code, effective_from DESC, version DESC) WHERE is_current_version = true;

CREATE UNIQUE INDEX pt_current_version_uq ON master.payment_term USING btree (tenant_id, code) WHERE is_current_version = true;

CREATE INDEX pt_tenant_active_pidx ON master.payment_term USING btree (tenant_id) WHERE status = 'active'::text;

CREATE INDEX ptc_term_idx ON master.payment_term_clause USING btree (payment_term_id);

CREATE INDEX ptdt_term_idx ON master.payment_term_discount_tier USING btree (payment_term_id);

CREATE INDEX person_email_idx ON master.person USING btree (tenant_id, primary_email) WHERE primary_email IS NOT NULL;

CREATE INDEX person_name_fts_idx ON master.person USING gin (to_tsvector('simple'::regconfig, (((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text)) || ' '::text) || COALESCE(preferred_name, ''::text)));

CREATE INDEX idx_pm_company ON master.planning_model USING btree (company_code_id);

CREATE INDEX idx_pm_current ON master.planning_model USING btree (tenant_id, is_current) WHERE is_current = true;

CREATE INDEX idx_pm_fiscal ON master.planning_model USING btree (tenant_id, fiscal_year_from);

CREATE INDEX idx_pm_status ON master.planning_model USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['archived'::text, 'cancelled'::text]);

CREATE INDEX idx_pm_tenant ON master.planning_model USING btree (tenant_id);

CREATE INDEX position_job_idx ON master."position" USING btree (tenant_id, job_id) WHERE job_id IS NOT NULL;

CREATE INDEX position_name_fts_idx ON master."position" USING gin (to_tsvector('simple'::regconfig, (COALESCE(name, ''::text) || ' '::text) || COALESCE(code, ''::text)));

CREATE INDEX position_org_unit_idx ON master."position" USING btree (tenant_id, org_unit_id) WHERE org_unit_id IS NOT NULL;

CREATE UNIQUE INDEX principal_external_ref_uidx ON master.principal USING btree (tenant_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX principal_login_email_global_active_idx ON master.principal USING btree (login_email, tenant_id, id) WHERE login_email IS NOT NULL AND is_active = true AND is_locked = false;

CREATE INDEX principal_login_email_idx ON master.principal USING btree (tenant_id, login_email) WHERE login_email IS NOT NULL;

CREATE INDEX principal_tenant_active_pidx ON master.principal USING btree (tenant_id, principal_type) WHERE is_active = true AND is_locked = false;

CREATE UNIQUE INDEX principal_tenant_code_lower_uidx ON master.principal USING btree (tenant_id, lower(code));

CREATE INDEX principal_tenant_type_idx ON master.principal USING btree (tenant_id, principal_type);

CREATE INDEX pib_principal_idx ON master.principal_identity_binding USING btree (tenant_id, principal_id);

CREATE INDEX pib_realm_subject_idx ON master.principal_identity_binding USING btree (realm_key, provider_code, subject_id);

CREATE INDEX pib_sync_status_pidx ON master.principal_identity_binding USING btree (tenant_id, sync_status) WHERE sync_status::text = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE INDEX pib_tenant_realm_principal_idx ON master.principal_identity_binding USING btree (tenant_id, realm_key, principal_id);

CREATE INDEX pnp_principal_plane_idx ON master.principal_notification_preference USING btree (tenant_id, principal_id, plane_key) WHERE is_active = true;

CREATE INDEX pp_default_company_idx ON master.principal_profile USING btree (tenant_id, default_company_code_id) WHERE default_company_code_id IS NOT NULL;

CREATE INDEX pp_employee_idx ON master.principal_profile USING btree (tenant_id, employee_id) WHERE employee_id IS NOT NULL;

CREATE INDEX principal_profile_default_cc_idx ON master.principal_profile USING btree (tenant_id, default_company_code_id) WHERE default_company_code_id IS NOT NULL;

CREATE INDEX principal_profile_principal_idx ON master.principal_profile USING btree (tenant_id, principal_id);

CREATE INDEX principal_profile_required_actions_pidx ON master.principal_profile USING btree (tenant_id) WHERE array_length(keycloak_required_actions, 1) > 0;

CREATE INDEX principal_profile_supervisor_idx ON master.principal_profile USING btree (tenant_id, supervisor_id) WHERE supervisor_id IS NOT NULL;

CREATE INDEX principal_profile_sync_drift_pidx ON master.principal_profile USING btree (tenant_id) WHERE keycloak_sync_status = ANY (ARRAY['pending'::text, 'drift'::text, 'error'::text]);

CREATE INDEX principal_relationship_from_idx ON master.principal_relationship USING btree (from_tenant_id, from_principal_id, relationship_type, status);

CREATE INDEX principal_relationship_to_idx ON master.principal_relationship USING btree (to_tenant_id, to_principal_id, relationship_type, status);

CREATE INDEX principal_relationship_verified_pidx ON master.principal_relationship USING btree (relationship_type, verified_method, verified_at) WHERE verification_status = 'verified'::text;

CREATE INDEX prod_active_pidx ON master.product USING btree (tenant_id, code) WHERE is_active = true;

CREATE INDEX prod_commodity_category_idx ON master.product USING btree (tenant_id, commodity_category_id) WHERE commodity_category_id IS NOT NULL;

CREATE INDEX prod_tenant_idx ON master.product USING btree (tenant_id);

CREATE INDEX prod_type_idx ON master.product USING btree (tenant_id, product_type);

CREATE UNIQUE INDEX product_tenant_sku_uq ON master.product USING btree (tenant_id, lower(sku)) WHERE sku IS NOT NULL;

CREATE INDEX pc_parent_idx ON master.profit_center USING btree (tenant_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX pc_postable_pidx ON master.profit_center USING btree (tenant_id, company_code_id) WHERE is_active = true AND node_type = 'posting'::text;

CREATE INDEX pc_segment_idx ON master.profit_center USING btree (tenant_id, segment_code) WHERE segment_code IS NOT NULL;

CREATE INDEX pc_tenant_company_idx ON master.profit_center USING btree (tenant_id, company_code_id);

CREATE INDEX proj_active_pidx ON master.project USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX proj_parent_idx ON master.project USING btree (tenant_id, parent_project_id) WHERE parent_project_id IS NOT NULL;

CREATE INDEX proj_tenant_company_idx ON master.project USING btree (tenant_id, company_code_id);

CREATE INDEX proj_type_idx ON master.project USING btree (tenant_id, project_type);

CREATE INDEX pi_active_pidx ON master.project_item USING btree (tenant_id, project_id) WHERE is_active = true;

CREATE INDEX pi_milestone_pidx ON master.project_item USING btree (tenant_id, project_id, milestone_date) WHERE milestone_date IS NOT NULL;

CREATE INDEX pi_parent_idx ON master.project_item USING btree (tenant_id, parent_item_id) WHERE parent_item_id IS NOT NULL;

CREATE INDEX pi_project_idx ON master.project_item USING btree (tenant_id, project_id);

CREATE INDEX pi_type_idx ON master.project_item USING btree (tenant_id, project_id, item_type);

CREATE INDEX record_bookmark_lookup_idx ON master.record_bookmark USING btree (tenant_id, principal_id, entity_code, record_id);

CREATE INDEX record_bookmark_principal_entity_idx ON master.record_bookmark USING btree (tenant_id, principal_id, entity_code);

CREATE INDEX sv_hash_idx ON master.saved_view USING btree (tenant_id, surface_code, state_hash) WHERE state_hash IS NOT NULL AND status = 'active'::text;

CREATE UNIQUE INDEX sv_name_uq ON master.saved_view USING btree (tenant_id, scope, owner_principal_id, surface_code, entity_key, name) NULLS NOT DISTINCT WHERE status = 'active'::text;

CREATE UNIQUE INDEX sv_one_default_uq ON master.saved_view USING btree (tenant_id, scope, owner_principal_id, surface_code, entity_key) NULLS NOT DISTINCT WHERE is_default = true AND status = 'active'::text;

CREATE INDEX sv_owner_idx ON master.saved_view USING btree (tenant_id, owner_principal_id, surface_code) WHERE status = 'active'::text AND owner_principal_id IS NOT NULL;

CREATE INDEX sv_surface_idx ON master.saved_view USING btree (tenant_id, surface_code) WHERE status = 'active'::text;

CREATE INDEX scoped_setting_resolution_idx ON master.scoped_setting USING btree (tenant_id, section_code, setting_key, scope_kind, scope_id);

CREATE INDEX site_active_pidx ON master.site USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX site_parent_idx ON master.site USING btree (tenant_id, parent_site_id) WHERE parent_site_id IS NOT NULL;

CREATE INDEX site_tenant_company_idx ON master.site USING btree (tenant_id, company_code_id);

CREATE INDEX site_type_idx ON master.site USING btree (tenant_id, company_code_id, site_type);

CREATE INDEX statutory_scheme_country_idx ON master.statutory_scheme USING btree (tenant_id, country_code, scheme_type);

CREATE INDEX supp_active_pidx ON master.supplier USING btree (tenant_id, supplier_code) WHERE is_active = true;

CREATE INDEX supp_bp_idx ON master.supplier USING btree (tenant_id, business_partner_id);

CREATE INDEX supp_tenant_idx ON master.supplier USING btree (tenant_id);

CREATE INDEX supp_type_idx ON master.supplier USING btree (tenant_id, supplier_type);

CREATE INDEX sai_bp_idx ON master.supplier_app_index USING btree (tenant_id, business_partner_id);

CREATE INDEX sai_search_text_gin ON master.supplier_app_index USING gin (search_text public.gin_trgm_ops);

CREATE INDEX sai_supplier_code_idx ON master.supplier_app_index USING btree (tenant_id, supplier_code);

CREATE INDEX sai_tenant_idx ON master.supplier_app_index USING btree (tenant_id);

CREATE INDEX sb_active_idx ON master.supplier_block USING btree (tenant_id, supplier_id) WHERE is_active = true;

CREATE INDEX sb_supplier_idx ON master.supplier_block USING btree (tenant_id, supplier_id);

CREATE INDEX sscat_category_idx ON master.supplier_commodity_category USING btree (tenant_id, commodity_category_id);

CREATE UNIQUE INDEX sscat_one_primary_uidx ON master.supplier_commodity_category USING btree (tenant_id, supplier_id) WHERE is_primary = true AND status = 'active'::text;

CREATE INDEX sscat_supplier_idx ON master.supplier_commodity_category USING btree (tenant_id, supplier_id);

CREATE INDEX sq_blocked_pidx ON master.supplier_qualification USING btree (tenant_id) WHERE is_blocked = true AND is_active = true;

CREATE INDEX sq_onboarding_idx ON master.supplier_qualification USING btree (tenant_id, onboarding_status);

CREATE INDEX sq_supplier_idx ON master.supplier_qualification USING btree (tenant_id, supplier_id);

CREATE INDEX tj_country_pidx ON master.tax_jurisdiction USING btree (tenant_id, country_code) WHERE is_active = true;

CREATE INDEX tj_state_region_pidx ON master.tax_jurisdiction USING btree (tenant_id, country_code, state_region_code) WHERE is_active = true AND state_region_code IS NOT NULL;

CREATE INDEX tj_type_pidx ON master.tax_jurisdiction USING btree (tenant_id, jurisdiction_type) WHERE is_active = true;

CREATE INDEX ix_tax_type_condition_type ON master.tax_type USING btree (tenant_id, condition_type_id) WHERE status::text = 'active'::text AND condition_type_id IS NOT NULL;

CREATE INDEX team_leader_idx ON master.team USING btree (tenant_id, leader_id);

CREATE INDEX team_tenant_active_pidx ON master.team USING btree (tenant_id) WHERE status = 'active'::text;

CREATE UNIQUE INDEX team_member_active_uidx ON master.team_member USING btree (tenant_id, team_id, principal_id) WHERE left_at IS NULL;

CREATE INDEX tm_team_idx ON master.team_member USING btree (tenant_id, team_id);

CREATE INDEX template_current_version_idx ON master.template USING btree (current_version_id) WHERE current_version_id IS NOT NULL;

CREATE INDEX template_kind_idx ON master.template USING btree (tenant_id, kind);

CREATE INDEX template_published_pidx ON master.template USING btree (tenant_id, kind) WHERE status = 'PUBLISHED'::text;

CREATE UNIQUE INDEX template_binding_active_uq ON master.template_binding USING btree (tenant_id, template_id, entity_name, operation, variant) WHERE is_active = true;

CREATE INDEX template_binding_priority_idx ON master.template_binding USING btree (tenant_id, entity_name, operation, variant, priority DESC) WHERE is_active = true;

CREATE INDEX tenant_active_pidx ON master.tenant USING btree (code) WHERE status = 'active'::text;

CREATE INDEX tenant_realm_code_all_idx ON master.tenant USING btree (realm_key, code);

CREATE INDEX tenant_subscription_idx ON master.tenant USING btree (subscription);

CREATE INDEX tenant_type_idx ON master.tenant USING btree (tenant_type);

CREATE INDEX tenant_identity_domain_lookup_idx ON master.tenant_identity_domain USING btree (domain) WHERE verification_status = 'verified'::text AND enabled = true;

CREATE INDEX tenant_identity_provider_plane_idx ON master.tenant_identity_provider USING gin (allowed_planes) WHERE enabled = true;

CREATE INDEX tenant_parameter_definition_lookup_idx ON master.tenant_parameter_definition USING btree (tenant_id, namespace, sort_order, code) WHERE status = 'active'::text;

CREATE INDEX tenant_parameter_value_lookup_idx ON master.tenant_parameter_value USING btree (tenant_id, parameter_code) WHERE status = 'active'::text;

CREATE INDEX tp_country_idx ON master.tenant_profile USING btree (country_code) WHERE country_code IS NOT NULL;

CREATE INDEX tp_currency_idx ON master.tenant_profile USING btree (currency_code) WHERE currency_code IS NOT NULL;

CREATE INDEX tenant_relationship_active_from_pidx ON master.tenant_relationship USING btree (from_tenant_id, to_tenant_id, relationship_type) WHERE status = 'active'::text;

CREATE INDEX tenant_relationship_active_to_pidx ON master.tenant_relationship USING btree (to_tenant_id, from_tenant_id, relationship_type) WHERE status = 'active'::text;

CREATE INDEX tenant_relationship_from_idx ON master.tenant_relationship USING btree (from_tenant_id, relationship_type, status);

CREATE INDEX tenant_relationship_to_idx ON master.tenant_relationship USING btree (to_tenant_id, relationship_type, status);

CREATE INDEX trsc_tenant_idx ON master.tenant_risk_source_config USING btree (tenant_id, source_code) WHERE is_enabled = true;

CREATE INDEX wh_active_pidx ON master.warehouse USING btree (tenant_id, site_id) WHERE is_active = true;

CREATE INDEX wh_site_idx ON master.warehouse USING btree (tenant_id, site_id);

CREATE INDEX wh_type_idx ON master.warehouse USING btree (tenant_id, warehouse_type);

CREATE INDEX work_assignment_employee_idx ON master.work_assignment USING btree (tenant_id, employee_id, effective_from DESC);

CREATE UNIQUE INDEX work_assignment_one_primary_active_uq ON master.work_assignment USING btree (tenant_id, employee_id) WHERE assignment_type = 'primary'::text AND status = 'active'::text;

CREATE INDEX work_assignment_position_idx ON master.work_assignment USING btree (tenant_id, position_id) WHERE position_id IS NOT NULL;
