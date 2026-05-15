-- LookupDomain/master/asset_assignment_type.sql
-- Lookup values for domain: master.asset_assignment_type
-- Idempotent: WHERE NOT EXISTS guard for inserts; explicit DELETE for retired entries

-- Retire the 'operating_unit' entry (replaced by company_code model)
DELETE FROM control.lookup_value
WHERE domain_code = 'master.asset_assignment_type'
  AND code        = 'operating_unit'
  AND tenant_id   IS NULL;

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('custodian',        'Custodian',         'master.asset_assignment_type', 'Asset custodian change',             10),
    ('location',         'Location',          'master.asset_assignment_type', 'Physical location change',           20),
    ('cost_center',      'Cost Center',       'master.asset_assignment_type', 'Cost center reassignment',           30),
    ('department',       'Department',        'master.asset_assignment_type', 'Department change',                  40),
    ('project',          'Project',           'master.asset_assignment_type', 'Project assignment change',          50),
    ('insurance_policy', 'Insurance Policy',  'master.asset_assignment_type', 'Insurance policy assignment change', 60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
