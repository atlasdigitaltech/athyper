CREATE INDEX attachment_sha256_idx
    ON document.attachment (tenant_id, sha256)
    WHERE sha256 IS NOT NULL AND status <> 'deleted';
CREATE INDEX attachment_storage_idx
    ON document.attachment (tenant_id, storage_bucket, storage_key);
CREATE INDEX attachment_parent_idx
    ON document.attachment (tenant_id, parent_attachment_id)
    WHERE parent_attachment_id IS NOT NULL;
CREATE INDEX attachment_expiry_idx
    ON document.attachment (expires_at)
    WHERE is_auto_delete_on_expiry AND status <> 'deleted';
CREATE INDEX attachment_processing_idx
    ON document.attachment (tenant_id, text_extraction_status, created_at)
    WHERE text_extraction_status IN ('pending', 'failed');
CREATE INDEX attachment_folder_owner_idx
    ON document.attachment_folder
    (tenant_id, entity_type, entity_id, parent_id, display_order);
CREATE INDEX attachment_link_owner_idx
    ON document.attachment_link
    (tenant_id, entity_type, entity_id, display_order);
CREATE INDEX attachment_link_pinned_attachment_idx
    ON document.attachment_link (tenant_id, pinned_attachment_id)
    WHERE pinned_attachment_id IS NOT NULL;
CREATE INDEX attachment_link_folder_idx
    ON document.attachment_link (tenant_id, folder_id)
    WHERE folder_id IS NOT NULL;

CREATE INDEX comment_owner_created_idx
    ON document.comment
    (tenant_id, entity_type, entity_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX comment_parent_idx
    ON document.comment (tenant_id, parent_comment_id, created_at)
    WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX comment_commenter_idx
    ON document.comment (tenant_id, commenter_id, created_at DESC);
CREATE INDEX comment_draft_principal_idx
    ON document.comment_draft (tenant_id, principal_id, updated_at DESC);
CREATE INDEX comment_cursor_owner_idx
    ON document.comment_feed_cursor
    (tenant_id, entity_type, entity_id, principal_id);
CREATE INDEX comment_mention_principal_idx
    ON document.comment_mention (tenant_id, mentioned_id, created_at DESC);
CREATE INDEX comment_mention_comment_idx
    ON document.comment_mention (tenant_id, comment_id);
CREATE INDEX comment_reaction_comment_idx
    ON document.comment_reaction (tenant_id, comment_id, created_at);

CREATE INDEX content_item_parent_idx
    ON document.content_item (tenant_id, parent_id, locale_code);
CREATE INDEX content_item_status_idx
    ON document.content_item (tenant_id, status, kind, updated_at DESC);
CREATE INDEX content_item_link_target_idx
    ON document.content_item_link (tenant_id, target_content_item_id);
CREATE INDEX content_item_version_item_idx
    ON snapshot.content_item_version
    (tenant_id, content_item_id, version DESC);
CREATE INDEX conversation_owner_idx
    ON document.conversation (tenant_id, entity_type, entity_id)
    WHERE entity_type IS NOT NULL;
CREATE INDEX conversation_status_idx
    ON document.conversation (tenant_id, status, updated_at DESC);
CREATE INDEX conversation_participant_principal_idx
    ON document.conversation_participant
    (tenant_id, principal_id, left_at, conversation_id);
CREATE INDEX conversation_participant_conversation_idx
    ON document.conversation_participant
    (tenant_id, conversation_id, left_at);

CREATE INDEX multipart_upload_expiry_idx
    ON document.multipart_upload (expires_at)
    WHERE status IN ('initiated', 'uploading');
CREATE INDEX multipart_upload_attachment_idx
    ON document.multipart_upload (tenant_id, attachment_id)
    WHERE attachment_id IS NOT NULL;

CREATE INDEX workflow_request_entity_idx ON document.workflow_request (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX workflow_request_status_idx ON document.workflow_request (tenant_id, status, requested_at DESC);
CREATE INDEX workflow_request_requested_by_idx ON document.workflow_request (tenant_id, requested_by);
CREATE INDEX workflow_request_decided_by_idx ON document.workflow_request (tenant_id, decided_by) WHERE decided_by IS NOT NULL;
CREATE INDEX workflow_request_status_by_idx ON document.workflow_request (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX workflow_request_created_by_idx ON document.workflow_request (tenant_id, created_by);
CREATE INDEX workflow_request_updated_by_idx ON document.workflow_request (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX workflow_stage_status_idx ON document.workflow_stage (tenant_id, workflow_request_id, status, stage_no);
CREATE INDEX workflow_stage_status_by_idx ON document.workflow_stage (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX workflow_stage_created_by_idx ON document.workflow_stage (tenant_id, created_by);
CREATE INDEX workflow_stage_updated_by_idx ON document.workflow_stage (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX commitment_supplier_idx ON document.commitment (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX commitment_parent_idx ON document.commitment (tenant_id, parent_commitment_id) WHERE parent_commitment_id IS NOT NULL;
CREATE INDEX commitment_responsible_idx ON document.commitment (tenant_id, responsible_principal_id) WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX commitment_requested_by_idx ON document.commitment (tenant_id, requested_by);
CREATE INDEX commitment_workflow_idx ON document.commitment (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX commitment_approved_by_idx ON document.commitment (tenant_id, approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX commitment_payment_term_idx ON document.commitment (tenant_id, payment_term_id) WHERE payment_term_id IS NOT NULL;
CREATE INDEX commitment_period_idx ON document.commitment (tenant_id, fiscal_period_id) WHERE fiscal_period_id IS NOT NULL;
CREATE INDEX commitment_status_by_idx ON document.commitment (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX commitment_created_by_idx ON document.commitment (tenant_id, created_by);
CREATE INDEX commitment_updated_by_idx ON document.commitment (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX commitment_journal_idx ON document.commitment (tenant_id, encumbrance_journal_entry_id) WHERE encumbrance_journal_entry_id IS NOT NULL;
CREATE INDEX commitment_status_idx ON document.commitment (tenant_id, company_code_id, status, effective_date DESC);

CREATE INDEX commitment_line_company_idx ON document.commitment_line (tenant_id, company_code_id);
CREATE INDEX commitment_line_item_idx ON document.commitment_line (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX commitment_line_commodity_idx ON document.commitment_line (tenant_id, commodity_category_id) WHERE commodity_category_id IS NOT NULL;
CREATE INDEX commitment_line_intent_idx ON document.commitment_line (tenant_id, business_intent_id) WHERE business_intent_id IS NOT NULL;
CREATE INDEX commitment_line_asset_class_idx ON document.commitment_line (tenant_id, asset_class_id) WHERE asset_class_id IS NOT NULL;
CREATE INDEX commitment_line_tax_group_idx ON document.commitment_line (tenant_id, tax_group_id) WHERE tax_group_id IS NOT NULL;
CREATE INDEX commitment_line_wht_group_idx ON document.commitment_line (tenant_id, withholding_tax_group_id) WHERE withholding_tax_group_id IS NOT NULL;
CREATE INDEX commitment_line_to_jur_idx ON document.commitment_line (tenant_id, to_tax_jurisdiction_id) WHERE to_tax_jurisdiction_id IS NOT NULL;
CREATE INDEX commitment_line_from_jur_idx ON document.commitment_line (tenant_id, from_tax_jurisdiction_id) WHERE from_tax_jurisdiction_id IS NOT NULL;
CREATE INDEX commitment_line_site_idx ON document.commitment_line (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX commitment_line_warehouse_idx ON document.commitment_line (tenant_id, site_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX commitment_line_ship_to_address_idx ON document.commitment_line (tenant_id, ship_to_address_id) WHERE ship_to_address_id IS NOT NULL;
CREATE INDEX commitment_line_bill_to_address_idx ON document.commitment_line (tenant_id, bill_to_address_id) WHERE bill_to_address_id IS NOT NULL;
CREATE INDEX commitment_line_bill_from_address_idx ON document.commitment_line (tenant_id, bill_from_address_id) WHERE bill_from_address_id IS NOT NULL;
CREATE INDEX commitment_line_ship_from_address_idx ON document.commitment_line (tenant_id, ship_from_address_id) WHERE ship_from_address_id IS NOT NULL;
CREATE INDEX commitment_line_remit_to_address_idx ON document.commitment_line (tenant_id, remit_to_address_id) WHERE remit_to_address_id IS NOT NULL;
CREATE INDEX commitment_line_status_by_idx ON document.commitment_line (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX commitment_line_created_by_idx ON document.commitment_line (tenant_id, created_by);
CREATE INDEX commitment_line_updated_by_idx ON document.commitment_line (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX commitment_release_parent_idx ON document.commitment_release_allocation (tenant_id, parent_commitment_id);
CREATE INDEX commitment_release_parent_line_idx ON document.commitment_release_allocation (tenant_id, parent_line_id);
CREATE INDEX commitment_release_header_idx ON document.commitment_release_allocation (tenant_id, release_commitment_id);
CREATE INDEX commitment_release_line_idx ON document.commitment_release_allocation (tenant_id, release_line_id);
CREATE INDEX commitment_release_reversal_idx ON document.commitment_release_allocation (tenant_id, reverses_allocation_id) WHERE reverses_allocation_id IS NOT NULL;
CREATE INDEX commitment_release_released_by_idx ON document.commitment_release_allocation (tenant_id, released_by);
CREATE INDEX commitment_release_created_by_idx ON document.commitment_release_allocation (tenant_id, created_by);

CREATE INDEX purchase_invoice_supplier_idx ON document.purchase_invoice (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX purchase_invoice_commitment_idx ON document.purchase_invoice (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX purchase_invoice_term_idx ON document.purchase_invoice (tenant_id, payment_term_id) WHERE payment_term_id IS NOT NULL;
CREATE INDEX purchase_invoice_period_idx ON document.purchase_invoice (tenant_id, fiscal_period_id);
CREATE INDEX purchase_invoice_requested_by_idx ON document.purchase_invoice (tenant_id, requested_by);
CREATE INDEX purchase_invoice_workflow_idx ON document.purchase_invoice (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX purchase_invoice_approved_by_idx ON document.purchase_invoice (tenant_id, approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX purchase_invoice_status_by_idx ON document.purchase_invoice (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX purchase_invoice_created_by_idx ON document.purchase_invoice (tenant_id, created_by);
CREATE INDEX purchase_invoice_updated_by_idx ON document.purchase_invoice (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX purchase_invoice_journal_idx ON document.purchase_invoice (tenant_id, ap_journal_entry_id) WHERE ap_journal_entry_id IS NOT NULL;
CREATE INDEX purchase_invoice_status_idx ON document.purchase_invoice (tenant_id, company_code_id, status, posting_date DESC);
CREATE UNIQUE INDEX purchase_invoice_supplier_number_uq
    ON document.purchase_invoice (tenant_id, supplier_id, supplier_invoice_number)
    WHERE supplier_id IS NOT NULL AND supplier_invoice_number IS NOT NULL
      AND status <> 'cancelled';

CREATE INDEX purchase_invoice_line_company_idx ON document.purchase_invoice_line (tenant_id, company_code_id);
CREATE INDEX purchase_invoice_line_commitment_idx ON document.purchase_invoice_line (tenant_id, commitment_line_id) WHERE commitment_line_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_item_idx ON document.purchase_invoice_line (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_commodity_idx ON document.purchase_invoice_line (tenant_id, commodity_category_id) WHERE commodity_category_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_intent_idx ON document.purchase_invoice_line (tenant_id, business_intent_id) WHERE business_intent_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_asset_class_idx ON document.purchase_invoice_line (tenant_id, asset_class_id) WHERE asset_class_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_tax_group_idx ON document.purchase_invoice_line (tenant_id, tax_group_id) WHERE tax_group_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_wht_group_idx ON document.purchase_invoice_line (tenant_id, withholding_tax_group_id) WHERE withholding_tax_group_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_to_jur_idx ON document.purchase_invoice_line (tenant_id, to_tax_jurisdiction_id) WHERE to_tax_jurisdiction_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_from_jur_idx ON document.purchase_invoice_line (tenant_id, from_tax_jurisdiction_id) WHERE from_tax_jurisdiction_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_site_idx ON document.purchase_invoice_line (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_warehouse_idx ON document.purchase_invoice_line (tenant_id, site_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_ship_to_address_idx ON document.purchase_invoice_line (tenant_id, ship_to_address_id) WHERE ship_to_address_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_bill_to_address_idx ON document.purchase_invoice_line (tenant_id, bill_to_address_id) WHERE bill_to_address_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_bill_from_address_idx ON document.purchase_invoice_line (tenant_id, bill_from_address_id) WHERE bill_from_address_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_ship_from_address_idx ON document.purchase_invoice_line (tenant_id, ship_from_address_id) WHERE ship_from_address_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_remit_to_address_idx ON document.purchase_invoice_line (tenant_id, remit_to_address_id) WHERE remit_to_address_id IS NOT NULL;
CREATE INDEX purchase_invoice_line_created_by_idx ON document.purchase_invoice_line (tenant_id, created_by);
CREATE INDEX purchase_invoice_line_updated_by_idx ON document.purchase_invoice_line (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX purchase_invoice_line_source_idx ON document.purchase_invoice_line (tenant_id, source_entity_type, source_entity_id, source_line_id)
    WHERE source_entity_id IS NOT NULL;

CREATE INDEX invoice_match_case_company_idx ON document.invoice_match_case (tenant_id, company_code_id);
CREATE INDEX invoice_match_case_commitment_idx ON document.invoice_match_case (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX invoice_match_case_matched_by_idx ON document.invoice_match_case (tenant_id, matched_by) WHERE matched_by IS NOT NULL;
CREATE INDEX invoice_match_case_status_by_idx ON document.invoice_match_case (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX invoice_match_case_created_by_idx ON document.invoice_match_case (tenant_id, created_by);
CREATE INDEX invoice_match_case_updated_by_idx ON document.invoice_match_case (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX invoice_match_case_status_idx ON document.invoice_match_case (tenant_id, status, created_at DESC);

CREATE INDEX accounting_distribution_gl_idx ON document.accounting_distribution (tenant_id, gl_account_id) WHERE gl_account_id IS NOT NULL;
CREATE INDEX accounting_distribution_cost_center_idx ON document.accounting_distribution (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX accounting_distribution_profit_center_idx ON document.accounting_distribution (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX accounting_distribution_project_idx ON document.accounting_distribution (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX accounting_distribution_dimension_idx ON document.accounting_distribution (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX accounting_distribution_asset_idx ON document.accounting_distribution (tenant_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX accounting_distribution_budget_idx ON document.accounting_distribution (tenant_id, budget_allocation_id) WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX accounting_distribution_created_by_idx ON document.accounting_distribution (tenant_id, created_by);
CREATE INDEX accounting_distribution_updated_by_idx ON document.accounting_distribution (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX accounting_distribution_source_idx ON document.accounting_distribution
    (tenant_id, source_entity_type, source_entity_id, source_line_id, amount_status);

CREATE INDEX payment_term_application_invoice_idx ON document.payment_term_application (tenant_id, purchase_invoice_id);
CREATE INDEX payment_term_application_line_idx ON document.payment_term_application (tenant_id, purchase_invoice_line_id) WHERE purchase_invoice_line_id IS NOT NULL;
CREATE INDEX payment_term_application_commitment_idx ON document.payment_term_application (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX payment_term_application_term_idx ON document.payment_term_application (tenant_id, payment_term_id) WHERE payment_term_id IS NOT NULL;
CREATE INDEX payment_term_application_clause_idx ON document.payment_term_application (tenant_id, payment_term_clause_id) WHERE payment_term_clause_id IS NOT NULL;
CREATE INDEX payment_term_application_requested_by_idx ON document.payment_term_application (tenant_id, override_requested_by) WHERE override_requested_by IS NOT NULL;
CREATE INDEX payment_term_application_decided_by_idx ON document.payment_term_application (tenant_id, override_decided_by) WHERE override_decided_by IS NOT NULL;
CREATE INDEX payment_term_application_reversal_idx ON document.payment_term_application (tenant_id, reverses_application_id) WHERE reverses_application_id IS NOT NULL;
CREATE INDEX payment_term_application_supersedes_idx ON document.payment_term_application (tenant_id, supersedes_application_id) WHERE supersedes_application_id IS NOT NULL;
CREATE INDEX payment_term_application_created_by_idx ON document.payment_term_application (tenant_id, created_by);
CREATE INDEX payment_term_application_updated_by_idx ON document.payment_term_application (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX payment_entry_supplier_idx ON document.payment_entry (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX payment_entry_bank_idx ON document.payment_entry (tenant_id, bank_account_id) WHERE bank_account_id IS NOT NULL;
CREATE INDEX payment_entry_period_idx ON document.payment_entry (tenant_id, fiscal_period_id);
CREATE INDEX payment_entry_reversal_idx ON document.payment_entry (tenant_id, reversal_of_payment_id) WHERE reversal_of_payment_id IS NOT NULL;
CREATE INDEX payment_entry_workflow_idx ON document.payment_entry (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX payment_entry_approved_by_idx ON document.payment_entry (tenant_id, approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX payment_entry_posted_by_idx ON document.payment_entry (tenant_id, posted_by) WHERE posted_by IS NOT NULL;
CREATE INDEX payment_entry_status_by_idx ON document.payment_entry (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX payment_entry_created_by_idx ON document.payment_entry (tenant_id, created_by);
CREATE INDEX payment_entry_updated_by_idx ON document.payment_entry (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX payment_entry_journal_idx ON document.payment_entry (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX payment_entry_status_idx ON document.payment_entry (tenant_id, company_code_id, status, posting_date DESC);

CREATE INDEX payment_allocation_invoice_idx ON document.payment_entry_allocation (tenant_id, purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;
CREATE INDEX payment_allocation_commitment_idx ON document.payment_entry_allocation (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX payment_allocation_term_idx ON document.payment_entry_allocation (tenant_id, payment_term_application_id) WHERE payment_term_application_id IS NOT NULL;
CREATE INDEX payment_allocation_reversal_idx ON document.payment_entry_allocation (tenant_id, reverses_allocation_id) WHERE reverses_allocation_id IS NOT NULL;
CREATE INDEX payment_allocation_created_by_idx ON document.payment_entry_allocation (tenant_id, created_by);

CREATE INDEX journal_entry_company_period_idx ON document.journal_entry
    (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, status);
CREATE INDEX journal_entry_reversal_idx ON document.journal_entry (tenant_id, reversal_of_journal_id) WHERE reversal_of_journal_id IS NOT NULL;
CREATE INDEX journal_entry_derived_idx ON document.journal_entry (tenant_id, derived_from_journal_id) WHERE derived_from_journal_id IS NOT NULL;
CREATE INDEX journal_entry_original_period_idx ON document.journal_entry (tenant_id, original_fiscal_period_id) WHERE original_fiscal_period_id IS NOT NULL;
CREATE INDEX journal_entry_policy_idx ON document.journal_entry (tenant_id, accounting_profile_policy_id) WHERE accounting_profile_policy_id IS NOT NULL;
CREATE INDEX journal_entry_posted_by_idx ON document.journal_entry (tenant_id, posted_by) WHERE posted_by IS NOT NULL;
CREATE INDEX journal_entry_status_by_idx ON document.journal_entry (tenant_id, status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX journal_entry_created_by_idx ON document.journal_entry (tenant_id, created_by);
CREATE INDEX journal_entry_updated_by_idx ON document.journal_entry (tenant_id, updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX journal_entry_source_idx ON document.journal_entry (tenant_id, source_entity_type, source_entity_id) WHERE source_entity_id IS NOT NULL;

CREATE INDEX journal_line_account_idx ON document.journal_line (tenant_id, gl_account_id);
CREATE INDEX journal_line_cost_center_idx ON document.journal_line (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX journal_line_profit_center_idx ON document.journal_line (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX journal_line_project_idx ON document.journal_line (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX journal_line_dimension_idx ON document.journal_line (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX journal_line_partner_idx ON document.journal_line (tenant_id, business_partner_id) WHERE business_partner_id IS NOT NULL;
CREATE INDEX journal_line_created_by_idx ON document.journal_line (tenant_id, created_by);
CREATE INDEX journal_line_subledger_idx ON document.journal_line (tenant_id, subledger_type, subledger_id) WHERE subledger_id IS NOT NULL;

CREATE INDEX journal_line_reference_line_idx ON document.journal_line_reference (tenant_id, journal_line_id);
CREATE INDEX journal_line_reference_distribution_idx ON document.journal_line_reference (tenant_id, accounting_distribution_id) WHERE accounting_distribution_id IS NOT NULL;
CREATE INDEX journal_line_reference_created_by_idx ON document.journal_line_reference (tenant_id, created_by);
CREATE INDEX journal_line_reference_source_idx ON document.journal_line_reference
    (tenant_id, source_entity_type, source_entity_id, source_line_id);

CREATE INDEX pr_status_idx ON document.purchase_requisition (tenant_id, company_code_id, status, document_date DESC);
CREATE INDEX pr_requester_idx ON document.purchase_requisition (tenant_id, requested_by, status);
CREATE INDEX pr_workflow_idx ON document.purchase_requisition (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX pr_period_idx ON document.purchase_requisition (tenant_id, fiscal_period_id) WHERE fiscal_period_id IS NOT NULL;
CREATE INDEX pr_journal_idx ON document.purchase_requisition (tenant_id, encumbrance_journal_entry_id) WHERE encumbrance_journal_entry_id IS NOT NULL;
CREATE INDEX prl_open_idx ON document.purchase_requisition_line (tenant_id, purchase_requisition_id, status, line_no);
CREATE INDEX prl_item_idx ON document.purchase_requisition_line (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX prl_supplier_idx ON document.purchase_requisition_line (tenant_id, suggested_supplier_id) WHERE suggested_supplier_id IS NOT NULL;
CREATE INDEX prl_site_idx ON document.purchase_requisition_line (tenant_id, site_id) WHERE site_id IS NOT NULL;

CREATE INDEX poc_commitment_idx ON document.purchase_order_confirmation (tenant_id, commitment_id, document_date DESC);
CREATE INDEX poc_supplier_status_idx ON document.purchase_order_confirmation (tenant_id, supplier_id, status);
CREATE INDEX poc_amendment_idx ON document.purchase_order_confirmation (tenant_id, amendment_commitment_id) WHERE amendment_commitment_id IS NOT NULL;
CREATE INDEX pocl_commitment_line_idx ON document.purchase_order_confirmation_line (tenant_id, commitment_line_id);

CREATE INDEX delivery_note_commitment_idx ON document.delivery_note (tenant_id, commitment_id, delivery_date DESC);
CREATE INDEX delivery_note_supplier_status_idx ON document.delivery_note (tenant_id, supplier_id, status);
CREATE INDEX delivery_note_arrival_idx ON document.delivery_note (tenant_id, expected_arrival_date) WHERE status IN ('draft','in_transit');
CREATE INDEX delivery_note_site_idx ON document.delivery_note (tenant_id, delivery_site_id);
CREATE INDEX delivery_note_line_commitment_idx ON document.delivery_note_line (tenant_id, commitment_line_id);

CREATE INDEX receipt_posting_idx ON document.receipt (tenant_id, company_code_id, posting_date DESC);
CREATE INDEX receipt_commitment_idx ON document.receipt (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX receipt_delivery_note_idx ON document.receipt (tenant_id, delivery_note_id) WHERE delivery_note_id IS NOT NULL;
CREATE INDEX receipt_supplier_idx ON document.receipt (tenant_id, supplier_id, status);
CREATE INDEX receipt_period_idx ON document.receipt (tenant_id, fiscal_period_id);
CREATE INDEX receipt_workflow_idx ON document.receipt (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX receipt_journal_idx ON document.receipt (tenant_id, accrual_journal_entry_id) WHERE accrual_journal_entry_id IS NOT NULL;
CREATE INDEX receipt_line_commitment_idx ON document.receipt_line (tenant_id, commitment_line_id);
CREATE INDEX receipt_line_delivery_idx ON document.receipt_line (tenant_id, delivery_note_line_id) WHERE delivery_note_line_id IS NOT NULL;
CREATE INDEX receipt_line_schedule_idx ON document.receipt_line (tenant_id, source_schedule_id) WHERE source_schedule_id IS NOT NULL;
CREATE INDEX receipt_line_item_idx ON document.receipt_line (tenant_id, item_id);
CREATE INDEX receipt_line_warehouse_idx ON document.receipt_line (tenant_id, site_id, warehouse_id);
CREATE INDEX receipt_line_movement_idx ON document.receipt_line (tenant_id, inventory_movement_id) WHERE inventory_movement_id IS NOT NULL;

CREATE INDEX service_sheet_posting_idx ON document.service_sheet (tenant_id, company_code_id, posting_date DESC);
CREATE INDEX service_sheet_commitment_idx ON document.service_sheet (tenant_id, commitment_id);
CREATE INDEX service_sheet_supplier_status_idx ON document.service_sheet (tenant_id, supplier_id, status);
CREATE INDEX service_sheet_period_idx ON document.service_sheet (tenant_id, fiscal_period_id);
CREATE INDEX service_sheet_workflow_idx ON document.service_sheet (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX service_sheet_journal_idx ON document.service_sheet (tenant_id, accrual_journal_entry_id) WHERE accrual_journal_entry_id IS NOT NULL;
CREATE INDEX service_sheet_line_commitment_idx ON document.service_sheet_line (tenant_id, commitment_line_id);
CREATE INDEX service_sheet_line_schedule_idx ON document.service_sheet_line (tenant_id, source_schedule_id) WHERE source_schedule_id IS NOT NULL;
CREATE INDEX service_sheet_line_item_idx ON document.service_sheet_line (tenant_id, item_id) WHERE item_id IS NOT NULL;

CREATE INDEX pricing_component_source_current_idx
    ON document.pricing_component
       (tenant_id, source_doc_type, source_doc_id, source_line_id, term_type, sequence)
    WHERE superseded_by_id IS NULL;
CREATE INDEX pricing_component_condition_idx
    ON document.pricing_component (tenant_id, condition_type_id)
    WHERE superseded_by_id IS NULL;
CREATE INDEX pricing_component_tax_group_idx
    ON document.pricing_component (tenant_id, tax_group_id)
    WHERE superseded_by_id IS NULL AND tax_group_id IS NOT NULL;
CREATE INDEX pricing_component_apportion_parent_idx
    ON document.pricing_component (tenant_id, is_apportioned_from_id)
    WHERE is_apportioned_from_id IS NOT NULL;
CREATE INDEX pricing_component_superseded_by_idx
    ON document.pricing_component (tenant_id, superseded_by_id)
    WHERE superseded_by_id IS NOT NULL;
CREATE INDEX pricing_component_superseded_actor_idx
    ON document.pricing_component (tenant_id, superseded_by_user)
    WHERE superseded_by_user IS NOT NULL;

CREATE UNIQUE INDEX schedule_line_current_number_uq
    ON document.schedule_line
       (tenant_id, source_doc_type, source_doc_id, source_line_id, schedule_no)
    WHERE is_current_version AND terminal_status IS NULL;
CREATE INDEX schedule_line_source_current_idx
    ON document.schedule_line (tenant_id, source_doc_type, source_line_id)
    WHERE is_current_version AND terminal_status IS NULL;
CREATE INDEX schedule_line_source_doc_idx
    ON document.schedule_line (tenant_id, source_doc_type, source_doc_id);
CREATE INDEX schedule_line_due_idx
    ON document.schedule_line (tenant_id, scheduled_date)
    WHERE is_current_version AND terminal_status IS NULL
      AND fulfillment_status IN ('open','partial');
CREATE INDEX schedule_line_previous_idx
    ON document.schedule_line (tenant_id, previous_version_id)
    WHERE previous_version_id IS NOT NULL;

CREATE INDEX catalog_import_supplier_status_idx
    ON document.catalog_import (
        tenant_id, company_code_id, supplier_business_partner_id, status, received_at
    );
CREATE INDEX catalog_import_source_idx
    ON document.catalog_import (source_system, source_publication_id);
CREATE INDEX catalog_import_line_import_status_idx
    ON document.catalog_import_line (
        tenant_id, catalog_import_id, match_status, review_decision, line_no
    );
CREATE INDEX catalog_import_line_proposed_item_idx
    ON document.catalog_import_line (tenant_id, proposed_item_id)
    WHERE proposed_item_id IS NOT NULL;
CREATE INDEX catalog_import_line_published_item_idx
    ON document.catalog_import_line (tenant_id, published_catalog_item_id)
    WHERE published_catalog_item_id IS NOT NULL;
CREATE INDEX catalog_import_line_commodity_idx
    ON document.catalog_import_line (commodity_code_id)
    WHERE commodity_code_id IS NOT NULL;

CREATE INDEX punchout_cart_supplier_status_idx
    ON document.punchout_cart (
        tenant_id, company_code_id, supplier_business_partner_id, status, returned_at
    );
CREATE INDEX punchout_cart_line_cart_idx
    ON document.punchout_cart_line (
        tenant_id, punchout_cart_id, match_status, line_no
    );
CREATE INDEX punchout_cart_line_item_idx
    ON document.punchout_cart_line (tenant_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX punchout_cart_line_commodity_idx
    ON document.punchout_cart_line (commodity_code_id)
    WHERE commodity_code_id IS NOT NULL;

CREATE INDEX production_order_output_status_idx
    ON document.production_order (
        tenant_id, company_code_id, output_item_id, status, planned_start_at
    );
CREATE INDEX production_order_bom_snapshot_idx
    ON document.production_order (tenant_id, bom_snapshot_id);
CREATE INDEX production_order_site_idx
    ON document.production_order (tenant_id, assembly_site_id)
    WHERE assembly_site_id IS NOT NULL;
CREATE INDEX production_order_component_order_idx
    ON document.production_order_component (
        tenant_id, production_order_id, status, line_no
    );
CREATE INDEX production_order_component_snapshot_idx
    ON document.production_order_component (
        tenant_id, bom_component_snapshot_id
    )
    WHERE bom_component_snapshot_id IS NOT NULL;
CREATE INDEX production_order_component_item_idx
    ON document.production_order_component (tenant_id, component_item_id);

CREATE INDEX sales_order_customer_status_idx
    ON document.sales_order (
        tenant_id, company_code_id, customer_id, status, order_date
    );
CREATE INDEX sales_order_line_order_idx
    ON document.sales_order_line (tenant_id, sales_order_id, status, line_no);
CREATE INDEX sales_order_line_item_idx
    ON document.sales_order_line (tenant_id, item_id, status);

CREATE INDEX catalog_import_supplier_fk_idx
    ON document.catalog_import (tenant_id, supplier_business_partner_id);
CREATE INDEX catalog_import_reviewed_by_idx
    ON document.catalog_import (tenant_id, reviewed_by)
    WHERE reviewed_by IS NOT NULL;
CREATE INDEX catalog_import_published_by_idx
    ON document.catalog_import (tenant_id, published_by)
    WHERE published_by IS NOT NULL;
CREATE INDEX catalog_import_created_by_idx
    ON document.catalog_import (tenant_id, created_by);
CREATE INDEX catalog_import_line_reviewed_by_idx
    ON document.catalog_import_line (tenant_id, reviewed_by)
    WHERE reviewed_by IS NOT NULL;
CREATE INDEX catalog_import_line_created_by_idx
    ON document.catalog_import_line (tenant_id, created_by);

CREATE INDEX punchout_cart_created_by_idx
    ON document.punchout_cart (tenant_id, created_by);
CREATE INDEX punchout_cart_line_matched_by_idx
    ON document.punchout_cart_line (tenant_id, matched_by)
    WHERE matched_by IS NOT NULL;
CREATE INDEX punchout_cart_line_created_by_idx
    ON document.punchout_cart_line (tenant_id, created_by);

CREATE INDEX production_order_created_by_idx
    ON document.production_order (tenant_id, created_by);
CREATE INDEX production_order_component_created_by_idx
    ON document.production_order_component (tenant_id, created_by);

CREATE INDEX sales_order_customer_fk_idx
    ON document.sales_order (tenant_id, customer_id);
CREATE INDEX sales_order_created_by_idx
    ON document.sales_order (tenant_id, created_by);
CREATE INDEX sales_order_line_created_by_idx
    ON document.sales_order_line (tenant_id, created_by);

CREATE INDEX stocktake_open_idx
    ON document.stocktake (tenant_id, warehouse_id, stocktake_date, status)
    WHERE status IN ('planned', 'in_progress');
CREATE INDEX stocktake_variance_journal_idx
    ON document.stocktake (tenant_id, variance_journal_entry_id)
    WHERE variance_journal_entry_id IS NOT NULL;
CREATE INDEX stocktake_company_site_idx
    ON document.stocktake (tenant_id, company_code_id, site_id);
CREATE INDEX stocktake_site_warehouse_idx
    ON document.stocktake (tenant_id, site_id, warehouse_id);
CREATE INDEX stocktake_completed_by_idx
    ON document.stocktake (tenant_id, completed_by)
    WHERE completed_by IS NOT NULL;
CREATE INDEX stocktake_line_item_idx
    ON document.stocktake_line (tenant_id, item_id, stocktake_id);
CREATE INDEX stocktake_line_uncounted_idx
    ON document.stocktake_line (tenant_id, stocktake_id, line_no)
    WHERE counted_quantity IS NULL;
CREATE INDEX stocktake_line_movement_idx
    ON document.stocktake_line (tenant_id, posted_inventory_movement_id)
    WHERE posted_inventory_movement_id IS NOT NULL;
CREATE INDEX stocktake_line_counted_by_idx
    ON document.stocktake_line (tenant_id, counted_by)
    WHERE counted_by IS NOT NULL;

CREATE INDEX sales_opportunity_org_status_idx
    ON document.sales_opportunity (tenant_id, operating_organization_id, status, expected_close_date);
CREATE INDEX sales_opportunity_customer_idx
    ON document.sales_opportunity (tenant_id, customer_id, status);
CREATE INDEX sales_opportunity_principal_company_idx
    ON document.sales_opportunity (tenant_id, principal_seller_company_id)
    WHERE principal_seller_company_id IS NOT NULL;
CREATE INDEX sales_opportunity_requested_by_idx
    ON document.sales_opportunity (tenant_id, requested_by)
    WHERE requested_by IS NOT NULL;
CREATE UNIQUE INDEX sales_opportunity_one_lead_idx
    ON document.sales_opportunity_company (tenant_id, opportunity_id)
    WHERE participation_role = 'lead_seller' AND status = 'active';
CREATE INDEX sales_opportunity_company_company_idx
    ON document.sales_opportunity_company (tenant_id, company_code_id, status);

CREATE INDEX sales_quotation_opportunity_idx
    ON document.sales_quotation (tenant_id, opportunity_id)
    WHERE opportunity_id IS NOT NULL;
CREATE INDEX sales_quotation_org_status_idx
    ON document.sales_quotation (tenant_id, operating_organization_id, status, valid_until);
CREATE INDEX sales_quotation_customer_idx
    ON document.sales_quotation (tenant_id, customer_id, status);
CREATE INDEX sales_quotation_principal_company_idx
    ON document.sales_quotation (tenant_id, principal_seller_company_id)
    WHERE principal_seller_company_id IS NOT NULL;
CREATE INDEX sales_quotation_requested_by_idx
    ON document.sales_quotation (tenant_id, requested_by)
    WHERE requested_by IS NOT NULL;
CREATE UNIQUE INDEX sales_quotation_one_lead_idx
    ON document.sales_quotation_company (tenant_id, quotation_id)
    WHERE participation_role = 'lead_seller' AND status = 'active';
CREATE INDEX sales_quotation_company_company_idx
    ON document.sales_quotation_company (tenant_id, company_code_id, status);
CREATE INDEX sales_quotation_allocation_company_idx
    ON document.sales_quotation_allocation (tenant_id, company_code_id, status);
CREATE INDEX sales_quotation_allocation_order_idx
    ON document.sales_quotation_allocation (tenant_id, output_sales_order_id)
    WHERE output_sales_order_id IS NOT NULL;
CREATE UNIQUE INDEX sales_order_quotation_company_uq
    ON document.sales_order (tenant_id, quotation_id, company_code_id)
    WHERE quotation_id IS NOT NULL;
CREATE INDEX sales_order_ic_fulfillment_order_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, sales_order_id, status);
CREATE INDEX sales_order_ic_fulfillment_company_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, fulfillment_company_code_id, status);
CREATE INDEX sales_order_ic_fulfillment_selling_company_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, selling_company_code_id, status);

CREATE UNIQUE INDEX bank_statement_source_hash_uq
    ON document.bank_statement (tenant_id, bank_account_id, source_hash)
    WHERE source_hash IS NOT NULL;
CREATE INDEX bank_statement_account_period_idx
    ON document.bank_statement (tenant_id, bank_account_id, period_end_date DESC, status);
CREATE INDEX bank_statement_company_status_idx
    ON document.bank_statement (tenant_id, company_code_id, status, period_end_date DESC);
CREATE INDEX bank_statement_signed_by_idx
    ON document.bank_statement (tenant_id, signed_off_by) WHERE signed_off_by IS NOT NULL;
CREATE INDEX bank_statement_line_date_amount_idx
    ON document.bank_statement_line (tenant_id, bank_statement_id, transaction_date, amount);
CREATE INDEX bank_statement_line_unmatched_idx
    ON document.bank_statement_line (tenant_id, bank_statement_id, transaction_date)
    WHERE recon_status IN ('unmatched', 'partially_matched', 'exception');

CREATE INDEX bank_recon_case_account_status_idx
    ON document.bank_recon_case (tenant_id, bank_account_id, status, created_at DESC);
CREATE INDEX bank_recon_case_company_status_idx
    ON document.bank_recon_case (tenant_id, company_code_id, status, created_at DESC);
CREATE INDEX bank_recon_case_journal_idx
    ON document.bank_recon_case (tenant_id, sign_off_journal_entry_id)
    WHERE sign_off_journal_entry_id IS NOT NULL;
CREATE INDEX bank_recon_case_line_case_idx
    ON document.bank_recon_case_line (tenant_id, bank_recon_case_id, side);
CREATE INDEX bank_recon_case_line_payment_idx
    ON document.bank_recon_case_line (tenant_id, payment_entry_id)
    WHERE payment_entry_id IS NOT NULL;
CREATE INDEX bank_recon_case_line_statement_idx
    ON document.bank_recon_case_line (tenant_id, bank_statement_line_id)
    WHERE bank_statement_line_id IS NOT NULL;

CREATE INDEX depreciation_run_period_status_idx
    ON document.depreciation_run (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, status);
CREATE INDEX depreciation_run_book_fk_idx
    ON document.depreciation_run (tenant_id, ledger_book_id);
CREATE INDEX depreciation_run_period_fk_idx
    ON document.depreciation_run (tenant_id, fiscal_period_id);
CREATE INDEX depreciation_run_reversal_idx
    ON document.depreciation_run (tenant_id, reversal_of_run_id)
    WHERE reversal_of_run_id IS NOT NULL;
CREATE INDEX depreciation_run_journal_idx
    ON document.depreciation_run (tenant_id, reference_journal_entry_id)
    WHERE reference_journal_entry_id IS NOT NULL;
CREATE INDEX depreciation_run_line_run_status_idx
    ON document.depreciation_run_line (tenant_id, run_id, status);
CREATE INDEX depreciation_run_line_asset_idx
    ON document.depreciation_run_line (tenant_id, asset_id, asset_book_id);
CREATE INDEX depreciation_run_line_book_fk_idx
    ON document.depreciation_run_line (tenant_id, asset_book_id);
CREATE INDEX depreciation_run_line_schedule_idx
    ON document.depreciation_run_line (tenant_id, depreciation_schedule_id)
    WHERE depreciation_schedule_id IS NOT NULL;
CREATE INDEX depreciation_run_line_reversal_idx
    ON document.depreciation_run_line (tenant_id, reversal_of_line_id)
    WHERE reversal_of_line_id IS NOT NULL;
CREATE INDEX depreciation_schedule_asset_period_idx
    ON document.depreciation_schedule (tenant_id, asset_id, fiscal_period_id);
CREATE INDEX depreciation_schedule_period_status_idx
    ON document.depreciation_schedule (tenant_id, fiscal_period_id, status);
CREATE INDEX depreciation_schedule_actual_line_idx
    ON document.depreciation_schedule (tenant_id, actual_run_line_id)
    WHERE actual_run_line_id IS NOT NULL;

CREATE INDEX sourcing_event_org_status_idx ON document.sourcing_event(tenant_id,operating_organization_id,status,close_at);
CREATE INDEX sourcing_event_central_company_idx ON document.sourcing_event(tenant_id,central_buyer_company_id) WHERE central_buyer_company_id IS NOT NULL;
CREATE INDEX sourcing_event_requested_by_idx ON document.sourcing_event(tenant_id,requested_by);
CREATE UNIQUE INDEX sourcing_event_one_lead_idx ON document.sourcing_event_company(tenant_id,sourcing_event_id)
    WHERE participation_role='lead_buyer' AND status='active';
CREATE INDEX sourcing_event_company_company_idx ON document.sourcing_event_company(tenant_id,company_code_id,status);
CREATE INDEX sourcing_event_demand_company_idx ON document.sourcing_event_demand(tenant_id,demand_company_code_id,status);
CREATE INDEX sourcing_event_demand_source_idx ON document.sourcing_event_demand(tenant_id,purchase_requisition_line_id,status);
CREATE INDEX sourcing_event_award_event_status_idx ON document.sourcing_event_award(tenant_id,sourcing_event_id,status);
CREATE INDEX sourcing_event_award_supplier_idx ON document.sourcing_event_award(tenant_id,supplier_id,status);
CREATE INDEX sourcing_event_award_allocation_demand_idx ON document.sourcing_event_award_allocation(tenant_id,sourcing_event_demand_id,status);
CREATE INDEX sourcing_event_award_allocation_company_idx ON document.sourcing_event_award_allocation(tenant_id,company_code_id,status);
CREATE INDEX sourcing_event_award_allocation_commitment_idx ON document.sourcing_event_award_allocation(tenant_id,output_commitment_id) WHERE output_commitment_id IS NOT NULL;
CREATE INDEX sourcing_event_ic_source_idx ON document.sourcing_event_intercompany_allocation(tenant_id,source_company_code_id,status);
CREATE INDEX sourcing_event_ic_beneficiary_idx ON document.sourcing_event_intercompany_allocation(tenant_id,beneficiary_company_code_id,status);
CREATE INDEX sourcing_event_ic_commitment_idx ON document.sourcing_event_intercompany_allocation(tenant_id,commitment_id);
CREATE INDEX sourcing_event_ic_journal_idx ON document.sourcing_event_intercompany_allocation(tenant_id,posting_journal_entry_id) WHERE posting_journal_entry_id IS NOT NULL;

CREATE INDEX shift_assignment_employee_date_idx ON document.shift_assignment(tenant_id,employee_id,work_date DESC);
CREATE INDEX shift_assignment_type_idx ON document.shift_assignment(tenant_id,shift_type_id,work_date DESC);
CREATE INDEX time_punch_employee_time_idx ON document.time_punch(tenant_id,employee_id,punch_at DESC);
CREATE INDEX time_punch_shift_idx ON document.time_punch(tenant_id,shift_assignment_id,punch_at) WHERE shift_assignment_id IS NOT NULL;
CREATE INDEX attendance_day_shift_idx ON document.attendance_day(tenant_id,shift_assignment_id) WHERE shift_assignment_id IS NOT NULL;
CREATE INDEX attendance_adjustment_employee_idx ON document.attendance_adjustment_request(tenant_id,employee_id,status);
CREATE INDEX attendance_adjustment_day_idx ON document.attendance_adjustment_request(tenant_id,attendance_day_id) WHERE attendance_day_id IS NOT NULL;
CREATE INDEX attendance_adjustment_workflow_idx ON document.attendance_adjustment_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX compensation_change_employee_idx ON document.compensation_change(tenant_id,employee_id,effective_date DESC);
CREATE INDEX compensation_change_current_idx ON document.compensation_change(tenant_id,current_assignment_id) WHERE current_assignment_id IS NOT NULL;
CREATE INDEX compensation_change_workflow_idx ON document.compensation_change(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX employee_tax_declaration_employee_idx ON document.employee_tax_declaration(tenant_id,employee_id,tax_year DESC);
CREATE INDEX employee_tax_declaration_workflow_idx ON document.employee_tax_declaration(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE UNIQUE INDEX employee_tax_declaration_one_approved_idx ON document.employee_tax_declaration(tenant_id,employee_id,employment_id,country_code,tax_year) WHERE status='approved';
CREATE INDEX leave_request_employee_idx ON document.leave_request(tenant_id,employee_id,start_date DESC,status);
CREATE INDEX leave_request_workflow_idx ON document.leave_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX leave_balance_employee_idx ON document.leave_balance_entry(tenant_id,employee_id,leave_type_id,entry_date DESC);
CREATE INDEX leave_balance_source_idx ON document.leave_balance_entry(tenant_id,source_entity_type,source_entity_id) WHERE source_entity_id IS NOT NULL;
CREATE INDEX people_request_employee_idx ON document.people_request(tenant_id,employee_id,status);
CREATE INDEX people_request_workflow_idx ON document.people_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX workforce_request_queue_idx ON document.workforce_request(tenant_id,status,created_at,id);
CREATE INDEX workforce_request_person_idx ON document.workforce_request(tenant_id,target_person_id,status) WHERE target_person_id IS NOT NULL;
CREATE INDEX workforce_request_employment_idx ON document.workforce_request(tenant_id,target_employment_id,status) WHERE target_employment_id IS NOT NULL;
CREATE INDEX workforce_request_scope_idx ON document.workforce_request(tenant_id,legal_entity_id,company_code_id,org_unit_id,status);
CREATE INDEX workforce_request_workflow_idx ON document.workforce_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX workforce_request_validation_request_idx ON document.workforce_request_validation(tenant_id,request_id,evaluated_at DESC,evaluation_id);
CREATE UNIQUE INDEX workforce_request_open_target_kind_uq
    ON document.workforce_request(tenant_id,target_person_id,request_kind)
    WHERE target_person_id IS NOT NULL
      AND status IN ('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed');
CREATE INDEX hr_case_employee_idx ON document.hr_case(tenant_id,employee_id,status) WHERE employee_id IS NOT NULL;
CREATE INDEX hr_case_assignee_idx ON document.hr_case(tenant_id,assigned_to,status) WHERE assigned_to IS NOT NULL;
CREATE INDEX onboarding_case_person_idx ON document.onboarding_case(tenant_id,person_id,status);
CREATE INDEX onboarding_case_employee_idx ON document.onboarding_case(tenant_id,employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX offboarding_case_employee_idx ON document.offboarding_case(tenant_id,employee_id,status);
CREATE INDEX payroll_period_group_date_idx ON document.payroll_period(tenant_id,pay_group_id,period_start DESC);
CREATE INDEX payroll_run_period_status_idx ON document.payroll_run(tenant_id,payroll_period_id,status);
CREATE INDEX payroll_run_reversal_idx ON document.payroll_run(tenant_id,reversal_of_run_id) WHERE reversal_of_run_id IS NOT NULL;
CREATE INDEX payroll_run_employee_employee_idx ON document.payroll_run_employee(tenant_id,employee_id,payroll_run_id);
CREATE INDEX payroll_run_employee_compensation_idx ON document.payroll_run_employee(tenant_id,compensation_assignment_id);
CREATE INDEX payroll_result_run_idx ON document.payroll_result(tenant_id,payroll_run_id,status);
CREATE INDEX payroll_result_line_component_idx ON document.payroll_result_line(tenant_id,pay_component_id);
CREATE INDEX payroll_result_line_cost_center_idx ON document.payroll_result_line(tenant_id,cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX payroll_result_line_project_idx ON document.payroll_result_line(tenant_id,project_id) WHERE project_id IS NOT NULL;
CREATE INDEX policy_acknowledgment_employee_idx
    ON document.policy_acknowledgment(tenant_id,employee_id,acknowledged_at DESC);
CREATE INDEX policy_acknowledgment_policy_idx
    ON document.policy_acknowledgment(tenant_id,policy_definition_id,policy_version_snapshot);
CREATE INDEX policy_acknowledgment_actor_idx
    ON document.policy_acknowledgment(tenant_id,acknowledged_by,acknowledged_at DESC);
CREATE INDEX policy_acknowledgment_correlation_idx
    ON document.policy_acknowledgment(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX project_task_wbs_idx
    ON document.project_task (tenant_id, project_id, project_wbs_id);
CREATE INDEX project_task_assignee_principal_idx
    ON document.project_task (tenant_id, assignee_principal_id)
    WHERE assignee_principal_id IS NOT NULL;
CREATE INDEX project_task_assignee_team_idx
    ON document.project_task (tenant_id, assignee_team_id)
    WHERE assignee_team_id IS NOT NULL;
CREATE INDEX project_task_status_idx
    ON document.project_task (tenant_id, project_id, status);
CREATE INDEX project_task_created_by_idx
    ON document.project_task (tenant_id, created_by);

CREATE INDEX project_task_requirement_task_idx
    ON document.project_task_requirement (tenant_id, project_id, project_task_id);
CREATE INDEX project_task_requirement_item_idx
    ON document.project_task_requirement (tenant_id, project_id, project_item_id);
CREATE INDEX project_task_requirement_status_idx
    ON document.project_task_requirement (tenant_id, project_task_id, status);
CREATE INDEX project_task_requirement_created_by_idx
    ON document.project_task_requirement (tenant_id, created_by);

CREATE INDEX budget_profile_project_idx
    ON document.budget_profile (tenant_id, company_code_id, project_id);
CREATE INDEX budget_profile_company_idx
    ON document.budget_profile (tenant_id, company_code_id);
CREATE INDEX budget_profile_book_idx
    ON document.budget_profile (tenant_id, ledger_book_id);
CREATE INDEX budget_profile_status_idx
    ON document.budget_profile (tenant_id, project_id, status);
CREATE INDEX budget_profile_supersedes_idx
    ON document.budget_profile (tenant_id, project_id, supersedes_profile_id)
    WHERE supersedes_profile_id IS NOT NULL;
CREATE INDEX budget_profile_approved_by_idx
    ON document.budget_profile (tenant_id, approved_by)
    WHERE approved_by IS NOT NULL;
CREATE INDEX budget_profile_created_by_idx
    ON document.budget_profile (tenant_id, created_by);

CREATE INDEX budget_allocation_profile_idx
    ON document.budget_allocation (tenant_id, project_id, budget_profile_id);
CREATE INDEX budget_allocation_wbs_idx
    ON document.budget_allocation (tenant_id, project_id, project_wbs_id);
CREATE INDEX budget_allocation_status_idx
    ON document.budget_allocation (tenant_id, budget_profile_id, status);
CREATE INDEX budget_allocation_created_by_idx
    ON document.budget_allocation (tenant_id, created_by);

CREATE INDEX planning_scenario_status_idx
    ON document.planning_scenario (tenant_id, planning_model_id, status, version_no DESC);

CREATE INDEX planning_scenario_based_on_idx
    ON document.planning_scenario (tenant_id, planning_model_id, based_on_scenario_id)
    WHERE based_on_scenario_id IS NOT NULL;

CREATE INDEX planning_scenario_line_period_idx
    ON document.planning_scenario_line (
        tenant_id, planning_scenario_id, fiscal_year, period_number
    );

CREATE INDEX planning_scenario_line_driver_idx
    ON document.planning_scenario_line (tenant_id, planning_driver_id)
    WHERE planning_driver_id IS NOT NULL;

CREATE INDEX planning_scenario_line_account_idx
    ON document.planning_scenario_line (tenant_id, gl_account_id, fiscal_year, period_number)
    WHERE gl_account_id IS NOT NULL;

CREATE INDEX asset_transaction_asset_book_idx ON document.asset_transaction(tenant_id,asset_id,asset_book_id);
CREATE INDEX asset_transaction_company_period_idx ON document.asset_transaction(tenant_id,company_code_id,fiscal_year,period_number);
CREATE INDEX asset_transaction_journal_idx ON document.asset_transaction(tenant_id,reference_je_id) WHERE reference_je_id IS NOT NULL;
CREATE INDEX asset_transaction_run_idx ON document.asset_transaction(tenant_id,depreciation_run_id) WHERE depreciation_run_id IS NOT NULL;
CREATE INDEX asset_transaction_type_idx ON document.asset_transaction(tenant_id,company_code_id,txn_type);

CREATE UNIQUE INDEX fx_revaluation_run_idempotency_uq ON document.fx_revaluation_run(tenant_id,company_code_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX fx_revaluation_run_period_idx ON document.fx_revaluation_run(tenant_id,company_code_id,fiscal_year,period_number);
CREATE INDEX fx_revaluation_run_status_idx ON document.fx_revaluation_run(tenant_id,status,revaluation_date DESC);

CREATE INDEX intercompany_agreement_pair_idx ON document.intercompany_agreement(tenant_id,source_company_code_id,dest_company_code_id,agreement_type) WHERE status='active';
CREATE INDEX intercompany_agreement_supersedes_idx ON document.intercompany_agreement(tenant_id,supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX intercompany_transaction_pair_period_idx ON document.intercompany_transaction(tenant_id,source_company_code_id,dest_company_code_id,fiscal_year,period_number);
CREATE INDEX intercompany_transaction_agreement_idx ON document.intercompany_transaction(tenant_id,agreement_id) WHERE agreement_id IS NOT NULL;
CREATE INDEX intercompany_transaction_match_idx ON document.intercompany_transaction(tenant_id,match_status) WHERE match_status IN ('UNMATCHED','DISPUTED');
CREATE INDEX intercompany_transaction_netting_idx ON document.intercompany_transaction(tenant_id,netting_batch_id) WHERE netting_batch_id IS NOT NULL;

CREATE INDEX ic_elimination_pair_period_idx ON document.ic_elimination(tenant_id,source_company_code_id,counterparty_company_code_id,fiscal_year,period_number);
CREATE INDEX ic_elimination_group_idx ON document.ic_elimination(tenant_id,consolidation_group,fiscal_year,period_number);
CREATE INDEX ic_elimination_approval_idx ON document.ic_elimination(tenant_id,approval_route,status) WHERE status='calculated' AND approval_route IN ('ENHANCED','MANUAL');

CREATE INDEX match_exception_case_idx ON document.match_exception(tenant_id,invoice_match_case_id);
CREATE INDEX match_exception_open_line_idx ON document.match_exception(tenant_id,invoice_line_id) WHERE status='open';
CREATE INDEX match_exception_workflow_idx ON document.match_exception(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE UNIQUE INDEX netting_batch_idempotency_uq ON document.netting_batch(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX netting_batch_pair_period_idx ON document.netting_batch(tenant_id,company_code_a_id,company_code_b_id,fiscal_year,period_number);
CREATE INDEX netting_batch_status_idx ON document.netting_batch(tenant_id,status,batch_date DESC);

CREATE UNIQUE INDEX obligation_horizon_scope_uq ON document.obligation_horizon(tenant_id,commitment_id,coalesce(schedule_id,'00000000-0000-0000-0000-000000000000'::uuid),fiscal_year);
CREATE INDEX obligation_horizon_company_year_idx ON document.obligation_horizon(tenant_id,company_code_id,fiscal_year);
CREATE INDEX obligation_horizon_active_tier_idx ON document.obligation_horizon(tenant_id,fiscal_year,obligation_tier) WHERE is_active;

CREATE INDEX payment_remittance_output_payment_idx ON document.payment_remittance_output(tenant_id,payment_entry_id);
CREATE INDEX payment_remittance_output_delivery_idx ON document.payment_remittance_output(tenant_id,delivery_status) WHERE delivery_status IN ('pending','failed','bounced');
CREATE INDEX payment_remittance_output_render_idx ON document.payment_remittance_output(tenant_id,render_output_id) WHERE render_output_id IS NOT NULL;

CREATE UNIQUE INDEX payment_term_discount_result_application_uq ON document.payment_term_discount_result(tenant_id,payment_id,invoice_id,coalesce(qualified_tier_no,0)) WHERE NOT is_reversal;
CREATE INDEX payment_term_discount_result_invoice_idx ON document.payment_term_discount_result(tenant_id,invoice_id,created_at DESC);
CREATE INDEX payment_term_discount_result_reverses_idx ON document.payment_term_discount_result(tenant_id,reverses_id) WHERE reverses_id IS NOT NULL;

CREATE INDEX wht_certificate_active_period_idx ON document.wht_certificate(tenant_id,company_code_id,period_from,period_to) WHERE status<>'voided';
CREATE INDEX wht_certificate_counterparty_idx ON document.wht_certificate(tenant_id,company_code_id,counterparty_id);
CREATE INDEX wht_certificate_source_gin ON document.wht_certificate USING gin(source_transaction_ids);

CREATE INDEX import_request_submitter_idx ON document.import_request(tenant_id,submitted_by,created_at DESC);
CREATE INDEX import_request_status_idx ON document.import_request(tenant_id,status,created_at DESC);
CREATE INDEX import_request_entity_idx ON document.import_request(tenant_id,entity_name,created_at DESC);
CREATE INDEX import_request_chunk_claim_idx ON document.import_request_chunk(tenant_id,status,created_at)
    WHERE status IN ('pending','queued','failed');
CREATE INDEX import_request_chunk_request_idx ON document.import_request_chunk(tenant_id,import_request_id,chunk_index);
CREATE INDEX import_request_chunk_job_idx ON document.import_request_chunk(job_id) WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX render_output_active_dedup_uq ON document.render_output(tenant_id,entity_name,entity_id,operation,variant,locale,input_payload_hash)
    WHERE status IN ('QUEUED','RENDERING') AND input_payload_hash IS NOT NULL;
CREATE INDEX render_output_queue_idx ON document.render_output(tenant_id,status,created_at) WHERE status IN ('QUEUED','RENDERING');
CREATE INDEX render_output_entity_idx ON document.render_output(tenant_id,entity_name,entity_id,created_at DESC);
CREATE INDEX render_output_retry_idx ON document.render_output(tenant_id,last_attempt_at)
    WHERE status IN ('QUEUED','RENDERING','FAILED');
CREATE INDEX render_output_failure_idx ON document.render_output(tenant_id,failure_category,last_attempt_at DESC)
    WHERE status='FAILED';
CREATE INDEX render_output_trace_idx ON document.render_output(trace_id) WHERE trace_id IS NOT NULL;

CREATE UNIQUE INDEX user_profile_update_request_one_active_uq ON document.user_profile_update_request(tenant_id,principal_id) WHERE is_active;
CREATE INDEX user_profile_update_request_status_idx ON document.user_profile_update_request(tenant_id,status,created_at DESC);
CREATE INDEX user_profile_update_request_workflow_idx ON document.user_profile_update_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX user_profile_update_request_scope_gin ON document.user_profile_update_request USING gin(request_scope);
CREATE UNIQUE INDEX attachment_generated_idempotency_uq ON document.attachment (tenant_id, (metadata->>'idempotency_key')) WHERE kind='generated_document' AND metadata ? 'idempotency_key';

-- attachment_series indexes
CREATE INDEX attachment_series_status_idx
    ON document.attachment_series (tenant_id, status, updated_at DESC)
    WHERE status IN ('active', 'expired', 'purge_requested');
CREATE INDEX attachment_series_expiry_idx
    ON document.attachment_series (expires_at)
    WHERE is_auto_delete_on_expiry AND status NOT IN ('purged', 'deleted');
CREATE INDEX attachment_series_retention_idx
    ON document.attachment_series (retention_until)
    WHERE status IN ('expired', 'deleted', 'purge_requested') AND retention_until IS NOT NULL;

-- attachment: series_id lookup
CREATE INDEX attachment_series_id_idx
    ON document.attachment (tenant_id, series_id)
    WHERE series_id IS NOT NULL;

-- attachment_link: series lookup
CREATE INDEX attachment_link_series_idx
    ON document.attachment_link (tenant_id, attachment_series_id);

-- attachment_legal_hold indexes
CREATE INDEX attachment_legal_hold_series_active_idx
    ON document.attachment_legal_hold (tenant_id, attachment_series_id)
    WHERE released_at IS NULL;
CREATE INDEX attachment_legal_hold_code_idx
    ON document.attachment_legal_hold (tenant_id, hold_code)
    WHERE hold_code IS NOT NULL AND released_at IS NULL;

-- attachment_legal_hold_event indexes
CREATE INDEX attachment_legal_hold_event_hold_idx
    ON document.attachment_legal_hold_event (tenant_id, legal_hold_id, occurred_at DESC);
CREATE INDEX attachment_legal_hold_event_series_idx
    ON document.attachment_legal_hold_event (tenant_id, attachment_series_id, occurred_at DESC);

-- attachment_derivative indexes
CREATE INDEX attachment_derivative_attachment_status_idx
    ON document.attachment_derivative (tenant_id, attachment_id, status, rendition_code);
CREATE INDEX attachment_derivative_ready_idx
    ON document.attachment_derivative (tenant_id, attachment_id, derivative_type, rendition_code)
    WHERE status = 'ready';
CREATE INDEX attachment_derivative_pending_idx
    ON document.attachment_derivative (created_at)
    WHERE status IN ('pending', 'failed') AND attempt_count < 5;

-- multipart_upload_part indexes
CREATE INDEX multipart_upload_part_upload_idx
    ON document.multipart_upload_part (tenant_id, multipart_upload_id, part_number);

-- multipart_upload: series lookup
CREATE INDEX multipart_upload_series_idx
    ON document.multipart_upload (tenant_id, attachment_series_id)
    WHERE attachment_series_id IS NOT NULL;

CREATE INDEX business_partner_invitation_status_idx ON document.business_partner_invitation(tenant_id,status,expires_at);
CREATE INDEX business_partner_invitation_journey_scope_idx ON document.business_partner_invitation(tenant_id,journey_kind,scope_kind,created_at DESC);
CREATE UNIQUE INDEX business_partner_invitation_request_uq ON document.business_partner_invitation(tenant_id,business_partner_request_id) WHERE business_partner_request_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_invitation_entity_case_uq ON document.business_partner_invitation(tenant_id,entity_case_id) WHERE entity_case_id IS NOT NULL;

CREATE INDEX business_partner_request_status_idx
    ON document.business_partner_request (tenant_id, status, created_at DESC);
CREATE INDEX business_partner_request_target_idx
    ON document.business_partner_request (tenant_id, target_business_partner_id, created_at DESC)
    WHERE target_business_partner_id IS NOT NULL;
CREATE INDEX business_partner_request_materialized_partner_idx
    ON document.business_partner_request (tenant_id, materialized_business_partner_id, created_at DESC, id DESC)
    WHERE materialized_business_partner_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_open_role_extension_uq
    ON document.business_partner_request (tenant_id, target_business_partner_id, requested_role)
    WHERE request_kind IN ('add_supplier', 'add_customer', 'add_workforce')
      AND status IN ('draft', 'validating', 'validation_failed', 'pending_approval', 'returned', 'approved', 'applying', 'failed');
CREATE UNIQUE INDEX business_partner_request_open_org_assignment_uq
    ON document.business_partner_request
       (tenant_id, target_business_partner_id, requested_role, operating_organization_id)
    WHERE request_kind = 'assign_organization'
      AND status IN ('draft', 'validating', 'validation_failed', 'pending_approval', 'returned', 'approved', 'applying', 'failed');
CREATE UNIQUE INDEX business_partner_request_open_company_configuration_uq
    ON document.business_partner_request
       (tenant_id, target_business_partner_id, requested_role, operating_organization_id, company_code_id)
    WHERE request_kind = 'configure_company'
      AND status IN ('draft', 'validating', 'validation_failed', 'pending_approval', 'returned', 'approved', 'applying', 'failed');
CREATE INDEX business_partner_request_workflow_idx
    ON document.business_partner_request (tenant_id, workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_invitation_uq
    ON document.business_partner_request (tenant_id, invitation_id)
    WHERE invitation_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_application_key_uq
    ON document.business_partner_request (tenant_id, application_idempotency_key)
    WHERE application_idempotency_key IS NOT NULL;
CREATE INDEX business_partner_request_org_idx
    ON document.business_partner_request (tenant_id, operating_organization_id, status, created_at DESC)
    WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_request_company_idx
    ON document.business_partner_request (tenant_id, company_code_id, status, created_at DESC)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_request_source_idx
    ON document.business_partner_request
       (tenant_id, source_system_code, source_entity_code, source_entity_id, source_version DESC)
    WHERE source_system_code IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_one_open_source_version_uq
    ON document.business_partner_request
       (tenant_id, source_system_code, source_entity_code, source_entity_id, source_version, request_kind)
    WHERE source_system_code IS NOT NULL
      AND status NOT IN ('rejected', 'cancelled', 'superseded', 'applied');
CREATE INDEX business_partner_request_evidence_request_idx
    ON document.business_partner_request_evidence (tenant_id, request_id, created_at);
CREATE INDEX business_partner_request_validation_request_idx
    ON document.business_partner_request_validation
       (tenant_id, request_id, evaluation_id, severity, outcome);
CREATE INDEX business_partner_request_address_request_idx
    ON document.business_partner_request_address (tenant_id, request_id);
CREATE INDEX business_partner_request_contact_person_request_idx
    ON document.business_partner_request_contact_person (tenant_id, request_id);
CREATE INDEX business_partner_request_contact_channel_request_idx
    ON document.business_partner_request_contact_channel (tenant_id, request_id);
CREATE INDEX business_partner_request_identifier_request_idx
    ON document.business_partner_request_identifier (tenant_id, request_id);
CREATE INDEX business_partner_request_tax_registration_request_idx
    ON document.business_partner_request_tax_registration (tenant_id, request_id);
CREATE INDEX business_partner_request_classification_request_idx
    ON document.business_partner_request_classification (tenant_id, request_id);
CREATE INDEX business_partner_request_certification_request_idx
    ON document.business_partner_request_certification (tenant_id, request_id);
CREATE INDEX business_partner_request_materialization_item_request_idx
    ON document.business_partner_request_materialization_item (tenant_id, request_id);
CREATE INDEX mesh_business_partner_match_snapshot_idx ON document.mesh_business_partner_match (tenant_id, snapshot_id, created_at DESC);
CREATE INDEX mesh_business_partner_match_org_idx ON document.mesh_business_partner_match (tenant_id, operating_organization_id, created_at DESC);
CREATE INDEX mesh_business_partner_match_candidate_idx ON document.mesh_business_partner_match (tenant_id, candidate_business_partner_id, created_at DESC) WHERE candidate_business_partner_id IS NOT NULL;
CREATE INDEX mesh_business_partner_acceptance_match_idx ON document.mesh_business_partner_acceptance (tenant_id, match_id, created_at DESC);
CREATE UNIQUE INDEX mesh_business_partner_acceptance_event_request_global_uq ON document.mesh_business_partner_acceptance_event (tenant_id, business_partner_request_id) WHERE business_partner_request_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_bank_verification_open_uq ON document.business_partner_bank_verification(tenant_id,bank_projection_id,supplier_company_profile_id) WHERE status IN('pending_verification','verified');
CREATE INDEX business_partner_bank_verification_profile_idx ON document.business_partner_bank_verification(tenant_id,supplier_company_profile_id,status,created_at DESC);
CREATE INDEX business_partner_bank_verification_partner_idx ON document.business_partner_bank_verification(tenant_id,business_partner_id,company_code_id,status,created_at DESC);
CREATE INDEX supplier_activation_evidence_partner_idx ON document.supplier_activation_evidence(tenant_id,business_partner_id,activated_at DESC);
CREATE INDEX workforce_requisition_status_idx ON document.workforce_requisition (tenant_id, company_code_id, status, expected_start_date);
CREATE INDEX workforce_requisition_supplier_supplier_idx ON document.workforce_requisition_supplier (tenant_id, supplier_id, status, response_due_at);
CREATE INDEX external_candidate_submission_review_idx ON document.external_candidate_submission (tenant_id, workforce_requisition_id, status, submitted_at);
CREATE INDEX external_candidate_submission_person_idx ON document.external_candidate_submission (tenant_id, person_id) WHERE person_id IS NOT NULL;
CREATE INDEX contingent_work_order_status_idx ON document.contingent_work_order (tenant_id, company_code_id, supplier_id, status);
CREATE INDEX contingent_work_order_revision_effective_idx ON document.contingent_work_order_revision (tenant_id, work_order_id, status, start_date, end_date);
CREATE UNIQUE INDEX contingent_work_order_revision_one_effective_uq ON document.contingent_work_order_revision (tenant_id, work_order_id) WHERE status = 'effective';
CREATE INDEX statement_of_work_status_idx ON document.statement_of_work (tenant_id, company_code_id, supplier_id, status);
CREATE INDEX statement_of_work_revision_effective_idx ON document.statement_of_work_revision (tenant_id, statement_of_work_id, status, start_date, end_date);
CREATE UNIQUE INDEX statement_of_work_revision_one_effective_uq ON document.statement_of_work_revision (tenant_id, statement_of_work_id) WHERE status = 'effective';
CREATE INDEX worker_engagement_worker_idx ON document.worker_engagement (tenant_id, external_worker_id, status, start_date, end_date);
CREATE INDEX worker_engagement_supplier_idx ON document.worker_engagement (tenant_id, supplier_id, company_code_id, status);
CREATE INDEX worker_operational_placement_effective_idx ON document.worker_operational_placement (tenant_id, worker_engagement_id, effective_from, effective_until) WHERE status = 'active';
CREATE UNIQUE INDEX worker_operational_placement_primary_open_uq ON document.worker_operational_placement (tenant_id, worker_engagement_id) WHERE is_primary AND effective_until IS NULL AND status = 'active';
CREATE INDEX worker_compliance_item_readiness_idx ON document.worker_compliance_item (tenant_id, worker_engagement_id, required_before, decision, valid_until);
CREATE INDEX external_time_sheet_approval_idx ON document.external_time_sheet (tenant_id, status, period_end, worker_engagement_id);
CREATE INDEX external_time_sheet_source_inbox_idx ON document.external_time_sheet (tenant_id, source_inbox_id) WHERE source_inbox_id IS NOT NULL;
CREATE INDEX external_expense_sheet_approval_idx ON document.external_expense_sheet (tenant_id, status, period_end, worker_engagement_id);
CREATE INDEX external_expense_sheet_source_inbox_idx ON document.external_expense_sheet (tenant_id, source_inbox_id) WHERE source_inbox_id IS NOT NULL;
CREATE INDEX external_service_entry_approval_idx ON document.external_service_entry (tenant_id, company_code_id, supplier_id, status, service_period_end);
CREATE INDEX external_workforce_invoice_allocation_source_idx ON document.external_workforce_invoice_allocation (tenant_id, service_entry_line_id, allocation_kind);
CREATE INDEX service_sheet_source_allocation_line_idx ON document.service_sheet_source_allocation (tenant_id, service_sheet_line_id, allocation_kind);
CREATE INDEX service_sheet_source_allocation_time_idx ON document.service_sheet_source_allocation (tenant_id, external_time_sheet_id, allocation_kind) WHERE external_time_sheet_id IS NOT NULL;
CREATE INDEX service_sheet_source_allocation_expense_idx ON document.service_sheet_source_allocation (tenant_id, external_expense_sheet_id, allocation_kind) WHERE external_expense_sheet_id IS NOT NULL;
CREATE INDEX service_sheet_source_allocation_sow_idx ON document.service_sheet_source_allocation (tenant_id, statement_of_work_item_id, allocation_kind) WHERE statement_of_work_item_id IS NOT NULL;
CREATE UNIQUE INDEX service_sheet_source_allocation_reversal_once_uq ON document.service_sheet_source_allocation (tenant_id, reverses_allocation_id) WHERE reverses_allocation_id IS NOT NULL;
