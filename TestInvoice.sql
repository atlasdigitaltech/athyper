-- TestInvoice.sql
-- Purpose:
--   Create 10 ATHQ purchase invoices for Athyper Group Holdings, one per major
--   invoice lifecycle status, with invoice lines, workflow/approval state,
--   accounting entries where applicable, and UI-oriented process metadata.
--
-- Assumptions:
--   - Tenant realm/code is athyper.
--   - Company code ATHQ represents Athyper Group Holdings.
--   - User athq.admin has principal id aa001000-0000-0000-0000-000000000007.
--   - TI-ATHQ-2026-002 uses a 2-level approval route:
--       level 1: athq.admin + athq.manager in parallel,
--       level 2: athq.cfo as the serial approver after level 1 completes.
--   - The script is additive. If an invoice number already exists, that invoice
--     is left unchanged so re-running the script does not duplicate child rows.

DO $$
DECLARE
  v_tenant_id uuid;
  v_company_code_id uuid;
  v_supplier_id uuid;
  v_supplier_name text := 'ATHQ Test Supplier';
  v_admin_id uuid := 'aa001000-0000-0000-0000-000000000007';
  v_parallel_approver_1_id uuid := 'aa001000-0000-0000-0000-000000000007'; -- athq.admin
  v_parallel_approver_2_id uuid := 'aa001000-0000-0000-0000-000000000005'; -- athq.manager
  v_serial_approver_id uuid := 'aa001000-0000-0000-0000-00000000000c'; -- athq.cfo
  v_book_id uuid;
  v_fiscal_period_id uuid;
  v_payment_term_id uuid;
  v_fiscal_year integer;
  v_period_number integer;
  v_postable_mv_ready boolean := false;
  v_expense_gl_account_id uuid;
  v_ap_gl_account_id uuid;
  v_existing_invoice_id uuid;
  v_invoice_id uuid;
  v_workflow_request_id uuid;
  v_workflow_stage_id uuid;
  v_parallel_stage_id uuid;
  v_serial_stage_id uuid;
  v_journal_entry_id uuid;
  v_reference_line_id uuid;
  v_anchor timestamptz;
  v_line_1_amount numeric(18, 2);
  v_line_2_amount numeric(18, 2);
  v_due_date date;
  v_approved_at timestamptz;
  r record;
BEGIN
  SELECT t.id
    INTO v_tenant_id
  FROM master.tenant t
  WHERE t.realm_key = 'athyper'
    AND t.code = 'athyper'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant athyper was not found.';
  END IF;

  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
  PERFORM set_config('app.current_principal_id', v_admin_id::text, true);

  IF NOT EXISTS (
    SELECT 1
    FROM master.principal p
    WHERE p.tenant_id = v_tenant_id
      AND p.id IN (v_parallel_approver_1_id, v_parallel_approver_2_id, v_serial_approver_id)
    GROUP BY p.tenant_id
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'Required ATHQ approval principals were not found. Expected athq.admin %, athq.manager %, athq.cfo %.',
      v_parallel_approver_1_id, v_parallel_approver_2_id, v_serial_approver_id;
  END IF;

  SELECT cc.id
    INTO v_company_code_id
  FROM master.company_code cc
  WHERE cc.tenant_id = v_tenant_id
    AND cc.code = 'ATHQ'
  LIMIT 1;

  IF v_company_code_id IS NULL THEN
    RAISE EXCEPTION 'Company code ATHQ for Athyper Group Holdings was not found.';
  END IF;

  SELECT pt.id
    INTO v_payment_term_id
  FROM master.payment_term pt
  WHERE pt.tenant_id = v_tenant_id
    AND pt.code = 'PT-NET30'
    AND pt.status = 'active'
  ORDER BY pt.version DESC
  LIMIT 1;

  IF v_payment_term_id IS NULL THEN
    RAISE EXCEPTION 'Active payment term PT-NET30 was not found for tenant athyper.';
  END IF;

  SELECT s.id, COALESCE(bp.name, s.supplier_code, v_supplier_name)
    INTO v_supplier_id, v_supplier_name
  FROM master.supplier s
  LEFT JOIN master.business_partner bp
    ON bp.id = s.business_partner_id
   AND bp.tenant_id = s.tenant_id
  WHERE s.tenant_id = v_tenant_id
    AND s.status = 'active'
  ORDER BY CASE WHEN s.supplier_code ILIKE '%ATHQ%' THEN 0 ELSE 1 END,
           s.supplier_code
  LIMIT 1;

  v_supplier_name := COALESCE(v_supplier_name, 'ATHQ Test Supplier');

  SELECT cba.book_id
    INTO v_book_id
  FROM master.company_code_book_assignment cba
  JOIN master.ledger_book lb
    ON lb.id = cba.book_id
   AND lb.tenant_id = cba.tenant_id
  WHERE cba.tenant_id = v_tenant_id
    AND cba.company_code_id = v_company_code_id
    AND cba.status = 'active'
    AND lb.status = 'active'
  ORDER BY lb.is_primary DESC, cba.priority DESC, cba.created_at
  LIMIT 1;

  IF v_book_id IS NULL THEN
    SELECT lb.id
      INTO v_book_id
    FROM master.ledger_book lb
    WHERE lb.tenant_id = v_tenant_id
      AND lb.status = 'active'
    ORDER BY lb.is_primary DESC, lb.created_at
    LIMIT 1;
  END IF;

  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'No active ledger book was found for tenant athyper.';
  END IF;

  SELECT fp.id, fp.fiscal_year, fp.period_number
    INTO v_fiscal_period_id, v_fiscal_year, v_period_number
  FROM master.fiscal_period fp
  WHERE fp.tenant_id = v_tenant_id
    AND fp.company_code_id = v_company_code_id
    AND fp.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::integer
    AND fp.period_number = EXTRACT(MONTH FROM CURRENT_DATE)::integer
    AND fp.status IN ('open', 'soft_close')
  ORDER BY fp.start_date DESC
  LIMIT 1;

  IF v_fiscal_period_id IS NULL THEN
    SELECT fp.id, fp.fiscal_year, fp.period_number
      INTO v_fiscal_period_id, v_fiscal_year, v_period_number
    FROM master.fiscal_period fp
    WHERE fp.tenant_id = v_tenant_id
      AND fp.company_code_id = v_company_code_id
    ORDER BY fp.fiscal_year DESC, fp.period_number DESC
    LIMIT 1;
  END IF;

  IF v_fiscal_period_id IS NULL THEN
    RAISE EXCEPTION 'No fiscal period was found for company ATHQ.';
  END IF;

  SELECT COALESCE(c.relispopulated, false)
    INTO v_postable_mv_ready
  FROM pg_class c
  WHERE c.oid = to_regclass('master.mv_company_postable_account');

  IF v_postable_mv_ready THEN
    SELECT mpa.gl_account_id
      INTO v_expense_gl_account_id
    FROM master.mv_company_postable_account mpa
    WHERE mpa.tenant_id = v_tenant_id
      AND mpa.company_code_id = v_company_code_id
      AND lower(mpa.account_class) IN ('expense', 'expenses')
    ORDER BY CASE
               WHEN mpa.account_name ILIKE '%consult%' OR mpa.account_name ILIKE '%service%' OR mpa.account_code ILIKE '%exp%' THEN 0
               ELSE 1
             END,
             mpa.account_code
    LIMIT 1;
  END IF;

  IF v_expense_gl_account_id IS NULL THEN
    SELECT ga.id
      INTO v_expense_gl_account_id
    FROM master.gl_account ga
    WHERE ga.tenant_id = v_tenant_id
      AND ga.status = 'active'
      AND ga.node_type = 'posting'
      AND lower(ga.account_class) IN ('expense', 'expenses')
    ORDER BY CASE
               WHEN ga.name ILIKE '%consult%' OR ga.name ILIKE '%service%' OR ga.code ILIKE '%exp%' THEN 0
               ELSE 1
             END,
             ga.sort_order NULLS LAST,
             ga.code
    LIMIT 1;
  END IF;

  IF v_postable_mv_ready THEN
    SELECT mpa.gl_account_id
      INTO v_ap_gl_account_id
    FROM master.mv_company_postable_account mpa
    WHERE mpa.tenant_id = v_tenant_id
      AND mpa.company_code_id = v_company_code_id
      AND lower(mpa.account_class) IN ('liability', 'liabilities')
    ORDER BY CASE
               WHEN mpa.account_name ILIKE '%payable%' OR mpa.account_code ILIKE '%ap%' OR lower(COALESCE(mpa.subledger_type, '')) IN ('supplier', 'ap') THEN 0
               ELSE 1
             END,
             mpa.account_code
    LIMIT 1;
  END IF;

  IF v_ap_gl_account_id IS NULL THEN
    SELECT ga.id
      INTO v_ap_gl_account_id
    FROM master.gl_account ga
    WHERE ga.tenant_id = v_tenant_id
      AND ga.status = 'active'
      AND ga.node_type = 'posting'
      AND lower(ga.account_class) IN ('liability', 'liabilities')
    ORDER BY CASE
               WHEN ga.name ILIKE '%payable%' OR ga.code ILIKE '%ap%' OR lower(COALESCE(ga.subledger_type, '')) IN ('supplier', 'ap') THEN 0
               ELSE 1
             END,
             ga.sort_order NULLS LAST,
             ga.code
    LIMIT 1;
  END IF;

  IF v_expense_gl_account_id IS NULL OR v_ap_gl_account_id IS NULL THEN
    RAISE EXCEPTION 'Required posting GL accounts were not found. Expense account: %, AP account: %',
      v_expense_gl_account_id, v_ap_gl_account_id;
  END IF;

  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(
      '[
        {
          "idx": 1,
          "invoice_id": "10000000-0000-0000-0000-000000000001",
          "invoice_number": "TI-ATHQ-2026-001",
          "supplier_invoice_number": "SUP-TI-001",
          "title": "Draft software subscription invoice",
          "status": "draft",
          "amount": 1200.00,
          "paid_amount": 0.00,
          "workflow": false,
          "workflow_status": null,
          "workflow_decision": null,
          "stage_status": null,
          "work_item_status": null,
          "work_item_decision": null,
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "overview"
        },
        {
          "idx": 2,
          "invoice_id": "10000000-0000-0000-0000-000000000002",
          "invoice_number": "TI-ATHQ-2026-002",
          "supplier_invoice_number": "SUP-TI-002",
          "title": "Approval requested facilities invoice",
          "status": "pending_approval",
          "amount": 2450.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "pending",
          "workflow_decision": null,
          "stage_status": "active",
          "work_item_status": "assigned",
          "work_item_decision": null,
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "approvals"
        },
        {
          "idx": 3,
          "invoice_id": "10000000-0000-0000-0000-000000000003",
          "invoice_number": "TI-ATHQ-2026-003",
          "supplier_invoice_number": "SUP-TI-003",
          "title": "Approved legal services invoice",
          "status": "approved",
          "amount": 3180.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "approved",
          "workflow_decision": "approve",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "approve",
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "workflow"
        },
        {
          "idx": 4,
          "invoice_id": "10000000-0000-0000-0000-000000000004",
          "invoice_number": "TI-ATHQ-2026-004",
          "supplier_invoice_number": "SUP-TI-004",
          "title": "Posted data center invoice",
          "status": "posted",
          "amount": 4875.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "approved",
          "workflow_decision": "approve",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "approve",
          "create_posting": true,
          "is_reversal": false,
          "ui_focus": "versions"
        },
        {
          "idx": 5,
          "invoice_id": "10000000-0000-0000-0000-000000000005",
          "invoice_number": "TI-ATHQ-2026-005",
          "supplier_invoice_number": "SUP-TI-005",
          "title": "Partially paid consulting invoice",
          "status": "partially_paid",
          "amount": 5620.00,
          "paid_amount": 2248.00,
          "workflow": true,
          "workflow_status": "approved",
          "workflow_decision": "approve",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "approve",
          "create_posting": true,
          "is_reversal": false,
          "ui_focus": "versions"
        },
        {
          "idx": 6,
          "invoice_id": "10000000-0000-0000-0000-000000000006",
          "invoice_number": "TI-ATHQ-2026-006",
          "supplier_invoice_number": "SUP-TI-006",
          "title": "Fully paid audit invoice",
          "status": "fully_paid",
          "amount": 7050.00,
          "paid_amount": 7050.00,
          "workflow": true,
          "workflow_status": "approved",
          "workflow_decision": "approve",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "approve",
          "create_posting": true,
          "is_reversal": false,
          "ui_focus": "versions"
        },
        {
          "idx": 7,
          "invoice_id": "10000000-0000-0000-0000-000000000007",
          "invoice_number": "TI-ATHQ-2026-007",
          "supplier_invoice_number": "SUP-TI-007",
          "title": "On hold procurement exception invoice",
          "status": "on_hold",
          "amount": 1840.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "pending",
          "workflow_decision": null,
          "stage_status": "active",
          "work_item_status": "assigned",
          "work_item_decision": null,
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "approvals"
        },
        {
          "idx": 8,
          "invoice_id": "10000000-0000-0000-0000-000000000008",
          "invoice_number": "TI-ATHQ-2026-008",
          "supplier_invoice_number": "SUP-TI-008",
          "title": "Rejected duplicate invoice",
          "status": "rejected",
          "amount": 990.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "rejected",
          "workflow_decision": "reject",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "reject",
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "workflow"
        },
        {
          "idx": 9,
          "invoice_id": "10000000-0000-0000-0000-000000000009",
          "invoice_number": "TI-ATHQ-2026-009",
          "supplier_invoice_number": "SUP-TI-009",
          "title": "Cancelled vendor correction invoice",
          "status": "cancelled",
          "amount": 1655.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "canceled",
          "workflow_decision": null,
          "stage_status": "skipped",
          "work_item_status": "skipped",
          "work_item_decision": null,
          "create_posting": false,
          "is_reversal": false,
          "ui_focus": "versions"
        },
        {
          "idx": 10,
          "invoice_id": "10000000-0000-0000-0000-000000000010",
          "invoice_number": "TI-ATHQ-2026-010",
          "supplier_invoice_number": "SUP-TI-010",
          "title": "Reversed posted invoice",
          "status": "reversed",
          "amount": 4325.00,
          "paid_amount": 0.00,
          "workflow": true,
          "workflow_status": "approved",
          "workflow_decision": "approve",
          "stage_status": "completed",
          "work_item_status": "completed",
          "work_item_decision": "approve",
          "create_posting": true,
          "is_reversal": true,
          "reversal_of_invoice_id": "10000000-0000-0000-0000-000000000004",
          "ui_focus": "versions"
        }
      ]'::jsonb
    ) AS s(
      idx integer,
      invoice_id uuid,
      invoice_number text,
      supplier_invoice_number text,
      title text,
      status text,
      amount numeric,
      paid_amount numeric,
      workflow boolean,
      workflow_status text,
      workflow_decision text,
      stage_status text,
      work_item_status text,
      work_item_decision text,
      create_posting boolean,
      is_reversal boolean,
      reversal_of_invoice_id uuid,
      ui_focus text
    )
  LOOP
    SELECT pi.id
      INTO v_existing_invoice_id
    FROM document.purchase_invoice pi
    WHERE pi.tenant_id = v_tenant_id
      AND pi.company_code_id = v_company_code_id
      AND pi.invoice_number = r.invoice_number
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Skipping existing invoice % (%).', r.invoice_number, v_existing_invoice_id;
      CONTINUE;
    END IF;

    v_invoice_id := r.invoice_id;
    v_workflow_request_id := NULL;
    v_workflow_stage_id := NULL;
    v_parallel_stage_id := NULL;
    v_serial_stage_id := NULL;
    v_journal_entry_id := NULL;
    v_reference_line_id := NULL;
    v_anchor := now() - ((12 - r.idx) * interval '1 day');
    v_due_date := CURRENT_DATE + CASE WHEN r.idx = 2 THEN 1 ELSE 30 END;
    v_line_1_amount := ROUND((r.amount * 0.65)::numeric, 2);
    v_line_2_amount := r.amount - v_line_1_amount;
    v_approved_at := CASE
      WHEN r.status IN ('approved', 'posted', 'partially_paid', 'fully_paid', 'on_hold', 'reversed') THEN v_anchor + interval '6 hours'
      ELSE NULL
    END;

    INSERT INTO document.purchase_invoice (
      id,
      tenant_id,
      company_code_id,
      invoice_number,
      invoice_source,
      invoice_type,
      supplier_id,
      supplier_invoice_number,
      supplier_invoice_date,
      document_date,
      posting_date,
      received_date,
      due_date,
      currency_code,
      base_currency_code,
      exchange_rate,
      subtotal_amount,
      tax_amount,
      tax_mode,
      tax_mode_source,
      withholding_tax_amount,
      retention_amount,
      total_amount,
      paid_amount,
      line_count,
      fiscal_year,
      period_number,
      status,
      status_changed_at,
      approved_at,
      approved_by,
      is_posted,
      is_reversal,
      reversal_of_id,
      is_credit_note,
      hold_reason,
      metadata,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      v_invoice_id,
      v_tenant_id,
      v_company_code_id,
      r.invoice_number,
      'non_po',
      CASE WHEN r.is_reversal THEN 'credit_note' ELSE 'standard' END,
      v_supplier_id,
      r.supplier_invoice_number,
      (v_anchor::date - 2),
      v_anchor::date,
      v_anchor::date,
      v_anchor::date,
      v_due_date,
      'MYR',
      'MYR',
      1,
      r.amount,
      0,
      'no_tax',
      'user_override',
      0,
      0,
      r.amount,
      r.paid_amount,
      2,
      v_fiscal_year,
      v_period_number,
      'draft',
      v_anchor,
      v_approved_at,
      CASE WHEN v_approved_at IS NOT NULL THEN v_admin_id ELSE NULL END,
      false,
      r.is_reversal,
      CASE WHEN r.is_reversal THEN r.reversal_of_invoice_id ELSE NULL END,
      r.is_reversal,
      CASE WHEN r.status = 'on_hold' THEN 'Awaiting procurement exception review.' ELSE NULL END,
      jsonb_build_object(
        'seed', 'TestInvoice.sql',
        'seedUser', 'athq.admin',
        'legalEntity', 'Athyper Group Holdings',
        'title', r.title,
        'runtime', jsonb_build_object(
          'descriptorContract', 'MetaEntityRuntimeDescriptor',
          'recordStatusField', 'status',
          'processState', jsonb_build_object(
            'lifecycle', jsonb_build_object(
              'currentState', r.status,
              'terminal', r.status IN ('fully_paid', 'cancelled', 'reversed', 'rejected')
            ),
            'workflow', jsonb_build_object(
              'enabled', r.workflow,
              'status', r.workflow_status,
              'currentStage', CASE
                WHEN r.idx = 2 THEN 'Level 1 Parallel Approval'
                WHEN r.workflow THEN 'Invoice Approval'
                ELSE NULL
              END,
              'pendingTasks', CASE
                WHEN r.idx = 2 THEN 2
                WHEN r.work_item_status IN ('assigned', 'in_progress') THEN 1
                ELSE 0
              END
            )
          )
        ),
        'uiPresentation', jsonb_build_object(
          'defaultProcessTab', r.ui_focus,
          'workflow', jsonb_build_object(
            'surface', 'right_process_panel',
            'summary', CASE
              WHEN r.workflow_status = 'pending' THEN 'Approval in progress'
              WHEN r.workflow_status = 'approved' THEN 'Workflow approved'
              WHEN r.workflow_status = 'rejected' THEN 'Workflow rejected'
              WHEN r.workflow_status = 'canceled' THEN 'Workflow canceled'
              ELSE 'No workflow request'
            END
          ),
          'approvals', jsonb_build_object(
            'headline', CASE
              WHEN r.idx = 2 THEN 'Your approval is requested - due tomorrow'
              WHEN r.work_item_status = 'assigned' THEN 'Approval action is pending'
              WHEN r.work_item_status = 'completed' THEN 'Approval completed'
              WHEN r.work_item_status = 'skipped' THEN 'Approval skipped'
              ELSE 'No approval task'
            END,
            'actions', CASE
              WHEN r.work_item_status IN ('assigned', 'in_progress') THEN jsonb_build_array('Approve', 'Reject', 'Request changes')
              ELSE '[]'::jsonb
            END,
            'assignedTo', CASE
              WHEN r.idx = 2 THEN 'athq.admin, athq.manager'
              WHEN r.work_item_status IN ('assigned', 'in_progress') THEN 'athq.admin'
              ELSE NULL
            END,
            'dueDate', CASE WHEN r.work_item_status IN ('assigned', 'in_progress') THEN v_due_date ELSE NULL END
          ),
          'versions', jsonb_build_array(
            jsonb_build_object('version', 1, 'label', 'Created', 'status', 'completed', 'actor', 'athq.admin', 'at', v_anchor),
            jsonb_build_object('version', 2, 'label', 'Current lifecycle: ' || r.status, 'status', 'current', 'actor', 'athq.admin', 'at', v_anchor + interval '8 hours')
          )
        )
      ),
      v_admin_id,
      v_admin_id,
      v_anchor,
      v_anchor + interval '8 hours'
    );

    INSERT INTO document.purchase_invoice_line (
      tenant_id,
      purchase_invoice_id,
      line_no,
      item_description,
      procurement_type,
      uom_code,
      quantity,
      unit_price,
      gross_amount,
      discount_amount,
      discount_pct,
      tax_amount,
      withholding_tax_amount,
      retention_amount,
      status,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES
      (
        v_tenant_id,
        v_invoice_id,
        1,
        r.title || ' - service component',
        'services',
        'EA',
        1,
        v_line_1_amount,
        v_line_1_amount,
        0,
        0,
        0,
        0,
        0,
        CASE WHEN r.status IN ('cancelled', 'rejected') THEN 'cancelled' ELSE 'open' END,
        v_admin_id,
        v_admin_id,
        v_anchor,
        v_anchor
      ),
      (
        v_tenant_id,
        v_invoice_id,
        2,
        r.title || ' - support component',
        'services',
        'EA',
        1,
        v_line_2_amount,
        v_line_2_amount,
        0,
        0,
        0,
        0,
        0,
        CASE WHEN r.status IN ('cancelled', 'rejected') THEN 'cancelled' ELSE 'open' END,
        v_admin_id,
        v_admin_id,
        v_anchor,
        v_anchor
      );

    INSERT INTO document.invoice_party_snapshot (
      tenant_id,
      purchase_invoice_id,
      supplier_id,
      party_name,
      tax_registration_no,
      legal_entity_name,
      country_code,
      contact_name,
      contact_email,
      captured_at,
      captured_by,
      metadata
    )
    VALUES (
      v_tenant_id,
      v_invoice_id,
      v_supplier_id,
      v_supplier_name,
      'ATHQ-TAX-TEST',
      'Athyper Group Holdings',
      'MY',
      'Accounts Payable Test Desk',
      'ap-test@athyper.example',
      v_anchor,
      v_admin_id,
      jsonb_build_object('seed', 'TestInvoice.sql', 'snapshotFor', r.invoice_number)
    );

    INSERT INTO document.invoice_address_snapshot (
      tenant_id,
      purchase_invoice_id,
      address_type,
      address_line_1,
      city,
      state_province,
      postal_code,
      country_code,
      captured_at,
      captured_by
    )
    VALUES (
      v_tenant_id,
      v_invoice_id,
      'REMIT_TO',
      'Level 18, Athyper Test Tower',
      'Kuala Lumpur',
      'Wilayah Persekutuan',
      '50088',
      'MY',
      v_anchor,
      v_admin_id
    );

    INSERT INTO document.invoice_bank_snapshot (
      tenant_id,
      purchase_invoice_id,
      bank_name,
      bank_country_code,
      account_holder_name,
      account_number,
      captured_at,
      captured_by
    )
    VALUES (
      v_tenant_id,
      v_invoice_id,
      'Athyper Test Bank',
      'MY',
      v_supplier_name,
      '0000008842',
      v_anchor,
      v_admin_id
    );

    INSERT INTO document.payment_term_application (
      tenant_id,
      invoice_id,
      payment_term_id,
      term_snapshot,
      clause_snapshot,
      clause_type,
      clause_code,
      calculated_basis_amount,
      default_amount,
      applied_amount,
      evaluation_sequence_no,
      running_total_amount,
      remaining_balance_amount,
      base_event_date,
      days_applied,
      resolved_due_date,
      application_status,
      metadata,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      v_tenant_id,
      v_invoice_id,
      v_payment_term_id,
      jsonb_build_object(
        'code', 'PT-NET30',
        'name', 'Net 30 Days',
        'baseEvent', 'INVOICE_DATE',
        'dueRuleType', 'NET_DAYS',
        'dueDays', 30,
        'seed', 'TestInvoice.sql'
      ),
      jsonb_build_object(
        'clauseType', 'DUE_DATE',
        'clauseCode', 'DUE_DATE',
        'baseEventDate', v_anchor::date,
        'daysApplied', CASE WHEN r.idx = 2 THEN 1 ELSE 30 END,
        'resolvedDueDate', v_due_date,
        'seed', 'TestInvoice.sql'
      ),
      'DUE_DATE',
      'DUE_DATE',
      r.amount,
      0,
      0,
      1,
      r.amount,
      r.amount,
      v_anchor::date,
      CASE WHEN r.idx = 2 THEN 1 ELSE 30 END,
      v_due_date,
      'APPLIED',
      jsonb_build_object(
        'seed', 'TestInvoice.sql',
        'explanation', CASE WHEN r.idx = 2 THEN 'Level 1 parallel approvals due tomorrow for athq.admin and athq.manager.' ELSE 'Standard net 30 test term.' END
      ),
      v_admin_id,
      v_admin_id,
      v_anchor,
      v_anchor
    );

    INSERT INTO document.invoice_match_case (
      tenant_id,
      company_code_id,
      purchase_invoice_id,
      match_type,
      match_result,
      total_quantity_variance,
      total_price_variance,
      total_amount_variance,
      has_exceptions,
      exception_count,
      matched_at,
      matched_by,
      status,
      metadata,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      v_tenant_id,
      v_company_code_id,
      v_invoice_id,
      'no_match',
      CASE
        WHEN r.status = 'on_hold' THEN 'exception'
        WHEN r.status = 'rejected' THEN 'rejected'
        WHEN r.status IN ('draft', 'pending_approval') THEN 'pending'
        ELSE 'matched'
      END,
      0,
      0,
      CASE WHEN r.status = 'on_hold' THEN 125.00 ELSE 0 END,
      r.status = 'on_hold',
      CASE WHEN r.status = 'on_hold' THEN 1 ELSE 0 END,
      CASE WHEN r.status IN ('approved', 'posted', 'partially_paid', 'fully_paid', 'reversed') THEN v_anchor + interval '3 hours' ELSE NULL END,
      CASE WHEN r.status IN ('approved', 'posted', 'partially_paid', 'fully_paid', 'reversed') THEN v_admin_id ELSE NULL END,
      CASE
        WHEN r.status = 'on_hold' THEN 'exception'
        WHEN r.status = 'cancelled' THEN 'cancelled'
        WHEN r.status IN ('draft', 'pending_approval') THEN 'pending'
        ELSE 'completed'
      END,
      jsonb_build_object(
        'seed', 'TestInvoice.sql',
        'rules', jsonb_build_array(
          jsonb_build_object('rule', 'supplier_snapshot', 'result', 'passed'),
          jsonb_build_object('rule', 'amount_validation', 'result', CASE WHEN r.status = 'on_hold' THEN 'exception' ELSE 'passed' END),
          jsonb_build_object('rule', 'approval_visibility', 'result', CASE WHEN r.idx = 2 THEN 'parallel_level_1_assigned_to_athq_admin_and_athq_manager' ELSE 'not_applicable' END)
        ),
        'exceptionSummary', CASE WHEN r.status = 'on_hold' THEN 'Procurement exception review is required before approval can continue.' ELSE NULL END
      ),
      v_admin_id,
      v_admin_id,
      v_anchor,
      v_anchor
    );

    IF r.workflow THEN
      v_workflow_request_id := shared.uuidv7();
      v_workflow_stage_id := shared.uuidv7();

      INSERT INTO document.workflow_request (
        id,
        tenant_id,
        workflow_type,
        entity_type,
        entity_id,
        entity_snapshot,
        requested_by,
        requested_at,
        status,
        decision,
        decided_by,
        decided_at,
        reason,
        metadata,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        v_workflow_request_id,
        v_tenant_id,
        'approval',
        'purchase_invoice',
        v_invoice_id::text,
        jsonb_build_object(
          'invoiceNumber', r.invoice_number,
          'status', r.status,
          'amount', r.amount,
          'currencyCode', 'MYR',
          'legalEntity', 'Athyper Group Holdings'
        ),
        v_admin_id,
        v_anchor + interval '1 hour',
        r.workflow_status,
        r.workflow_decision,
        CASE WHEN r.workflow_decision IS NOT NULL THEN v_admin_id ELSE NULL END,
        CASE WHEN r.workflow_decision IS NOT NULL THEN v_anchor + interval '5 hours' ELSE NULL END,
        CASE
          WHEN r.workflow_decision = 'reject' THEN 'Rejected as part of TestInvoice lifecycle coverage.'
          WHEN r.workflow_decision = 'approve' THEN 'Approved as part of TestInvoice lifecycle coverage.'
          ELSE NULL
        END,
        jsonb_build_object(
          'seed', 'TestInvoice.sql',
          'approvalCard', jsonb_build_object(
            'headline', CASE WHEN r.idx = 2 THEN 'Your approval is requested - due tomorrow' ELSE NULL END,
            'actions', CASE WHEN r.idx IN (2, 7) THEN jsonb_build_array('Approve', 'Reject', 'Request changes') ELSE '[]'::jsonb END
          ),
          'approvalTopology', jsonb_build_object(
            'mode', CASE WHEN r.idx = 2 THEN 'parallel_then_serial' ELSE 'single_stage' END,
            'stages', CASE
              WHEN r.idx = 2 THEN jsonb_build_array(
                jsonb_build_object(
                  'stageNo', 1,
                  'name', 'Level 1 Parallel Approval',
                  'mode', 'parallel',
                  'required', 2,
                  'approvers', jsonb_build_array('athq.admin', 'athq.manager'),
                  'status', 'active'
                ),
                jsonb_build_object(
                  'stageNo', 2,
                  'name', 'Level 2 CFO Approval',
                  'mode', 'serial',
                  'required', 1,
                  'approvers', jsonb_build_array('athq.cfo'),
                  'status', 'pending'
                )
              )
              ELSE jsonb_build_array(
                jsonb_build_object(
                  'stageNo', 1,
                  'name', 'Invoice Approval',
                  'mode', 'serial',
                  'required', 1,
                  'status', r.stage_status
                )
              )
            END
          )
        ),
        v_admin_id,
        v_admin_id,
        v_anchor + interval '1 hour',
        v_anchor + interval '5 hours'
      );

      IF r.idx = 2 THEN
        v_parallel_stage_id := v_workflow_stage_id;
        v_serial_stage_id := shared.uuidv7();

        INSERT INTO document.workflow_stage (
          id,
          tenant_id,
          workflow_request_id,
          stage_no,
          name,
          mode,
          quorum,
          status,
          started_at,
          completed_at,
          outcome,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES
          (
            v_parallel_stage_id,
            v_tenant_id,
            v_workflow_request_id,
            1,
            'Level 1 Parallel Approval',
            'parallel',
            jsonb_build_object('strategy', 'unanimous', 'required', 2, 'mode', 'parallel', 'approvalLevel', 1),
            'active',
            v_anchor + interval '1 hour',
            NULL,
            NULL,
            v_admin_id,
            v_admin_id,
            v_anchor + interval '1 hour',
            v_anchor + interval '1 hour'
          ),
          (
            v_serial_stage_id,
            v_tenant_id,
            v_workflow_request_id,
            2,
            'Level 2 CFO Approval',
            'serial',
            jsonb_build_object('strategy', 'count', 'required', 1, 'mode', 'serial', 'approvalLevel', 2),
            'pending',
            NULL,
            NULL,
            NULL,
            v_admin_id,
            v_admin_id,
            v_anchor + interval '1 hour',
            v_anchor + interval '1 hour'
          );

        INSERT INTO event.work_item (
          id,
          tenant_id,
          task_type,
          workflow_request_id,
          workflow_stage_id,
          designated_id,
          assignee_id,
          order_index,
          status,
          assigned_at,
          started_at,
          completed_at,
          due_at,
          decision,
          reason,
          metadata,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES
          (
            shared.uuidv7(),
            v_tenant_id,
            'approval',
            v_workflow_request_id,
            v_parallel_stage_id,
            v_parallel_approver_1_id,
            v_parallel_approver_1_id,
            1,
            'assigned',
            v_anchor + interval '1 hour',
            NULL,
            NULL,
            v_due_date::timestamp + time '17:00',
            NULL,
            'Level 1 parallel approval pending for athq.admin.',
            jsonb_build_object(
              'seed', 'TestInvoice.sql',
              'principalAware', true,
              'visibleTo', jsonb_build_array('athq.admin'),
              'uiMessage', 'Your approval is requested - due tomorrow',
              'actions', jsonb_build_array('Approve', 'Reject', 'Request changes'),
              'approvalLevel', 1,
              'sequenceMode', 'parallel',
              'parallelGroup', 'level_1',
              'nextStage', 'Level 2 CFO Approval'
            ),
            v_admin_id,
            v_admin_id,
            v_anchor + interval '1 hour',
            v_anchor + interval '1 hour'
          ),
          (
            shared.uuidv7(),
            v_tenant_id,
            'approval',
            v_workflow_request_id,
            v_parallel_stage_id,
            v_parallel_approver_2_id,
            v_parallel_approver_2_id,
            1,
            'assigned',
            v_anchor + interval '1 hour',
            NULL,
            NULL,
            v_due_date::timestamp + time '17:00',
            NULL,
            'Level 1 parallel approval pending for athq.manager.',
            jsonb_build_object(
              'seed', 'TestInvoice.sql',
              'principalAware', true,
              'visibleTo', jsonb_build_array('athq.manager'),
              'uiMessage', 'Parallel approval is requested - due tomorrow',
              'actions', jsonb_build_array('Approve', 'Reject', 'Request changes'),
              'approvalLevel', 1,
              'sequenceMode', 'parallel',
              'parallelGroup', 'level_1',
              'nextStage', 'Level 2 CFO Approval'
            ),
            v_admin_id,
            v_admin_id,
            v_anchor + interval '1 hour',
            v_anchor + interval '1 hour'
          ),
          (
            shared.uuidv7(),
            v_tenant_id,
            'approval',
            v_workflow_request_id,
            v_serial_stage_id,
            v_serial_approver_id,
            v_serial_approver_id,
            1,
            'pending',
            NULL,
            NULL,
            NULL,
            (v_due_date + 2)::timestamp + time '17:00',
            NULL,
            'Waiting for level 1 parallel approvals before CFO review.',
            jsonb_build_object(
              'seed', 'TestInvoice.sql',
              'principalAware', true,
              'visibleTo', jsonb_build_array('athq.cfo'),
              'uiMessage', 'Waiting for level 1 parallel approvals.',
              'actions', '[]'::jsonb,
              'approvalLevel', 2,
              'sequenceMode', 'serial',
              'dependsOn', 'level_1'
            ),
            v_admin_id,
            v_admin_id,
            v_anchor + interval '1 hour',
            v_anchor + interval '1 hour'
          );
      ELSE
        INSERT INTO document.workflow_stage (
          id,
          tenant_id,
          workflow_request_id,
          stage_no,
          name,
          mode,
          quorum,
          status,
          started_at,
          completed_at,
          outcome,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          v_workflow_stage_id,
          v_tenant_id,
          v_workflow_request_id,
          1,
          'Invoice Approval',
          'serial',
          jsonb_build_object('required', 1, 'mode', 'single_approver'),
          r.stage_status,
          CASE WHEN r.stage_status IN ('active', 'completed', 'skipped', 'canceled') THEN v_anchor + interval '1 hour' ELSE NULL END,
          CASE WHEN r.stage_status IN ('completed', 'skipped', 'canceled') THEN v_anchor + interval '5 hours' ELSE NULL END,
          CASE
            WHEN r.workflow_decision = 'approve' THEN 'approved'
            WHEN r.workflow_decision = 'reject' THEN 'rejected'
            WHEN r.stage_status = 'skipped' THEN 'skipped'
            ELSE NULL
          END,
          v_admin_id,
          v_admin_id,
          v_anchor + interval '1 hour',
          v_anchor + interval '5 hours'
        );

        INSERT INTO event.work_item (
          id,
          tenant_id,
          task_type,
          workflow_request_id,
          workflow_stage_id,
          designated_id,
          assignee_id,
          order_index,
          status,
          assigned_at,
          started_at,
          completed_at,
          due_at,
          decision,
          reason,
          metadata,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          shared.uuidv7(),
          v_tenant_id,
          'approval',
          v_workflow_request_id,
          v_workflow_stage_id,
          v_admin_id,
          v_admin_id,
          1,
          r.work_item_status,
          CASE WHEN r.work_item_status IN ('assigned', 'in_progress', 'completed', 'skipped', 'escalated') THEN v_anchor + interval '1 hour' ELSE NULL END,
          CASE WHEN r.work_item_status IN ('in_progress', 'completed') THEN v_anchor + interval '2 hours' ELSE NULL END,
          CASE WHEN r.work_item_status IN ('completed', 'skipped', 'escalated') THEN v_anchor + interval '5 hours' ELSE NULL END,
          CASE WHEN r.work_item_status IN ('assigned', 'in_progress') THEN (v_due_date::timestamp + time '17:00') ELSE NULL END,
          r.work_item_decision,
          CASE
            WHEN r.status = 'on_hold' THEN 'On hold until procurement exception is cleared.'
            WHEN r.workflow_decision = 'reject' THEN 'Rejected during test approval route.'
            WHEN r.workflow_decision = 'approve' THEN 'Approved during test approval route.'
            ELSE NULL
          END,
          jsonb_build_object(
            'seed', 'TestInvoice.sql',
            'principalAware', true,
            'visibleTo', jsonb_build_array('athq.admin'),
            'uiMessage', NULL,
            'actions', CASE WHEN r.work_item_status IN ('assigned', 'in_progress') THEN jsonb_build_array('Approve', 'Reject', 'Request changes') ELSE '[]'::jsonb END
          ),
          v_admin_id,
          v_admin_id,
          v_anchor + interval '1 hour',
          v_anchor + interval '5 hours'
        );
      END IF;

      UPDATE document.purchase_invoice
      SET workflow_request_id = v_workflow_request_id,
          updated_by = v_admin_id,
          updated_at = v_anchor + interval '5 hours'
      WHERE id = v_invoice_id;

      INSERT INTO log.workflow_event_log (
        tenant_id,
        event_type,
        severity,
        instance_id,
        step_instance_id,
        workflow_template_code,
        entity_type,
        entity_id,
        actor_id,
        from_status,
        to_status,
        transition_name,
        action,
        previous_state,
        new_state,
        comment,
        detail,
        created_by,
        created_at
      )
      VALUES (
        v_tenant_id,
        'workflow.transition',
        'info',
        v_workflow_request_id::text,
        v_workflow_stage_id::text,
        'TEST_INVOICE_APPROVAL',
        'purchase_invoice',
        v_invoice_id,
        v_admin_id,
        'draft',
        r.workflow_status,
        CASE WHEN r.idx = 2 THEN 'Level 1 Parallel Approval' ELSE 'Invoice Approval' END,
        COALESCE(r.workflow_decision, 'submit'),
        jsonb_build_object('status', 'draft'),
        jsonb_build_object(
          'status', r.workflow_status,
          'stage', r.stage_status,
          'currentStage', CASE WHEN r.idx = 2 THEN 'Level 1 Parallel Approval' ELSE 'Invoice Approval' END
        ),
        CASE WHEN r.idx = 2 THEN 'Waiting for level 1 parallel approvals - due tomorrow' ELSE 'Test invoice workflow state seeded.' END,
        jsonb_build_object(
          'seed', 'TestInvoice.sql',
          'invoiceNumber', r.invoice_number,
          'approvalTopology', CASE
            WHEN r.idx = 2 THEN jsonb_build_object(
              'mode', 'parallel_then_serial',
              'activeStage', 'Level 1 Parallel Approval',
              'pendingParallelApprovers', jsonb_build_array('athq.admin', 'athq.manager'),
              'nextSerialApprover', 'athq.cfo'
            )
            ELSE jsonb_build_object('mode', 'single_stage')
          END
        ),
        v_admin_id,
        v_anchor + interval '5 hours'
      );
    END IF;

    IF r.create_posting THEN
      v_journal_entry_id := shared.uuidv7();

      INSERT INTO document.journal_entry (
        id,
        tenant_id,
        code,
        name,
        company_code_id,
        book_id,
        fiscal_period_id,
        fiscal_year,
        period_number,
        je_number,
        document_date,
        posting_date,
        source_doc_type,
        source_doc_id,
        transaction_currency,
        base_currency,
        total_debit,
        total_credit,
        line_count,
        is_reversal,
        status,
        posted_at,
        posted_by,
        description,
        metadata,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        v_journal_entry_id,
        v_tenant_id,
        'JE-' || r.invoice_number,
        CASE WHEN r.is_reversal THEN 'Reversal accounting for ' || r.invoice_number ELSE 'AP recognition for ' || r.invoice_number END,
        v_company_code_id,
        v_book_id,
        v_fiscal_period_id,
        v_fiscal_year,
        v_period_number,
        'JE-' || r.invoice_number,
        v_anchor::date,
        v_anchor::date,
        CASE WHEN r.is_reversal THEN 'reversal' ELSE 'purchase_invoice' END,
        v_invoice_id,
        'MYR',
        'MYR',
        r.amount,
        r.amount,
        2,
        false,
        'draft',
        NULL,
        NULL,
        CASE WHEN r.is_reversal THEN 'Reversal accounting for ' || r.invoice_number ELSE 'AP recognition for ' || r.invoice_number END,
        jsonb_build_object('seed', 'TestInvoice.sql', 'invoiceNumber', r.invoice_number, 'lifecycleStatus', r.status),
        v_admin_id,
        v_admin_id,
        v_anchor + interval '9 hours',
        v_anchor + interval '9 hours'
      );

      IF r.is_reversal THEN
        INSERT INTO document.journal_line (
          tenant_id,
          journal_entry_id,
          company_code_id,
          book_id,
          fiscal_period_id,
          fiscal_year,
          period_number,
          posting_date,
          line_no,
          gl_account_id,
          description,
          transaction_currency,
          transaction_debit,
          transaction_credit,
          base_currency,
          base_debit,
          base_credit,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          v_journal_entry_id,
          v_company_code_id,
          v_book_id,
          v_fiscal_period_id,
          v_fiscal_year,
          v_period_number,
          v_anchor::date,
          1,
          v_ap_gl_account_id,
          'Reverse AP liability for ' || r.invoice_number,
          'MYR',
          r.amount,
          0,
          'MYR',
          r.amount,
          0,
          v_admin_id,
          v_admin_id,
          v_anchor + interval '9 hours',
          v_anchor + interval '9 hours'
        )
        RETURNING id INTO v_reference_line_id;

        INSERT INTO document.journal_line (
          tenant_id,
          journal_entry_id,
          company_code_id,
          book_id,
          fiscal_period_id,
          fiscal_year,
          period_number,
          posting_date,
          line_no,
          gl_account_id,
          description,
          transaction_currency,
          transaction_debit,
          transaction_credit,
          base_currency,
          base_debit,
          base_credit,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          v_journal_entry_id,
          v_company_code_id,
          v_book_id,
          v_fiscal_period_id,
          v_fiscal_year,
          v_period_number,
          v_anchor::date,
          2,
          v_expense_gl_account_id,
          'Reverse expense for ' || r.invoice_number,
          'MYR',
          0,
          r.amount,
          'MYR',
          0,
          r.amount,
          v_admin_id,
          v_admin_id,
          v_anchor + interval '9 hours',
          v_anchor + interval '9 hours'
        );
      ELSE
        INSERT INTO document.journal_line (
          tenant_id,
          journal_entry_id,
          company_code_id,
          book_id,
          fiscal_period_id,
          fiscal_year,
          period_number,
          posting_date,
          line_no,
          gl_account_id,
          description,
          transaction_currency,
          transaction_debit,
          transaction_credit,
          base_currency,
          base_debit,
          base_credit,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          v_journal_entry_id,
          v_company_code_id,
          v_book_id,
          v_fiscal_period_id,
          v_fiscal_year,
          v_period_number,
          v_anchor::date,
          1,
          v_expense_gl_account_id,
          'Invoice expense for ' || r.invoice_number,
          'MYR',
          r.amount,
          0,
          'MYR',
          r.amount,
          0,
          v_admin_id,
          v_admin_id,
          v_anchor + interval '9 hours',
          v_anchor + interval '9 hours'
        );

        INSERT INTO document.journal_line (
          tenant_id,
          journal_entry_id,
          company_code_id,
          book_id,
          fiscal_period_id,
          fiscal_year,
          period_number,
          posting_date,
          line_no,
          gl_account_id,
          description,
          transaction_currency,
          transaction_debit,
          transaction_credit,
          base_currency,
          base_debit,
          base_credit,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          v_journal_entry_id,
          v_company_code_id,
          v_book_id,
          v_fiscal_period_id,
          v_fiscal_year,
          v_period_number,
          v_anchor::date,
          2,
          v_ap_gl_account_id,
          'AP liability for ' || r.invoice_number,
          'MYR',
          0,
          r.amount,
          'MYR',
          0,
          r.amount,
          v_admin_id,
          v_admin_id,
          v_anchor + interval '9 hours',
          v_anchor + interval '9 hours'
        )
        RETURNING id INTO v_reference_line_id;
      END IF;

      INSERT INTO document.journal_line_reference (
        tenant_id,
        journal_line_id,
        ref_type,
        ref_doc_type,
        ref_doc_id,
        allocated_amount,
        currency_code,
        base_amount,
        metadata,
        created_by
      )
      VALUES (
        v_tenant_id,
        v_reference_line_id,
        'invoice_adjustment',
        'purchase_invoice',
        v_invoice_id,
        r.amount,
        'MYR',
        r.amount,
        jsonb_build_object('seed', 'TestInvoice.sql', 'invoiceNumber', r.invoice_number),
        v_admin_id
      );

      UPDATE document.journal_entry
      SET status = 'created',
          updated_by = v_admin_id,
          updated_at = v_anchor + interval '9 hours'
      WHERE id = v_journal_entry_id;

      UPDATE document.journal_entry
      SET status = 'posted',
          posted_at = v_anchor + interval '9 hours',
          posted_by = v_admin_id,
          updated_by = v_admin_id,
          updated_at = v_anchor + interval '9 hours'
      WHERE id = v_journal_entry_id;

      UPDATE document.purchase_invoice
      SET ap_je_id = v_journal_entry_id,
          is_posted = true,
          posted_at = v_anchor + interval '9 hours',
          posted_by = v_admin_id,
          updated_by = v_admin_id,
          updated_at = v_anchor + interval '9 hours'
      WHERE id = v_invoice_id;
    END IF;

    IF r.status = 'cancelled' THEN
      UPDATE document.purchase_invoice
      SET status = 'cancelled',
          updated_by = v_admin_id,
          updated_at = v_anchor + interval '10 hours'
      WHERE id = v_invoice_id;
    ELSE
      IF r.status IN ('pending_approval', 'approved', 'posted', 'partially_paid', 'fully_paid', 'on_hold', 'rejected', 'reversed') THEN
        UPDATE document.purchase_invoice
        SET status = 'pending_approval',
            updated_by = v_admin_id,
            updated_at = v_anchor + interval '10 hours'
        WHERE id = v_invoice_id;
      END IF;

      IF r.status = 'rejected' THEN
        UPDATE document.purchase_invoice
        SET status = 'rejected',
            updated_by = v_admin_id,
            updated_at = v_anchor + interval '10 hours'
        WHERE id = v_invoice_id;
      ELSIF r.status IN ('approved', 'posted', 'partially_paid', 'fully_paid', 'on_hold', 'reversed') THEN
        UPDATE document.purchase_invoice
        SET status = 'approved',
            updated_by = v_admin_id,
            updated_at = v_anchor + interval '10 hours'
        WHERE id = v_invoice_id;

        IF r.status = 'on_hold' THEN
          UPDATE document.purchase_invoice
          SET status = 'on_hold',
              updated_by = v_admin_id,
              updated_at = v_anchor + interval '10 hours'
          WHERE id = v_invoice_id;
        ELSIF r.status IN ('posted', 'partially_paid', 'fully_paid', 'reversed') THEN
          UPDATE document.purchase_invoice
          SET status = 'posted',
              updated_by = v_admin_id,
              updated_at = v_anchor + interval '10 hours'
          WHERE id = v_invoice_id;

          IF r.status IN ('partially_paid', 'fully_paid') THEN
            UPDATE document.purchase_invoice
            SET status = 'partially_paid',
                updated_by = v_admin_id,
                updated_at = v_anchor + interval '10 hours'
            WHERE id = v_invoice_id;
          END IF;

          IF r.status = 'fully_paid' THEN
            UPDATE document.purchase_invoice
            SET status = 'fully_paid',
                updated_by = v_admin_id,
                updated_at = v_anchor + interval '10 hours'
            WHERE id = v_invoice_id;
          ELSIF r.status = 'reversed' THEN
            UPDATE document.purchase_invoice
            SET status = 'reversed',
                updated_by = v_admin_id,
                updated_at = v_anchor + interval '10 hours'
            WHERE id = v_invoice_id;
          END IF;
        END IF;
      END IF;
    END IF;

    INSERT INTO log.entity_lifecycle_log (
      tenant_id,
      entity_type,
      entity_id,
      lifecycle_id,
      operation_code,
      from_status,
      to_status,
      actor_id,
      company_code_id,
      remarks,
      payload,
      created_by,
      created_at
    )
    VALUES (
      v_tenant_id,
      'purchase_invoice',
      v_invoice_id,
      NULL,
      CASE r.status
        WHEN 'draft' THEN 'create'
        WHEN 'pending_approval' THEN 'submit'
        WHEN 'approved' THEN 'approve'
        WHEN 'posted' THEN 'post'
        WHEN 'partially_paid' THEN 'record_partial_payment'
        WHEN 'fully_paid' THEN 'record_full_payment'
        WHEN 'on_hold' THEN 'hold'
        WHEN 'rejected' THEN 'reject'
        WHEN 'cancelled' THEN 'cancel'
        WHEN 'reversed' THEN 'reverse'
        ELSE 'update'
      END,
      'draft',
      r.status,
      v_admin_id,
      v_company_code_id,
      'Seeded by TestInvoice.sql for lifecycle/runtime UI coverage.',
      jsonb_build_object(
        'seed', 'TestInvoice.sql',
        'invoiceNumber', r.invoice_number,
        'status', r.status,
        'workflowRequestId', v_workflow_request_id,
        'journalEntryId', v_journal_entry_id
      ),
      v_admin_id,
      v_anchor + interval '10 hours'
    );

    INSERT INTO log.activity_log (
      tenant_id,
      domain,
      activity_type,
      entity_type,
      entity_id,
      actor_id,
      company_code_id,
      detail,
      correlation_id,
      created_by,
      created_at
    )
    VALUES
      (
        v_tenant_id,
        'document',
        'document.created',
        'purchase_invoice',
        v_invoice_id,
        v_admin_id,
        v_company_code_id,
        jsonb_build_object('seed', 'TestInvoice.sql', 'invoiceNumber', r.invoice_number, 'version', 1),
        v_invoice_id,
        v_admin_id,
        v_anchor
      ),
      (
        v_tenant_id,
        'document',
        'document.updated',
        'purchase_invoice',
        v_invoice_id,
        v_admin_id,
        v_company_code_id,
        jsonb_build_object('seed', 'TestInvoice.sql', 'invoiceNumber', r.invoice_number, 'fromStatus', 'draft', 'toStatus', r.status, 'version', 2),
        v_invoice_id,
        v_admin_id,
        v_anchor + interval '10 hours'
      );

    RAISE NOTICE 'Created invoice % in status %.', r.invoice_number, r.status;
  END LOOP;
END $$;

-- UI layout recommendation encoded by this data set:
--   Header: lifecycle chip from purchase_invoice.status.
--   Tabs: Overview, Workflow, Approvals, Versions.
--   Right process rail:
--     - Workflow shows request status, current stage, task count, SLA/due date.
--     - Approvals shows only principal-visible work items. For TI-ATHQ-2026-002,
--       level 1 is active with two parallel work items:
--         athq.admin + athq.manager, both due tomorrow.
--       level 2 is pending with athq.cfo as the serial approver.
--     - Versions shows activity/version events first, then accounting/workflow links.
