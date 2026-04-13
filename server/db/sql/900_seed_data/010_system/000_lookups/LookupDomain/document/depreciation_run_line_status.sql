-- LookupDomain/document/depreciation_run_line_status.sql
-- Lookup values for domain: document.depreciation_run_line_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('calculated', 'Calculated',  'document.depreciation_run_line_status', 'Depreciation amount calculated',     10),
    ('posted',     'Posted',      'document.depreciation_run_line_status', 'Line posted to asset transaction',   20),
    ('skipped',    'Skipped',     'document.depreciation_run_line_status', 'Line skipped (e.g., fully depr.)',   30),
    ('error',      'Error',       'document.depreciation_run_line_status', 'Calculation or posting error',       40),
    ('reversed',   'Reversed',    'document.depreciation_run_line_status', 'Line reversed',                      50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
