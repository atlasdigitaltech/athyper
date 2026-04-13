-- LookupDomain/control/asset_class_book_policy_status.sql
-- Lookup values for domain: control.asset_class_book_policy_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',     'Active',     'control.asset_class_book_policy_status', 'Policy is in effect and available for resolution',   10),
    ('inactive',   'Inactive',   'control.asset_class_book_policy_status', 'Policy is disabled — skipped by resolver',           20),
    ('superseded', 'Superseded', 'control.asset_class_book_policy_status', 'Replaced by a newer effective-dated policy version', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
