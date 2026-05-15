-- LookupDomain/master/cc_mapping_type.sql
-- Lookup values for domain: master.cc_mapping_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('exact',   'Exact',   'master.cc_mapping_type', 'Exact one-to-one match',       10),
    ('broad',   'Broad',   'master.cc_mapping_type', 'Broader than target code',     20),
    ('narrow',  'Narrow',  'master.cc_mapping_type', 'Narrower than target code',    30),
    ('partial', 'Partial', 'master.cc_mapping_type', 'Partial overlap',              40),
    ('related', 'Related', 'master.cc_mapping_type', 'Related but not equivalent',   50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
