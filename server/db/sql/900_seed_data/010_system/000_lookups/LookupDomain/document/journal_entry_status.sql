-- LookupDomain/document/journal_entry_status.sql
-- Lookup values for domain: document.journal_entry_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',    'Draft',    'document.journal_entry_status', 'Entry created, not yet validated',  10),
    ('created',  'Created',  'document.journal_entry_status', 'Validated, awaiting posting',       20),
    ('posted',   'Posted',   'document.journal_entry_status', 'Successfully posted to ledger',     30),
    ('reversed', 'Reversed', 'document.journal_entry_status', 'Reversed by a correction entry',   40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
