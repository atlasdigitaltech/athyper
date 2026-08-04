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
