-- Sub-classifier inside an address_link.purpose. NOT DB-enforced — service may
-- validate against this seed but free-text values are allowed so new flows don't
-- block on a seed update.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Sub-classification within 'correspondence' ─────────────────────────
    ('legal_notice',       'Legal Notice',
     'master.address_role_qualifier',
     'Statutory demands, service of process, formal legal correspondence.',
     'correspondence', 10),

    ('regulatory_filing',  'Regulatory Filing',
     'master.address_role_qualifier',
     'Address filed with regulators, licensors, or government authorities.',
     'correspondence', 11),

    ('tax_filing',         'Tax Filing',
     'master.address_role_qualifier',
     'Tax authority correspondence, VAT documentation, GST/SST filings.',
     'correspondence', 12),

    ('account_statement',  'Account Statement',
     'master.address_role_qualifier',
     'Periodic account statements and financial summaries.',
     'correspondence', 13),

    ('emergency',          'Emergency Contact',
     'master.address_role_qualifier',
     'Emergency or next-of-kin address (employee, principal contexts).',
     'correspondence', 14),

    ('payslip',            'Payslip',
     'master.address_role_qualifier',
     'Payroll-related correspondence to employees (separate from payment remit-to).',
     'correspondence', 15),

    ('registered_office',  'Registered Office',
     'master.address_role_qualifier',
     'Official registered office of a legal entity.',
     'correspondence', 16),

    ('statutory_correspondence', 'Statutory Correspondence',
     'master.address_role_qualifier',
     'General statutory correspondence address for a legal entity.',
     'correspondence', 17),

    -- ── Sub-classification within 'ship_to' / 'ship_from' ──────────────────
    ('return_to_supplier', 'Return to Supplier',
     'master.address_role_qualifier',
     'Reverse-logistics destination when goods are returned to the supplier. Used with purpose=ship_from on supplier-owned link.',
     'logistics', 20),

    ('warehouse_inbound',  'Warehouse Inbound',
     'master.address_role_qualifier',
     'Designated inbound dock or receiving bay within a multi-dock warehouse.',
     'logistics', 21)

) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
