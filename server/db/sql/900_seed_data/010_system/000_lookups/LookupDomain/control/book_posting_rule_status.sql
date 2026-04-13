-- LookupDomain/control/book_posting_rule_status.sql
-- Lookup values for domain: control.book_posting_rule_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',   'Active',   'control.book_posting_rule_status', 'Rule is enforced',        10),
    ('inactive', 'Inactive', 'control.book_posting_rule_status', 'Rule is suspended',       20),
    ('retired',  'Retired',  'control.book_posting_rule_status', 'Rule permanently removed', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
