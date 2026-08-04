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
