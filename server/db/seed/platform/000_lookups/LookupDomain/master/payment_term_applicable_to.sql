-- LookupDomain/master/payment_term_applicable_to.sql
-- Lookup values for domain: master.payment_term_applicable_to
-- Used by: payment_term.applicable_to
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('supplier',      'Supplier',      'master.payment_term_applicable_to', 'Applies to outbound AP payments to suppliers', 10),
    ('customer',      'Customer',      'master.payment_term_applicable_to', 'Applies to inbound AR payments from customers',20),
    ('intercompany',  'Intercompany',  'master.payment_term_applicable_to', 'Applies to intercompany settlements',          30),
    ('both',          'Both',          'master.payment_term_applicable_to', 'Applies to both supplier and customer terms',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
