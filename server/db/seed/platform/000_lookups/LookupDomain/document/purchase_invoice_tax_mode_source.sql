INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('supplier_profile',
     'Supplier Profile',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode defaulted from the supplier''s tax configuration profile.',
     10),
    ('tax_group',
     'Tax Group',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode inferred from the invoice''s tax group settings.',
     20),
    ('company_default',
     'Company Default',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode set from the company code''s default tax configuration.',
     30),
    ('user_override',
     'User Override',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode was manually overridden by the user (requires ap.override_tax_mode permission).',
     40),
    ('cannot_infer',
     'Cannot Infer',
     'document.purchase_invoice_tax_mode_source',
     'System could not determine tax mode from available supplier/tax data — user must enter manually.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
