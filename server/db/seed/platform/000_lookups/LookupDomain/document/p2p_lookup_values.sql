INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_requisition',        'Purchase Requisition',       'control.document_sequence_doc_type', 'Internal purchase request',                75),
    ('delivery_note',               'Delivery Note',              'control.document_sequence_doc_type', 'Inbound logistics delivery artifact',       65),
    ('receipt',                     'Receipt',                    'control.document_sequence_doc_type', 'Approvable receipt posting',                68),
    ('service_sheet',               'Service Sheet',              'control.document_sequence_doc_type', 'Approvable service completion sheet',       72),
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

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('receipt',                 'Receipt',                'document.je_source_doc_type', 'GR/IR accrual at receipt posting',               150),
    ('service_sheet',           'Service Sheet',          'document.je_source_doc_type', 'Accrual at service sheet posting',               160),
    ('commitment_encumbrance',  'Commitment Encumbrance', 'document.je_source_doc_type', 'PO/contract encumbrance at approval',            170),
    ('advance_payment',         'Advance Payment',        'document.je_source_doc_type', 'Advance to supplier prepayment posting',         180),
    ('advance_recovery',        'Advance Recovery',       'document.je_source_doc_type', 'Advance recovery at invoice matching',           190),
    ('retention_release',       'Retention Release',      'document.je_source_doc_type', 'AP retention payable release payment',           200)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

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

-- Note: document.purchase_invoice_source seeded in purchase_invoice_source.sql
-- Note: document.purchase_invoice_type   seeded in purchase_invoice_type.sql

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('three_way',         'Three-Way',          'document.invoice_match_type', 'PO <-> GR <-> Invoice match',              10),
    ('two_way',           'Two-Way',            'document.invoice_match_type', 'PO <-> Invoice match (no GR required)',   20),
    ('no_match',          'No Match',           'document.invoice_match_type', 'Non-PO invoice; no matching required',  30),
    ('evaluated_receipt', 'Evaluated Receipt',  'document.invoice_match_type', 'ERS: system auto-generates invoice at GR', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- Normalize legacy uppercase codes inserted before lookup_value_code_fmt was tightened.
UPDATE control.lookup_value SET code = 'three_way'         WHERE domain_code = 'document.invoice_match_type' AND code = 'THREE_WAY'         AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'two_way'           WHERE domain_code = 'document.invoice_match_type' AND code = 'TWO_WAY'           AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'no_match'          WHERE domain_code = 'document.invoice_match_type' AND code = 'NO_MATCH'          AND tenant_id IS NULL;
UPDATE control.lookup_value SET code = 'evaluated_receipt' WHERE domain_code = 'document.invoice_match_type' AND code = 'EVALUATED_RECEIPT' AND tenant_id IS NULL;

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

-- Codes are lowercase; document.accounting_distribution.account_source CHECK constraint
-- uses uppercase ('PENDING','PROFILE','FALLBACK') — EnumRenderer bridges for UI.
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pending',  'Pending Resolution',            'document.acct_dist_account_source', 'AD row created; GL account not yet resolved (pre-posting state).',                     10),
    ('profile',  'Resolved via Accounting Profile','document.acct_dist_account_source', 'GL resolved at posting via control.acct_profile_entry_template.',                       20),
    ('fallback', 'Resolved via Fallback Path',    'document.acct_dist_account_source', 'GL resolved at posting via the hardcoded posting-service fallback (no matching profile).', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- Codes are lowercase; ad_basis_chk CHECK constraint uses uppercase
-- (PERCENT | AMOUNT | QUANTITY) — EnumRenderer bridges.
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('percent',  'Percent',  'document.acct_dist_distribution_basis', 'Split expressed as a percentage of the line total (split_pct required).', 10),
    ('amount',   'Amount',   'document.acct_dist_distribution_basis', 'Split expressed as an absolute amount (split_amount required).',          20),
    ('quantity', 'Quantity', 'document.acct_dist_distribution_basis', 'Split expressed as a quantity of the line UOM (split_quantity required).',30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('goods',    'Goods',    'document.procurement_type', 'Physical goods delivered',                        10),
    ('services', 'Services', 'document.procurement_type', 'Services rendered or contracted',                 20)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('contract',    'Contract',    'document.line_type', 'Line originated from a contract source',   10),
    ('catalog',     'Catalog',     'document.line_type', 'Line originated from a catalog source',    20),
    ('marketplace', 'Marketplace', 'document.line_type', 'Line originated from a marketplace source', 30),
    ('noncatalog',  'NonCatalog',  'document.line_type', 'Line not sourced from contract or catalog', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

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
