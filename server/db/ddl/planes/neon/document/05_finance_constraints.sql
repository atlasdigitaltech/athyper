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
