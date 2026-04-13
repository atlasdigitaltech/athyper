-- LookupDomain/control/resolution_event_code.sql
-- Lookup values for domain: resolution.event_code
-- Human labels for transaction flow lifecycle event codes (Engine 4.13).
-- Depends on: 000_lookup_domains.sql (domain row must exist)
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('order_creation',       'Order / PR Created',                'resolution.event_code', 'Purchase requisition or sales order created, triggering initial obligation recognition.',    10),
    ('order_approval',       'Order / Invoice Approved',          'resolution.event_code', 'Order or invoice approved through workflow, enabling downstream commitment or AR entry.',   20),
    ('fulfillment',          'Goods Received / Shipped',          'resolution.event_code', 'Physical goods received (GR) or shipped from warehouse. Triggers accrual or COGS entry.',  30),
    ('invoice_created',      'Sales Invoice Issued',              'resolution.event_code', 'Sales invoice raised and sent to customer. Creates AR and deferred-revenue unwinding.',     40),
    ('invoice_received',     'Purchase Invoice Received',         'resolution.event_code', 'Supplier invoice received and registered. Creates AP liability entry.',                     50),
    ('invoice_matched',      'Invoice 3-Way Matched',             'resolution.event_code', 'PO / GR / invoice matched successfully. Releases any GR accrual and confirms AP.',         60),
    ('settlement',           'Payment / Cash Receipt',            'resolution.event_code', 'Payment made or cash received. Clears AP/AR and records bank/cash entry.',                 70),
    ('contract_execution',   'Contract Signed / Activated',       'resolution.event_code', 'Contract signed or activated. May trigger deferred-revenue or prepaid asset setup.',       80),
    ('obligation_satisfied', 'Milestone / Obligation Satisfied',  'resolution.event_code', 'Performance obligation satisfied per IFRS 15. Triggers revenue recognition entry.',        90),
    ('period_recognition',   'Period Revenue / Expense',          'resolution.event_code', 'Time-based revenue or expense recognised at period end (SaaS ratable, prepaid amort).',   100),
    ('advance_paid',         'Advance Payment Issued',            'resolution.event_code', 'Advance or prepayment issued to supplier or employee. Creates prepaid asset entry.',       110),
    ('advance_recovered',    'Advance Recovered',                 'resolution.event_code', 'Previously issued advance deducted from invoice or payroll. Clears prepaid asset.',        120),
    ('penalty_applied',      'Penalty Assessed',                  'resolution.event_code', 'Contractual penalty charged to counterparty or assessed against the entity.',              130),
    ('rebate_earned',        'Rebate Earned',                     'resolution.event_code', 'Volume or trade rebate earned from supplier. Creates rebate receivable or reduces COGS.',  140),
    ('retention_released',   'Retention Released',                'resolution.event_code', 'Contract retention withheld at invoice now released on final acceptance.',                 150),
    ('discount_accepted',    'Dynamic Discount Captured',         'resolution.event_code', 'Early-payment discount accepted via dynamic discounting programme.',                       160),
    ('inventory_reserved',   'Stock Soft-Reserved',               'resolution.event_code', 'Stock soft-reserved against a sales order. Updates obligation horizon without COGS.',     170),
    ('inventory_allocated',  'Stock Picked / Allocated',          'resolution.event_code', 'Physical pick and allocation from warehouse. Advances obligation toward fulfillment.',     180),
    ('material_issued',      'Material Issued to WIP',            'resolution.event_code', 'Raw material issued from stores to work-in-progress. Creates WIP entry.',                 190),
    ('transfer_shipped',     'Transfer Shipped from Source',      'resolution.event_code', 'Inter-company or inter-warehouse transfer shipped. Creates in-transit inventory entry.',   200),
    ('transfer_received',    'Transfer Received at Destination',  'resolution.event_code', 'Transfer received at destination. Clears in-transit and books receiving entry.',           210),
    ('lease_commencement',   'Lease Commenced (IFRS 16)',         'resolution.event_code', 'Lease commencement date reached. Creates ROU asset and lease liability entries.',          220),
    ('lease_payment',        'Lease Payment',                     'resolution.event_code', 'Periodic lease payment made. Splits between interest expense and liability principal.',    230)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
