-- LookupDomain/document/payment_entry_status.sql
-- Lookup values for domain: document.payment_entry_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',            'Draft',            'document.payment_entry_status', 'Payment created, not yet submitted',         10),
    ('pending_approval', 'Pending Approval', 'document.payment_entry_status', 'Submitted, awaiting approval',              20),
    ('approved',         'Approved',         'document.payment_entry_status', 'Approved, ready for posting',               30),
    ('posted',           'Posted',           'document.payment_entry_status', 'Posted to ledger, settlement recorded',     40),
    ('transmitted',      'Transmitted',      'document.payment_entry_status', 'Payment file sent to bank',                 50),
    ('printed',          'Printed',          'document.payment_entry_status', 'Check/remittance printed',                  60),
    ('cleared',          'Cleared',          'document.payment_entry_status', 'Bank confirmed payment cleared',            70),
    ('reversed',         'Reversed',         'document.payment_entry_status', 'Reversed by a correction entry',           80),
    ('voided',           'Voided',           'document.payment_entry_status', 'Voided before clearance',                  90),
    ('cancelled',        'Cancelled',        'document.payment_entry_status', 'Cancelled before posting',                 100),
    ('rejected',         'Rejected',         'document.payment_entry_status', 'Rejected during approval',                 110)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
