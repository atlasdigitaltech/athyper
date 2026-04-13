-- LookupDomain/control/bpr_account_strategy.sql
-- Lookup values for domain: control.bpr_account_strategy
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('same',    'Same Account', 'control.bpr_account_strategy', 'Post to same GL account in target book', 10),
    ('map',     'Account Map',  'control.bpr_account_strategy', 'Use explicit account mapping table',     20),
    ('profile', 'Profile',      'control.bpr_account_strategy', 'Derive from posting profile rules',      30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
