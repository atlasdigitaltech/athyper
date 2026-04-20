-- ============================================================================
-- TRANSACTION EVENT CATALOG — SEED DATA
-- ============================================================================
-- File:     005_transaction_event_catalog.sql
-- Schema:   control
-- Purpose:  Register all 23 canonical lifecycle event codes.
--           DDL for control.transaction_event_catalog is in 01_tables.sql (§0).
-- Depends:  control.transaction_event_catalog table (01_tables.sql §0)
-- Idempotent: Yes — ON CONFLICT (code) DO UPDATE SET label, description
--             preserves is_active and audit columns on re-run.
-- Run:      Once at system install; re-run when labels change.
-- ============================================================================

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.transaction_event_catalog
    (code, label, description, created_by)
VALUES
    -- ── Procurement lifecycle ──────────────────────────────────────────────
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

    -- ── Settlement and financial close ────────────────────────────────────
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

    -- ── Obligation and milestone ──────────────────────────────────────────
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

    -- ── Inventory and production ──────────────────────────────────────────
    ('INVENTORY_RESERVED',  'Inventory Soft-Reserved',
     'Stock soft-reserved for a sales order; no JE, commitment tracking only.',
     v_sys),
    ('INVENTORY_ALLOCATED', 'Inventory Allocated / Picked',
     'Stock physically picked and allocated to a shipment; no JE, commitment tracking only.',
     v_sys),
    ('MATERIAL_ISSUED',     'Material Issued to Production',
     'Raw materials or components issued to a work-in-progress production order.',
     v_sys),

    -- ── Lease ─────────────────────────────────────────────────────────────
    ('LEASE_COMMENCEMENT',  'Lease Commencement (IFRS 16)',
     'Right-of-use asset and lease liability recognised at commencement of a lease.',
     v_sys),
    ('LEASE_PAYMENT',       'Lease Payment',
     'Periodic cash payment reducing the lease liability.',
     v_sys),

    -- ── Intercompany / warehouse transfers ───────────────────────────────
    ('TRANSFER_SHIPPED',    'Transfer Shipped from Source',
     'Goods dispatched from source warehouse in an intercompany or internal transfer.',
     v_sys),
    ('TRANSFER_RECEIVED',   'Transfer Received at Destination',
     'Goods received at destination warehouse; reverses the shipped entry.',
     v_sys)

ON CONFLICT (code) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description;
    -- is_active and created_by intentionally excluded from UPDATE.

END $$;
