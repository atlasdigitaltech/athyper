-- LookupDomain/master/fx_rate_type.sql
-- Lookup values for domain: master.fx_rate_type
-- Used by: fx_rate.rate_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('spot',     'Spot',          'master.fx_rate_type', 'Current market rate for immediate exchange',          10),
    ('forward',  'Forward',       'master.fx_rate_type', 'Agreed-upon rate for future settlement',              20),
    ('average',  'Period Average', 'master.fx_rate_type', 'Average rate over a reporting period',               30),
    ('closing',  'Closing',       'master.fx_rate_type', 'Rate at end of business day / period-end',            40),
    ('opening',  'Opening',       'master.fx_rate_type', 'Rate at start of business day / period-start',        50),
    ('official', 'Official',      'master.fx_rate_type', 'Central bank or regulatory-published rate',           60),
    ('budget',   'Budget',        'master.fx_rate_type', 'Fixed rate used for internal budget planning',        70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
