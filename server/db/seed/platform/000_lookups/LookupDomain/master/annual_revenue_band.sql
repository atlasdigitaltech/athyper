-- LookupDomain/master/annual_revenue_band.sql
-- Lookup domain + values for: master.annual_revenue_band
-- Used by: master.supplier.annual_revenue_band
-- Codes: lt_ = less than, r_ = range, gt_ = greater than (all start with letter)
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.annual_revenue_band',
       'Annual Revenue Band',
       'Standardised annual revenue bands (USD equivalent) for supplier business profile.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.annual_revenue_band'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('lt_100k',     'Below $100K USD',      'master.annual_revenue_band', 'Annual revenue below USD 100,000',              10),
    ('r100k_1m',    '$100K – $1M USD',      'master.annual_revenue_band', 'Annual revenue USD 100K to 1 million',          20),
    ('r1m_10m',     '$1M – $10M USD',       'master.annual_revenue_band', 'Annual revenue USD 1 million to 10 million',    30),
    ('r10m_50m',    '$10M – $50M USD',      'master.annual_revenue_band', 'Annual revenue USD 10 million to 50 million',   40),
    ('r50m_100m',   '$50M – $100M USD',     'master.annual_revenue_band', 'Annual revenue USD 50 million to 100 million',  50),
    ('r100m_1b',    '$100M – $1B USD',      'master.annual_revenue_band', 'Annual revenue USD 100 million to 1 billion',   60),
    ('gt_1b',       'Over $1B USD',         'master.annual_revenue_band', 'Annual revenue above USD 1 billion',            70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
