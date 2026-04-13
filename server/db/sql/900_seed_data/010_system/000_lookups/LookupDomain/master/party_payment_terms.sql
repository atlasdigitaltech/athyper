-- LookupDomain/master/party_payment_terms.sql
-- Lookup values for domain: master.party_payment_terms
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('net_15',  'Net 15',    'master.party_payment_terms', 'Payment due in 15 days',    10),
    ('net_30',  'Net 30',    'master.party_payment_terms', 'Payment due in 30 days',    20),
    ('net_45',  'Net 45',    'master.party_payment_terms', 'Payment due in 45 days',    30),
    ('net_60',  'Net 60',    'master.party_payment_terms', 'Payment due in 60 days',    40),
    ('net_90',  'Net 90',    'master.party_payment_terms', 'Payment due in 90 days',    50),
    ('cod',     'COD',       'master.party_payment_terms', 'Cash on delivery',          60),
    ('prepaid', 'Prepaid',   'master.party_payment_terms', 'Payment before delivery',   70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
