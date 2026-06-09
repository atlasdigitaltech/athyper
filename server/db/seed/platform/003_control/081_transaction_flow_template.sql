-- Table-owned seed for control.transaction_flow_template
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/003_control/010_flows_and_routing.sql
-- ============================================================

-- ============================================================================
-- 900_seed_data/002_control/010_flows_and_routing.sql
-- Sources: 010_transaction_flow_template.sql + 011_notification_routing_collab.sql
-- ============================================================================

-- ============================================================================
-- Engine 4.13: Platform-global transaction flow template seed
-- Depends on: 04_tables/002_control.sql (control.transaction_flow_template)
-- 15 flow codes, 61 event rows. tenant_id IS NULL = platform-global.
-- Idempotent: ON CONFLICT DO NOTHING (unique: tft_flow_event_uq covers
--   COALESCE(tenant_id,'00000000...'), flow_code, event_code).
-- ============================================================================

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.transaction_flow_template
    (tenant_id, flow_code, direction, event_code, event_name,
     event_seq, is_mandatory, creates_je, reverses_prior, commitment_action, created_by)
VALUES
    -- ── INBOUND: PO_BASED ─────────────────────────────────────────────────
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_CREATION',    'PR created',                10, false, true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_APPROVAL',    'PO approved',               20, true,  true,  'ORDER_CREATION',     'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'FULFILLMENT',       'Goods received',            30, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'INVOICE_MATCHED',   'Invoice 3-way matched',     40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'SETTLEMENT',        'Payment',                   50, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: NON_PO ───────────────────────────────────────────────────
    (NULL,'NON_PO',          'INBOUND',   'INVOICE_RECEIVED',  'Invoice received',          10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'ORDER_APPROVAL',    'Invoice approved',          20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'SETTLEMENT',        'Payment',                   30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PURCHASE_CONTRACT ────────────────────────────────────────
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

    -- ── INBOUND: PURCHASE_SUB ─────────────────────────────────────────────
    (NULL,'PURCHASE_SUB',    'INBOUND',   'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'PERIOD_RECOGNITION','Period expense',            20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'INVOICE_RECEIVED',  'Periodic invoice',          30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'SETTLEMENT',        'Payment',                   40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: LEASE ────────────────────────────────────────────────────
    (NULL,'LEASE',           'INBOUND',   'LEASE_COMMENCEMENT','Lease commenced (IFRS 16)', 10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'LEASE',           'INBOUND',   'PERIOD_RECOGNITION','Depreciation + interest',   20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'LEASE',           'INBOUND',   'LEASE_PAYMENT',     'Lease payment',             30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: DIRECT_PURCHASE ──────────────────────────────────────────
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'ORDER_APPROVAL',    'Expense approved',          10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'SETTLEMENT',        'Reimbursement / payment',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PRODUCTION_ORDER ─────────────────────────────────────────
    (NULL,'PRODUCTION_ORDER','INBOUND',   'ORDER_CREATION',    'Work order released',       10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'MATERIAL_ISSUED',   'Material issued to WIP',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'OBLIGATION_SATISFIED','Finished goods received', 30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PREPAID_TOPUP ────────────────────────────────────────────
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'CONTRACT_EXECUTION','Prepaid card loaded',       10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'ORDER_APPROVAL',    'Authorisation captured',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'FULFILLMENT',       'Goods/service delivered',   30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'SETTLEMENT',        'Settlement (prepaid no-op)',40, false, false, NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: SALES_ORDER ─────────────────────────────────────────────
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_CREATION',    'SO booked',                 10, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_APPROVAL',    'SO confirmed',              20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_RESERVED','Stock soft-reserved',       25, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_ALLOCATED','Stock picked / allocated', 27, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'FULFILLMENT',       'Goods shipped',             30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVOICE_CREATED',   'Sales invoice issued',      40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              50, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: DIRECT_SALE ─────────────────────────────────────────────
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'INVOICE_CREATED',   'Invoice issued',            10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: REVENUE_CONTRACT ────────────────────────────────────────
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'CONTRACT_EXECUTION','Contract executed',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'OBLIGATION_SATISFIED','Performance obligation satisfied',20,false,true,NULL,            'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'INVOICE_CREATED',   'Revenue invoice issued',    30, true,  true,  'OBLIGATION_SATISFIED','NONE',          v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: REVENUE_SUB ─────────────────────────────────────────────
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'PERIOD_RECOGNITION','Period revenue recognised', 20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'INVOICE_CREATED',   'Periodic invoice issued',   30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: PROJECT_REVENUE ─────────────────────────────────────────
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'CONTRACT_EXECUTION','Project commenced',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'PERIOD_RECOGNITION','% completion recognition',  20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'OBLIGATION_SATISFIED','Milestone billed',        30, false, true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── BILATERAL: IC_TRANSFER ────────────────────────────────────────────
    (NULL,'IC_TRANSFER',     'BILATERAL', 'CONTRACT_EXECUTION','IC agreement activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'IC_TRANSFER',     'BILATERAL', 'SETTLEMENT',        'IC settlement / netting',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── BILATERAL: WAREHOUSE_TRANSFER ─────────────────────────────────────
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','ORDER_CREATION',   'Transfer requested',        10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_SHIPPED', 'Shipped from source WH',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_RECEIVED','Received at destination WH',30, true,  true,  'TRANSFER_SHIPPED',   'NONE',            v_sys)

ON CONFLICT DO NOTHING;

END $$;
