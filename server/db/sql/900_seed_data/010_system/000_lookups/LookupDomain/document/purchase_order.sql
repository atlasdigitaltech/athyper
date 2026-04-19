-- LookupDomain/document/purchase_order.sql
-- Lookup values for Purchase Order domains + journal_entry_status approval extensions
-- Idempotent: WHERE NOT EXISTS guard on every INSERT
-- =============================================================================

-- ── Purchase order status ─────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',              'Draft',              'document.purchase_order_status', 'PO created, not yet submitted for approval',        10),
    ('pending_approval',   'Pending Approval',   'document.purchase_order_status', 'Submitted and awaiting approval',                   20),
    ('approved',           'Approved',           'document.purchase_order_status', 'Approved, ready to transmit to vendor',             30),
    ('sent_to_vendor',     'Sent to Vendor',     'document.purchase_order_status', 'PO transmitted to vendor, awaiting acknowledgement', 40),
    ('partially_received', 'Partially Received', 'document.purchase_order_status', 'Some line items received against this PO',          50),
    ('fully_received',     'Fully Received',     'document.purchase_order_status', 'All line items received',                           60),
    ('on_hold',            'On Hold',            'document.purchase_order_status', 'PO suspended - processing blocked, reversible to prior state', 65),
    ('closed',             'Closed',             'document.purchase_order_status', 'PO closed, no further receipts expected',           70),
    ('rejected',           'Rejected',           'document.purchase_order_status', 'Rejected during approval',                         80),
    ('cancelled',          'Cancelled',          'document.purchase_order_status', 'PO cancelled before or after approval',             90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ── Purchase order type ───────────────────────────────────────────────────────
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',  'Standard',  'document.purchase_order_type', 'Standard one-time purchase order',          10),
    ('blanket',   'Blanket',   'document.purchase_order_type', 'Blanket PO for recurring or open purchases', 20),
    ('service',   'Service',   'document.purchase_order_type', 'Service procurement order',                  30),
    ('emergency', 'Emergency', 'document.purchase_order_type', 'Emergency fast-track purchase order',        40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- ── Journal entry status — approval workflow extensions ───────────────────────
-- Extends the existing draft / created / posted / reversed with approval states
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pending_review', 'Pending Review', 'document.journal_entry_status', 'Submitted, awaiting accounting manager review', 15),
    ('approved',       'Approved',       'document.journal_entry_status', 'Approved, ready to post to ledger',             25),
    ('rejected',       'Rejected',       'document.journal_entry_status', 'Rejected, returned to preparer for correction', 45)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
