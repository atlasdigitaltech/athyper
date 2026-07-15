-- Â§1 transaction_event_catalog â€” 25 canonical lifecycle event codes
-- Â§2 transaction_flow_template â€” uses event codes; same-file ordering avoids FK footwork.

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.transaction_event_catalog
    (code, label, description, created_by)
VALUES
    -- â”€â”€ Procurement lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('ORDER_CREATION',      'Order / Request Creation',
     'Initial creation of a purchase request, sales order, work order, or transfer request.',
     v_sys),
    ('ORDER_APPROVAL',      'Order / Request Approval',
     'Approval of a purchase order, sales order, expense claim, or invoice.',
     v_sys),
    ('CONTRACT_EXECUTION',  'Contract / Agreement Execution',
     'Execution or activation of a purchase contract, revenue contract, subscription, lease, IC agreement, or prepaid card load.',
     v_sys),
    ('FULFILLMENT',         'Fulfillment / Delivery',
     'Goods receipt (inbound) or goods shipment (outbound); service delivery confirmation.',
     v_sys),
    ('INVOICE_RECEIVED',    'Purchase Invoice Received',
     'Supplier invoice received for matching or direct-pay processing.',
     v_sys),
    ('INVOICE_MATCHED',     'Invoice Three-Way Matched',
     'Purchase invoice matched against PO and goods receipt; liability confirmed.',
     v_sys),
    ('INVOICE_CREATED',     'Sales Invoice Created',
     'Outbound sales, service, or revenue invoice issued to customer.',
     v_sys),

    -- â”€â”€ Settlement and financial close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('SETTLEMENT',          'Settlement / Payment / Receipt',
     'Cash payment (inbound) or cash receipt (outbound); IC netting settlement.',
     v_sys),
    ('ADVANCE_PAID',        'Advance Payment Made',
     'Prepayment or advance disbursed under a purchase contract.',
     v_sys),
    ('ADVANCE_RECOVERED',   'Advance Recovery / Offset',
     'Advance amount offset against a milestone invoice or final settlement.',
     v_sys),
    ('RETENTION_RELEASED',  'Retention Released',
     'Contractual retention amount released to supplier after obligations met.',
     v_sys),
    ('DISCOUNT_ACCEPTED',   'Dynamic Discount Accepted',
     'Early-payment or SCF dynamic discount captured by buyer.',
     v_sys),

    -- â”€â”€ Obligation and milestone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('OBLIGATION_SATISFIED', 'Performance Obligation Satisfied / Milestone',
     'Performance obligation met (IFRS 15), milestone completed, or finished goods received from production.',
     v_sys),
    ('PERIOD_RECOGNITION',  'Period-Based Recognition',
     'Periodic revenue recognition (subscription/project) or period depreciation and interest (lease).',
     v_sys),
    ('PENALTY_APPLIED',     'Penalty Assessed',
     'Contractual penalty or liquidated damages assessed against a counterparty.',
     v_sys),
    ('REBATE_EARNED',       'Rebate Earned',
     'Volume rebate or trade rebate earned under a purchase agreement.',
     v_sys),

    -- â”€â”€ Inventory and production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('INVENTORY_RESERVED',  'Inventory Soft-Reserved',
     'Stock soft-reserved for a sales order; no JE, commitment tracking only.',
     v_sys),
    ('INVENTORY_ALLOCATED', 'Inventory Allocated / Picked',
     'Stock physically picked and allocated to a shipment; no JE, commitment tracking only.',
     v_sys),
    ('MATERIAL_ISSUED',     'Material Issued to Production',
     'Raw materials or components issued to a work-in-progress production order.',
     v_sys),

    -- â”€â”€ Lease â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('LEASE_COMMENCEMENT',  'Lease Commencement (IFRS 16)',
     'Right-of-use asset and lease liability recognised at commencement of a lease.',
     v_sys),
    ('LEASE_PAYMENT',       'Lease Payment',
     'Periodic cash payment reducing the lease liability.',
     v_sys),

    -- â”€â”€ Intercompany / warehouse transfers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('TRANSFER_SHIPPED',    'Transfer Shipped from Source',
     'Goods dispatched from source warehouse in an intercompany or internal transfer.',
     v_sys),
    ('TRANSFER_RECEIVED',   'Transfer Received at Destination',
     'Goods received at destination warehouse; reverses the shipped entry.',
     v_sys),

    -- â”€â”€ Reversals and releases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Cross-cutting lifecycle events emitted by transition hooks on
    -- postedâ†’reversed and approved/sentâ†’cancelled edges. Referenced by
    -- 072p_p2p_runtime_contract.sql Â§6a for PI/receipt/service_sheet reversal
    -- and PO cancellation. Catalog rows added by 100.Â§5 contract check.
    ('REVERSAL',            'Reversal of Prior Event',
     'Compensating reversal of a previously posted financial event. '
     'Generates negation JE and restores affected commitments, inventory, '
     'or budget consumption performed by the original event.',
     v_sys),
    ('RELEASE',             'Commitment / Encumbrance Release',
     'Release of a previously held commitment or encumbrance (e.g. cancelled '
     'PO, short-closed contract). Returns commitment and budget capacity '
     'without producing a settlement JE.',
     v_sys)

ON CONFLICT (code) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description;
    -- is_active and created_by intentionally excluded from UPDATE.

END $$;


-- Â§2 Transaction flow templates (15 flow codes, 61 event rows). Platform-global (tenant_id IS NULL).
-- Idempotent: ON CONFLICT DO NOTHING (unique: tft_flow_event_uq covers
--   COALESCE(tenant_id,'00000000...'), flow_code, event_code).

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.transaction_flow_template
    (tenant_id, flow_code, direction, event_code, event_name,
     event_seq, is_mandatory, creates_je, reverses_prior, commitment_action, created_by)
VALUES
    -- â”€â”€ INBOUND: PO_BASED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_CREATION',    'PR created',                10, false, true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_APPROVAL',    'PO approved',               20, true,  true,  'ORDER_CREATION',     'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'FULFILLMENT',       'Goods received',            30, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'INVOICE_MATCHED',   'Invoice 3-way matched',     40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'SETTLEMENT',        'Payment',                   50, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'REVERSAL',          'Compensating reversal',     60, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: NON_PO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'NON_PO',          'INBOUND',   'INVOICE_RECEIVED',  'Invoice received',          10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'ORDER_APPROVAL',    'Invoice approved',          20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'SETTLEMENT',        'Payment',                   30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'REVERSAL',          'Compensating reversal',     40, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: PURCHASE_CONTRACT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'CONTRACT_EXECUTION','Contract signed',           10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'ADVANCE_PAID',      'Advance payment',           15, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'OBLIGATION_SATISFIED','Milestone completed',     20, false, true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'INVOICE_RECEIVED',  'Invoice received',          30, true,  true,  'OBLIGATION_SATISFIED','NONE',           v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'ADVANCE_RECOVERED', 'Advance recovery',          32, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'PENALTY_APPLIED',   'Penalty assessed',          34, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'REBATE_EARNED',     'Rebate earned',             36, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'DISCOUNT_ACCEPTED', 'Dynamic discount captured', 38, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'SETTLEMENT',        'Payment',                   40, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'RETENTION_RELEASED','Retention released',        50, false, true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: PURCHASE_SUB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PURCHASE_SUB',    'INBOUND',   'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'PERIOD_RECOGNITION','Period expense',            20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'INVOICE_RECEIVED',  'Periodic invoice',          30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'SETTLEMENT',        'Payment',                   40, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: LEASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'LEASE',           'INBOUND',   'LEASE_COMMENCEMENT','Lease commenced (IFRS 16)', 10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'LEASE',           'INBOUND',   'PERIOD_RECOGNITION','Depreciation + interest',   20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'LEASE',           'INBOUND',   'LEASE_PAYMENT',     'Lease payment',             30, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: DIRECT_PURCHASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'ORDER_APPROVAL',    'Expense approved',          10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'SETTLEMENT',        'Reimbursement / payment',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: PRODUCTION_ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PRODUCTION_ORDER','INBOUND',   'ORDER_CREATION',    'Work order released',       10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'MATERIAL_ISSUED',   'Material issued to WIP',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'OBLIGATION_SATISFIED','Finished goods received', 30, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ INBOUND: PREPAID_TOPUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'CONTRACT_EXECUTION','Prepaid card loaded',       10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'ORDER_APPROVAL',    'Authorisation captured',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'FULFILLMENT',       'Goods/service delivered',   30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'SETTLEMENT',        'Settlement (prepaid no-op)',40, false, false, NULL,                 'NONE',            v_sys),

    -- â”€â”€ OUTBOUND: SALES_ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_CREATION',    'SO booked',                 10, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_APPROVAL',    'SO confirmed',              20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_RESERVED','Stock soft-reserved',       25, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_ALLOCATED','Stock picked / allocated', 27, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'FULFILLMENT',       'Goods shipped',             30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVOICE_CREATED',   'Sales invoice issued',      40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              50, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ OUTBOUND: DIRECT_SALE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'INVOICE_CREATED',   'Invoice issued',            10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              20, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ OUTBOUND: REVENUE_CONTRACT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'CONTRACT_EXECUTION','Contract executed',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'OBLIGATION_SATISFIED','Performance obligation satisfied',20,false,true,NULL,            'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'INVOICE_CREATED',   'Revenue invoice issued',    30, true,  true,  'OBLIGATION_SATISFIED','NONE',          v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ OUTBOUND: REVENUE_SUB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'PERIOD_RECOGNITION','Period revenue recognised', 20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'INVOICE_CREATED',   'Periodic invoice issued',   30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ OUTBOUND: PROJECT_REVENUE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'CONTRACT_EXECUTION','Project commenced',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'PERIOD_RECOGNITION','% completion recognition',  20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'OBLIGATION_SATISFIED','Milestone billed',        30, false, true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ BILATERAL: IC_TRANSFER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'IC_TRANSFER',     'BILATERAL', 'CONTRACT_EXECUTION','IC agreement activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'IC_TRANSFER',     'BILATERAL', 'SETTLEMENT',        'IC settlement / netting',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- â”€â”€ BILATERAL: WAREHOUSE_TRANSFER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','ORDER_CREATION',   'Transfer requested',        10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_SHIPPED', 'Shipped from source WH',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_RECEIVED','Received at destination WH',30, true,  true,  'TRANSFER_SHIPPED',   'NONE',            v_sys)

ON CONFLICT DO NOTHING;

END $$;

