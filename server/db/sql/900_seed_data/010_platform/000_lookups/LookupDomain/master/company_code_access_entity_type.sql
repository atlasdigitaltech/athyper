-- LookupDomain/master/company_code_access_entity_type.sql
-- Lookup values for domain: master.company_code_access_entity_type
-- Replaces the inline CHECK constraint cca_entity_type_chk (removed from table DDL).
-- is_extensible = true: tenants may add custom entity types via lookup_value without DDL changes.
-- Idempotent: WHERE NOT EXISTS guard on (domain_code, code, tenant_id IS NULL)

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('supplier',          'Supplier',          'master.company_code_access_entity_type', 10),
    ('customer',          'Customer',          'master.company_code_access_entity_type', 20),
    ('item',              'Item',              'master.company_code_access_entity_type', 30),
    ('chart_of_accounts', 'Chart of accounts', 'master.company_code_access_entity_type', 40),
    ('cost_centre',       'Cost centre',       'master.company_code_access_entity_type', 50),
    ('project',           'Project',           'master.company_code_access_entity_type', 60),
    ('bank_account',      'Bank account',      'master.company_code_access_entity_type', 70)
) AS v(code, name, domain_code, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code
      AND x.code        = v.code
      AND x.tenant_id   IS NULL
);
