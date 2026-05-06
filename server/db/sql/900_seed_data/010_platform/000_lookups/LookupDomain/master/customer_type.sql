-- LookupDomain/master/customer_type.sql
-- Lookup values for domain: master.customer_type
-- Note: canonical intercompany code is 'intercompany' (matches DDL CHECK on master.customer).
-- A prior version used 'internal' — the migration block below renames it.
-- Idempotent: WHERE NOT EXISTS guard + migration UPDATE

-- Migration first: rename stale 'internal' → 'intercompany' before the INSERT runs.
-- On a clean install this is a no-op; on an existing DB it prevents the duplicate-key
-- violation that would occur if we inserted 'intercompany' while 'internal' still exists.
UPDATE control.lookup_value
SET    code        = 'intercompany',
       name        = 'Intercompany',
       description = 'Internal group entity — intercompany AR'
WHERE  domain_code = 'master.customer_type'
  AND  code        = 'internal'
  AND  tenant_id IS NULL;

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('corporate',     'Corporate',      'master.customer_type', 'B2B corporate entity',                    10),
    ('individual',    'Individual',     'master.customer_type', 'B2C individual consumer',                  20),
    ('government',    'Government',     'master.customer_type', 'Government / public sector',               30),
    ('intercompany',  'Intercompany',   'master.customer_type', 'Internal group entity — intercompany AR',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
