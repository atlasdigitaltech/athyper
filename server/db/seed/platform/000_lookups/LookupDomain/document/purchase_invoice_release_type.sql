-- LookupDomain/document/purchase_invoice_release_type.sql
-- Lookup values for domain: document.purchase_invoice_release_type
-- How retained balances are released.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('partial',         'Partial',         'document.purchase_invoice_release_type', 'Release part of the selected retention balance.',      10),
    ('full_release',    'Full release',    'document.purchase_invoice_release_type', 'Release all selected retention balance.',              20),
    ('milestone_based', 'Milestone-based', 'document.purchase_invoice_release_type', 'Release based on milestone completion.',               30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
