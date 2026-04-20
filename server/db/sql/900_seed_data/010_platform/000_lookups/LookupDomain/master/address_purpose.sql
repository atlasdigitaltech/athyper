-- LookupDomain/master/address_purpose.sql
-- Lookup values for domain: master.address_purpose
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- Reserved: catch-all fallback
    ('default',      'Default',
     'master.address_purpose',
     'Catch-all fallback used when no specific override exists. Resolved by fn_resolve_address().',
     'other', 0),

    -- Category: financial
    ('billing',      'Billing',
     'master.address_purpose',
     'Address to appear on invoices, billing statements, and payment requests.',
     'financial', 10),
    ('remittance',   'Remittance',
     'master.address_purpose',
     'Address for payment advice, remittance notes, and accounts payable correspondence.',
     'financial', 11),
    ('tax',          'Tax / Fiscal',
     'master.address_purpose',
     'Registered address for tax authority correspondence and VAT documentation.',
     'financial', 12),
    ('statements',   'Account Statements',
     'master.address_purpose',
     'Address for periodic account statements and financial summaries.',
     'financial', 13),

    -- Category: operational
    ('shipping',     'Shipping',
     'master.address_purpose',
     'Delivery address for outbound goods and fulfilment.',
     'operational', 20),
    ('receiving',    'Receiving / Goods In',
     'master.address_purpose',
     'Address for inbound deliveries, goods receipts, and returns processing.',
     'operational', 21),
    ('returns',      'Returns',
     'master.address_purpose',
     'Address for returned goods and reverse logistics.',
     'operational', 22),
    ('warehouse',    'Warehouse / Storage',
     'master.address_purpose',
     'Inventory storage or distribution facility used in stock movements.',
     'operational', 23),
    ('installation', 'Installation Site',
     'master.address_purpose',
     'On-site location where services are delivered or equipment is installed.',
     'operational', 24),

    -- Category: correspondence
    ('mailing',      'Mailing',
     'master.address_purpose',
     'General postal correspondence address.',
     'correspondence', 30),
    ('legal',        'Legal / Registered',
     'master.address_purpose',
     'Statutory registered address or legal correspondence address.',
     'correspondence', 31),
    ('regulatory',   'Regulatory',
     'master.address_purpose',
     'Address filed with a regulatory authority, licensor, or government body.',
     'correspondence', 32),
    ('notices',      'Formal Notices',
     'master.address_purpose',
     'Address for legal notices, statutory demands, and service of process.',
     'correspondence', 33),

    -- Category: people
    ('home',         'Home',
     'master.address_purpose',
     'Principal private residence of an individual.',
     'people', 40),
    ('work',         'Work',
     'master.address_purpose',
     'Primary workplace for an individual.',
     'people', 41),
    ('emergency',    'Emergency Contact',
     'master.address_purpose',
     'Address for emergency or next-of-kin contact.',
     'people', 42),
    ('payroll',      'Payroll',
     'master.address_purpose',
     'Address used for payslips and payroll-related correspondence.',
     'people', 43),

    -- Category: corporate
    ('hq',           'Headquarters',
     'master.address_purpose',
     'Principal corporate headquarters location.',
     'corporate', 50),
    ('office',       'Branch Office',
     'master.address_purpose',
     'Secondary or regional office location.',
     'corporate', 51),
    ('trading',      'Trading Address',
     'master.address_purpose',
     'Address from which the business is actively operated.',
     'corporate', 52),

    -- Catch-all
    ('other',        'Other',
     'master.address_purpose',
     'Purpose not covered by standard classifications.',
     'other', 99)
) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
