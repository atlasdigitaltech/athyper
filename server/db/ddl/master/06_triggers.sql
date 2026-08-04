-- ============================================================================
-- master/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_ap_status_changed BEFORE UPDATE ON master.accounting_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ap_updated_at BEFORE UPDATE ON master.accounting_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_address_derive_jurisdiction BEFORE INSERT OR UPDATE OF country_code, region ON master.address FOR EACH ROW EXECUTE FUNCTION master.trg_address_derive_jurisdiction();

CREATE TRIGGER trg_address_status_changed BEFORE UPDATE ON master.address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_address_type_lookup BEFORE INSERT OR UPDATE OF address_type ON master.address FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.address_type', 'address_type');

CREATE TRIGGER trg_address_updated_at BEFORE UPDATE ON master.address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_address_link_owner_type_guard BEFORE INSERT OR UPDATE OF owner_type ON master.address_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

CREATE TRIGGER trg_address_link_purpose_lookup BEFORE INSERT OR UPDATE OF purpose ON master.address_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.address_purpose', 'purpose');

CREATE TRIGGER trg_address_link_updated_at BEFORE UPDATE ON master.address_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_z_address_link_owner_ref BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.address_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

CREATE TRIGGER trg_asset_retirement_type_lookup BEFORE INSERT OR UPDATE OF retirement_type ON master.asset FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_retirement_type', 'retirement_type');

CREATE TRIGGER trg_asset_status_changed BEFORE UPDATE ON master.asset FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_asset_updated_at BEFORE UPDATE ON master.asset FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_aah_assignment_type_lookup BEFORE INSERT OR UPDATE OF assignment_type ON master.asset_assignment_history FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_assignment_type', 'assignment_type');

CREATE TRIGGER trg_aah_updated_at BEFORE UPDATE ON master.asset_assignment_history FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ab_book_type_immutable BEFORE UPDATE OF book_type ON master.asset_book FOR EACH ROW EXECUTE FUNCTION master.trg_asset_book_type_immutable();

CREATE TRIGGER trg_ab_book_type_lookup BEFORE INSERT OR UPDATE OF book_type ON master.asset_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');

CREATE TRIGGER trg_ab_convention_lookup BEFORE INSERT OR UPDATE OF convention ON master.asset_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_convention', 'convention');

CREATE TRIGGER trg_ab_depr_method_lookup BEFORE INSERT OR UPDATE OF depreciation_method ON master.asset_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_method', 'depreciation_method');

CREATE TRIGGER trg_ab_prorate_basis_lookup BEFORE INSERT OR UPDATE OF prorate_basis ON master.asset_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_prorate_basis', 'prorate_basis');

CREATE TRIGGER trg_ab_status_changed BEFORE UPDATE ON master.asset_book FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ab_updated_at BEFORE UPDATE ON master.asset_book FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ac_life_policy_lookup BEFORE INSERT OR UPDATE OF useful_life_override_policy ON master.asset_class FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_life_override_policy', 'useful_life_override_policy');

CREATE TRIGGER trg_ac_nature_lookup BEFORE INSERT OR UPDATE OF asset_nature ON master.asset_class FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_nature', 'asset_nature');

CREATE TRIGGER trg_ac_status_changed BEFORE UPDATE ON master.asset_class FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ac_updated_at BEFORE UPDATE ON master.asset_class FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_acomp_status_changed BEFORE UPDATE ON master.asset_component FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_acomp_updated_at BEFORE UPDATE ON master.asset_component FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_message_allocate_sequence BEFORE INSERT ON master.atlas_message FOR EACH ROW EXECUTE FUNCTION master.trg_allocate_atlas_message_sequence();

CREATE TRIGGER trg_atlas_message_mutation_guard BEFORE UPDATE ON master.atlas_message FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_message_mutation();

CREATE TRIGGER trg_atlas_message_updated_at BEFORE UPDATE ON master.atlas_message FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_atlas_thread_envelope_check AFTER INSERT OR UPDATE ON master.atlas_thread DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION master.trg_validate_atlas_thread_envelope();

CREATE TRIGGER trg_atlas_thread_mutation_guard BEFORE UPDATE ON master.atlas_thread FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_thread_mutation();

CREATE TRIGGER trg_atlas_thread_updated_at BEFORE UPDATE ON master.atlas_thread FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_attachment_kind_lookup BEFORE INSERT OR UPDATE OF kind ON master.attachment FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.attachment_kind', 'kind');

CREATE TRIGGER trg_attachment_updated_at BEFORE UPDATE ON master.attachment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_att_comment_parent_guard BEFORE INSERT OR UPDATE ON master.attachment_comment FOR EACH ROW EXECUTE FUNCTION document.trg_comment_parent_same_attachment();

CREATE TRIGGER trg_att_comment_updated_at BEFORE UPDATE ON master.attachment_comment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_att_comment_validate_mentions BEFORE INSERT OR UPDATE ON master.attachment_comment FOR EACH ROW EXECUTE FUNCTION document.trg_doc_validate_mentions();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_delegation FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_delegation" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER auth_delegation_grant_permission_plane_guard BEFORE INSERT OR UPDATE OF permission_id, plane_code ON master.auth_delegation_grant FOR EACH ROW EXECUTE FUNCTION master.trg_auth_permission_plane_guard();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_delegation_grant FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_delegation_grant" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER auth_deny_rule_permission_plane_guard BEFORE INSERT OR UPDATE OF permission_id, plane_code ON master.auth_deny_rule FOR EACH ROW EXECUTE FUNCTION master.trg_auth_permission_plane_guard();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_deny_rule FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_deny_rule" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_group FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_group" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_group_member FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_group_member" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_group_role FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_group_role" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER auth_override_permission_plane_guard BEFORE INSERT OR UPDATE OF permission_id, plane_code ON master.auth_override FOR EACH ROW EXECUTE FUNCTION master.trg_auth_permission_plane_guard();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_override FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_override" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_plane_membership FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_plane_membership" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER auth_record_acl_permission_plane_guard BEFORE INSERT OR UPDATE OF permission_id, plane_code ON master.auth_record_acl FOR EACH ROW EXECUTE FUNCTION master.trg_auth_permission_plane_guard();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_record_acl FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_record_acl" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_role FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_role" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER auth_role_permission_permission_plane_guard BEFORE INSERT OR UPDATE OF permission_id, plane_code ON master.auth_role_permission FOR EACH ROW EXECUTE FUNCTION master.trg_auth_permission_plane_guard();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_role_permission FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_role_permission" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.auth_scope_target FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."auth_scope_target" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_bank_account_id_type_lookup BEFORE INSERT OR UPDATE OF account_id_type ON master.bank_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_id_type', 'account_id_type');

CREATE TRIGGER trg_bank_account_nature_lookup BEFORE INSERT OR UPDATE OF account_nature ON master.bank_account FOR EACH ROW WHEN (new.account_nature IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_nature', 'account_nature');

CREATE TRIGGER trg_bank_account_status_changed BEFORE UPDATE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bank_account_updated_at BEFORE UPDATE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bank_account_verification_method_lookup BEFORE INSERT OR UPDATE OF verification_method ON master.bank_account FOR EACH ROW WHEN (new.verification_method IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_verification_method', 'verification_method');

CREATE TRIGGER trg_fin_ready_bank_account AFTER INSERT OR DELETE OR UPDATE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Bank Account changed');

CREATE TRIGGER trg_a_bahc_owner_guard BEFORE INSERT OR UPDATE OF bank_account_link_id ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION master.trg_guard_house_config_owner();

CREATE TRIGGER trg_bahc_default_unique BEFORE INSERT OR UPDATE OF is_default_disbursement, is_default_collection ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION master.trg_house_config_default_unique();

CREATE TRIGGER trg_bahc_gl_postable BEFORE INSERT OR UPDATE OF gl_account_id, bank_account_link_id ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION master.trg_house_config_gl_postable();

CREATE TRIGGER trg_bahc_local_type_lookup BEFORE INSERT OR UPDATE OF local_account_type ON master.bank_account_house_config FOR EACH ROW WHEN (new.local_account_type IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_local_type', 'local_account_type');

CREATE TRIGGER trg_bahc_recon_mode_lookup BEFORE INSERT OR UPDATE OF reconciliation_mode ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_reconciliation_mode', 'reconciliation_mode');

CREATE TRIGGER trg_bahc_status_changed BEFORE UPDATE ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bahc_updated_at BEFORE UPDATE ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bahc_usage_type_lookup BEFORE INSERT OR UPDATE OF usage_type ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_usage_type', 'usage_type');

CREATE TRIGGER trg_fin_ready_house_bank AFTER INSERT OR DELETE OR UPDATE ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'House Bank configuration changed');

CREATE TRIGGER trg_bal_guard_owner_change_with_config BEFORE UPDATE OF owner_type, owner_id ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION master.trg_bal_guard_owner_change_with_config();

CREATE TRIGGER trg_bal_purpose_lookup BEFORE INSERT OR UPDATE OF purpose ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_account_link_purpose', 'purpose');

CREATE TRIGGER trg_bal_recheck_default_on_date_change BEFORE UPDATE OF effective_from, effective_until ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION master.trg_bal_recheck_default_on_date_change();

CREATE TRIGGER trg_bal_updated_at BEFORE UPDATE ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bal_validate_owner_type BEFORE INSERT OR UPDATE OF owner_type ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

CREATE TRIGGER trg_fin_ready_bank_link AFTER INSERT OR DELETE OR UPDATE ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional', 'Bank Account Company link changed');

CREATE TRIGGER trg_z_bal_validate_owner_ref BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

CREATE TRIGGER trg_bank_party_institution_type_lookup BEFORE INSERT OR UPDATE OF institution_type ON master.bank_party FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_party_institution_type', 'institution_type');

CREATE TRIGGER trg_bank_party_nat_code_type_lookup BEFORE INSERT OR UPDATE OF national_bank_code_type ON master.bank_party FOR EACH ROW WHEN (new.national_bank_code_type IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.bank_party_national_bank_code_type', 'national_bank_code_type');

CREATE TRIGGER trg_bank_party_status_changed BEFORE UPDATE ON master.bank_party FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bank_party_updated_at BEFORE UPDATE ON master.bank_party FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_bank_party AFTER INSERT OR DELETE OR UPDATE ON master.bank_party FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Bank Party changed');

CREATE TRIGGER trg_brand_profile_single_default BEFORE INSERT OR UPDATE OF is_default, is_active ON master.brand_profile FOR EACH ROW EXECUTE FUNCTION document.trg_enforce_single_default();

CREATE TRIGGER trg_brand_profile_updated_at BEFORE UPDATE ON master.brand_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bi_parent_guard BEFORE INSERT OR UPDATE OF parent_id, domain ON master.business_intent FOR EACH ROW EXECUTE FUNCTION master.trg_bi_parent_guard();

CREATE TRIGGER trg_bi_status_changed BEFORE UPDATE OF status ON master.business_intent FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bi_updated_at BEFORE UPDATE ON master.business_intent FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bp_app_index_sync AFTER UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.trg_bp_app_index_sync();

CREATE TRIGGER trg_bp_hierarchy_sync BEFORE INSERT OR UPDATE OF parent_business_partner_id ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.fn_bp_hierarchy_sync();

CREATE TRIGGER trg_bp_status_changed BEFORE UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bp_updated_at BEFORE UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bpnl_updated_at BEFORE UPDATE ON master.business_partner_network_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_connect_validation BEFORE INSERT OR UPDATE OF connection_status, remote_tenant_id, remote_business_partner_id ON master.business_partner_network_link FOR EACH ROW EXECUTE FUNCTION master.fn_network_connect_validation();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.career_band FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.career_level FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_coa_framework_lookup BEFORE INSERT OR UPDATE OF framework ON master.chart_of_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.chart_of_account_framework', 'framework');

CREATE TRIGGER trg_coa_status_changed BEFORE UPDATE ON master.chart_of_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_coa_updated_at BEFORE UPDATE ON master.chart_of_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_chart AFTER UPDATE OF framework, country_code, account_range, version, is_locked, status ON master.chart_of_account FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('chart', 'Chart definition changed');

CREATE TRIGGER trg_comment_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON master.comment FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_comment_hierarchy_guard BEFORE INSERT OR UPDATE OF parent_comment_id, thread_depth, context_type, entity_type, entity_id ON master.comment FOR EACH ROW EXECUTE FUNCTION master.trg_comment_hierarchy_guard();

CREATE TRIGGER trg_comment_intent_lookup BEFORE INSERT OR UPDATE OF comment_intent ON master.comment FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_intent', 'comment_intent');

CREATE TRIGGER trg_comment_mentions_validate BEFORE INSERT OR UPDATE OF mentions ON master.comment FOR EACH ROW EXECUTE FUNCTION master.trg_validate_comment_mentions();

CREATE TRIGGER trg_comment_updated_at BEFORE UPDATE ON master.comment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cd_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON master.comment_draft FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_comment_draft_updated_at BEFORE UPDATE ON master.comment_draft FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cm_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON master.comment_mention FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_cr_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON master.comment_reaction FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_cr_reaction_type_lookup BEFORE INSERT OR UPDATE OF reaction_type ON master.comment_reaction FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.reaction_type', 'reaction_type');

CREATE TRIGGER trg_ccat_maintain_root_category BEFORE INSERT OR UPDATE OF parent_id ON master.commodity_category FOR EACH ROW EXECUTE FUNCTION master.trg_ccat_maintain_root_category();

CREATE TRIGGER trg_ccat_status_changed BEFORE UPDATE ON master.commodity_category FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ccat_updated_at BEFORE UPDATE ON master.commodity_category FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccat_valuation_lookup BEFORE INSERT OR UPDATE OF default_valuation_method ON master.commodity_category FOR EACH ROW WHEN (new.default_valuation_method IS NOT NULL) EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'default_valuation_method');

CREATE TRIGGER trg_cc_classification_type_lookup BEFORE INSERT OR UPDATE OF classification_type ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_classification_type', 'classification_type');

CREATE TRIGGER trg_cc_domain_code_lookup BEFORE INSERT OR UPDATE OF domain_code ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_domain_code', 'domain_code');

CREATE TRIGGER trg_cc_mapping_type_lookup BEFORE INSERT OR UPDATE OF mapping_type ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_mapping_type', 'mapping_type');

CREATE TRIGGER trg_cc_owner_type BEFORE INSERT OR UPDATE OF owner_type ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_owner_type();

CREATE TRIGGER trg_cc_owner_type_lookup BEFORE INSERT OR UPDATE OF owner_type ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_owner_type', 'owner_type');

CREATE TRIGGER trg_cc_provenance_lookup BEFORE INSERT OR UPDATE OF provenance ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_provenance', 'provenance');

CREATE TRIGGER trg_cc_status_changed BEFORE UPDATE ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cc_validate_code BEFORE INSERT OR UPDATE OF classification_type, domain_code, code_id ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_code();

CREATE TRIGGER trg_cc_validate_owner BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.commodity_classification FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_owner();

CREATE TRIGGER trg_company_code_framework_lookup BEFORE INSERT OR UPDATE OF regulatory_framework ON master.company_code FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_framework', 'regulatory_framework');

CREATE TRIGGER trg_company_code_fy_variant_lookup BEFORE INSERT OR UPDATE OF fiscal_year_variant ON master.company_code FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_fy_variant', 'fiscal_year_variant');

CREATE TRIGGER trg_company_code_status_changed BEFORE UPDATE ON master.company_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_company_code_updated_at BEFORE UPDATE ON master.company_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_company AFTER UPDATE OF legal_entity_id, functional_currency, country_code, regulatory_framework, timezone_code, locale_code, date_format, week_start, status, fiscal_year_start_month, fiscal_year_variant, default_ledger_book_id ON master.company_code FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company', 'Company accounting profile changed');

CREATE TRIGGER trg_ba_conflict_lookup BEFORE INSERT OR UPDATE OF conflict_strategy ON master.company_code_book_assignment FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_book_assignment_conflict', 'conflict_strategy');

CREATE TRIGGER trg_ba_status_changed BEFORE UPDATE ON master.company_code_book_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ba_updated_at BEFORE UPDATE ON master.company_code_book_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_book_assignment AFTER INSERT OR DELETE OR UPDATE ON master.company_code_book_assignment FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Book assignment changed');

CREATE TRIGGER trg_ccca_status_changed BEFORE UPDATE ON master.company_code_chart_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ccca_type_lookup BEFORE INSERT OR UPDATE OF assignment_type ON master.company_code_chart_assignment FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ccca_assignment_type', 'assignment_type');

CREATE TRIGGER trg_ccca_updated_at BEFORE UPDATE ON master.company_code_chart_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_chart_assignment AFTER INSERT OR DELETE OR UPDATE ON master.company_code_chart_assignment FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Chart assignment changed');

CREATE TRIGGER trg_ccp_credit_rating_lookup BEFORE INSERT OR UPDATE OF credit_rating ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.credit_rating', 'credit_rating');

CREATE TRIGGER trg_ccp_receipt_method_direction BEFORE INSERT OR UPDATE OF default_receipt_method_id ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION master.trg_ccp_validate_receipt_method_direction();

CREATE TRIGGER trg_ccp_statement_cycle_lookup BEFORE INSERT OR UPDATE OF statement_cycle_code ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.statement_cycle', 'statement_cycle_code');

CREATE TRIGGER trg_ccp_status_changed BEFORE UPDATE ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ccp_updated_at BEFORE UPDATE ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccp_validate_payment_term BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();

CREATE TRIGGER trg_odd_scope_guard BEFORE INSERT OR UPDATE OF dimension_value_id, company_code_id ON master.company_code_dimension_default FOR EACH ROW EXECUTE FUNCTION master.trg_odd_scope_guard();

CREATE TRIGGER trg_odd_status_changed BEFORE UPDATE OF status ON master.company_code_dimension_default FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_odd_updated_at BEFORE UPDATE ON master.company_code_dimension_default FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccga_defaults_company BEFORE INSERT OR UPDATE ON master.company_code_gl_account FOR EACH ROW EXECUTE FUNCTION master.trg_ccga_defaults_same_company();

CREATE TRIGGER trg_ccga_recon_lookup BEFORE INSERT OR UPDATE OF reconciliation_type ON master.company_code_gl_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ccga_reconciliation_type', 'reconciliation_type');

CREATE TRIGGER trg_ccga_status_changed BEFORE UPDATE ON master.company_code_gl_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ccga_updated_at BEFORE UPDATE ON master.company_code_gl_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_gl_control AFTER INSERT OR DELETE OR UPDATE ON master.company_code_gl_account FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company GL control changed');

CREATE TRIGGER trg_scp_payment_method_direction BEFORE INSERT OR UPDATE OF payment_method_id ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION master.trg_scp_validate_payment_method_direction();

CREATE TRIGGER trg_scp_remittance_bank_link BEFORE INSERT OR UPDATE OF preferred_remittance_bank_link_id ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION master.trg_scp_validate_remittance_bank_link();

CREATE TRIGGER trg_scp_status_changed BEFORE UPDATE ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_scp_updated_at BEFORE UPDATE ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_scp_validate_payment_term BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();

CREATE TRIGGER trg_contact_email_channel_guard BEFORE INSERT OR UPDATE OF contact_link_id, tenant_id ON master.contact_email FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_email_channel();

CREATE TRIGGER trg_contact_email_updated_at BEFORE UPDATE ON master.contact_email FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_a_contact_link_normalize BEFORE INSERT OR UPDATE OF value, channel_type, purpose, code, name ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_contact_link_value();

CREATE TRIGGER trg_b_contact_link_root_owner_default_purpose BEFORE INSERT OR UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.trg_contact_link_root_owner_default_purpose();

CREATE TRIGGER trg_contact_link_channel_type_lookup BEFORE INSERT OR UPDATE OF channel_type ON master.contact_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.contact_link_channel_type', 'channel_type');

CREATE TRIGGER trg_contact_link_owner_type_guard BEFORE INSERT OR UPDATE OF owner_type ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

CREATE TRIGGER trg_contact_link_purpose_lookup BEFORE INSERT OR UPDATE OF purpose ON master.contact_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.contact_link_purpose', 'purpose');

CREATE TRIGGER trg_contact_link_role_qualifier_lookup BEFORE INSERT OR UPDATE OF role_qualifier ON master.contact_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.contact_role_qualifier', 'role_qualifier');

CREATE TRIGGER trg_contact_link_status_changed BEFORE UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_contact_link_sync_login_email AFTER INSERT OR DELETE OR UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.fn_sync_principal_login_email();

CREATE TRIGGER trg_contact_link_updated_at BEFORE UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_z_contact_link_owner_ref BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

CREATE TRIGGER trg_marketing_consent_owner_ref BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.contact_marketing_consent FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

CREATE TRIGGER trg_marketing_consent_owner_type_guard BEFORE INSERT OR UPDATE OF owner_type ON master.contact_marketing_consent FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

CREATE TRIGGER trg_marketing_consent_status_changed_at BEFORE UPDATE OF status ON master.contact_marketing_consent FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_marketing_consent_status_lookup BEFORE INSERT OR UPDATE OF status ON master.contact_marketing_consent FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.marketing_consent_status', 'status');

CREATE TRIGGER trg_marketing_consent_updated_at BEFORE UPDATE ON master.contact_marketing_consent FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_contact_phone_channel_guard BEFORE INSERT OR UPDATE OF contact_link_id, tenant_id ON master.contact_phone FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_phone_channel();

CREATE TRIGGER trg_contact_phone_updated_at BEFORE UPDATE ON master.contact_phone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_content_item_kind_lookup BEFORE INSERT OR UPDATE OF kind ON master.content_item FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.content_item_kind', 'kind');

CREATE TRIGGER trg_content_item_status_changed BEFORE UPDATE ON master.content_item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_content_item_updated_at BEFORE UPDATE ON master.content_item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cil_relation_type_lookup BEFORE INSERT OR UPDATE OF relation_type ON master.content_item_link FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.content_item_link_relation_type', 'relation_type');

CREATE TRIGGER trg_conv_type_lookup BEFORE INSERT OR UPDATE OF type ON master.conversation FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.conversation_type', 'type');

CREATE TRIGGER trg_conv_updated_at BEFORE UPDATE ON master.conversation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_conversation_atlas_mutation_guard BEFORE UPDATE ON master.conversation FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_conversation_mutation();

CREATE CONSTRAINT TRIGGER trg_conversation_participant_atlas_cursor_check AFTER INSERT OR UPDATE ON master.conversation_participant DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION master.trg_validate_atlas_participant_cursor();

CREATE TRIGGER trg_conversation_participant_atlas_insert_guard BEFORE INSERT ON master.conversation_participant FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_participant_insert();

CREATE TRIGGER trg_conversation_participant_atlas_mutation_guard BEFORE UPDATE ON master.conversation_participant FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_participant_mutation();

CREATE TRIGGER trg_cp_updated_at BEFORE UPDATE ON master.conversation_participant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cc_category_lookup BEFORE INSERT OR UPDATE OF cost_center_category ON master.cost_center FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cost_center_category', 'cost_center_category');

CREATE TRIGGER trg_cc_cross_refs BEFORE INSERT OR UPDATE ON master.cost_center FOR EACH ROW EXECUTE FUNCTION master.trg_cc_cross_refs_same_company();

CREATE TRIGGER trg_cc_level BEFORE INSERT OR UPDATE ON master.cost_center FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

CREATE TRIGGER trg_cc_node_type_lookup BEFORE INSERT OR UPDATE OF node_type ON master.cost_center FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cost_center_node_type', 'node_type');

CREATE TRIGGER trg_cc_parent_co BEFORE INSERT OR UPDATE ON master.cost_center FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

CREATE TRIGGER trg_cc_status_changed BEFORE UPDATE ON master.cost_center FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON master.cost_center FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cust_status_changed BEFORE UPDATE ON master.customer FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_cust_type_lookup BEFORE INSERT OR UPDATE OF customer_type ON master.customer FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.customer_type', 'customer_type');

CREATE TRIGGER trg_cust_updated_at BEFORE UPDATE ON master.customer FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_customer_app_index_sync AFTER INSERT OR DELETE OR UPDATE ON master.customer FOR EACH ROW EXECUTE FUNCTION master.trg_customer_app_index_sync();

CREATE TRIGGER trg_customer_category_guard BEFORE INSERT OR UPDATE OF customer_type, business_partner_id ON master.customer FOR EACH ROW EXECUTE FUNCTION master.fn_customer_category_guard();

CREATE TRIGGER trg_cq_updated_at BEFORE UPDATE ON master.customer_qualification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dash_enforce_created_by BEFORE INSERT OR UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

CREATE TRIGGER trg_dash_guard_scope_owner BEFORE UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

CREATE TRIGGER trg_dash_immutable_code BEFORE UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

CREATE TRIGGER trg_dash_scope BEFORE INSERT OR UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.dashboard_scope', 'scope');

CREATE TRIGGER trg_dash_surface_code BEFORE INSERT OR UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

CREATE TRIGGER trg_dash_sync_deleted_at BEFORE UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();

CREATE TRIGGER trg_dash_updated_at BEFORE UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dashboard_status_changed BEFORE UPDATE ON master.dashboard FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dashboard_widget_updated_at BEFORE UPDATE ON master.dashboard_widget FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dw_breakpoint BEFORE INSERT OR UPDATE ON master.dashboard_widget FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.breakpoint', 'breakpoint_code');

CREATE TRIGGER trg_dw_enforce_created_by BEFORE INSERT OR UPDATE ON master.dashboard_widget FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

CREATE TRIGGER trg_dw_widget_type BEFORE INSERT OR UPDATE ON master.dashboard_widget FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.widget_type', 'widget_type_code');

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.designation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ds_status_changed BEFORE UPDATE ON master.dimension_set FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON master.dimension_set FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dsi_no_delete BEFORE DELETE ON master.dimension_set_item FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_immutable();

CREATE TRIGGER trg_dsi_no_update BEFORE UPDATE ON master.dimension_set_item FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_immutable();

CREATE TRIGGER trg_dsi_type_value_consistency BEFORE INSERT ON master.dimension_set_item FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_type_value_consistency();

CREATE TRIGGER trg_dt_category_lookup BEFORE INSERT OR UPDATE OF category ON master.dimension_type FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.dimension_type_category', 'category');

CREATE TRIGGER trg_dt_deactivation_guard BEFORE UPDATE OF status ON master.dimension_type FOR EACH ROW EXECUTE FUNCTION master.trg_dt_deactivation_guard();

CREATE TRIGGER trg_dt_status_changed BEFORE UPDATE ON master.dimension_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dt_updated_at BEFORE UPDATE ON master.dimension_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dv_company_scope_guard BEFORE INSERT OR UPDATE OF company_code_id ON master.dimension_value FOR EACH ROW EXECUTE FUNCTION master.trg_dv_company_scope_guard();

CREATE TRIGGER trg_dv_parent_guard BEFORE INSERT OR UPDATE OF parent_id, dimension_type_id, company_code_id ON master.dimension_value FOR EACH ROW EXECUTE FUNCTION master.trg_dv_parent_guard();

CREATE TRIGGER trg_dv_status_changed BEFORE UPDATE ON master.dimension_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dv_updated_at BEFORE UPDATE ON master.dimension_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_document_updated_at BEFORE UPDATE ON master.document FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_emp_status_changed BEFORE UPDATE ON master.employee FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_emp_type_lookup BEFORE INSERT OR UPDATE OF employment_type ON master.employee FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.employment_type', 'employment_type');

CREATE TRIGGER trg_emp_updated_at BEFORE UPDATE ON master.employee FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.employee_leave_enrollment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.employee_statutory_enrollment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.employment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.external_reference FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_fiscal_period AFTER INSERT OR DELETE OR UPDATE ON master.fiscal_period FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company fiscal period changed');

CREATE TRIGGER trg_fp_status_changed BEFORE UPDATE ON master.fiscal_period FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fp_type_lookup BEFORE INSERT OR UPDATE OF period_type ON master.fiscal_period FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.fiscal_period_type', 'period_type');

CREATE TRIGGER trg_fp_updated_at BEFORE UPDATE ON master.fiscal_period FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fx_rate_immutable BEFORE DELETE OR UPDATE ON master.fx_rate FOR EACH ROW EXECUTE FUNCTION master.guard_fx_rate_immutable();

CREATE TRIGGER trg_fin_ready_gl_account AFTER INSERT OR DELETE OR UPDATE OF chart_of_account_id, parent_id, account_class, node_type, normal_balance, subledger_type, currency_code, status ON master.gl_account FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('gl_account', 'GL account definition changed');

CREATE TRIGGER trg_gla_balance_lookup BEFORE INSERT OR UPDATE OF normal_balance ON master.gl_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_balance', 'normal_balance');

CREATE TRIGGER trg_gla_class_lookup BEFORE INSERT OR UPDATE OF account_class ON master.gl_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_class', 'account_class');

CREATE TRIGGER trg_gla_node_type_lookup BEFORE INSERT OR UPDATE OF node_type ON master.gl_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_node_type', 'node_type');

CREATE TRIGGER trg_gla_parent_class BEFORE INSERT OR UPDATE ON master.gl_account FOR EACH ROW EXECUTE FUNCTION master.trg_gl_account_parent_class_check();

CREATE TRIGGER trg_gla_status_changed BEFORE UPDATE ON master.gl_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_gla_subledger_lookup BEFORE INSERT OR UPDATE OF subledger_type ON master.gl_account FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_subledger', 'subledger_type');

CREATE TRIGGER trg_gla_updated_at BEFORE UPDATE ON master.gl_account FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_hc_single_default BEFORE INSERT OR UPDATE OF is_default ON master.holiday_calendar FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_single_default();

CREATE TRIGGER trg_hc_status_changed BEFORE UPDATE ON master.holiday_calendar FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_hc_updated_at BEFORE UPDATE ON master.holiday_calendar FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_hc_validate_weekend_days BEFORE INSERT OR UPDATE OF weekend_pattern, weekend_days ON master.holiday_calendar FOR EACH ROW EXECUTE FUNCTION master.trg_validate_weekend_days();

CREATE TRIGGER trg_hcd_updated_at BEFORE UPDATE ON master.holiday_calendar_day FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ictp_ic_enabled_guard BEFORE INSERT OR UPDATE OF source_company_code_id, counterparty_company_code_id ON master.intercompany_trading_pair FOR EACH ROW EXECUTE FUNCTION master.trg_ictp_ic_enabled_guard_fn();

CREATE TRIGGER trg_ictp_profile_gate BEFORE INSERT OR UPDATE OF status, counterparty_supplier_profile_id ON master.intercompany_trading_pair FOR EACH ROW EXECUTE FUNCTION master.fn_ictp_profile_gate();

CREATE TRIGGER trg_ictp_status_changed BEFORE UPDATE ON master.intercompany_trading_pair FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ictp_updated_at BEFORE UPDATE ON master.intercompany_trading_pair FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_im_status_changed BEFORE UPDATE ON master.item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_im_updated_at BEFORE UPDATE ON master.item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_im_valuation_lookup BEFORE INSERT OR UPDATE OF valuation_method ON master.item FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'valuation_method');

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.job FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.job_family FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.job_function FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_label_updated_at BEFORE UPDATE ON master.label FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_label_validate BEFORE INSERT OR UPDATE ON master.label FOR EACH ROW EXECUTE FUNCTION master.trg_label_validate();

CREATE TRIGGER trg_label_entity_type_check BEFORE INSERT OR UPDATE ON master.label_entity_type FOR EACH ROW EXECUTE FUNCTION master.trg_label_entity_type_validate();

CREATE TRIGGER trg_label_entity_type_updated_at BEFORE UPDATE ON master.label_entity_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.leave_plan FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.leave_plan_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.leave_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_book AFTER UPDATE OF category, reporting_standard, base_currency_code, is_auto_post, is_approval_required, is_manual_je_allowed, is_reversal_allowed, close_mode, status ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('book', 'Ledger Book definition changed');

CREATE TRIGGER trg_lb_category_lookup BEFORE INSERT OR UPDATE OF category ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_category', 'category');

CREATE TRIGGER trg_lb_close_mode_lookup BEFORE INSERT OR UPDATE OF close_mode ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_close_mode', 'close_mode');

CREATE TRIGGER trg_lb_standard_lookup BEFORE INSERT OR UPDATE OF reporting_standard ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_standard', 'reporting_standard');

CREATE TRIGGER trg_lb_status_changed BEFORE UPDATE ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_lb_updated_at BEFORE UPDATE ON master.ledger_book FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_legal_entity AFTER UPDATE OF country_code, functional_currency, reporting_currency, regulatory_framework, status ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('legal_entity', 'Legal Entity accounting profile changed');

CREATE TRIGGER trg_le_hierarchy_sync BEFORE INSERT OR UPDATE OF parent_entity_id ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION master.fn_le_hierarchy_sync();

CREATE TRIGGER trg_legal_entity_consolidation_lookup BEFORE INSERT OR UPDATE OF consolidation_method ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_consolidation', 'consolidation_method');

CREATE TRIGGER trg_legal_entity_framework_lookup BEFORE INSERT OR UPDATE OF regulatory_framework ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_framework', 'regulatory_framework');

CREATE TRIGGER trg_legal_entity_status_changed BEFORE UPDATE ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_legal_entity_type_lookup BEFORE INSERT OR UPDATE OF entity_type ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_type', 'entity_type');

CREATE TRIGGER trg_legal_entity_updated_at BEFORE UPDATE ON master.legal_entity FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_lebpl_self_bp_guard BEFORE INSERT OR UPDATE OF relationship_type, business_partner_id ON master.legal_entity_business_partner_link FOR EACH ROW EXECUTE FUNCTION master.trg_lebpl_self_bp_guard_fn();

CREATE TRIGGER trg_lebpl_status_changed BEFORE UPDATE ON master.legal_entity_business_partner_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_lebpl_updated_at BEFORE UPDATE ON master.legal_entity_business_partner_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_self_bp_registration_guard BEFORE INSERT OR UPDATE OF relationship_type, business_partner_id ON master.legal_entity_business_partner_link FOR EACH ROW EXECUTE FUNCTION master.fn_self_bp_registration_guard();

CREATE TRIGGER trg_leib_updated_at BEFORE UPDATE ON master.legal_entity_identity_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_letterhead_single_default BEFORE INSERT OR UPDATE OF is_default, is_active ON master.letterhead FOR EACH ROW EXECUTE FUNCTION document.trg_enforce_single_default();

CREATE TRIGGER trg_letterhead_updated_at BEFORE UPDATE ON master.letterhead FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_letterhead_validate_margins BEFORE INSERT OR UPDATE OF page_margins ON master.letterhead FOR EACH ROW EXECUTE FUNCTION document.trg_validate_page_margins();

CREATE TRIGGER trg_mpu_part_etags_validate BEFORE INSERT OR UPDATE OF part_etags ON master.multipart_upload FOR EACH ROW EXECUTE FUNCTION master.trg_validate_part_etags();

CREATE TRIGGER trg_mpu_updated_at BEFORE UPDATE ON master.multipart_upload FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_guard_mesh_network_provider BEFORE DELETE OR UPDATE ON master.network_provider FOR EACH ROW EXECUTE FUNCTION master.fn_guard_mesh_network_provider();

CREATE TRIGGER trg_notif_category_lookup BEFORE INSERT OR UPDATE OF category ON master.notification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.category', 'category');

CREATE TRIGGER trg_notif_channel_lookup BEFORE INSERT OR UPDATE OF channel ON master.notification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.channel', 'channel');

CREATE TRIGGER trg_notif_priority_lookup BEFORE INSERT OR UPDATE OF priority ON master.notification FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.priority', 'priority');

CREATE TRIGGER trg_notif_updated_at BEFORE UPDATE ON master.notification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_notif_category_lookup BEFORE INSERT OR UPDATE OF category ON master.notification_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.category', 'category');

CREATE TRIGGER trg_notif_channel_lookup BEFORE INSERT OR UPDATE OF channel ON master.notification_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.channel', 'channel');

CREATE TRIGGER trg_notif_priority_lookup BEFORE INSERT OR UPDATE OF priority ON master.notification_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.priority', 'priority');

CREATE TRIGGER trg_notif_updated_at BEFORE UPDATE ON master.notification_default FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_oo_domain_immutable BEFORE UPDATE OF domain ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION master.trg_operating_organization_domain_immutable();

CREATE TRIGGER trg_oo_hierarchy BEFORE INSERT OR UPDATE OF tenant_id, domain, parent_id ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_hierarchy();

CREATE TRIGGER trg_oo_scope_version BEFORE UPDATE OF parent_id, effective_from, effective_until, status ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION master.trg_operating_organization_scope_version();

CREATE TRIGGER trg_oo_status_changed BEFORE UPDATE ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_oo_updated_at BEFORE UPDATE ON master.operating_organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ooc_bump_scope AFTER INSERT OR DELETE OR UPDATE ON master.operating_organization_company FOR EACH ROW EXECUTE FUNCTION master.trg_bump_operating_organization_membership_scope();

CREATE TRIGGER trg_ooc_status_changed BEFORE UPDATE ON master.operating_organization_company FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ooc_updated_at BEFORE UPDATE ON master.operating_organization_company FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ooc_validate BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, participation_role ON master.operating_organization_company FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_company();

CREATE TRIGGER trg_people_org_unit_path BEFORE INSERT OR UPDATE OF code, parent_id ON master.org_unit FOR EACH ROW EXECUTE FUNCTION master.trg_people_org_unit_path();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON master.org_unit FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.org_unit FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_tax_registration AFTER INSERT OR DELETE OR UPDATE ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Tax registration changed');

CREATE TRIGGER trg_otr_scope BEFORE INSERT OR UPDATE OF tenant_id, legal_entity_id, company_code_id ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION master.guard_organization_tax_registration_scope();

CREATE TRIGGER trg_otr_updated_at BEFORE UPDATE ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_owner_type_immutable_code BEFORE UPDATE OF code ON master.owner_type FOR EACH ROW EXECUTE FUNCTION master.trg_immutable_owner_type_code();

CREATE TRIGGER trg_owner_type_in_use_guard BEFORE DELETE OR UPDATE OF status ON master.owner_type FOR EACH ROW EXECUTE FUNCTION master.trg_guard_owner_type_in_use();

CREATE TRIGGER trg_owner_type_no_shadow BEFORE INSERT OR UPDATE OF code, tenant_id ON master.owner_type FOR EACH ROW EXECUTE FUNCTION master.trg_guard_owner_type_no_shadow();

CREATE TRIGGER trg_owner_type_status_changed BEFORE UPDATE ON master.owner_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_owner_type_updated_at BEFORE UPDATE ON master.owner_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_owner_type_validate BEFORE INSERT OR UPDATE OF schema_name, table_name, pk_column, is_tenant_scoped, tenant_column ON master.owner_type FOR EACH ROW EXECUTE FUNCTION master.trg_owner_type_validate();

CREATE TRIGGER trg_party_contact_person_parent_ref BEFORE INSERT OR UPDATE OF tenant_id, party_type, party_id ON master.party_contact_person FOR EACH ROW EXECUTE FUNCTION master.trg_validate_party_contact_parent();

CREATE TRIGGER trg_ownership_pct_aggregate_guard BEFORE INSERT OR UPDATE ON master.party_governance_relation FOR EACH ROW EXECUTE FUNCTION master.fn_ownership_pct_aggregate_guard();

CREATE TRIGGER trg_pra_approved_immutable BEFORE UPDATE ON master.party_risk_assessment FOR EACH ROW EXECUTE FUNCTION master.trg_pra_approved_immutable_fn();

CREATE TRIGGER trg_pra_subject_binding BEFORE INSERT OR UPDATE OF subject_type, subject_id, business_partner_id ON master.party_risk_assessment FOR EACH ROW EXECUTE FUNCTION master.trg_risk_subject_binding_fn();

CREATE TRIGGER trg_pra_sync_qualification AFTER INSERT OR UPDATE OF status, risk_band, next_review_at, approved_at, approved_by ON master.party_risk_assessment FOR EACH ROW WHEN (new.status = 'approved'::text AND new.assessment_context = 'supplier_role'::text) EXECUTE FUNCTION master.trg_pra_sync_qualification_fn();

CREATE TRIGGER trg_pra_updated_at BEFORE UPDATE ON master.party_risk_assessment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_prds_updated_at BEFORE UPDATE ON master.party_risk_dimension_score FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_prd_child_consistency BEFORE INSERT OR UPDATE OF dimension_score_id, assessment_id, evidence_id ON master.party_risk_driver FOR EACH ROW EXECUTE FUNCTION master.trg_prd_child_consistency_fn();

CREATE TRIGGER trg_pre_core_immutable BEFORE UPDATE ON master.party_risk_evidence FOR EACH ROW EXECUTE FUNCTION master.trg_pre_core_immutable_fn();

CREATE TRIGGER trg_pre_raw_payload_immutable BEFORE UPDATE OF raw_payload ON master.party_risk_evidence FOR EACH ROW EXECUTE FUNCTION master.trg_pre_raw_payload_immutable_fn();

CREATE TRIGGER trg_pre_subject_binding BEFORE INSERT OR UPDATE OF subject_type, subject_id, business_partner_id ON master.party_risk_evidence FOR EACH ROW EXECUTE FUNCTION master.trg_risk_subject_binding_fn();

CREATE TRIGGER trg_pre_updated_at BEFORE UPDATE ON master.party_risk_evidence FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_prm_updated_at BEFORE UPDATE ON master.party_risk_mitigation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_prre_no_update BEFORE UPDATE ON master.party_risk_review_event FOR EACH ROW EXECUTE FUNCTION master.trg_prre_no_update_fn();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.pay_component FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.pay_grade FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.pay_group FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.pay_structure FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.pay_structure_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pm_direction_lookup BEFORE INSERT OR UPDATE OF direction ON master.payment_method FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_method_direction', 'direction');

CREATE TRIGGER trg_pm_instrument_mode_lookup BEFORE INSERT OR UPDATE OF instrument_mode ON master.payment_method FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_method_instrument_mode', 'instrument_mode');

CREATE TRIGGER trg_pm_status_changed BEFORE UPDATE ON master.payment_method FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pm_updated_at BEFORE UPDATE ON master.payment_method FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_payment_term AFTER INSERT OR DELETE OR UPDATE ON master.payment_term FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Payment Term changed');

CREATE TRIGGER trg_pt_category_lookup BEFORE INSERT OR UPDATE OF term_category ON master.payment_term FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_category', 'term_category');

CREATE TRIGGER trg_pt_immutable BEFORE UPDATE ON master.payment_term FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_immutable();

CREATE TRIGGER trg_pt_status_changed BEFORE UPDATE ON master.payment_term FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pt_updated_at BEFORE UPDATE ON master.payment_term FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_payment_term_clause AFTER INSERT OR DELETE OR UPDATE ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Payment Term clause changed');

CREATE TRIGGER trg_ptc_immutable BEFORE UPDATE ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_clause_immutable();

CREATE TRIGGER trg_ptc_recovery_method_lookup BEFORE INSERT OR UPDATE OF recovery_method ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_recovery_method', 'recovery_method');

CREATE TRIGGER trg_ptc_release_event_lookup BEFORE INSERT OR UPDATE OF release_event ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_release_event', 'release_event');

CREATE TRIGGER trg_ptc_trigger_event_lookup BEFORE INSERT OR UPDATE OF trigger_event ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_trigger_event', 'trigger_event');

CREATE TRIGGER trg_ptc_updated_at BEFORE UPDATE ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ptc_validate_settles BEFORE INSERT OR UPDATE OF settles_clause_code, clause_type ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION master.trg_validate_settles_clause();

CREATE TRIGGER trg_fin_ready_payment_term_discount AFTER INSERT OR DELETE OR UPDATE ON master.payment_term_discount_tier FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant', 'Payment Term discount changed');

CREATE TRIGGER trg_ptdt_immutable BEFORE UPDATE ON master.payment_term_discount_tier FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_discount_tier_immutable();

CREATE TRIGGER trg_ptdt_updated_at BEFORE UPDATE ON master.payment_term_discount_tier FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON master.person FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.person FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.person_sensitive_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master."position" FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.principal FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."principal" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_principal_status_changed BEFORE UPDATE ON master.principal FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_principal_type_lookup BEFORE INSERT OR UPDATE OF principal_type ON master.principal FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_type', 'principal_type');

CREATE TRIGGER trg_principal_updated_at BEFORE UPDATE ON master.principal FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.principal_identity_binding FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "master"."principal_identity_binding" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_pib_service_client BEFORE INSERT OR UPDATE OF service_client_id ON master.principal_identity_binding FOR EACH ROW EXECUTE FUNCTION master.trg_guard_auth_binding_service_client();

CREATE TRIGGER trg_pib_updated_at BEFORE UPDATE ON master.principal_identity_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_freeze_keycloak_profile_columns BEFORE UPDATE ON master.principal_profile FOR EACH ROW EXECUTE FUNCTION master.trg_fn_freeze_keycloak_profile_columns();

COMMENT ON TRIGGER "trg_freeze_keycloak_profile_columns" ON "master"."principal_profile" IS 'Phase 2 IAM: no-op while app.iam_profile_kc_frozen is unset/false. Becomes a write guard once the GUC is set to ''true''. See fn_migrate_principal_identity_bindings() for activation instructions.';

CREATE TRIGGER trg_principal_profile_ou_iam_outbox AFTER UPDATE OF default_company_code_id ON master.principal_profile FOR EACH ROW WHEN (old.default_company_code_id IS DISTINCT FROM new.default_company_code_id) EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'company_code_assignment');

CREATE TRIGGER trg_principal_profile_service_client BEFORE INSERT OR UPDATE OF keycloak_service_client_id ON master.principal_profile FOR EACH ROW EXECUTE FUNCTION master.trg_guard_service_client();

CREATE TRIGGER trg_principal_profile_updated_at BEFORE UPDATE ON master.principal_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_relationship_status_changed BEFORE UPDATE OF status ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_principal_relationship_type_lookup BEFORE INSERT OR UPDATE OF relationship_type ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_type', 'relationship_type');

CREATE TRIGGER trg_principal_relationship_updated_at BEFORE UPDATE ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_relationship_verification_status_lookup BEFORE INSERT OR UPDATE OF verification_status ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_verification_status', 'verification_status');

CREATE TRIGGER trg_principal_relationship_verified_method_lookup BEFORE INSERT OR UPDATE OF verified_method ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_verified_method', 'verified_method');

CREATE TRIGGER trg_puipref_enforce_created_by BEFORE INSERT OR UPDATE ON master.principal_ui_preference FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

CREATE TRIGGER trg_puipref_preference_code BEFORE INSERT OR UPDATE ON master.principal_ui_preference FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.preference_code', 'preference_code');

CREATE TRIGGER trg_puipref_surface_code BEFORE INSERT OR UPDATE ON master.principal_ui_preference FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

CREATE TRIGGER trg_puipref_updated_at BEFORE UPDATE ON master.principal_ui_preference FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_puip_appearance_mode BEFORE INSERT OR UPDATE ON master.principal_ui_profile FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.appearance_mode', 'appearance_mode');

CREATE TRIGGER trg_puip_density BEFORE INSERT OR UPDATE ON master.principal_ui_profile FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.density', 'density_code');

CREATE TRIGGER trg_puip_enforce_created_by BEFORE INSERT OR UPDATE ON master.principal_ui_profile FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

CREATE TRIGGER trg_puip_updated_at BEFORE UPDATE ON master.principal_ui_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pop_updated_at BEFORE UPDATE ON master.procurement_organization_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pop_validate_domain BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id ON master.procurement_organization_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile('procurement');

CREATE TRIGGER trg_prod_status_changed BEFORE UPDATE ON master.product FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_prod_type_lookup BEFORE INSERT OR UPDATE OF product_type ON master.product FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.product_type', 'product_type');

CREATE TRIGGER trg_prod_updated_at BEFORE UPDATE ON master.product FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pc_level BEFORE INSERT OR UPDATE ON master.profit_center FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

CREATE TRIGGER trg_pc_node_type_lookup BEFORE INSERT OR UPDATE OF node_type ON master.profit_center FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.profit_center_node_type', 'node_type');

CREATE TRIGGER trg_pc_parent_co BEFORE INSERT OR UPDATE ON master.profit_center FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

CREATE TRIGGER trg_pc_status_changed BEFORE UPDATE ON master.profit_center FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pc_type_lookup BEFORE INSERT OR UPDATE OF profit_center_type ON master.profit_center FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.profit_center_type', 'profit_center_type');

CREATE TRIGGER trg_pc_updated_at BEFORE UPDATE ON master.profit_center FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_proj_level BEFORE INSERT OR UPDATE ON master.project FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

CREATE TRIGGER trg_proj_parent_co BEFORE INSERT OR UPDATE ON master.project FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

CREATE TRIGGER trg_proj_settlement_lookup BEFORE INSERT OR UPDATE OF settlement_type ON master.project FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_settlement_type', 'settlement_type');

CREATE TRIGGER trg_proj_status_changed BEFORE UPDATE ON master.project FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_proj_type_lookup BEFORE INSERT OR UPDATE OF project_type ON master.project FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_type', 'project_type');

CREATE TRIGGER trg_proj_updated_at BEFORE UPDATE ON master.project FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pi_company BEFORE INSERT OR UPDATE ON master.project_item FOR EACH ROW EXECUTE FUNCTION master.trg_project_item_company_integrity();

CREATE TRIGGER trg_pi_level BEFORE INSERT OR UPDATE ON master.project_item FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

CREATE TRIGGER trg_pi_status_changed BEFORE UPDATE ON master.project_item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pi_type_lookup BEFORE INSERT OR UPDATE OF item_type ON master.project_item FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_item_type', 'item_type');

CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON master.project_item FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_sop_updated_at BEFORE UPDATE ON master.sales_organization_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_sop_validate_domain BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id ON master.sales_organization_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile('sales');

CREATE TRIGGER trg_saved_view_status_changed BEFORE UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_sv_enforce_created_by BEFORE INSERT OR UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

CREATE TRIGGER trg_sv_guard_scope_owner BEFORE UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

CREATE TRIGGER trg_sv_immutable_code BEFORE UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

CREATE TRIGGER trg_sv_scope BEFORE INSERT OR UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.view_scope', 'scope');

CREATE TRIGGER trg_sv_surface_code BEFORE INSERT OR UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

CREATE TRIGGER trg_sv_sync_deleted_at BEFORE UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();

CREATE TRIGGER trg_sv_updated_at BEFORE UPDATE ON master.saved_view FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.shift_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_site_level BEFORE INSERT OR UPDATE ON master.site FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

CREATE TRIGGER trg_site_parent_co BEFORE INSERT OR UPDATE ON master.site FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

CREATE TRIGGER trg_site_status_changed BEFORE UPDATE ON master.site FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_site_type_lookup BEFORE INSERT OR UPDATE OF site_type ON master.site FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.site_type', 'site_type');

CREATE TRIGGER trg_site_updated_at BEFORE UPDATE ON master.site FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.statutory_scheme FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_supp_status_changed BEFORE UPDATE ON master.supplier FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_supp_type_lookup BEFORE INSERT OR UPDATE OF supplier_type ON master.supplier FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.supplier_type', 'supplier_type');

CREATE TRIGGER trg_supp_updated_at BEFORE UPDATE ON master.supplier FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_supplier_app_index_sync AFTER INSERT OR DELETE OR UPDATE ON master.supplier FOR EACH ROW EXECUTE FUNCTION master.trg_supplier_app_index_sync();

CREATE TRIGGER trg_supplier_category_guard BEFORE INSERT OR UPDATE OF supplier_type, business_partner_id ON master.supplier FOR EACH ROW EXECUTE FUNCTION master.fn_supplier_category_guard();

CREATE TRIGGER trg_supplier_block_sync AFTER INSERT OR DELETE OR UPDATE ON master.supplier_block FOR EACH ROW EXECUTE FUNCTION master.fn_supplier_block_sync();

CREATE TRIGGER trg_sq_updated_at BEFORE UPDATE ON master.supplier_qualification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_team_status_changed BEFORE UPDATE ON master.team FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_team_updated_at BEFORE UPDATE ON master.team FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_template_updated_at BEFORE UPDATE ON master.template FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2('global');

ALTER TABLE "master"."tenant" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_tenant_status_changed BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_tenant_status_transition BEFORE UPDATE OF status ON master.tenant FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_status_transition();

CREATE TRIGGER trg_tenant_subscription_lookup BEFORE INSERT OR UPDATE OF subscription ON master.tenant FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_subscription', 'subscription');

CREATE TRIGGER trg_tenant_type_lookup BEFORE INSERT OR UPDATE OF tenant_type ON master.tenant FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_type', 'tenant_type');

CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tp_normalize_weekend_days BEFORE INSERT OR UPDATE OF weekend_days ON master.tenant_profile FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_weekend_days();

CREATE TRIGGER trg_tp_updated_at BEFORE UPDATE ON master.tenant_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tenant_relationship_direction_lookup BEFORE INSERT OR UPDATE OF relationship_direction ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_direction', 'relationship_direction');

CREATE TRIGGER trg_tenant_relationship_status_changed BEFORE UPDATE OF status ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_tenant_relationship_status_lookup BEFORE INSERT OR UPDATE OF status ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_status', 'status');

CREATE TRIGGER trg_tenant_relationship_type_lookup BEFORE INSERT OR UPDATE OF relationship_type ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_type', 'relationship_type');

CREATE TRIGGER trg_tenant_relationship_updated_at BEFORE UPDATE ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_wh_status_changed BEFORE UPDATE ON master.warehouse FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_wh_type_lookup BEFORE INSERT OR UPDATE OF warehouse_type ON master.warehouse FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.warehouse_type', 'warehouse_type');

CREATE TRIGGER trg_wh_updated_at BEFORE UPDATE ON master.warehouse FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.work_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.work_pattern FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.work_pattern_day FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
