-- LookupDomain/master/fx_rate_source.sql
-- Lookup values for domain: master.fx_rate_source
-- Used by: fx_rate.source
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('manual',    'Manual',         'master.fx_rate_source', 'Manually entered by a finance user',              10),
    ('ecb',       'ECB',            'master.fx_rate_source', 'European Central Bank published rate',            20),
    ('rbi',       'RBI',            'master.fx_rate_source', 'Reserve Bank of India published rate',            30),
    ('fed',       'US Federal',     'master.fx_rate_source', 'US Federal Reserve published rate',               40),
    ('bloomberg', 'Bloomberg',      'master.fx_rate_source', 'Bloomberg data feed',                             50),
    ('reuters',   'Reuters / LSEG', 'master.fx_rate_source', 'Reuters / LSEG Refinitiv data feed',             60),
    ('api',       'API Feed',       'master.fx_rate_source', 'Third-party API or open data feed integration',   70),
    ('cbr',       'CBR',            'master.fx_rate_source', 'Central Bank of Russia published rate',           80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
