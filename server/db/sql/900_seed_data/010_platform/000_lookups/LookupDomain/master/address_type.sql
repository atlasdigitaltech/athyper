-- LookupDomain/master/address_type.sql
-- Lookup values for domain: master.address_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- Category: residential
    ('residential',      'Residential',
     'master.address_type',
     'Private home or apartment.',
     'residential', 10),
    ('residential_apt',  'Apartment / Unit',
     'master.address_type',
     'Multi-unit residential. Requires unit number in line2 or line3.',
     'residential', 11),

    -- Category: commercial
    ('commercial',       'Commercial Office',
     'master.address_type',
     'Standard commercial office premises.',
     'commercial', 20),
    ('retail',           'Retail Premises',
     'master.address_type',
     'Shop, showroom, or retail unit.',
     'commercial', 21),
    ('industrial',       'Industrial',
     'master.address_type',
     'Factory, workshop, or light industrial unit.',
     'commercial', 22),
    ('warehouse',        'Warehouse',
     'master.address_type',
     'Storage or distribution facility.',
     'commercial', 23),
    ('coworking',        'Co-working Space',
     'master.address_type',
     'Shared or serviced office with no dedicated tenancy.',
     'commercial', 24),
    ('virtual_office',   'Virtual Office',
     'master.address_type',
     'Registered address service with no physical occupancy.',
     'commercial', 25),

    -- Category: logistics
    ('po_box',           'PO Box',
     'master.address_type',
     'Post Office Box. Mail only — no physical delivery possible.',
     'logistics', 30),
    ('freight_depot',    'Freight Depot',
     'master.address_type',
     'Freight terminal or depot for large consignments.',
     'logistics', 31),
    ('customs_zone',     'Customs / FTZ',
     'master.address_type',
     'Bonded warehouse or Free Trade Zone facility.',
     'logistics', 32),
    ('parcel_locker',    'Parcel Locker',
     'master.address_type',
     'Self-service parcel collection point.',
     'logistics', 33),

    -- Category: institutional
    ('government',       'Government',
     'master.address_type',
     'Government ministry, department, or agency premises.',
     'institutional', 40),
    ('hospital',         'Hospital / Clinic',
     'master.address_type',
     'Medical facility.',
     'institutional', 41),
    ('education',        'Educational',
     'master.address_type',
     'School, university, or training centre.',
     'institutional', 42),

    -- Category: special
    ('construction',     'Construction Site',
     'master.address_type',
     'Temporary project site with no permanent postal address.',
     'special', 50),
    ('rural',            'Rural / Unstructured',
     'master.address_type',
     'Location described by landmarks or GPS rather than formal postal address.',
     'special', 51),
    ('other',            'Other',
     'master.address_type',
     'Type not covered by standard classifications.',
     'special', 99)
) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
