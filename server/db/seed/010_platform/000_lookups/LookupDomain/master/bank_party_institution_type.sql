-- LookupDomain/master/bank_party_institution_type.sql
-- Lookup values for domain: master.bank_party_institution_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('bank',               'Bank',               'master.bank_party_institution_type', 'Commercial or retail bank',                            10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('payment_provider',   'Payment Provider',   'master.bank_party_institution_type', 'Payment service provider',                             20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('correspondent_bank', 'Correspondent Bank', 'master.bank_party_institution_type', 'Intermediary bank for cross-border',                   30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('wallet_provider',    'Wallet Provider',    'master.bank_party_institution_type', 'Digital wallet or e-money provider',                   40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('neobank',            'Neobank / Digital Bank', 'master.bank_party_institution_type', 'Licensed digital-only bank (Revolut, N26, Monzo)', 50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('fx_broker',          'FX Broker',          'master.bank_party_institution_type', 'Foreign exchange broker with account-holding capability', 60, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
