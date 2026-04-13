-- =============================================================================
-- LookupDomain/document/p2p_lookup_values.sql
-- Lookup values for all P2P document domains
-- Idempotent: WHERE NOT EXISTS guards on every INSERT
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Document sequence types (registered for auto-numbering engine)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_requisition',        'Purchase Requisition',       'control.document_sequence_doc_type', 'Internal purchase request',                75),
    ('delivery_note',               'Delivery Note',              'control.document_sequence_doc_type', 'Inbound logistics delivery artifact',       65),
    ('goods_receipt',               'Goods Receipt',              'control.document_sequence_doc_type', 'Approvable goods receipt posting',          68),
    ('service_entry_sheet',         'Service Entry Sheet',        'control.document_sequence_doc_type', 'Approvable service completion sheet',       72),
    ('purchase_order_confirmation', 'PO Confirmation',            'control.document_sequence_doc_type', 'Vendor PO acknowledgement artifact',        82),
    ('purchase_invoice',            'Purchase Invoice',           'control.document_sequence_doc_type', 'Approvable AP invoice',                     85),
    ('invoice_match_case',          'Invoice Match Case',         'control.document_sequence_doc_type', 'Invoice reconciliation case header',        87),
    ('payment_entry',               'Payment Entry',              'control.document_sequence_doc_type', 'Approvable outbound payment',               90),
    ('payment_remittance_output',   'Payment Remittance Output',  'control.document_sequence_doc_type', 'Remittance advice output to vendor',        95)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JE source doc types (P2P-originated journal entries)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('goods_receipt',           'Goods Receipt',          'document.je_source_doc_type', 'GR/IR accrual at goods receipt posting',         150),
    ('service_entry_sheet',     'Service Entry Sheet',    'document.je_source_doc_type', 'SES accrual at service sheet posting',           160),
    ('commitment_encumbrance',  'Commitment Encumbrance', 'document.je_source_doc_type', 'PO/contract encumbrance at approval',            170),
    ('advance_payment',         'Advance Payment',        'document.je_source_doc_type', 'Advance to supplier prepayment posting',         180),
    ('advance_recovery',        'Advance Recovery',       'document.je_source_doc_type', 'Advance recovery at invoice matching',           190),
    ('retention_release',       'Retention Release',      'document.je_source_doc_type', 'AP retention payable release payment',           200)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase requisition types
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',           'Standard',             'document.purchase_requisition_type', 'Standard purchase request',                     10),
    ('urgent',             'Urgent',               'document.purchase_requisition_type', 'Urgent / fast-track purchase request',          20),
    ('blanket',            'Blanket',              'document.purchase_requisition_type', 'Blanket requisition for recurring purchases',   30),
    ('framework_call_off', 'Framework Call-Off',   'document.purchase_requisition_type', 'Call-off from a framework agreement',           40),
    ('capex',              'Capital Expenditure',  'document.purchase_requisition_type', 'Capital asset purchase request',                50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase requisition status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',                'Draft',                 'document.purchase_requisition_status', 'PR in draft; not yet submitted',              10),
    ('pending_approval',     'Pending Approval',      'document.purchase_requisition_status', 'Submitted and awaiting approver action',      20),
    ('approved',             'Approved',              'document.purchase_requisition_status', 'Approved; ready to convert to PO',           30),
    ('rejected',             'Rejected',              'document.purchase_requisition_status', 'Rejected by approver',                        40),
    ('partially_converted',  'Partially Converted',   'document.purchase_requisition_status', 'Some lines converted to PO',                 50),
    ('fully_converted',      'Fully Converted',       'document.purchase_requisition_status', 'All lines converted to PO',                  60),
    ('closed',               'Closed',                'document.purchase_requisition_status', 'Manually closed by requester or manager',    70),
    ('cancelled',            'Cancelled',             'document.purchase_requisition_status', 'Cancelled before approval',                  80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Commitment line status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('open',                  'Open',                  'document.commitment_line_status', 'Line open; no receipt yet',                   10),
    ('partially_received',    'Partially Received',    'document.commitment_line_status', 'Some quantity receipted',                     20),
    ('fully_received',        'Fully Received',        'document.commitment_line_status', 'All quantity receipted',                      30),
    ('partially_invoiced',    'Partially Invoiced',    'document.commitment_line_status', 'Some quantity invoiced',                      40),
    ('fully_invoiced',        'Fully Invoiced',        'document.commitment_line_status', 'All quantity invoiced',                       50),
    ('closed',                'Closed',                'document.commitment_line_status', 'Line manually closed',                        60),
    ('cancelled',             'Cancelled',             'document.commitment_line_status', 'Line cancelled',                              70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Goods receipt status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',            'Draft',            'document.goods_receipt_status', 'GR in draft',                    10),
    ('pending_approval', 'Pending Approval', 'document.goods_receipt_status', 'Awaiting approver action',       20),
    ('approved',         'Approved',         'document.goods_receipt_status', 'Approved; ready to post',        30),
    ('posted',           'Posted',           'document.goods_receipt_status', 'Inventory and accrual posted',   40),
    ('reversed',         'Reversed',         'document.goods_receipt_status', 'GR reversed via reversal GR',   50),
    ('cancelled',        'Cancelled',        'document.goods_receipt_status', 'GR cancelled before posting',   60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Service entry sheet status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',               'Draft',               'document.ses_status', 'SES in draft',                             10),
    ('pending_acceptance',  'Pending Acceptance',  'document.ses_status', 'Submitted to requestor for acceptance',    20),
    ('accepted',            'Accepted',            'document.ses_status', 'Requestor accepted; pending finance',      30),
    ('pending_approval',    'Pending Approval',    'document.ses_status', 'Finance approval in progress',             40),
    ('approved',            'Approved',            'document.ses_status', 'Approved; ready to post',                  50),
    ('posted',              'Posted',              'document.ses_status', 'Accrual JE posted',                        60),
    ('reversed',            'Reversed',            'document.ses_status', 'SES reversed via reversal SES',           70),
    ('cancelled',           'Cancelled',           'document.ses_status', 'SES cancelled before posting',            80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase invoice source
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('po_based',        'PO-Based',           'document.purchase_invoice_source', 'Invoice matched to a purchase order',        10),
    ('contract_based',  'Contract-Based',     'document.purchase_invoice_source', 'Invoice matched to a contract',              20),
    ('non_po',          'Non-PO',             'document.purchase_invoice_source', 'Invoice with no prior commitment',           30),
    ('one_time_vendor', 'One-Time Vendor',    'document.purchase_invoice_source', 'Invoice from a non-registered vendor',       40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase invoice type
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',           'Standard',              'document.purchase_invoice_type', 'Regular AP invoice',                          10),
    ('credit_note',        'Credit Note',           'document.purchase_invoice_type', 'Supplier credit reducing outstanding',        20),
    ('debit_note',         'Debit Note',            'document.purchase_invoice_type', 'Buyer-generated debit to supplier',           30),
    ('advance',            'Advance',               'document.purchase_invoice_type', 'Advance payment invoice',                     40),
    ('retention_release',  'Retention Release',     'document.purchase_invoice_type', 'Release of withheld retention amount',        50),
    ('proforma',           'Pro-forma',             'document.purchase_invoice_type', 'Proforma invoice (not posted)',               60),
    ('self_billed',        'Self-Billed',           'document.purchase_invoice_type', 'Buyer-created invoice on behalf of vendor',   70),
    ('down_payment',       'Down Payment',          'document.purchase_invoice_type', 'Down payment request invoice',                80),
    ('final',              'Final',                 'document.purchase_invoice_type', 'Final invoice closing the commitment',        90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase invoice status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',            'Draft',             'document.purchase_invoice_status', 'Invoice in draft',                        10),
    ('pending_approval', 'Pending Approval',  'document.purchase_invoice_status', 'Awaiting approval',                       20),
    ('approved',         'Approved',          'document.purchase_invoice_status', 'Approved; ready to post',                 30),
    ('posted',           'Posted',            'document.purchase_invoice_status', 'AP JE posted; fully outstanding',         40),
    ('partially_paid',   'Partially Paid',    'document.purchase_invoice_status', 'Partially settled by payments',           50),
    ('fully_paid',       'Fully Paid',        'document.purchase_invoice_status', 'Fully settled',                           60),
    ('on_hold',          'On Hold',           'document.purchase_invoice_status', 'Payment held pending investigation',      70),
    ('reversed',         'Reversed',          'document.purchase_invoice_status', 'Reversed via credit note',                80),
    ('cancelled',        'Cancelled',         'document.purchase_invoice_status', 'Cancelled before posting',                90),
    ('rejected',         'Rejected',          'document.purchase_invoice_status', 'Rejected during approval',               100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice match type
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('three_way',         'Three-Way',          'document.invoice_match_type', 'PO ↔ GR ↔ Invoice match',              10),
    ('two_way',           'Two-Way',            'document.invoice_match_type', 'PO ↔ Invoice match (no GR required)',   20),
    ('no_match',          'No Match',           'document.invoice_match_type', 'Non-PO invoice; no matching required',  30),
    ('evaluated_receipt', 'Evaluated Receipt',  'document.invoice_match_type', 'ERS: system auto-generates invoice at GR', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Match exception type
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('price_variance',             'Price Variance',              'document.match_exception_type', 'Invoice unit price differs from PO',        10),
    ('quantity_variance',          'Quantity Variance',           'document.match_exception_type', 'Invoice qty differs from GR accepted qty',  20),
    ('amount_variance',            'Amount Variance',             'document.match_exception_type', 'Net amount variance beyond tolerance',      30),
    ('missing_receipt',            'Missing Receipt',             'document.match_exception_type', 'No matching GR or SES found',               40),
    ('duplicate_invoice',          'Duplicate Invoice',           'document.match_exception_type', 'Probable duplicate of an existing invoice', 50),
    ('tax_variance',               'Tax Variance',                'document.match_exception_type', 'Tax amount differs from calculation',       60),
    ('fx_variance',                'FX Variance',                 'document.match_exception_type', 'Exchange rate variance on foreign invoice', 70),
    ('retention_variance',         'Retention Variance',          'document.match_exception_type', 'Retention amount mismatch',                80),
    ('advance_recovery_mismatch',  'Advance Recovery Mismatch',   'document.match_exception_type', 'Advance deduction does not match records',  90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Payment entry type
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',           'Standard',            'document.payment_entry_type', 'Standard full or partial payment',          10),
    ('advance',            'Advance',             'document.payment_entry_type', 'Advance payment against commitment',        20),
    ('retention_release',  'Retention Release',   'document.payment_entry_type', 'Release of AP retention payable',           30),
    ('partial',            'Partial',             'document.payment_entry_type', 'Partial payment on invoice',                40),
    ('final',              'Final',               'document.payment_entry_type', 'Final payment closing the invoice',         50),
    ('down_payment',       'Down Payment',        'document.payment_entry_type', 'Down payment / prepayment',                 60),
    ('urgent',             'Urgent',              'document.payment_entry_type', 'Urgent out-of-cycle payment',               70),
    ('netting',            'Netting',             'document.payment_entry_type', 'Netted payment across multiple invoices',   80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Payment entry status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',            'Draft',             'document.payment_entry_status', 'Payment in draft',                           10),
    ('pending_approval', 'Pending Approval',  'document.payment_entry_status', 'Awaiting approval',                          20),
    ('approved',         'Approved',          'document.payment_entry_status', 'Approved; ready to post',                    30),
    ('posted',           'Posted',            'document.payment_entry_status', 'Payment JE posted',                          40),
    ('transmitted',      'Transmitted',       'document.payment_entry_status', 'Sent to bank / payment processor',           50),
    ('printed',          'Printed',           'document.payment_entry_status', 'Check/remittance printed',                   60),
    ('cleared',          'Cleared',           'document.payment_entry_status', 'Confirmed cleared by bank',                  70),
    ('reversed',         'Reversed',          'document.payment_entry_status', 'Payment reversed',                           80),
    ('voided',           'Voided',            'document.payment_entry_status', 'Payment voided before transmission',         90),
    ('cancelled',        'Cancelled',         'document.payment_entry_status', 'Cancelled before posting',                  100),
    ('rejected',         'Rejected',          'document.payment_entry_status', 'Rejected during approval',                  110)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Delivery note status
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',                'Draft',                'document.delivery_note_status', 'Delivery note registered',           10),
    ('in_transit',           'In Transit',           'document.delivery_note_status', 'Goods dispatched by supplier',      20),
    ('arrived',              'Arrived',              'document.delivery_note_status', 'Arrived at receiving site',         30),
    ('partially_receipted',  'Partially Receipted',  'document.delivery_note_status', 'Some lines receipted via GR',       40),
    ('fully_receipted',      'Fully Receipted',      'document.delivery_note_status', 'All lines receipted',               50),
    ('returned',             'Returned',             'document.delivery_note_status', 'Goods returned to supplier',        60),
    ('cancelled',            'Cancelled',            'document.delivery_note_status', 'Delivery note cancelled',           70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Accounting distribution account source modes
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('posting_role',   'Posting Role',      'document.acct_dist_account_source', 'Resolved via control.posting_role mapping',                   10),
    ('fixed',          'Fixed Account',     'document.acct_dist_account_source', 'Explicit GL account ID or code on the distribution row',      20),
    ('from_intent',    'From Intent',       'document.acct_dist_account_source', 'Resolved via business_intent.default_gl_account_id',          30),
    ('from_category',  'From Category',     'document.acct_dist_account_source', 'Resolved via spend_category → intent → GL (default path)',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
