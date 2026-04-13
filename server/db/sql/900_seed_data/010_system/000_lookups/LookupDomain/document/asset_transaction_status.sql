-- LookupDomain/document/asset_transaction_status.sql
-- Lookup values for domain: document.asset_transaction_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',    'Draft',     'document.asset_transaction_status', 'Transaction created, not yet posted',   10),
    ('posted',   'Posted',    'document.asset_transaction_status', 'Transaction posted to ledger',          20),
    ('reversed', 'Reversed',  'document.asset_transaction_status', 'Transaction reversed',                  30),
    ('void',     'Void',      'document.asset_transaction_status', 'Transaction voided',                    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
