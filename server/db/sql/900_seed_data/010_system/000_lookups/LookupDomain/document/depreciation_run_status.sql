-- LookupDomain/document/depreciation_run_status.sql
-- Lookup values for domain: document.depreciation_run_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('planned',   'Planned',    'document.depreciation_run_status', 'Run scheduled but not started',  10),
    ('running',   'Running',    'document.depreciation_run_status', 'Run in progress',                20),
    ('completed', 'Completed',  'document.depreciation_run_status', 'Run completed successfully',     30),
    ('failed',    'Failed',     'document.depreciation_run_status', 'Run failed with errors',         40),
    ('reversed',  'Reversed',   'document.depreciation_run_status', 'Run reversed',                   50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
