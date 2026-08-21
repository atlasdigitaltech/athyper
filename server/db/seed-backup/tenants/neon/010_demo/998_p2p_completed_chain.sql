-- Deterministic, read-only UI inspection chain.
-- This demo data intentionally represents final states. Runtime/audit contract
-- tests use service calls and never use this fixture as an outcome seed.
DO $p2p_demo$
DECLARE
    v_tenant_id uuid;
    v_company_code_id uuid;
    v_principal_id uuid;
    v_supplier_id uuid;
    v_supplier_name text;
    v_item_id uuid;
    v_warehouse_id uuid;
    v_payment_method_id uuid;
    v_po_id uuid := 'ffffffff-bbbb-0000-0000-000000000001';
    v_po_line_id uuid := 'ffffffff-bbbb-0000-0000-000000000002';
    v_receipt_id uuid := 'ffffffff-bbbb-0000-0000-000000000003';
    v_receipt_line_id uuid := 'ffffffff-bbbb-0000-0000-000000000004';
    v_invoice_id uuid := 'ffffffff-bbbb-0000-0000-000000000005';
    v_invoice_line_id uuid := 'ffffffff-bbbb-0000-0000-000000000006';
    v_payment_id uuid := 'ffffffff-bbbb-0000-0000-000000000007';
BEGIN
    SELECT id INTO v_tenant_id
      FROM master.tenant
     WHERE code = 'athyper' AND status = 'active'
     ORDER BY created_at LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'P2P completed demo chain skipped: tenant athyper is unavailable';
        RETURN;
    END IF;

    SELECT id INTO v_company_code_id FROM master.company_code
     WHERE tenant_id = v_tenant_id AND status = 'active' ORDER BY created_at LIMIT 1;
    SELECT id INTO v_principal_id FROM master.principal
     WHERE tenant_id = v_tenant_id AND status = 'active' ORDER BY created_at LIMIT 1;
    SELECT s.id, bp.name INTO v_supplier_id, v_supplier_name
      FROM master.supplier s
      JOIN master.business_partner bp ON bp.id = s.business_partner_id
     WHERE s.tenant_id = v_tenant_id AND s.status = 'active'
     ORDER BY s.created_at LIMIT 1;
    SELECT id INTO v_item_id FROM master.item
     WHERE tenant_id = v_tenant_id AND status = 'active' ORDER BY created_at LIMIT 1;
    SELECT id INTO v_warehouse_id FROM master.warehouse
     WHERE tenant_id = v_tenant_id AND status = 'active' ORDER BY created_at LIMIT 1;
    SELECT id INTO v_payment_method_id FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND status = 'active' ORDER BY created_at LIMIT 1;

    IF v_company_code_id IS NULL OR v_principal_id IS NULL OR v_supplier_id IS NULL
       OR v_item_id IS NULL OR v_warehouse_id IS NULL OR v_payment_method_id IS NULL THEN
        RAISE NOTICE 'P2P completed demo chain skipped: required master data is incomplete';
        RETURN;
    END IF;

    INSERT INTO document.commitment (
        id, tenant_id, code, name, company_code_id, requested_by,
        commitment_type, order_type, party_type, party_id,
        document_date, effective_date, currency_code, base_currency_code,
        exchange_rate, total_amount, scheduled_amount, fulfilled_amount,
        invoiced_amount, paid_amount, fiscal_year, period_number,
        approved_at, approved_by, status, status_source, metadata, created_by
    ) VALUES (
        v_po_id, v_tenant_id, 'PO-DEMO-COMPLETE-001', 'Completed P2P inspection chain',
        v_company_code_id, v_principal_id, 'purchase_order', 'standard',
        'supplier', v_supplier_id, DATE '2026-06-02', DATE '2026-06-02',
        'USD', 'USD', 1, 1000, 1000, 1000, 1000, 1000, 2026, 6,
        TIMESTAMPTZ '2026-06-03 09:00:00+00', v_principal_id,
        'closed', 'system', '{"demo_read_only":true,"chain_stage":"purchase_order"}', v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.commitment_line (
        id, tenant_id, company_code_id, commitment_id, line_no,
        item_id, item_description, procurement_type, line_type,
        uom_code, quantity, unit_price, price_unit, currency_code,
        supplier_id, warehouse_id, received_quantity, invoiced_quantity,
        status, created_by
    ) VALUES (
        v_po_line_id, v_tenant_id, v_company_code_id, v_po_id, 1,
        v_item_id, 'Completed chain inspection item', 'goods', 'noncatalog',
        'EA', 10, 100, 1, 'USD', v_supplier_id, v_warehouse_id, 10, 10,
        'closed', v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.receipt (
        id, tenant_id, code, name, company_code_id, requested_by,
        commitment_id, supplier_id, received_date, posting_date,
        currency_code, base_currency_code, exchange_rate, total_amount,
        fiscal_year, period_number, approved_at, approved_by,
        status, status_source, metadata, created_by
    ) VALUES (
        v_receipt_id, v_tenant_id, 'RCP-DEMO-COMPLETE-001', 'Posted receipt for completed chain',
        v_company_code_id, v_principal_id, v_po_id, v_supplier_id,
        DATE '2026-06-05', DATE '2026-06-05', 'USD', 'USD', 1, 1000,
        2026, 6, TIMESTAMPTZ '2026-06-05 09:00:00+00', v_principal_id,
        'posted', 'system', '{"demo_read_only":true,"chain_stage":"receipt"}', v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.receipt_line (
        id, tenant_id, company_code_id, receipt_id, line_no,
        commitment_line_id, source_doc_entity, source_doc_id, source_line_id,
        item_id, item_description, procurement_type, line_type,
        uom_code, received_quantity, accepted_quantity, rejected_quantity,
        unit_price, price_unit, currency_code, warehouse_id, supplier_id, created_by
    ) VALUES (
        v_receipt_line_id, v_tenant_id, v_company_code_id, v_receipt_id, 1,
        v_po_line_id, 'purchase_order', v_po_id, v_po_line_id,
        v_item_id, 'Completed chain inspection item', 'goods', 'noncatalog',
        'EA', 10, 10, 0, 100, 1, 'USD', v_warehouse_id, v_supplier_id, v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.purchase_invoice (
        id, tenant_id, code, name, company_code_id, requested_by,
        invoice_source, invoice_type, supplier_id, commitment_id,
        supplier_invoice_number, supplier_invoice_date, posting_date,
        received_date, baseline_date, due_date, tax_mode, match_type, match_status,
        currency_code, base_currency_code, exchange_rate, total_amount, paid_amount,
        fiscal_year, period_number, approved_at, approved_by,
        status, status_source, metadata, created_by
    ) VALUES (
        v_invoice_id, v_tenant_id, 'PI-DEMO-COMPLETE-001', 'Fully paid invoice for completed chain',
        v_company_code_id, v_principal_id, 'po_based', 'standard', v_supplier_id, v_po_id,
        'SUP-DEMO-COMPLETE-001', DATE '2026-06-07', DATE '2026-06-07', DATE '2026-06-07',
        DATE '2026-06-07', DATE '2026-07-07', 'exclusive', 'three_way', 'fully_matched',
        'USD', 'USD', 1, 1000, 1000, 2026, 6,
        TIMESTAMPTZ '2026-06-08 09:00:00+00', v_principal_id,
        'fully_paid', 'system', '{"demo_read_only":true,"chain_stage":"purchase_invoice"}', v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.purchase_invoice_line (
        id, tenant_id, company_code_id, purchase_invoice_id, line_no,
        commitment_line_id, receipt_line_id, item_id, item_description,
        procurement_type, line_type, uom_code, quantity, unit_price,
        price_unit, currency_code, matched_quantity, match_status,
        warehouse_id, supplier_id, created_by
    ) VALUES (
        v_invoice_line_id, v_tenant_id, v_company_code_id, v_invoice_id, 1,
        v_po_line_id, v_receipt_line_id, v_item_id, 'Completed chain inspection item',
        'goods', 'noncatalog', 'EA', 10, 100, 1, 'USD', 10, 'fully_matched',
        v_warehouse_id, v_supplier_id, v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.payment_entry (
        id, tenant_id, code, name, company_code_id, payment_number,
        payment_type, payment_direction, supplier_id, supplier_name,
        payment_method_id, document_date, posting_date, value_date,
        currency_code, base_currency_code, exchange_rate, payment_amount,
        base_amount, fiscal_year, period_number, is_posted, posted_at, posted_by,
        approved_at, approved_by, is_transmitted, transmission_status,
        cleared_date, line_count, status, metadata, created_by
    ) VALUES (
        v_payment_id, v_tenant_id, 'PAY-DEMO-COMPLETE-001', 'Cleared payment for completed chain',
        v_company_code_id, 'PAY-DEMO-COMPLETE-001', 'standard', 'OUTBOUND',
        v_supplier_id, v_supplier_name, v_payment_method_id,
        DATE '2026-06-10', DATE '2026-06-10', DATE '2026-06-10',
        'USD', 'USD', 1, 1000, 1000, 2026, 6, true,
        TIMESTAMPTZ '2026-06-10 09:00:00+00', v_principal_id,
        TIMESTAMPTZ '2026-06-10 08:00:00+00', v_principal_id,
        true, 'accepted', DATE '2026-06-11', 1, 'cleared',
        '{"demo_read_only":true,"chain_stage":"payment"}', v_principal_id
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO document.payment_entry_allocation (
        tenant_id, payment_entry_id, line_no, purchase_invoice_id,
        currency_code, allocated_amount, base_currency_code, exchange_rate,
        base_amount, created_by
    ) VALUES (
        v_tenant_id, v_payment_id, 1, v_invoice_id,
        'USD', 1000, 'USD', 1, 1000, v_principal_id
    ) ON CONFLICT (payment_entry_id, line_no) DO NOTHING;

    RAISE NOTICE 'P2P completed demo chain ready: PO % -> receipt % -> PI % -> payment %',
        v_po_id, v_receipt_id, v_invoice_id, v_payment_id;
END $p2p_demo$;
