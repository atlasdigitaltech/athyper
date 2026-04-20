-- LookupDomain/master/payment_term_category.sql
-- Lookup domain + values for master.payment_term_category
-- is_extensible = true — tenants may add custom categories.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.payment_term_category',
       'Payment term category',
       'Classification of payment terms by industry or use case: standard, construction, government, etc. '
       'Tenant-extensible.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.payment_term_category'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',     'Standard',     'master.payment_term_category', 'General-purpose payment terms',                10),
    ('construction', 'Construction', 'master.payment_term_category', 'Payment terms for construction contracts',     20),
    ('government',   'Government',   'master.payment_term_category', 'Payment terms for government contracts',       30),
    ('subscription', 'Subscription', 'master.payment_term_category', 'Payment terms for subscription agreements',    40),
    ('lease',        'Lease',        'master.payment_term_category', 'Payment terms for lease agreements',           50),
    ('trade',        'Trade',        'master.payment_term_category', 'Payment terms for trade / commodity contracts', 60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
