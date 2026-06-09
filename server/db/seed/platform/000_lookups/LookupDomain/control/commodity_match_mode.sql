-- LookupDomain/control/commodity_match_mode.sql
-- Lookup values for domain: control.commodity_match_mode
-- Code matching precision for commodity_code_to_category_rule.match_mode.
-- Stored as UPPERCASE (EXACT, PREFIX); EnumRenderer does case-insensitive matching.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('exact',    'Exact Match',    'control.commodity_match_mode', 10),
    ('prefix',   'Prefix Match',   'control.commodity_match_mode', 20),
    ('range',    'Range Match',    'control.commodity_match_mode', 30),
    ('wildcard', 'Wildcard Match', 'control.commodity_match_mode', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
