-- LookupDomain/master/payment_method_direction.sql
-- Lookup values for domain: master.payment_method_direction
-- Shared across method, policy, binding, settlement tables

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('outbound', 'Outbound', 'master.payment_method_direction', 'Disbursement / payment sent',        10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('inbound',  'Inbound',  'master.payment_method_direction', 'Collection / payment received',      20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('both',     'Both',     'master.payment_method_direction', 'Applicable in both directions',      30, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
