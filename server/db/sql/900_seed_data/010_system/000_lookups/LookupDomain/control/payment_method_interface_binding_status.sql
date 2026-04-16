-- LookupDomain/control/payment_method_interface_binding_status.sql
-- Lookup values for domain: control.payment_method_interface_binding_status

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('active',   'Active',   'control.payment_method_interface_binding_status', 'Binding in effect',  10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('inactive', 'Inactive', 'control.payment_method_interface_binding_status', 'Binding suspended',  20, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
