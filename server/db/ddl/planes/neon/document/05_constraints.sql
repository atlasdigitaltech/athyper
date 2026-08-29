ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_parent_fk
    FOREIGN KEY (tenant_id, parent_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_uploaded_by_fk
    FOREIGN KEY (tenant_id, uploaded_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_quota_usage ADD CONSTRAINT attachment_quota_usage_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_usage ADD CONSTRAINT attachment_quota_usage_created_by_fk FOREIGN KEY (tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_attachment_fk FOREIGN KEY (tenant_id,resource_id) REFERENCES document.attachment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_created_by_fk FOREIGN KEY (tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES document.attachment_folder (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_folder_fk
    FOREIGN KEY (tenant_id, folder_id)
    REFERENCES document.attachment_folder (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment
    ADD CONSTRAINT comment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_parent_fk
    FOREIGN KEY (tenant_id, parent_comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_commenter_fk
    FOREIGN KEY (tenant_id, commenter_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_deleted_by_fk
    FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_archived_by_fk
    FOREIGN KEY (tenant_id, archived_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_parent_fk
    FOREIGN KEY (tenant_id, parent_comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_comment_fk
    FOREIGN KEY (tenant_id, comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_principal_fk
    FOREIGN KEY (tenant_id, mentioned_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_comment_fk
    FOREIGN KEY (tenant_id, comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_source_fk
    FOREIGN KEY (tenant_id, source_content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_target_fk
    FOREIGN KEY (tenant_id, target_content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_deleted_by_fk
    FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES document.conversation (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_left_by_fk
    FOREIGN KEY (tenant_id, left_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_initiated_by_fk
    FOREIGN KEY (tenant_id, initiated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_item_fk
    FOREIGN KEY (tenant_id, content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_current_version_fk
    FOREIGN KEY (tenant_id, current_version_id)
    REFERENCES snapshot.content_item_version (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_item_fk FOREIGN KEY(tenant_id,content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.content_quota_usage ADD CONSTRAINT content_quota_usage_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE document.content_quota_reservation ADD CONSTRAINT content_quota_reservation_item_fk FOREIGN KEY(tenant_id,content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE CASCADE;

ALTER TABLE document.workflow_request
    ADD CONSTRAINT workflow_request_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT workflow_request_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_request_decided_by_fk FOREIGN KEY (tenant_id, decided_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_request_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_request_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_request_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.workflow_stage
    ADD CONSTRAINT workflow_stage_request_fk FOREIGN KEY (tenant_id, workflow_request_id)
        REFERENCES document.workflow_request(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT workflow_stage_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_stage_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT workflow_stage_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.commitment
    ADD CONSTRAINT commitment_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT commitment_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT commitment_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT commitment_parent_fk FOREIGN KEY (tenant_id, parent_commitment_id)
        REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT commitment_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id)
        REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT commitment_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_payment_term_fk FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id),
    ADD CONSTRAINT commitment_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT commitment_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.commitment_line
    ADD CONSTRAINT commitment_line_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT commitment_line_commitment_fk FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT commitment_line_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT commitment_line_commodity_fk FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT commitment_line_intent_fk FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT commitment_line_asset_class_fk FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT commitment_line_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT commitment_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_line_tax_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT commitment_line_wht_group_fk FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT commitment_line_to_jurisdiction_fk FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT commitment_line_from_jurisdiction_fk FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT commitment_line_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT commitment_line_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT commitment_line_ship_to_fk FOREIGN KEY (tenant_id, ship_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT commitment_line_bill_to_fk FOREIGN KEY (tenant_id, bill_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT commitment_line_bill_from_fk FOREIGN KEY (tenant_id, bill_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT commitment_line_ship_from_fk FOREIGN KEY (tenant_id, ship_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT commitment_line_remit_to_fk FOREIGN KEY (tenant_id, remit_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT commitment_line_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.commitment_release_allocation
    ADD CONSTRAINT commitment_release_parent_fk FOREIGN KEY (tenant_id, parent_commitment_id)
        REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT commitment_release_parent_line_fk FOREIGN KEY (tenant_id, parent_line_id)
        REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT commitment_release_header_fk FOREIGN KEY (tenant_id, release_commitment_id)
        REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT commitment_release_line_fk FOREIGN KEY (tenant_id, release_line_id)
        REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT commitment_release_reversal_fk FOREIGN KEY (tenant_id, reverses_allocation_id)
        REFERENCES document.commitment_release_allocation(tenant_id, id),
    ADD CONSTRAINT commitment_release_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_release_released_by_fk FOREIGN KEY (tenant_id, released_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commitment_release_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.purchase_invoice
    ADD CONSTRAINT purchase_invoice_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT purchase_invoice_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT purchase_invoice_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT purchase_invoice_payment_term_fk FOREIGN KEY (tenant_id, payment_term_id) REFERENCES master.payment_term(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.purchase_invoice_line
    ADD CONSTRAINT purchase_invoice_line_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_invoice_fk FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT purchase_invoice_line_commitment_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_commodity_fk FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_intent_fk FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_asset_class_fk FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT purchase_invoice_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT purchase_invoice_line_tax_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_wht_group_fk FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_to_jurisdiction_fk FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_from_jurisdiction_fk FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT purchase_invoice_line_ship_to_fk FOREIGN KEY (tenant_id, ship_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_bill_to_fk FOREIGN KEY (tenant_id, bill_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_bill_from_fk FOREIGN KEY (tenant_id, bill_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_ship_from_fk FOREIGN KEY (tenant_id, ship_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_remit_to_fk FOREIGN KEY (tenant_id, remit_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT purchase_invoice_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.invoice_match_case
    ADD CONSTRAINT invoice_match_case_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT invoice_match_case_invoice_fk FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT invoice_match_case_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT invoice_match_case_matched_by_fk FOREIGN KEY (tenant_id, matched_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT invoice_match_case_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT invoice_match_case_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT invoice_match_case_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.accounting_distribution
    ADD CONSTRAINT accounting_distribution_gl_fk FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_dimension_fk FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_budget_fk FOREIGN KEY (tenant_id, budget_allocation_id) REFERENCES document.budget_allocation(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT accounting_distribution_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_distribution_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.payment_term_application
    ADD CONSTRAINT payment_term_application_invoice_fk FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice(tenant_id, id),
    ADD CONSTRAINT payment_term_application_line_fk FOREIGN KEY (tenant_id, purchase_invoice_line_id)
        REFERENCES document.purchase_invoice_line(tenant_id, id),
    ADD CONSTRAINT payment_term_application_commitment_fk FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT payment_term_application_term_fk FOREIGN KEY (tenant_id, payment_term_id)
        REFERENCES master.payment_term(tenant_id, id),
    ADD CONSTRAINT payment_term_application_clause_fk FOREIGN KEY (tenant_id, payment_term_clause_id)
        REFERENCES master.payment_term_clause(tenant_id, id),
    ADD CONSTRAINT payment_term_application_requested_by_fk FOREIGN KEY (tenant_id, override_requested_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_term_application_decided_by_fk FOREIGN KEY (tenant_id, override_decided_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_term_application_reversal_fk FOREIGN KEY (tenant_id, reverses_application_id)
        REFERENCES document.payment_term_application(tenant_id, id),
    ADD CONSTRAINT payment_term_application_supersedes_fk FOREIGN KEY (tenant_id, supersedes_application_id)
        REFERENCES document.payment_term_application(tenant_id, id),
    ADD CONSTRAINT payment_term_application_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_term_application_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.payment_entry
    ADD CONSTRAINT payment_entry_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT payment_entry_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT payment_entry_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT payment_entry_bank_account_fk FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account(tenant_id, id),
    ADD CONSTRAINT payment_entry_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT payment_entry_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT payment_entry_bank_currency_fk FOREIGN KEY (bank_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT payment_entry_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT payment_entry_reversal_fk FOREIGN KEY (tenant_id, reversal_of_payment_id) REFERENCES document.payment_entry(tenant_id, id),
    ADD CONSTRAINT payment_entry_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id),
    ADD CONSTRAINT payment_entry_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_entry_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_entry_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_entry_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_entry_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.payment_entry_allocation
    ADD CONSTRAINT payment_entry_allocation_payment_fk FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry(tenant_id, id),
    ADD CONSTRAINT payment_entry_allocation_invoice_fk FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice(tenant_id, id),
    ADD CONSTRAINT payment_entry_allocation_commitment_fk FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT payment_entry_allocation_term_fk FOREIGN KEY (tenant_id, payment_term_application_id)
        REFERENCES document.payment_term_application(tenant_id, id),
    ADD CONSTRAINT payment_entry_allocation_reversal_fk FOREIGN KEY (tenant_id, reverses_allocation_id)
        REFERENCES document.payment_entry_allocation(tenant_id, id),
    ADD CONSTRAINT payment_entry_allocation_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT payment_entry_allocation_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT payment_entry_allocation_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.journal_entry
    ADD CONSTRAINT journal_entry_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT journal_entry_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT journal_entry_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT journal_entry_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT journal_entry_transaction_currency_fk FOREIGN KEY (transaction_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT journal_entry_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT journal_entry_reversal_fk FOREIGN KEY (tenant_id, reversal_of_journal_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT journal_entry_derived_fk FOREIGN KEY (tenant_id, derived_from_journal_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT journal_entry_original_period_fk FOREIGN KEY (tenant_id, original_fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT journal_entry_policy_fk FOREIGN KEY (tenant_id, accounting_profile_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id),
    ADD CONSTRAINT journal_entry_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT journal_entry_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT journal_entry_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT journal_entry_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.journal_line
    ADD CONSTRAINT journal_line_entry_fk FOREIGN KEY (tenant_id, journal_entry_id)
        REFERENCES document.journal_entry(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT journal_line_account_fk FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT journal_line_transaction_currency_fk FOREIGN KEY (transaction_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT journal_line_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT journal_line_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT journal_line_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT journal_line_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT journal_line_dimension_fk FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id),
    ADD CONSTRAINT journal_line_partner_fk FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id),
    ADD CONSTRAINT journal_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.journal_line_reference
    ADD CONSTRAINT journal_line_reference_line_fk FOREIGN KEY (tenant_id, journal_line_id)
        REFERENCES document.journal_line(tenant_id, id),
    ADD CONSTRAINT journal_line_reference_distribution_fk FOREIGN KEY (tenant_id, accounting_distribution_id)
        REFERENCES document.accounting_distribution(tenant_id, id),
    ADD CONSTRAINT journal_line_reference_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT journal_line_reference_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

-- Journal links from earlier-created operational documents are added after the
-- journal tables exist, avoiding circular table-order dependencies.
ALTER TABLE document.commitment
    ADD CONSTRAINT commitment_encumbrance_journal_fk
        FOREIGN KEY (tenant_id, encumbrance_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id);
ALTER TABLE document.purchase_invoice
    ADD CONSTRAINT purchase_invoice_journal_fk
        FOREIGN KEY (tenant_id, ap_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id);
ALTER TABLE document.payment_entry
    ADD CONSTRAINT payment_entry_journal_fk
        FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id);

ALTER TABLE document.purchase_requisition
    ADD CONSTRAINT pr_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT pr_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT pr_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pr_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pr_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pr_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pr_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT pr_journal_fk FOREIGN KEY (tenant_id, encumbrance_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT pr_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id),
    ADD CONSTRAINT pr_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pr_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pr_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pr_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.purchase_requisition_line
    ADD CONSTRAINT prl_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT prl_header_fk FOREIGN KEY (tenant_id, purchase_requisition_id) REFERENCES document.purchase_requisition(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT prl_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT prl_commodity_fk FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT prl_intent_fk FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT prl_asset_class_fk FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT prl_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT prl_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT prl_tax_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT prl_wht_group_fk FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT prl_to_jurisdiction_fk FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT prl_from_jurisdiction_fk FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT prl_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT prl_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT prl_suggested_supplier_fk FOREIGN KEY (tenant_id, suggested_supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT prl_ship_to_fk FOREIGN KEY (tenant_id, ship_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT prl_bill_to_fk FOREIGN KEY (tenant_id, bill_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT prl_bill_from_fk FOREIGN KEY (tenant_id, bill_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT prl_ship_from_fk FOREIGN KEY (tenant_id, ship_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT prl_remit_to_fk FOREIGN KEY (tenant_id, remit_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT prl_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT prl_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT prl_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.purchase_order_confirmation
    ADD CONSTRAINT poc_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT poc_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT poc_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT poc_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT poc_amendment_fk FOREIGN KEY (tenant_id, amendment_commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT poc_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT poc_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT poc_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT poc_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.purchase_order_confirmation_line
    ADD CONSTRAINT pocl_header_fk FOREIGN KEY (tenant_id, confirmation_id) REFERENCES document.purchase_order_confirmation(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT pocl_commitment_line_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT pocl_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.delivery_note
    ADD CONSTRAINT dn_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT dn_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT dn_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT dn_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT dn_site_fk FOREIGN KEY (tenant_id, delivery_site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT dn_warehouse_fk FOREIGN KEY (tenant_id, delivery_site_id, delivery_warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT dn_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT dn_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dn_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dn_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.delivery_note_line
    ADD CONSTRAINT dnl_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT dnl_header_fk FOREIGN KEY (tenant_id, delivery_note_id) REFERENCES document.delivery_note(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT dnl_commitment_line_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT dnl_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT dnl_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT dnl_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dnl_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.receipt
    ADD CONSTRAINT receipt_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT receipt_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT receipt_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT receipt_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT receipt_delivery_note_fk FOREIGN KEY (tenant_id, delivery_note_id) REFERENCES document.delivery_note(tenant_id, id),
    ADD CONSTRAINT receipt_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT receipt_site_fk FOREIGN KEY (tenant_id, receiving_site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT receipt_warehouse_fk FOREIGN KEY (tenant_id, receiving_site_id, receiving_warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT receipt_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT receipt_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT receipt_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT receipt_journal_fk FOREIGN KEY (tenant_id, accrual_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT receipt_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id),
    ADD CONSTRAINT receipt_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT receipt_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT receipt_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT receipt_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.receipt_line
    ADD CONSTRAINT receipt_line_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT receipt_line_header_fk FOREIGN KEY (tenant_id, receipt_id) REFERENCES document.receipt(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT receipt_line_commitment_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT receipt_line_delivery_fk FOREIGN KEY (tenant_id, delivery_note_line_id) REFERENCES document.delivery_note_line(tenant_id, id),
    ADD CONSTRAINT receipt_line_schedule_fk FOREIGN KEY (tenant_id, source_schedule_id) REFERENCES document.schedule_line(tenant_id, id),
    ADD CONSTRAINT receipt_line_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT receipt_line_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT receipt_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT receipt_line_tax_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT receipt_line_wht_group_fk FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT receipt_line_to_jur_fk FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT receipt_line_from_jur_fk FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT receipt_line_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT receipt_line_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT receipt_line_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT receipt_line_ship_to_fk FOREIGN KEY (tenant_id, ship_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT receipt_line_bill_to_fk FOREIGN KEY (tenant_id, bill_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT receipt_line_bill_from_fk FOREIGN KEY (tenant_id, bill_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT receipt_line_ship_from_fk FOREIGN KEY (tenant_id, ship_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT receipt_line_remit_to_fk FOREIGN KEY (tenant_id, remit_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT receipt_line_asset_class_fk FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT receipt_line_movement_fk FOREIGN KEY (tenant_id, inventory_movement_id) REFERENCES ledger.inventory_movement(tenant_id, id),
    ADD CONSTRAINT receipt_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT receipt_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.service_sheet
    ADD CONSTRAINT service_sheet_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT service_sheet_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT service_sheet_requested_by_fk FOREIGN KEY (tenant_id, requested_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT service_sheet_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT service_sheet_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT service_sheet_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT service_sheet_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT service_sheet_journal_fk FOREIGN KEY (tenant_id, accrual_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT service_sheet_accepted_by_fk FOREIGN KEY (tenant_id, accepted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id),
    ADD CONSTRAINT service_sheet_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.service_sheet_line
    ADD CONSTRAINT service_sheet_line_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_header_fk FOREIGN KEY (tenant_id, service_sheet_id) REFERENCES document.service_sheet(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT service_sheet_line_commitment_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_schedule_fk FOREIGN KEY (tenant_id, source_schedule_id) REFERENCES document.schedule_line(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT service_sheet_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT service_sheet_line_tax_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_wht_group_fk FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_to_jur_fk FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_from_jur_fk FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id) REFERENCES master.warehouse(tenant_id, site_id, id),
    ADD CONSTRAINT service_sheet_line_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_ship_to_fk FOREIGN KEY (tenant_id, ship_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_bill_to_fk FOREIGN KEY (tenant_id, bill_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_bill_from_fk FOREIGN KEY (tenant_id, bill_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_ship_from_fk FOREIGN KEY (tenant_id, ship_from_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_remit_to_fk FOREIGN KEY (tenant_id, remit_to_address_id) REFERENCES master.address(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT service_sheet_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.pricing_component
    ADD CONSTRAINT pricing_component_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT pricing_component_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT pricing_component_condition_type_fk
        FOREIGN KEY (tenant_id, condition_type_id) REFERENCES master.condition_type(tenant_id, id),
    ADD CONSTRAINT pricing_component_tax_group_fk
        FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT pricing_component_apportioned_from_fk
        FOREIGN KEY (tenant_id, is_apportioned_from_id) REFERENCES document.pricing_component(tenant_id, id),
    ADD CONSTRAINT pricing_component_superseded_by_fk
        FOREIGN KEY (tenant_id, superseded_by_id) REFERENCES document.pricing_component(tenant_id, id),
    ADD CONSTRAINT pricing_component_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pricing_component_base_currency_fk
        FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pricing_component_superseded_by_user_fk
        FOREIGN KEY (tenant_id, superseded_by_user) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pricing_component_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pricing_component_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.schedule_line
    ADD CONSTRAINT schedule_line_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT schedule_line_previous_fk
        FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.schedule_line(tenant_id, id),
    ADD CONSTRAINT schedule_line_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT schedule_line_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT schedule_line_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_supplier_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_published_by_fk
    FOREIGN KEY (tenant_id, published_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_import_fk
    FOREIGN KEY (tenant_id, catalog_import_id)
    REFERENCES document.catalog_import (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_normalized_uom_fk
    FOREIGN KEY (normalized_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_proposed_item_fk
    FOREIGN KEY (tenant_id, proposed_item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_published_item_fk
    FOREIGN KEY (tenant_id, published_catalog_item_id)
    REFERENCES master.catalog_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_supplier_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_cart_fk
    FOREIGN KEY (tenant_id, punchout_cart_id)
    REFERENCES document.punchout_cart (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_matched_by_fk
    FOREIGN KEY (tenant_id, matched_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_output_item_fk
    FOREIGN KEY (tenant_id, company_code_id, output_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_bom_snapshot_fk
    FOREIGN KEY (tenant_id, bom_snapshot_id)
    REFERENCES snapshot.bom (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_site_fk
    FOREIGN KEY (tenant_id, assembly_site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_order_fk
    FOREIGN KEY (tenant_id, production_order_id)
    REFERENCES document.production_order (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_snapshot_fk
    FOREIGN KEY (tenant_id, bom_component_snapshot_id)
    REFERENCES snapshot.bom_component (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_item_fk
    FOREIGN KEY (tenant_id, component_item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_order_fk
    FOREIGN KEY (tenant_id, sales_order_id)
    REFERENCES document.sales_order (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.stocktake
    ADD CONSTRAINT stocktake_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_company_site_fk FOREIGN KEY (tenant_id, company_code_id, site_id)
        REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_site_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id)
        REFERENCES master.warehouse (tenant_id, site_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_variance_journal_fk FOREIGN KEY (tenant_id, variance_journal_entry_id)
        REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_completed_by_fk FOREIGN KEY (tenant_id, completed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.stocktake_line
    ADD CONSTRAINT stocktake_line_header_fk FOREIGN KEY (tenant_id, stocktake_id)
        REFERENCES document.stocktake (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT stocktake_line_item_fk FOREIGN KEY (tenant_id, item_id)
        REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_uom_fk FOREIGN KEY (uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_counted_by_fk FOREIGN KEY (tenant_id, counted_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_movement_fk FOREIGN KEY (tenant_id, posted_inventory_movement_id)
        REFERENCES ledger.inventory_movement (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_opportunity
    ADD CONSTRAINT sales_opportunity_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_customer_fk FOREIGN KEY (tenant_id, customer_id)
        REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_org_fk FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_principal_company_fk FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_requested_by_fk FOREIGN KEY (tenant_id, requested_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_opportunity_company
    ADD CONSTRAINT sales_opportunity_company_parent_fk FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_opportunity_company_company_fk FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation
    ADD CONSTRAINT sales_quotation_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_opportunity_fk FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_customer_fk FOREIGN KEY (tenant_id, customer_id)
        REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_org_fk FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_principal_company_fk FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_requested_by_fk FOREIGN KEY (tenant_id, requested_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation_company
    ADD CONSTRAINT sales_quotation_company_parent_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_quotation_company_company_fk FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation_allocation
    ADD CONSTRAINT sales_quotation_allocation_parent_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_quotation_allocation_member_fk FOREIGN KEY (tenant_id, quotation_id, company_code_id)
        REFERENCES document.sales_quotation_company (tenant_id, quotation_id, company_code_id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_order_fk FOREIGN KEY (tenant_id, output_sales_order_id)
        REFERENCES document.sales_order (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_quotation_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order_intercompany_fulfillment
    ADD CONSTRAINT sales_order_ic_fulfillment_order_fk FOREIGN KEY (tenant_id, sales_order_id)
        REFERENCES document.sales_order (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_order_ic_fulfillment_selling_company_fk FOREIGN KEY (tenant_id, selling_company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_company_fk FOREIGN KEY (tenant_id, fulfillment_company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_statement
    ADD CONSTRAINT bank_statement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_account_fk FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_signed_by_fk FOREIGN KEY (tenant_id, signed_off_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_statement_line
    ADD CONSTRAINT bank_statement_line_header_fk FOREIGN KEY (tenant_id, bank_statement_id) REFERENCES document.bank_statement (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT bank_statement_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_recon_case
    ADD CONSTRAINT bank_recon_case_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_account_fk FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_journal_fk FOREIGN KEY (tenant_id, sign_off_journal_entry_id) REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_signed_by_fk FOREIGN KEY (tenant_id, signed_off_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_voided_by_fk FOREIGN KEY (tenant_id, voided_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_recon_case_line
    ADD CONSTRAINT bank_recon_case_line_case_fk FOREIGN KEY (tenant_id, bank_recon_case_id) REFERENCES document.bank_recon_case (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT bank_recon_case_line_payment_fk FOREIGN KEY (tenant_id, payment_entry_id) REFERENCES document.payment_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_line_statement_fk FOREIGN KEY (tenant_id, bank_statement_line_id) REFERENCES document.bank_statement_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_run
    ADD CONSTRAINT depreciation_run_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_reversal_fk FOREIGN KEY (tenant_id, reversal_of_run_id) REFERENCES document.depreciation_run (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_journal_fk FOREIGN KEY (tenant_id, reference_journal_entry_id) REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_started_by_fk FOREIGN KEY (tenant_id, started_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_completed_by_fk FOREIGN KEY (tenant_id, completed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_run_line
    ADD CONSTRAINT depreciation_run_line_run_fk FOREIGN KEY (tenant_id, run_id) REFERENCES document.depreciation_run (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT depreciation_run_line_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_book_fk FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_schedule_fk FOREIGN KEY (tenant_id, depreciation_schedule_id) REFERENCES document.depreciation_schedule (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_reversal_fk FOREIGN KEY (tenant_id, reversal_of_line_id) REFERENCES document.depreciation_run_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_book_fk FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_actual_line_fk FOREIGN KEY (tenant_id, actual_run_line_id) REFERENCES document.depreciation_run_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event
    ADD CONSTRAINT sourcing_event_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_central_company_fk FOREIGN KEY(tenant_id,central_buyer_company_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_currency_fk FOREIGN KEY(evaluation_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_requested_by_fk FOREIGN KEY(tenant_id,requested_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_published_by_fk FOREIGN KEY(tenant_id,published_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_awarded_by_fk FOREIGN KEY(tenant_id,awarded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_closed_by_fk FOREIGN KEY(tenant_id,closed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event_company
    ADD CONSTRAINT sourcing_event_company_event_fk FOREIGN KEY(tenant_id,sourcing_event_id) REFERENCES document.sourcing_event(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT sourcing_event_company_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_company_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_company_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_company_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event_demand
    ADD CONSTRAINT sourcing_event_demand_event_fk FOREIGN KEY(tenant_id,sourcing_event_id) REFERENCES document.sourcing_event(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT sourcing_event_demand_line_fk FOREIGN KEY(tenant_id,purchase_requisition_line_id) REFERENCES document.purchase_requisition_line(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_company_fk FOREIGN KEY(tenant_id,demand_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_uom_fk FOREIGN KEY(uom_code) REFERENCES shared.uom(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_source_currency_fk FOREIGN KEY(source_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_evaluation_currency_fk FOREIGN KEY(evaluation_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_demand_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event_award
    ADD CONSTRAINT sourcing_event_award_event_fk FOREIGN KEY(tenant_id,sourcing_event_id) REFERENCES document.sourcing_event(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT sourcing_event_award_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES master.supplier(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_converted_by_fk FOREIGN KEY(tenant_id,converted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event_award_allocation
    ADD CONSTRAINT sourcing_event_award_allocation_award_fk FOREIGN KEY(tenant_id,award_id) REFERENCES document.sourcing_event_award(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT sourcing_event_award_allocation_demand_fk FOREIGN KEY(tenant_id,sourcing_event_demand_id) REFERENCES document.sourcing_event_demand(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_uom_fk FOREIGN KEY(uom_code) REFERENCES shared.uom(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_commitment_fk FOREIGN KEY(tenant_id,output_commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_award_allocation_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.sourcing_event_intercompany_allocation
    ADD CONSTRAINT sourcing_event_ic_award_allocation_fk FOREIGN KEY(tenant_id,award_allocation_id) REFERENCES document.sourcing_event_award_allocation(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT sourcing_event_ic_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_beneficiary_company_fk FOREIGN KEY(tenant_id,beneficiary_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_commitment_fk FOREIGN KEY(tenant_id,commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_journal_fk FOREIGN KEY(tenant_id,posting_journal_entry_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT sourcing_event_ic_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT',v_table);
        EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='document' AND table_name=v_table AND column_name='updated_by') THEN
            EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        END IF;
        IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='document' AND table_name=v_table AND column_name='status_changed_by') THEN
            EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE document.shift_assignment
    ADD CONSTRAINT shift_assignment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT shift_assignment_shift_type_fk FOREIGN KEY(tenant_id,shift_type_id) REFERENCES master.shift_type(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.time_punch
    ADD CONSTRAINT time_punch_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT time_punch_shift_fk FOREIGN KEY(tenant_id,shift_assignment_id) REFERENCES document.shift_assignment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attendance_day
    ADD CONSTRAINT attendance_day_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_day_shift_fk FOREIGN KEY(tenant_id,shift_assignment_id) REFERENCES document.shift_assignment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attendance_adjustment_request
    ADD CONSTRAINT attendance_adjustment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_day_fk FOREIGN KEY(tenant_id,attendance_day_id) REFERENCES document.attendance_day(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.compensation_change
    ADD CONSTRAINT compensation_change_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_current_assignment_fk FOREIGN KEY(tenant_id,current_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_approved_assignment_fk FOREIGN KEY(tenant_id,approved_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_pay_group_fk FOREIGN KEY(tenant_id,proposed_pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_pay_structure_fk FOREIGN KEY(tenant_id,proposed_pay_structure_id) REFERENCES master.pay_structure(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_currency_fk FOREIGN KEY(proposed_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.employee_tax_declaration
    ADD CONSTRAINT employee_tax_declaration_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_country_fk FOREIGN KEY(country_code) REFERENCES shared.country(code) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.employee_tax_declaration_line
    ADD CONSTRAINT employee_tax_declaration_line_parent_fk FOREIGN KEY(tenant_id,employee_tax_declaration_id) REFERENCES document.employee_tax_declaration(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE document.leave_request
    ADD CONSTRAINT leave_request_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_type_fk FOREIGN KEY(tenant_id,leave_type_id) REFERENCES master.leave_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_plan_fk FOREIGN KEY(tenant_id,leave_plan_id) REFERENCES master.leave_plan(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.leave_balance_entry
    ADD CONSTRAINT leave_balance_entry_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_balance_entry_type_fk FOREIGN KEY(tenant_id,leave_type_id) REFERENCES master.leave_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_balance_entry_plan_fk FOREIGN KEY(tenant_id,leave_plan_id) REFERENCES master.leave_plan(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.people_request
    ADD CONSTRAINT people_request_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.hr_case
    ADD CONSTRAINT hr_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_case_assigned_to_fk FOREIGN KEY(tenant_id,assigned_to) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.onboarding_case
    ADD CONSTRAINT onboarding_case_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT onboarding_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT onboarding_case_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.offboarding_case
    ADD CONSTRAINT offboarding_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT offboarding_case_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_period
    ADD CONSTRAINT payroll_period_pay_group_fk FOREIGN KEY(tenant_id,pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_run
    ADD CONSTRAINT payroll_run_period_fk FOREIGN KEY(tenant_id,payroll_period_id) REFERENCES document.payroll_period(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_journal_fk FOREIGN KEY(tenant_id,posted_journal_entry_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_reversal_of_fk FOREIGN KEY(tenant_id,reversal_of_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_posted_by_fk FOREIGN KEY(tenant_id,posted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_run_employee
    ADD CONSTRAINT payroll_run_employee_run_fk FOREIGN KEY(tenant_id,payroll_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT payroll_run_employee_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_employee_compensation_fk FOREIGN KEY(tenant_id,compensation_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.policy_acknowledgment
    ADD CONSTRAINT policy_acknowledgment_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_policy_fk FOREIGN KEY(policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_actor_fk FOREIGN KEY(tenant_id,acknowledged_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_result
    ADD CONSTRAINT payroll_result_run_fk FOREIGN KEY(tenant_id,payroll_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_run_employee_fk FOREIGN KEY(tenant_id,payroll_run_employee_id) REFERENCES document.payroll_run_employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;
ALTER TABLE document.payroll_result_line
    ADD CONSTRAINT payroll_result_line_result_fk FOREIGN KEY(tenant_id,payroll_result_id) REFERENCES document.payroll_result(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT payroll_result_line_component_fk FOREIGN KEY(tenant_id,pay_component_id) REFERENCES master.pay_component(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_formula_fk FOREIGN KEY(tenant_id,formula_expression_version_id) REFERENCES control.formula_expression_version(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.project_task
    ADD CONSTRAINT project_task_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_task_wbs_fk FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_assignee_principal_fk FOREIGN KEY (tenant_id, assignee_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_assignee_team_fk FOREIGN KEY (tenant_id, assignee_team_id)
    REFERENCES master.team (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.project_task_requirement
    ADD CONSTRAINT project_task_requirement_task_fk
    FOREIGN KEY (tenant_id, project_id, project_task_id)
    REFERENCES document.project_task (tenant_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_task_requirement_item_fk
    FOREIGN KEY (tenant_id, project_id, project_item_id)
    REFERENCES master.project_item (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_requirement_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_requirement_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.budget_profile
    ADD CONSTRAINT budget_profile_project_fk FOREIGN KEY (tenant_id, company_code_id, project_id)
    REFERENCES master.project (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_supersedes_fk FOREIGN KEY (tenant_id, project_id, supersedes_profile_id)
    REFERENCES document.budget_profile (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_approved_by_fk FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.budget_allocation
    ADD CONSTRAINT budget_allocation_profile_fk
    FOREIGN KEY (tenant_id, project_id, budget_profile_id)
    REFERENCES document.budget_profile (tenant_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT budget_allocation_wbs_fk
    FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_allocation_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.planning_scenario
    ADD CONSTRAINT planning_scenario_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT planning_scenario_model_fk
        FOREIGN KEY (tenant_id, planning_model_id)
        REFERENCES control.planning_model(tenant_id, id),
    ADD CONSTRAINT planning_scenario_based_on_fk
        FOREIGN KEY (tenant_id, planning_model_id, based_on_scenario_id)
        REFERENCES document.planning_scenario(tenant_id, planning_model_id, id),
    ADD CONSTRAINT planning_scenario_approved_by_fk
        FOREIGN KEY (tenant_id, approved_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.planning_scenario_line
    ADD CONSTRAINT planning_scenario_line_scenario_fk
        FOREIGN KEY (tenant_id, planning_model_id, planning_scenario_id)
        REFERENCES document.planning_scenario(tenant_id, planning_model_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT planning_scenario_line_driver_fk
        FOREIGN KEY (tenant_id, planning_model_id, planning_driver_id)
        REFERENCES control.planning_driver(tenant_id, planning_model_id, id),
    ADD CONSTRAINT planning_scenario_line_gl_fk
        FOREIGN KEY (tenant_id, gl_account_id)
        REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_cost_center_fk
        FOREIGN KEY (tenant_id, cost_center_id)
        REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_profit_center_fk
        FOREIGN KEY (tenant_id, profit_center_id)
        REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_project_fk
        FOREIGN KEY (tenant_id, project_id)
        REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_wbs_fk
        FOREIGN KEY (tenant_id, project_id, project_wbs_id)
        REFERENCES master.project_wbs(tenant_id, project_id, id),
    ADD CONSTRAINT planning_scenario_line_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT planning_scenario_line_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id);

-- Tenant boundary and referential integrity for operational documents.

ALTER TABLE document.asset_transaction
    ADD CONSTRAINT asset_transaction_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_asset_fk FOREIGN KEY(tenant_id,asset_id) REFERENCES master.asset(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_asset_book_fk FOREIGN KEY(tenant_id,asset_book_id) REFERENCES master.asset_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_journal_fk FOREIGN KEY(tenant_id,reference_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_run_fk FOREIGN KEY(tenant_id,depreciation_run_id) REFERENCES document.depreciation_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_run_line_fk FOREIGN KEY(tenant_id,depreciation_run_line_id) REFERENCES document.depreciation_run_line(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_reversal_fk FOREIGN KEY(tenant_id,reversal_of_id) REFERENCES document.asset_transaction(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.fx_revaluation_run
    ADD CONSTRAINT fx_revaluation_run_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_book_fk FOREIGN KEY(tenant_id,book_id) REFERENCES master.ledger_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_currency_fk FOREIGN KEY(functional_currency) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_journal_fk FOREIGN KEY(tenant_id,revaluation_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_reversal_journal_fk FOREIGN KEY(tenant_id,reversal_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.intercompany_agreement
    ADD CONSTRAINT intercompany_agreement_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_dest_company_fk FOREIGN KEY(tenant_id,dest_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_base_currency_fk FOREIGN KEY(base_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_supersedes_fk FOREIGN KEY(tenant_id,supersedes_id) REFERENCES document.intercompany_agreement(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_dimension_fk FOREIGN KEY(tenant_id,dimension_set_id) REFERENCES master.dimension_set(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_owner_fk FOREIGN KEY(tenant_id,agreement_owner_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.netting_batch
    ADD CONSTRAINT netting_batch_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_a_fk FOREIGN KEY(tenant_id,company_code_a_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_b_fk FOREIGN KEY(tenant_id,company_code_b_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_journal_fk FOREIGN KEY(tenant_id,settlement_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.intercompany_transaction
    ADD CONSTRAINT intercompany_transaction_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dest_company_fk FOREIGN KEY(tenant_id,dest_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_base_currency_fk FOREIGN KEY(base_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_agreement_fk FOREIGN KEY(tenant_id,agreement_id) REFERENCES document.intercompany_agreement(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_source_journal_fk FOREIGN KEY(tenant_id,source_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dest_journal_fk FOREIGN KEY(tenant_id,dest_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_mirror_fk FOREIGN KEY(tenant_id,mirror_txn_id) REFERENCES document.intercompany_transaction(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_netting_fk FOREIGN KEY(tenant_id,netting_batch_id) REFERENCES document.netting_batch(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dimension_fk FOREIGN KEY(tenant_id,dimension_set_id) REFERENCES master.dimension_set(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.ic_elimination
    ADD CONSTRAINT ic_elimination_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_counterparty_company_fk FOREIGN KEY(tenant_id,counterparty_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_book_fk FOREIGN KEY(tenant_id,book_id) REFERENCES master.ledger_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_functional_currency_fk FOREIGN KEY(functional_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_transaction_fk FOREIGN KEY(tenant_id,ic_transaction_id) REFERENCES document.intercompany_transaction(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_journal_fk FOREIGN KEY(tenant_id,je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_reversal_journal_fk FOREIGN KEY(tenant_id,reversal_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.match_exception
    ADD CONSTRAINT match_exception_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT match_exception_case_fk FOREIGN KEY(tenant_id,invoice_match_case_id) REFERENCES document.invoice_match_case(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT match_exception_line_fk FOREIGN KEY(tenant_id,invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT match_exception_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT match_exception_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.obligation_horizon
    ADD CONSTRAINT obligation_horizon_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_commitment_fk FOREIGN KEY(tenant_id,commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_schedule_fk FOREIGN KEY(tenant_id,schedule_id) REFERENCES document.schedule_line(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_intent_fk FOREIGN KEY(tenant_id,intent_id) REFERENCES master.business_intent(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_contract_currency_fk FOREIGN KEY(contract_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE document.render_output
    ADD CONSTRAINT render_output_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_template_fk FOREIGN KEY(tenant_id,template_version_id) REFERENCES snapshot.template_version(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_letterhead_fk FOREIGN KEY(tenant_id,letterhead_id) REFERENCES master.letterhead(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_brand_fk FOREIGN KEY(tenant_id,brand_profile_id) REFERENCES master.brand_profile(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_replaces_fk FOREIGN KEY(tenant_id,replaces_output_id) REFERENCES document.render_output(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.import_request_chunk
    ADD CONSTRAINT import_request_chunk_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_request_fk FOREIGN KEY(tenant_id,import_request_id) REFERENCES document.import_request(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT import_request_chunk_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.payment_remittance_output
    ADD CONSTRAINT payment_remittance_output_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_payment_fk FOREIGN KEY(tenant_id,payment_entry_id) REFERENCES document.payment_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES master.supplier(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_render_fk FOREIGN KEY(tenant_id,render_output_id) REFERENCES document.render_output(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.payment_term_discount_result
    ADD CONSTRAINT payment_term_discount_result_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_payment_fk FOREIGN KEY(tenant_id,payment_id) REFERENCES document.payment_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_invoice_fk FOREIGN KEY(tenant_id,invoice_id) REFERENCES document.purchase_invoice(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_commitment_fk FOREIGN KEY(tenant_id,commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_term_fk FOREIGN KEY(tenant_id,payment_term_id) REFERENCES master.payment_term(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_tier_fk FOREIGN KEY(tenant_id,discount_tier_id) REFERENCES master.payment_term_discount_tier(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_reverses_fk FOREIGN KEY(tenant_id,reverses_id) REFERENCES document.payment_term_discount_result(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.wht_certificate
    ADD CONSTRAINT wht_certificate_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_counterparty_fk FOREIGN KEY(tenant_id,counterparty_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_tax_type_fk FOREIGN KEY(tenant_id,tax_type_id) REFERENCES master.tax_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_superseded_fk FOREIGN KEY(tenant_id,superseded_by_id) REFERENCES document.wht_certificate(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.import_request
    ADD CONSTRAINT import_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT user_profile_update_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT user_profile_update_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

-- Header/line ownership was intentionally deferred until these headers moved.
ALTER TABLE ledger.fx_revaluation_line
    ADD CONSTRAINT fx_revaluation_line_run_fk FOREIGN KEY(tenant_id,run_id) REFERENCES document.fx_revaluation_run(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE ledger.ic_elimination_line
    ADD CONSTRAINT ic_elimination_line_header_fk FOREIGN KEY(tenant_id,elimination_id) REFERENCES document.ic_elimination(tenant_id,id) ON DELETE RESTRICT;

-- Every actor reference is tenant-scoped; nullable actors are accepted by FK semantics.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('asset_transaction','performed_by'),('asset_transaction','posted_by'),('asset_transaction','status_changed_by'),('asset_transaction','created_by'),('asset_transaction','updated_by'),
        ('fx_revaluation_run','status_changed_by'),('fx_revaluation_run','created_by'),('fx_revaluation_run','updated_by'),
        ('intercompany_agreement','approved_by'),('intercompany_agreement','status_changed_by'),('intercompany_agreement','created_by'),('intercompany_agreement','updated_by'),
        ('intercompany_transaction','posted_by'),('intercompany_transaction','status_changed_by'),('intercompany_transaction','created_by'),('intercompany_transaction','updated_by'),
        ('ic_elimination','approved_by'),('ic_elimination','posted_by'),('ic_elimination','status_changed_by'),('ic_elimination','created_by'),('ic_elimination','updated_by'),
        ('match_exception','resolved_by'),('match_exception','created_by'),('match_exception','updated_by'),
        ('netting_batch','settled_by'),('netting_batch','approved_by'),('netting_batch','status_changed_by'),('netting_batch','created_by'),('netting_batch','updated_by'),
        ('obligation_horizon','status_changed_by'),('obligation_horizon','created_by'),('obligation_horizon','updated_by'),
        ('payment_remittance_output','created_by'),('payment_remittance_output','updated_by'),
        ('payment_term_discount_result','created_by'),
        ('wht_certificate','issued_by'),('wht_certificate','voided_by'),('wht_certificate','created_by'),('wht_certificate','updated_by'),
        ('import_request','submitted_by'),('import_request','created_by'),('import_request','updated_by'),
        ('render_output','revoked_by'),('render_output','last_replayed_by'),('render_output','status_changed_by'),('render_output','created_by'),('render_output','updated_by'),
        ('user_profile_update_request','created_by'),('user_profile_update_request','requested_by'),('user_profile_update_request','principal_id'),('user_profile_update_request','status_changed_by'),('user_profile_update_request','updated_by')
    ) AS x(table_name,column_name)
    LOOP
        EXECUTE format(
            'ALTER TABLE document.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id,%I) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',
            r.table_name, r.table_name || '_' || r.column_name || '_fk', r.column_name
        );
    END LOOP;
END $$;

-- attachment_series constraints
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_current_attachment_fk
    FOREIGN KEY (tenant_id, current_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment.series_id FK (deferrable: series and first version are co-created)
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_series_id_fk
    FOREIGN KEY (tenant_id, series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;

-- attachment_link: series FK
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_attachment_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;

-- multipart_upload: series + parent FKs
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_attachment_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_parent_attachment_fk
    FOREIGN KEY (tenant_id, parent_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;

-- attachment_legal_hold constraints
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_placed_by_fk
    FOREIGN KEY (tenant_id, placed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_released_by_fk
    FOREIGN KEY (tenant_id, released_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment_legal_hold_event constraints
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_hold_fk
    FOREIGN KEY (tenant_id, legal_hold_id)
    REFERENCES document.attachment_legal_hold (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_actor_fk
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment_derivative constraints
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- multipart_upload_part constraints
ALTER TABLE document.multipart_upload_part
    ADD CONSTRAINT multipart_upload_part_upload_fk
    FOREIGN KEY (tenant_id, multipart_upload_id)
    REFERENCES document.multipart_upload (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.multipart_upload_part
    ADD CONSTRAINT multipart_upload_part_recorded_by_fk
    FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.supplier_registration_invitation
    ADD CONSTRAINT supplier_registration_invitation_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_registration_invitation_operating_org_fk
        FOREIGN KEY (tenant_id, requested_operating_organization_id)
        REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_registration_invitation_company_fk
        FOREIGN KEY (tenant_id, optional_company_code_id)
        REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_registration_invitation_applicant_fk
        FOREIGN KEY (tenant_id, applicant_principal_id)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_registration_invitation_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT supplier_registration_invitation_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request
    ADD CONSTRAINT business_partner_request_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_target_fk
        FOREIGN KEY (tenant_id, target_business_partner_id)
        REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_base_snapshot_fk
        FOREIGN KEY (tenant_id, base_snapshot_id)
        REFERENCES snapshot.entity_snapshot_identity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_operating_org_fk
        FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_legal_entity_fk
        FOREIGN KEY (tenant_id, legal_entity_id)
        REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_org_unit_fk
        FOREIGN KEY (tenant_id, org_unit_id)
        REFERENCES master.org_unit(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_position_fk
        FOREIGN KEY (tenant_id, position_id)
        REFERENCES master.position(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_workflow_fk
        FOREIGN KEY (tenant_id, workflow_request_id)
        REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_fk
        FOREIGN KEY (tenant_id, materialized_business_partner_id)
        REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_supplier_fk
        FOREIGN KEY (tenant_id, materialized_supplier_id)
        REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_customer_fk
        FOREIGN KEY (tenant_id, materialized_customer_id)
        REFERENCES master.customer(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_person_fk
        FOREIGN KEY (tenant_id, materialized_person_id)
        REFERENCES master.person(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_employee_fk
        FOREIGN KEY (tenant_id, materialized_employee_id)
        REFERENCES master.employee(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_employment_fk
        FOREIGN KEY (tenant_id, materialized_employment_id)
        REFERENCES master.employment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_work_assignment_fk
        FOREIGN KEY (tenant_id, materialized_work_assignment_id)
        REFERENCES master.work_assignment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_principal_fk
        FOREIGN KEY (tenant_id, materialized_principal_id)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_supplier_company_profile_fk
        FOREIGN KEY (tenant_id, materialized_supplier_company_profile_id)
        REFERENCES master.company_code_supplier_profile(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_customer_company_profile_fk
        FOREIGN KEY (tenant_id, materialized_customer_company_profile_id)
        REFERENCES master.company_code_customer_profile(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialized_assignment_fk
        FOREIGN KEY (tenant_id, materialized_operating_organization_assignment_id)
        REFERENCES master.business_partner_operating_organization_assignment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_materialization_snapshot_fk
        FOREIGN KEY (tenant_id, materialization_snapshot_id)
        REFERENCES snapshot.entity_snapshot_identity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_submitted_by_fk
        FOREIGN KEY (tenant_id, submitted_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_approved_by_fk
        FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_applied_by_fk
        FOREIGN KEY (tenant_id, applied_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request
    ADD CONSTRAINT business_partner_request_invitation_fk
        FOREIGN KEY (tenant_id, invitation_id)
        REFERENCES document.supplier_registration_invitation(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_applicant_fk
        FOREIGN KEY (tenant_id, applicant_principal_id)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request_evidence
    ADD CONSTRAINT business_partner_request_evidence_request_fk
        FOREIGN KEY (tenant_id, request_id)
        REFERENCES document.business_partner_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_evidence_attachment_fk
        FOREIGN KEY (tenant_id, attachment_id)
        REFERENCES document.attachment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_evidence_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_id)
        REFERENCES snapshot.entity_snapshot_identity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_evidence_verified_by_fk
        FOREIGN KEY (tenant_id, verified_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_evidence_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request_validation
    ADD CONSTRAINT business_partner_request_validation_request_fk
        FOREIGN KEY (tenant_id, request_id)
        REFERENCES document.business_partner_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_validation_evaluated_by_fk
        FOREIGN KEY (tenant_id, evaluated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_request_validation_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request
    ADD CONSTRAINT business_partner_request_representation_evidence_fk
        FOREIGN KEY (tenant_id, representation_evidence_id)
        REFERENCES document.business_partner_request_evidence(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.supplier_registration_invitation
    ADD CONSTRAINT supplier_registration_invitation_request_fk
        FOREIGN KEY (tenant_id, business_partner_request_id)
        REFERENCES document.business_partner_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request
    ADD CONSTRAINT business_partner_request_source_projection_fk FOREIGN KEY (tenant_id, source_projection_id) REFERENCES snapshot.mesh_business_partner_profile_received(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_match
    ADD CONSTRAINT mesh_business_partner_match_projection_fk FOREIGN KEY (tenant_id, projection_id) REFERENCES control.mesh_business_partner_profile_projection(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_match_snapshot_fk FOREIGN KEY (tenant_id, snapshot_id) REFERENCES snapshot.mesh_business_partner_profile_received(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_match_org_fk FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_match_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_match_candidate_fk FOREIGN KEY (tenant_id, candidate_business_partner_id) REFERENCES master.business_partner(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_match_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_acceptance
    ADD CONSTRAINT mesh_business_partner_acceptance_match_fk FOREIGN KEY (tenant_id, match_id, snapshot_id) REFERENCES document.mesh_business_partner_match(tenant_id, id, snapshot_id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_acceptance_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_acceptance_event
    ADD CONSTRAINT mesh_business_partner_acceptance_event_acceptance_fk FOREIGN KEY (tenant_id, acceptance_id) REFERENCES document.mesh_business_partner_acceptance(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_acceptance_event_request_fk FOREIGN KEY (tenant_id, business_partner_request_id) REFERENCES document.business_partner_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_business_partner_acceptance_event_recorded_by_fk FOREIGN KEY (tenant_id, recorded_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.business_partner_bank_verification
  ADD CONSTRAINT business_partner_bank_verification_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_projection_fk FOREIGN KEY(tenant_id,bank_projection_id) REFERENCES control.mesh_bank_account_projection(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_profile_fk FOREIGN KEY(tenant_id,supplier_company_profile_id) REFERENCES master.company_code_supplier_profile(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_candidate_fk FOREIGN KEY(tenant_id,candidate_bank_account_link_id) REFERENCES master.bank_account_link(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_prior_fk FOREIGN KEY(tenant_id,prior_bank_account_link_id) REFERENCES master.bank_account_link(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_verified_by_fk FOREIGN KEY(tenant_id,verified_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_rejected_by_fk FOREIGN KEY(tenant_id,rejected_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_bank_verification_applied_by_fk FOREIGN KEY(tenant_id,applied_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
