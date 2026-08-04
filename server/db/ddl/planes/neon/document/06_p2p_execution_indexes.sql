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
