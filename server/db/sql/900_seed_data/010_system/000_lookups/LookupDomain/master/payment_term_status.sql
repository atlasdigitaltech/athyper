-- LookupDomain/master/payment_term_status.sql
-- Lookup domain + values for master.payment_term_status
-- is_extensible = false — statuses are platform-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.payment_term_status',
       'Payment term status',
       'Lifecycle status of a payment term: draft, active, inactive, superseded, archived.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.payment_term_status'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',      'Draft',      'master.payment_term_status', 'Payment term is being drafted',                  10),
    ('active',     'Active',     'master.payment_term_status', 'Payment term is active and available for use',   20),
    ('inactive',   'Inactive',   'master.payment_term_status', 'Payment term is temporarily disabled',           30),
    ('superseded', 'Superseded', 'master.payment_term_status', 'Payment term has been replaced by a newer version', 40),
    ('archived',   'Archived',   'master.payment_term_status', 'Payment term is archived',                       50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
