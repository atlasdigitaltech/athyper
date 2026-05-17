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
    ('purchase_order_confirmation', 'PO Confirmation',            'control.document_sequence_doc_type', 'Supplier PO acknowledgement artifact',      82),
    ('purchase_invoice',            'Purchase Invoice',           'control.document_sequence_doc_type', 'Approvable AP invoice',                     85),
    ('invoice_match_case',          'Invoice Match Case',         'control.document_sequence_doc_type', 'Invoice reconciliation case header',        87),
    ('payment_entry',               'Payment Entry',              'control.document_sequence_doc_type', 'Approvable outbound payment',               90),
    ('payment_remittance_output',   'Payment Remittance Output',  'control.document_sequence_doc_type', 'Remittance advice output to supplier',      95)
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
-- Purchase invoice source
-- ─────────────────────────────────────────────────────────────────────────────
-- Normalise legacy codes first so WHERE NOT EXISTS below sees the final codes,
-- preventing INSERT→UPDATE duplicate-key collisions on re-runs.
UPDATE control.lookup_value SET code = 'po_based'          WHERE domain_code = 'document.purchase_invoice_source' AND code = 'PO_BASED'                          AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'contract_based'    WHERE domain_code = 'document.purchase_invoice_source' AND code = 'CONTRACT_BASED'                    AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'non_po'            WHERE domain_code = 'document.purchase_invoice_source' AND code = 'NON_PO'                            AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'one_time_supplier' WHERE domain_code = 'document.purchase_invoice_source' AND code IN ('ONE_TIME_VENDOR','one_time_vendor') AND tenant_id IS NULL;

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('po_based',          'PO-Based',           'document.purchase_invoice_source', 'Invoice matched to a purchase order',    10),
    ('contract_based',    'Contract-Based',     'document.purchase_invoice_source', 'Invoice matched to a contract',          20),
    ('non_po',            'Non-PO',             'document.purchase_invoice_source', 'Invoice with no prior commitment',       30),
    ('one_time_supplier', 'One-Time Supplier',  'document.purchase_invoice_source', 'Invoice from a non-registered supplier', 40)
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
    ('self_billed',        'Self-Billed',           'document.purchase_invoice_type', 'Buyer-created invoice on behalf of supplier', 70),
    ('final',              'Final',                 'document.purchase_invoice_type', 'Final invoice closing the commitment',        90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- Fix any already-seeded uppercase codes → lowercase (idempotent)
UPDATE control.lookup_value SET code = 'standard'          WHERE domain_code = 'document.purchase_invoice_type' AND code = 'STANDARD'          AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'credit_note'       WHERE domain_code = 'document.purchase_invoice_type' AND code = 'CREDIT_NOTE'       AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'debit_note'        WHERE domain_code = 'document.purchase_invoice_type' AND code = 'DEBIT_NOTE'        AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'advance'           WHERE domain_code = 'document.purchase_invoice_type' AND code = 'ADVANCE'           AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'retention_release' WHERE domain_code = 'document.purchase_invoice_type' AND code = 'RETENTION_RELEASE' AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'proforma'          WHERE domain_code = 'document.purchase_invoice_type' AND code = 'PROFORMA'          AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'self_billed'       WHERE domain_code = 'document.purchase_invoice_type' AND code = 'SELF_BILLED'       AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'final'             WHERE domain_code = 'document.purchase_invoice_type' AND code = 'FINAL'             AND tenant_id IS NULL;

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

-- Fix any already-seeded uppercase codes → lowercase (idempotent)
UPDATE control.lookup_value SET code = 'three_way'         WHERE domain_code = 'document.invoice_match_type' AND code = 'THREE_WAY'         AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'two_way'           WHERE domain_code = 'document.invoice_match_type' AND code = 'TWO_WAY'           AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'no_match'          WHERE domain_code = 'document.invoice_match_type' AND code = 'NO_MATCH'          AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'evaluated_receipt' WHERE domain_code = 'document.invoice_match_type' AND code = 'EVALUATED_RECEIPT' AND tenant_id IS NULL;

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
-- Accounting distribution account source modes
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('posting_role',   'Posting Role',      'document.acct_dist_account_source', 'Resolved via control.posting_role mapping',                   10),
    ('fixed',          'Fixed Account',     'document.acct_dist_account_source', 'Explicit GL account ID or code on the distribution row',      20),
    ('from_intent',    'From Intent',       'document.acct_dist_account_source', 'Resolved via commodity category policy for the business intent', 30),
    ('from_category',  'From Category',     'document.acct_dist_account_source', 'Resolved via spend_category → intent → GL (default path)',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice line procurement type
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('goods',    'Goods',    'document.procurement_type', 'Physical goods delivered',                        10),
    ('services', 'Services', 'document.procurement_type', 'Services rendered or contracted',                 20),
    ('mixed',    'Mixed',    'document.procurement_type', 'Combined goods and services on a single line',    30),
    ('freight',  'Freight',  'document.procurement_type', 'Shipping and freight charges',                    40),
    ('misc',     'Misc',     'document.procurement_type', 'Miscellaneous charges not fitting other types',   50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice / line match status (three-way match progress)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('unmatched',          'Unmatched',          'document.invoice_match_status', 'No matching GR or SES linked yet',                   10),
    ('partially_matched',  'Partially Matched',  'document.invoice_match_status', 'Some lines or quantity matched; remainder pending',  20),
    ('fully_matched',      'Fully Matched',      'document.invoice_match_status', 'All lines matched within tolerance',                 30),
    ('match_exception',    'Match Exception',    'document.invoice_match_status', 'Variance outside tolerance; requires resolution',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice budget check result
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('passed',   'Passed',            'document.invoice_budget_check_result', 'Budget check passed; sufficient funds available',             10),
    ('warned',   'Warned',            'document.invoice_budget_check_result', 'Budget nearly exhausted; within warning threshold',           20),
    ('override', 'Override Approved', 'document.invoice_budget_check_result', 'Over budget but manually overridden by authorised user',      30),
    ('blocked',  'Blocked',           'document.invoice_budget_check_result', 'Insufficient budget; invoice cannot proceed without override', 40),
    ('exempt',   'Exempt',            'document.invoice_budget_check_result', 'Invoice is exempt from budget checking (e.g. statutory)',     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
