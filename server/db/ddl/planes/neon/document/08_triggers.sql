CREATE TRIGGER trg_attachment_10_creation_guard
BEFORE UPDATE ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_attachment_20_version_guard
BEFORE INSERT OR UPDATE OF tenant_id, parent_attachment_id, version_no
ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_version_guard();
CREATE TRIGGER trg_attachment_30_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_attachment_90_updated_at
BEFORE UPDATE ON document.attachment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_attachment_folder_10_creation_guard
BEFORE UPDATE ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_attachment_folder_20_hierarchy
BEFORE INSERT OR UPDATE OF tenant_id, entity_type, entity_id, parent_id
ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_folder_guard();
CREATE TRIGGER trg_attachment_folder_90_updated_at
BEFORE UPDATE ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_attachment_link_folder
BEFORE INSERT OR UPDATE OF tenant_id, entity_type, entity_id, folder_id
ON document.attachment_link
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_link_folder_guard();
CREATE TRIGGER trg_attachment_link_guard
BEFORE UPDATE ON document.attachment_link
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_link_guard();

CREATE TRIGGER trg_comment_10_creation_guard
BEFORE UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_comment_20_hierarchy
BEFORE INSERT OR UPDATE OF tenant_id, context_type, entity_type, entity_id,
    comment_intent, parent_comment_id, thread_depth
ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_guard();
CREATE TRIGGER trg_comment_90_updated_at
BEFORE UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_draft_10_creation_guard
BEFORE UPDATE ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_comment_draft_20_context
BEFORE INSERT OR UPDATE OF tenant_id, context_type, entity_type, entity_id,
    parent_comment_id
ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_draft_guard();
CREATE TRIGGER trg_comment_draft_90_updated_at
BEFORE UPDATE ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_reaction_type
BEFORE INSERT OR UPDATE OF tenant_id, reaction_type
ON document.comment_reaction
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_reaction_guard();
CREATE TRIGGER trg_comment_mention_immutable
BEFORE UPDATE ON document.comment_mention
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_comment_reaction_immutable
BEFORE UPDATE ON document.comment_reaction
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_content_item_10_creation_guard
BEFORE UPDATE ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_content_item_20_parent
BEFORE INSERT OR UPDATE OF tenant_id, parent_id
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_content_parent_guard();
CREATE TRIGGER trg_content_item_30_current_version
BEFORE INSERT OR UPDATE OF tenant_id, current_version_id
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_content_current_version_guard();
CREATE TRIGGER trg_content_item_40_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_content_item_90_updated_at
BEFORE UPDATE ON document.content_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_content_item_link_immutable
BEFORE UPDATE ON document.content_item_link
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_conversation_10_creation_guard
BEFORE UPDATE ON document.conversation
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_conversation_20_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.conversation
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_conversation_90_updated_at
BEFORE UPDATE ON document.conversation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_conversation_participant_10_creation_guard
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_conversation_participant_20_membership_guard
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION document.trg_conversation_participant_guard();
CREATE TRIGGER trg_conversation_participant_90_updated_at
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_multipart_upload_10_creation_guard
BEFORE UPDATE ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_multipart_upload_20_parts
BEFORE INSERT OR UPDATE OF part_etags
ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION document.trg_multipart_parts_guard();
CREATE TRIGGER trg_multipart_upload_90_updated_at
BEFORE UPDATE ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_content_item_version_immutable
BEFORE UPDATE OR DELETE ON snapshot.content_item_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_content_item_version_immutable();
CREATE TRIGGER comment_feed_cursor_90_updated
BEFORE UPDATE ON document.comment_feed_cursor
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

SELECT audit.install_document_row_audit_triggers();

CREATE TRIGGER workflow_request_identity_guard BEFORE UPDATE ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER workflow_request_status_stamp BEFORE UPDATE OF status ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER workflow_request_updated_at BEFORE UPDATE ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER workflow_stage_identity_guard BEFORE UPDATE ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER workflow_stage_status_stamp BEFORE UPDATE OF status ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER workflow_stage_updated_at BEFORE UPDATE ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commitment_identity_guard BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER commitment_terminal_guard BEFORE UPDATE OR DELETE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_commitment_terminal();
CREATE TRIGGER commitment_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER commitment_status_stamp BEFORE UPDATE OF status ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER commitment_row_version BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER commitment_updated_at BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commitment_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_commitment_line();
CREATE TRIGGER commitment_line_identity_guard BEFORE UPDATE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER commitment_line_status_stamp BEFORE UPDATE OF status ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER commitment_line_updated_at BEFORE UPDATE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER commitment_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_commitment_total();

CREATE TRIGGER commitment_release_validate BEFORE INSERT ON document.commitment_release_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_release_allocation();
CREATE TRIGGER commitment_release_immutable BEFORE UPDATE OR DELETE ON document.commitment_release_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER purchase_invoice_identity_guard BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER purchase_invoice_terminal_guard BEFORE UPDATE OR DELETE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_invoice_terminal();
CREATE TRIGGER purchase_invoice_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER purchase_invoice_status_stamp BEFORE UPDATE OF status ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER purchase_invoice_row_version BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER purchase_invoice_updated_at BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER purchase_invoice_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_purchase_invoice_line();
CREATE TRIGGER purchase_invoice_line_identity_guard BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER purchase_invoice_line_row_version BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER purchase_invoice_line_updated_at BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER purchase_invoice_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_purchase_invoice_total();

CREATE TRIGGER invoice_match_case_validate BEFORE INSERT OR UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_invoice_match_case();
CREATE TRIGGER invoice_match_case_identity_guard BEFORE UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER invoice_match_case_status_stamp BEFORE UPDATE OF status ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER invoice_match_case_updated_at BEFORE UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER accounting_distribution_identity_guard BEFORE UPDATE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER accounting_distribution_posted_guard BEFORE UPDATE OR DELETE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_distribution_posted();
CREATE TRIGGER accounting_distribution_updated_at BEFORE UPDATE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_term_application_validate BEFORE INSERT OR UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_term_application();
CREATE TRIGGER payment_term_application_identity_guard BEFORE UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER payment_term_application_updated_at BEFORE UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_entry_identity_guard BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER payment_entry_financial_guard BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_payment_posted();
CREATE TRIGGER payment_entry_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER payment_entry_status_stamp BEFORE UPDATE OF status ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER payment_entry_row_version BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER payment_entry_updated_at BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_entry_allocation_validate BEFORE INSERT ON document.payment_entry_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payment_allocation();
CREATE TRIGGER payment_entry_allocation_immutable BEFORE UPDATE OR DELETE ON document.payment_entry_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER journal_entry_identity_guard BEFORE UPDATE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER journal_entry_posted_guard BEFORE UPDATE OR DELETE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_journal_posted();
CREATE TRIGGER journal_entry_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER journal_entry_posting_validate BEFORE UPDATE OF status ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_journal_posting();
CREATE TRIGGER journal_entry_status_stamp BEFORE UPDATE OF status ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER journal_entry_updated_at BEFORE UPDATE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER journal_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_journal_line();
CREATE TRIGGER journal_line_immutable_evidence BEFORE UPDATE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER journal_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_journal_total();

CREATE TRIGGER journal_line_reference_immutable BEFORE UPDATE OR DELETE ON document.journal_line_reference
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition','purchase_order_confirmation','delivery_note','receipt','service_sheet'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_p2p_header()', v_table || '_10_guard', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF status ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()', v_table || '_20_status', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version()', v_table || '_25_version', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table || '_30_updated', v_table);
    END LOOP;
END $$;

CREATE TRIGGER purchase_requisition_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.purchase_requisition
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER receipt_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.receipt
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER service_sheet_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.service_sheet
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition_line','delivery_note_line','receipt_line','service_sheet_line'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_validate_p2p_line()', v_table || '_10_guard', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table || '_30_updated', v_table);
    END LOOP;
END $$;

CREATE TRIGGER purchase_requisition_line_status_stamp
BEFORE UPDATE OF status ON document.purchase_requisition_line
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();

CREATE TRIGGER confirmation_line_validate
BEFORE INSERT ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_confirmation_line();
CREATE TRIGGER confirmation_line_immutable
BEFORE UPDATE OR DELETE ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER pr_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.purchase_requisition_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER confirmation_line_total_sync AFTER INSERT ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER receipt_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER service_sheet_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();

CREATE CONSTRAINT TRIGGER receipt_line_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_fulfillment_capacity();
CREATE CONSTRAINT TRIGGER service_sheet_line_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_fulfillment_capacity();

CREATE TRIGGER receipt_line_schedule_refresh
AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_commitment_schedule();
CREATE TRIGGER service_sheet_line_schedule_refresh
AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_commitment_schedule();

CREATE TRIGGER pricing_component_05_validate
BEFORE INSERT OR UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_pricing_component();
CREATE TRIGGER pricing_component_10_parent_guard
BEFORE INSERT OR UPDATE OR DELETE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_pricing_component_write();
CREATE TRIGGER pricing_component_20_row_version
BEFORE UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER pricing_component_30_updated_at
BEFORE UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER schedule_line_05_validate
BEFORE INSERT OR UPDATE ON document.schedule_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_schedule_line();
CREATE TRIGGER schedule_line_30_updated_at
BEFORE UPDATE ON document.schedule_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER schedule_line_90_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.schedule_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_schedule_capacity();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'catalog_import', 'catalog_import_line',
        'punchout_cart', 'punchout_cart_line',
        'production_order', 'production_order_component',
        'sales_order', 'sales_order_line'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_sales_order_line_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, sales_order_id, item_id, currency_code
ON document.sales_order_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_order_line();

CREATE TRIGGER trg_production_order_15_snapshot_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, company_code_id, output_item_id, bom_snapshot_id, uom_code
ON document.production_order
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_production_order();

CREATE TRIGGER trg_production_order_component_15_snapshot_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, production_order_id, bom_component_snapshot_id,
    component_item_id, uom_code
ON document.production_order_component
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_production_order_component();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'stocktake_line',
        'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_stocktake_15_completion
BEFORE INSERT OR UPDATE ON document.stocktake
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_stocktake_completion();

CREATE TRIGGER trg_stocktake_line_15_contract
BEFORE INSERT OR UPDATE ON document.stocktake_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_stocktake_line();

CREATE TRIGGER trg_stocktake_line_15_delete_guard
BEFORE DELETE ON document.stocktake_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_stocktake_line_delete();

CREATE TRIGGER trg_sales_opportunity_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, selling_model, principal_seller_company_id
ON document.sales_opportunity
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_header();

CREATE TRIGGER trg_sales_opportunity_company_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, opportunity_id, company_code_id
ON document.sales_opportunity_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_company('opportunity');

CREATE TRIGGER trg_sales_quotation_14_opportunity_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, opportunity_id, customer_id, operating_organization_id,
    selling_model, principal_seller_company_id
ON document.sales_quotation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_quotation();

CREATE TRIGGER trg_sales_quotation_15_sales_org_contract
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, selling_model, principal_seller_company_id
ON document.sales_quotation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_header();

CREATE TRIGGER trg_sales_quotation_company_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, quotation_id, company_code_id
ON document.sales_quotation_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_company('quotation');

CREATE TRIGGER trg_sales_quotation_allocation_15_contract
BEFORE INSERT OR UPDATE ON document.sales_quotation_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_allocation();

CREATE TRIGGER trg_sales_order_ic_fulfillment_15_contract
BEFORE INSERT OR UPDATE ON document.sales_order_intercompany_fulfillment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_intercompany_fulfillment();

CREATE TRIGGER trg_sales_order_15_quotation_contract
BEFORE INSERT OR UPDATE OF tenant_id, quotation_id, company_code_id, customer_id, currency_code
ON document.sales_order
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_order_quotation();

CREATE CONSTRAINT TRIGGER trg_sales_opportunity_95_structure
AFTER INSERT OR UPDATE ON document.sales_opportunity
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_opportunity_structure();

CREATE CONSTRAINT TRIGGER trg_sales_opportunity_company_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_opportunity_company
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_opportunity_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_95_structure
AFTER INSERT OR UPDATE ON document.sales_quotation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_company_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_quotation_company
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_allocation_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_quotation_allocation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_order_95_intercompany_total
AFTER UPDATE OF total_amount ON document.sales_order
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_intercompany_fulfillment_total();

CREATE CONSTRAINT TRIGGER trg_sales_order_ic_fulfillment_95_total
AFTER INSERT OR UPDATE OR DELETE ON document.sales_order_intercompany_fulfillment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_intercompany_fulfillment_total();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case','bank_recon_case_line',
        'depreciation_run','depreciation_run_line','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case',
        'depreciation_run','depreciation_run_line','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_recon_case','depreciation_run','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case',
        'depreciation_run','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_bank_statement_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,bank_account_id,period_start_date,period_end_date,currency_code
ON document.bank_statement FOR EACH ROW EXECUTE FUNCTION document.trg_validate_bank_statement();
CREATE TRIGGER trg_bank_statement_15_state
BEFORE INSERT OR UPDATE ON document.bank_statement
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_bank_statement_state();

CREATE TRIGGER trg_bank_statement_line_15_guard
BEFORE INSERT OR UPDATE ON document.bank_statement_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_bank_statement_line();
CREATE TRIGGER trg_bank_statement_line_15_delete
BEFORE DELETE ON document.bank_statement_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_bank_recon_case_15_state
BEFORE INSERT OR UPDATE ON document.bank_recon_case
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_bank_recon_case();
CREATE TRIGGER trg_bank_recon_case_80_projection
AFTER UPDATE OF status ON document.bank_recon_case
FOR EACH ROW EXECUTE FUNCTION document.trg_after_bank_recon_case_state();

CREATE TRIGGER trg_bank_recon_case_line_10_contract
BEFORE INSERT ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_bank_recon_line();
CREATE TRIGGER trg_bank_recon_case_line_15_immutable
BEFORE UPDATE OR DELETE ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_bank_recon_case_line_80_projection
AFTER INSERT ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_after_bank_recon_line();

CREATE TRIGGER trg_depreciation_run_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,ledger_book_id,fiscal_period_id,currency_code,reversal_of_run_id
ON document.depreciation_run FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_run();
CREATE TRIGGER trg_depreciation_run_15_state
BEFORE INSERT OR UPDATE ON document.depreciation_run
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_depreciation_run();
CREATE TRIGGER trg_depreciation_run_80_post
AFTER UPDATE OF status ON document.depreciation_run
FOR EACH ROW EXECUTE FUNCTION document.trg_post_depreciation_run();

CREATE TRIGGER trg_depreciation_run_line_10_contract
BEFORE INSERT OR UPDATE ON document.depreciation_run_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_line();
CREATE TRIGGER trg_depreciation_run_line_15_immutable
BEFORE UPDATE OR DELETE ON document.depreciation_run_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_depreciation_line();

CREATE TRIGGER trg_depreciation_schedule_15_contract
BEFORE INSERT OR UPDATE ON document.depreciation_schedule
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_schedule();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'sourcing_event','sourcing_event_company','sourcing_event_demand',
        'sourcing_event_award','sourcing_event_award_allocation',
        'sourcing_event_intercompany_allocation'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_sourcing_event_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,operating_organization_id,buying_model,central_buyer_company_id
ON document.sourcing_event FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_event();
CREATE TRIGGER trg_sourcing_event_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_event();

CREATE TRIGGER trg_sourcing_event_company_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_company();

CREATE TRIGGER trg_sourcing_event_demand_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,sourcing_event_id,purchase_requisition_line_id,demand_company_code_id,
    requested_quantity,uom_code,requested_amount,source_currency_code,evaluation_amount,evaluation_currency_code,fx_rate_snapshot
ON document.sourcing_event_demand FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_demand();

CREATE TRIGGER trg_sourcing_event_award_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event_award
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_award();
CREATE TRIGGER trg_sourcing_event_award_80_projection
AFTER UPDATE OF status ON document.sourcing_event_award
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION document.trg_refresh_sourcing_award();

CREATE TRIGGER trg_sourcing_event_award_allocation_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_award_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_award_allocation();
CREATE TRIGGER trg_sourcing_event_award_allocation_80_projection
AFTER INSERT OR UPDATE OR DELETE ON document.sourcing_event_award_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_sourcing_award();

CREATE TRIGGER trg_sourcing_event_intercompany_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_intercompany_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_intercompany();
CREATE TRIGGER trg_sourcing_event_intercompany_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event_intercompany_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_intercompany();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line','policy_acknowledgment'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table);
    END LOOP;
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','leave_request','people_request','hr_case','onboarding_case','offboarding_case',
        'payroll_period','payroll_run','payroll_run_employee','payroll_result'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table);
        EXECUTE format('CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table);
        EXECUTE format('CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table);
    END LOOP;
END;
$$;

CREATE TRIGGER trg_shift_assignment_10_contract BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_type_id ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION document.trg_validate_shift_assignment();
CREATE TRIGGER trg_shift_assignment_15_state BEFORE INSERT OR UPDATE ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_time_punch_10_reference BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_assignment_id ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_validate_attendance_reference();
CREATE TRIGGER trg_time_punch_12_evidence BEFORE UPDATE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_guard_time_punch();
CREATE TRIGGER trg_time_punch_15_state BEFORE UPDATE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_time_punch_15_no_delete BEFORE DELETE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_attendance_day_10_reference BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_assignment_id,attendance_date ON document.attendance_day FOR EACH ROW EXECUTE FUNCTION document.trg_validate_attendance_reference();
CREATE TRIGGER trg_attendance_day_15_state BEFORE UPDATE ON document.attendance_day FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();

CREATE TRIGGER trg_attendance_adjustment_15_state BEFORE INSERT OR UPDATE ON document.attendance_adjustment_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_compensation_change_10_contract BEFORE INSERT OR UPDATE ON document.compensation_change FOR EACH ROW EXECUTE FUNCTION document.trg_validate_compensation_change();
CREATE TRIGGER trg_compensation_change_15_state BEFORE INSERT OR UPDATE ON document.compensation_change FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_employee_tax_declaration_10_contract BEFORE INSERT OR UPDATE OF tenant_id,employee_id,employment_id ON document.employee_tax_declaration FOR EACH ROW EXECUTE FUNCTION document.trg_validate_tax_declaration();
CREATE TRIGGER trg_employee_tax_declaration_15_state BEFORE INSERT OR UPDATE ON document.employee_tax_declaration FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_employee_tax_declaration_line_10_guard BEFORE INSERT OR UPDATE OR DELETE ON document.employee_tax_declaration_line FOR EACH ROW EXECUTE FUNCTION document.trg_guard_tax_declaration_line();
CREATE TRIGGER trg_employee_tax_declaration_line_90_updated BEFORE UPDATE ON document.employee_tax_declaration_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_leave_request_10_contract BEFORE INSERT OR UPDATE OF tenant_id,leave_plan_id,leave_type_id,quantity_unit ON document.leave_request FOR EACH ROW EXECUTE FUNCTION document.trg_validate_leave_contract();
CREATE TRIGGER trg_leave_request_15_state BEFORE INSERT OR UPDATE ON document.leave_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_leave_balance_entry_10_contract BEFORE INSERT ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION document.trg_validate_leave_contract();
CREATE TRIGGER trg_leave_balance_entry_15_immutable BEFORE UPDATE OR DELETE ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_people_request_15_state BEFORE INSERT OR UPDATE ON document.people_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_hr_case_15_state BEFORE INSERT OR UPDATE ON document.hr_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_case();
CREATE TRIGGER trg_onboarding_case_15_state BEFORE INSERT OR UPDATE ON document.onboarding_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_people_case();
CREATE TRIGGER trg_offboarding_case_15_state BEFORE INSERT OR UPDATE ON document.offboarding_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_people_case();

CREATE TRIGGER trg_payroll_period_15_state BEFORE UPDATE ON document.payroll_period FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_run_15_state BEFORE INSERT OR UPDATE ON document.payroll_run FOR EACH ROW EXECUTE FUNCTION document.trg_manage_payroll_run();
CREATE TRIGGER trg_payroll_run_employee_10_contract BEFORE INSERT OR UPDATE OF tenant_id,payroll_run_id,employee_id,compensation_assignment_id ON document.payroll_run_employee FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_run_employee();
CREATE TRIGGER trg_payroll_run_employee_15_state BEFORE UPDATE ON document.payroll_run_employee FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_result_10_contract BEFORE INSERT OR UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_result();
CREATE TRIGGER trg_payroll_result_15_state BEFORE UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_result_line_10_contract BEFORE INSERT ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_result_line();
CREATE TRIGGER trg_payroll_result_line_15_immutable BEFORE UPDATE OR DELETE ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_payroll_result_line_80_projection AFTER INSERT ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_payroll_result();

CREATE TRIGGER trg_policy_acknowledgment_10_immutable
BEFORE UPDATE OR DELETE ON document.policy_acknowledgment
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_policy_acknowledgment_05_contract
BEFORE INSERT ON document.policy_acknowledgment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_policy_acknowledgment();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'project_task', 'project_task_requirement', 'budget_profile', 'budget_allocation'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_00_created_by BEFORE INSERT ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_identity BEFORE UPDATE ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_80_status BEFORE UPDATE OF status ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_90_updated_at BEFORE UPDATE ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_project_task_20_validate
BEFORE INSERT OR UPDATE OF project_id, project_wbs_id
ON document.project_task
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_project_task();

CREATE TRIGGER trg_project_task_requirement_20_validate
BEFORE INSERT OR UPDATE OF project_id, project_item_id, uom_code
ON document.project_task_requirement
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_project_task_requirement();

CREATE TRIGGER trg_budget_profile_20_validate
BEFORE INSERT OR UPDATE OF project_id, company_code_id, ledger_book_id, currency_code
ON document.budget_profile
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_budget_profile();

CREATE TRIGGER trg_budget_allocation_20_validate
BEFORE INSERT OR UPDATE OF budget_profile_id, project_id, project_wbs_id,
    fiscal_year, allocated_amount, status
ON document.budget_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_budget_allocation();

CREATE TRIGGER trg_planning_scenario_00_created_by
BEFORE INSERT ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_scenario_05_validate
BEFORE INSERT OR UPDATE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_planning_scenario();

CREATE TRIGGER trg_planning_scenario_10_status
BEFORE UPDATE OF status ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_planning_scenario_20_guard
BEFORE UPDATE OR DELETE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_planning_scenario();

CREATE TRIGGER trg_planning_scenario_90_updated
BEFORE UPDATE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_scenario_line_00_created_by
BEFORE INSERT ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_scenario_line_20_guard
BEFORE INSERT OR UPDATE OR DELETE ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_planning_scenario_line();

CREATE TRIGGER trg_planning_scenario_line_90_updated
BEFORE UPDATE ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','intercompany_agreement',
        'intercompany_transaction','ic_elimination','match_exception','netting_batch',
        'obligation_horizon','payment_remittance_output','wht_certificate',
        'import_request','import_request_chunk','render_output','user_profile_update_request'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table || '_05_creation_guard',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_90_updated_at',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','intercompany_agreement',
        'intercompany_transaction','ic_elimination','netting_batch',
        'obligation_horizon','import_request_chunk','render_output','user_profile_update_request'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table || '_20_status_evidence',v_table
        );
    END LOOP;
END $$;

CREATE TRIGGER import_request_chunk_10_guard
BEFORE UPDATE ON document.import_request_chunk
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_import_request_chunk();

CREATE TRIGGER render_output_10_state
BEFORE UPDATE OF status ON document.render_output
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_render_output_state();

CREATE TRIGGER asset_transaction_10_coordinates
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,asset_id,asset_book_id,book_type,depreciation_run_id,depreciation_run_line_id
ON document.asset_transaction FOR EACH ROW
EXECUTE FUNCTION document.trg_validate_asset_transaction();

CREATE TRIGGER match_exception_80_rollup
AFTER INSERT OR UPDATE OR DELETE ON document.match_exception
FOR EACH ROW EXECUTE FUNCTION document.trg_rollup_match_exceptions();

CREATE TRIGGER payment_term_discount_result_10_immutable
BEFORE UPDATE OR DELETE ON document.payment_term_discount_result
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
